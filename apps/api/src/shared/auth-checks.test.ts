import { describe, it, expect, beforeAll } from "vite-plus/test";
import { Hono } from "hono";
import { SignJWT, generateKeyPair } from "jose";
import type { CryptoKey } from "jose";
import { createAuthMiddleware, bearerToken } from "@molca/mes";

const ISSUER = "https://keycloak.test/realms/lnd";

let priv: CryptoKey;
let pub: CryptoKey;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  priv = pair.privateKey;
  pub = pair.publicKey;
});

function sign(claims: { aud?: string; azp?: string }) {
  return new SignJWT({ sub: "u1", ...(claims.azp ? { azp: claims.azp } : {}) })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(claims.aud ?? "account")
    .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
    .sign(priv);
}

// Mirrors registerInfra: the API passes config.auth straight through to createAuthMiddleware.
function app(auth: { audience?: string[]; allowedAzp?: string[] }) {
  const a = new Hono<any>();
  a.use(
    "*",
    createAuthMiddleware({
      issuer: ISSUER,
      getKey: pub,
      getToken: bearerToken(),
      audience: auth.audience,
      allowedAzp: auth.allowedAzp,
    }),
  );
  a.get("/", (c) => c.json({ ok: true }));
  return a;
}

function get(a: Hono<any>, token: string) {
  return a.request("/", { headers: { Authorization: `Bearer ${token}` } });
}

describe("API auth checks (opt-in, wired from AUTH_AUDIENCE / AUTH_ALLOWED_AZP)", () => {
  it("with both unset, any azp and aud 'account' pass", async () => {
    const res = await get(app({}), await sign({ aud: "account", azp: "anything" }));
    expect(res.status).toBe(200);
  });

  it("with allowedAzp set, an unlisted azp is refused and a listed azp passes", async () => {
    const a = app({ allowedAzp: ["dx-platform"] });

    const refused = await get(a, await sign({ azp: "other" }));
    expect(refused.status).toBe(401);
    expect(await refused.json()).toEqual({ error: "forbidden client" });

    const allowed = await get(a, await sign({ azp: "dx-platform" }));
    expect(allowed.status).toBe(200);
  });

  it("with audience set, a token with aud 'account' is refused", async () => {
    const res = await get(app({ audience: ["dx-master-data"] }), await sign({ aud: "account" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid audience" });
  });
});
