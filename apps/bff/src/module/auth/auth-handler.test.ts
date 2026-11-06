import { describe, it, expect, beforeAll, vi } from "vite-plus/test";
import { Hono } from "hono";
import { SignJWT, generateKeyPair } from "jose";
import { createAuthHandler } from "./auth-handler.js";
import { createAuthMiddleware, cookieToken } from "@molca/security";
import type { AuthService, TokenSet } from "./auth-service.js";
import type { AppConfig } from "../../shared/config/config.js";

const ISSUER = "http://localhost:9099/realms/test";

let privateKey: CryptoKey;
let publicKey: CryptoKey;

beforeAll(async () => {
  const keyPair = await generateKeyPair("RS256");
  privateKey = keyPair.privateKey;
  publicKey = keyPair.publicKey;
});

const TEST_CONFIG: AppConfig = {
  oidc: {
    clientId: "portal-bff",
    clientSecret: "secret",
    baseUri: ISSUER,
    redirectUri: "http://localhost:3003/api/callback",
    scope: "openid profile email",
  },
  cookie: {
    name: "test_sess",
    secret: "supersecretvalue1234567890abcdef",
  },
  clientBaseRedirectUri: "http://localhost:3003",
  cors: {
    allowedOrigins: ["http://localhost:3003"],
  },
  coreApi: {
    baseUrl: "http://localhost:4000",
  },
  proxy: {
    allowedPrefixes: ["/v1/"],
    upstreamTimeoutMs: 30_000,
  },
  region: "sea",
  devAutoLogin: null,
};

async function createToken(claims: Record<string, unknown> = {}): Promise<string> {
  return new SignJWT({
    sub: "user-123",
    preferred_username: "john",
    email: "john@example.com",
    resource_access: { portal: { roles: ["admin"] } },
    organization: { org1: { id: "org-1", name: "Org One" } },
    ...claims,
  })
    .setProtectedHeader({ alg: "RS256" })
    .setExpirationTime("1h")
    .setIssuer(ISSUER)
    .setSubject((claims.sub as string) ?? "user-123")
    .sign(privateKey);
}

function createMockAuthService(overrides: Partial<AuthService> = {}): AuthService {
  return {
    getConfig: vi.fn(() => Promise.resolve({} as any)),
    buildLoginUrl: vi.fn(() =>
      Promise.resolve(new URL("http://localhost:9099/auth?redirect=test")),
    ),
    exchangeCode: vi.fn(() =>
      Promise.resolve({
        accessToken: "new-access-token",
        refreshToken: "new-refresh-token",
        idToken: "new-id-token",
      } as TokenSet),
    ),
    refreshToken: vi.fn(() =>
      Promise.resolve({
        accessToken: "refreshed-access-token",
        refreshToken: "refreshed-refresh-token",
        idToken: "refreshed-id-token",
      } as TokenSet),
    ),
    passwordGrant: vi.fn(() =>
      Promise.resolve({
        accessToken: "dev-access-token",
        refreshToken: "dev-refresh-token",
        idToken: "dev-id-token",
      } as TokenSet),
    ),
    buildLogoutUrl: vi.fn(() => Promise.resolve(new URL("http://localhost:9099/logout"))),
    sanitizeReturnPath: vi.fn((returnTo: string | null | undefined) => {
      if (!returnTo || returnTo.startsWith("//")) return "/";
      return returnTo;
    }),
    buildClientRedirectUri: vi.fn((baseUri: string, returnTo: string) => {
      const base = baseUri.replace(/\/$/, "");
      if (returnTo === "/") return base;
      return `${base}${returnTo}`;
    }),
    ...overrides,
  };
}

function createTestApp(authService?: AuthService, config: AppConfig = TEST_CONFIG) {
  const svc = authService ?? createMockAuthService();
  const authMw = createAuthMiddleware({
    issuer: ISSUER,
    getKey: publicKey,
    getToken: cookieToken(config.cookie.name),
  });
  const handler = createAuthHandler({
    authService: svc,
    config,
    authMw,
  });
  const app = new Hono();
  app.route("/", handler);
  return { app, authService: svc };
}

describe("auth-handler", () => {
  describe("GET /api/login", () => {
    it("should redirect to the Keycloak authorization URL", async () => {
      const { app } = createTestApp();
      const res = await app.request("/api/login", { redirect: "manual" });

      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("http://localhost:9099/auth?redirect=test");
    });

    it("should set PKCE temporary cookies", async () => {
      const { app } = createTestApp();
      const res = await app.request("/api/login", { redirect: "manual" });

      const cookies = res.headers.getSetCookie();
      const cookieNames = cookies.map((c) => c.split("=")[0]);

      expect(cookieNames).toContain("test_sess_code_verifier");
      expect(cookieNames).toContain("test_sess_state");
      expect(cookieNames).toContain("test_sess_nonce");
      expect(cookieNames).toContain("test_sess_return_to");
    });

    it("should store sanitized returnTo cookie from query", async () => {
      const { app } = createTestApp();
      const res = await app.request("/api/login?returnTo=%2Fposts%2F01JB2K", {
        redirect: "manual",
      });

      const cookies = res.headers.getSetCookie();
      const returnToCookie = cookies.find((c) => c.startsWith("test_sess_return_to="));
      expect(returnToCookie).toBeDefined();
      expect(returnToCookie).toContain("test_sess_return_to=%2Fposts%2F01JB2K");
    });

    it("should fall back to root returnTo for malicious paths", async () => {
      const { app } = createTestApp();
      const res = await app.request("/api/login?returnTo=%2F%2Fevil.com", { redirect: "manual" });

      const cookies = res.headers.getSetCookie();
      const returnToCookie = cookies.find((c) => c.startsWith("test_sess_return_to="));
      expect(returnToCookie).toContain("test_sess_return_to=%2F");
    });

    it("should return 503 when auth service fails", async () => {
      const svc = createMockAuthService({
        buildLoginUrl: vi.fn(() => Promise.reject(new Error("discovery failed"))),
      });
      const { app } = createTestApp(svc);
      const res = await app.request("/api/login");

      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error).toBe("failed to initiate login");
    });
  });

  describe("GET /api/callback", () => {
    it("should exchange code and set token cookies", async () => {
      const { app } = createTestApp();

      const res = await app.request("/api/callback?code=authcode&state=s1", {
        redirect: "manual",
        headers: {
          Cookie: [
            "test_sess_code_verifier=verifier123",
            "test_sess_state=s1",
            "test_sess_nonce=n1",
          ].join("; "),
        },
      });

      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("http://localhost:3003");

      const cookies = res.headers.getSetCookie();
      const cookieStr = cookies.join("; ");
      expect(cookieStr).toContain("test_sess_access_token=new-access-token");
      expect(cookieStr).toContain("test_sess_refresh_token=new-refresh-token");
      expect(cookieStr).toContain("test_sess_id_token=new-id-token");
    });

    it("should redirect to client base URI plus returnTo path", async () => {
      const { app } = createTestApp();

      const res = await app.request("/api/callback?code=authcode&state=s1", {
        redirect: "manual",
        headers: {
          Cookie: [
            "test_sess_code_verifier=verifier123",
            "test_sess_state=s1",
            "test_sess_nonce=n1",
            "test_sess_return_to=%2Fposts%2F01JB2K",
          ].join("; "),
        },
      });

      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("http://localhost:3003/posts/01JB2K");
    });

    it("should ignore invalid returnTo cookie on callback", async () => {
      const { app } = createTestApp();

      const res = await app.request("/api/callback?code=authcode&state=s1", {
        redirect: "manual",
        headers: {
          Cookie: [
            "test_sess_code_verifier=verifier123",
            "test_sess_state=s1",
            "test_sess_nonce=n1",
            "test_sess_return_to=%2F%2Fevil.com",
          ].join("; "),
        },
      });

      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("http://localhost:3003");
    });

    it("should return 400 when PKCE cookies are missing", async () => {
      const { app } = createTestApp();
      const res = await app.request("/api/callback?code=authcode&state=s1");

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("session expired, please login again");
    });

    it("should return 403 when keycloak returns error", async () => {
      const { app } = createTestApp();
      const res = await app.request(
        "/api/callback?error=access_denied&error_description=User+denied+access",
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("User denied access");
    });

    it("should return 500 when token exchange fails", async () => {
      const svc = createMockAuthService({
        exchangeCode: vi.fn(() => Promise.reject(new Error("exchange failed"))),
      });
      const { app } = createTestApp(svc);

      const res = await app.request("/api/callback?code=authcode&state=s1", {
        headers: {
          Cookie: ["test_sess_code_verifier=v", "test_sess_state=s1", "test_sess_nonce=n1"].join(
            "; ",
          ),
        },
      });

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("token exchange failed");
    });
  });

  describe("GET /api/me", () => {
    it("should return user info from JWT payload", async () => {
      const { app } = createTestApp();
      const token = await createToken();

      const res = await app.request("/api/me", {
        headers: {
          Cookie: `test_sess_access_token=${token}`,
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.sub).toBe("user-123");
      expect(body.data.preferredUsername).toBe("john");
      expect(body.data.email).toBe("john@example.com");
      expect(body.data.resourceAccess).toEqual({
        portal: { roles: ["admin"] },
      });
      expect(body.data.organization).toEqual({ "Org One": { id: "org-1" } });
    });

    it("should return 401 when no token cookie is present", async () => {
      const { app } = createTestApp();
      const res = await app.request("/api/me");

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("token not found");
    });
  });

  describe("GET /api/me with devAutoLogin", () => {
    const DEV_CONFIG: AppConfig = {
      ...TEST_CONFIG,
      devAutoLogin: { username: "ops", password: "pw", personas: ["ops", "demo-technician"] },
    };

    it("signs a browser without a session in and sends it back to /api/me", async () => {
      const { app, authService } = createTestApp(undefined, DEV_CONFIG);
      const res = await app.request("/api/me", { redirect: "manual" });

      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe("/api/me");
      expect(authService.passwordGrant).toHaveBeenCalledWith("ops", "pw");
      const cookies = res.headers.getSetCookie();
      expect(cookies.some((c) => c.startsWith("test_sess_access_token=dev-access-token"))).toBe(
        true,
      );
      expect(cookies.some((c) => c.startsWith("test_sess_refresh_token=dev-refresh-token"))).toBe(
        true,
      );
    });

    it("leaves an existing session alone", async () => {
      const { app, authService } = createTestApp(undefined, DEV_CONFIG);
      const token = await createToken();
      const res = await app.request("/api/me", {
        headers: { Cookie: `test_sess_access_token=${token}` },
      });

      expect(res.status).toBe(200);
      expect(authService.passwordGrant).not.toHaveBeenCalled();
    });

    it("signs in again when the cookie holds a token the middleware refuses", async () => {
      const { app, authService } = createTestApp(undefined, DEV_CONFIG);
      const res = await app.request("/api/me", {
        redirect: "manual",
        headers: { Cookie: "test_sess_access_token=stale.or.foreign" },
      });

      expect(res.status).toBe(307);
      expect(authService.passwordGrant).toHaveBeenCalledWith("ops", "pw");
      expect(
        res.headers
          .getSetCookie()
          .some((c) => c.startsWith("test_sess_access_token=dev-access-token")),
      ).toBe(true);
    });

    it("lists the demo personas and switches to one of them", async () => {
      const { app, authService } = createTestApp(undefined, DEV_CONFIG);
      const list = await app.request("/api/dev/personas");
      expect((await list.json()).data.personas).toEqual(["ops", "demo-technician"]);

      const res = await app.request("/api/dev/switch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "demo-technician" }),
      });
      expect(res.status).toBe(200);
      expect(authService.passwordGrant).toHaveBeenCalledWith("demo-technician", "pw");
      expect(
        res.headers
          .getSetCookie()
          .some((c) => c.startsWith("test_sess_access_token=dev-access-token")),
      ).toBe(true);
    });

    it("refuses a person outside the persona list", async () => {
      const { app } = createTestApp(undefined, DEV_CONFIG);
      const res = await app.request("/api/dev/switch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "admin" }),
      });
      expect(res.status).toBe(403);
    });

    it("has no persona endpoints without devAutoLogin", async () => {
      const { app } = createTestApp();
      expect((await app.request("/api/dev/personas")).status).toBe(404);
    });

    it("is off without devAutoLogin", async () => {
      const { app, authService } = createTestApp();
      const res = await app.request("/api/me");

      expect(res.status).toBe(401);
      expect(authService.passwordGrant).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/me/status", () => {
    it("should return success message for authenticated user", async () => {
      const { app } = createTestApp();
      const token = await createToken();

      const res = await app.request("/api/me/status", {
        headers: {
          Cookie: `test_sess_access_token=${token}`,
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.message).toBe("success");
    });

    it("should return 401 when not authenticated", async () => {
      const { app } = createTestApp();
      const res = await app.request("/api/me/status");

      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/token/refresh", () => {
    it("should refresh tokens and set new cookies", async () => {
      const { app } = createTestApp();
      const token = await createToken();

      const res = await app.request("/api/token/refresh", {
        method: "POST",
        headers: {
          Cookie: [`test_sess_access_token=${token}`, `test_sess_refresh_token=old-refresh`].join(
            "; ",
          ),
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.message).toBe("token refreshed");

      const cookies = res.headers.getSetCookie();
      const cookieStr = cookies.join("; ");
      expect(cookieStr).toContain("test_sess_access_token=refreshed-access-token");
    });

    it("should return 401 when refresh token cookie is missing", async () => {
      const { app } = createTestApp();
      const token = await createToken();

      const res = await app.request("/api/token/refresh", {
        method: "POST",
        headers: {
          Cookie: `test_sess_access_token=${token}`,
        },
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("session expired");
    });

    it("should clear cookies and return 401 when refresh grant fails", async () => {
      const svc = createMockAuthService({
        refreshToken: vi.fn(() => Promise.reject(new Error("revoked"))),
      });
      const { app } = createTestApp(svc);
      const token = await createToken();

      const res = await app.request("/api/token/refresh", {
        method: "POST",
        headers: {
          Cookie: [`test_sess_access_token=${token}`, `test_sess_refresh_token=old-refresh`].join(
            "; ",
          ),
        },
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("session expired");
    });
  });

  describe("GET /api/logout", () => {
    it("should clear cookies and redirect to keycloak logout", async () => {
      const { app } = createTestApp();
      const token = await createToken();

      const res = await app.request("/api/logout", {
        method: "GET",
        redirect: "manual",
        headers: {
          Cookie: [`test_sess_access_token=${token}`, `test_sess_id_token=id-tok`].join("; "),
        },
      });

      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("http://localhost:9099/logout");
    });
  });

  describe("POST /api/logout", () => {
    it("should clear cookies and redirect to keycloak logout", async () => {
      const { app } = createTestApp();
      const token = await createToken();

      const res = await app.request("/api/logout", {
        method: "POST",
        redirect: "manual",
        headers: {
          Cookie: [`test_sess_access_token=${token}`, `test_sess_id_token=id-tok`].join("; "),
        },
      });

      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("http://localhost:9099/logout");

      const cookies = res.headers.getSetCookie();
      const deletedCookies = cookies.filter(
        (c) => c.includes("Max-Age=0") || c.includes("max-age=0"),
      );
      expect(deletedCookies.length).toBeGreaterThanOrEqual(3);
    });

    it("should redirect to client base URI when logout URL build fails", async () => {
      const svc = createMockAuthService({
        buildLogoutUrl: vi.fn(() => Promise.reject(new Error("fail"))),
      });
      const { app } = createTestApp(svc);
      const token = await createToken();

      const res = await app.request("/api/logout", {
        method: "POST",
        redirect: "manual",
        headers: {
          Cookie: `test_sess_access_token=${token}`,
        },
      });

      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("http://localhost:3003");
    });
  });
});
