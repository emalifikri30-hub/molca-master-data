import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { jwtVerify, errors, createRemoteJWKSet } from "jose";

import type { Context } from "hono";
import type { CryptoKey as JWKCryptoKey, JWK, KeyObject } from "jose";
import type { JWTVerifyGetKey } from "jose/jwt/verify";

import type { AuthEnv, AppJwtPayload } from "./claims.js";

type JWTKey = JWKCryptoKey | KeyObject | JWK | Uint8Array | JWTVerifyGetKey;

// Pulls the raw JWT out of a request. Returning undefined yields a
// "token not found" 401; a present-but-invalid token yields "invalid token".
type TokenExtractor = (c: Context) => string | undefined;

type AuthMiddlewareOptions = {
  issuer: string;
  getKey: JWTKey;
  getToken: TokenExtractor;
};

// Reads `Authorization: Bearer <token>`. Used by token-facing APIs (post/comment).
function bearerToken(): TokenExtractor {
  return (c) => {
    const raw = c.req.header("Authorization");
    if (!raw) return undefined;
    const [scheme, token] = raw.split(" ");
    if (scheme !== "Bearer" || !token) return undefined;
    return token;
  };
}

// Reads the `<cookieName>_access_token` cookie. Used by the browser-facing BFF.
function cookieToken(cookieName: string): TokenExtractor {
  const accessTokenCookieName = `${cookieName}_access_token`;
  return (c) => getCookie(c, accessTokenCookieName);
}

function createKeycloakJwks(oidcBaseUri: string): JWTVerifyGetKey {
  return createRemoteJWKSet(new URL(`${oidcBaseUri}/protocol/openid-connect/certs`));
}

function createAuthMiddleware({ issuer, getKey, getToken }: AuthMiddlewareOptions) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const token = getToken(c);

    if (!token) {
      return c.json({ error: "token not found" }, 401);
    }

    try {
      const { payload } = await jwtVerify(token, getKey as JWTVerifyGetKey, { issuer });
      c.set("jwtPayload", payload as AppJwtPayload);
    } catch (err) {
      if (err instanceof errors.JWTExpired) {
        return c.json({ error: "token expired" }, 401);
      }
      return c.json({ error: "invalid token" }, 401);
    }

    await next();
  });
}

type AuthMiddleware = ReturnType<typeof createAuthMiddleware>;

export { createAuthMiddleware, createKeycloakJwks, bearerToken, cookieToken };
export type { AuthMiddlewareOptions, AuthMiddleware, JWTKey, TokenExtractor };
