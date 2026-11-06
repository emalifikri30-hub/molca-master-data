import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { serialize } from "hono/utils/cookie";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import {
  randomPKCECodeVerifier,
  calculatePKCECodeChallenge,
  randomState,
  randomNonce,
} from "openid-client";
import type { AuthService } from "./auth-service.js";
import type { AppConfig } from "../../shared/config/config.js";
import type { AuthEnv, AuthMiddleware } from "@molca/security";
import type { MeResponse, MeStatusResponse, OrganizationInfo } from "./auth-dto.js";
import { WebResponse } from "@molca/network";
import { baseLogger, getRequestContext } from "@molca/observability";

const log = () => getRequestContext()?.logger ?? baseLogger;

type AuthHandlerDeps = {
  authService: AuthService;
  config: AppConfig;
  authMw: AuthMiddleware;
};

const TEMP_COOKIE_MAX_AGE = 600; // 10 minutes for PKCE flow

function cookieOptions(config: AppConfig, maxAge?: number) {
  return {
    httpOnly: true,
    secure: new URL(config.clientBaseRedirectUri).protocol === "https:",
    path: "/",
    sameSite: "lax" as const,
    ...(maxAge !== undefined && { maxAge }),
  };
}

function createAuthHandler({ authService, config, authMw }: AuthHandlerDeps) {
  const app = new Hono<AuthEnv>();
  const cookieName = config.cookie.name;

  app.get("/api/login", async (c) => {
    try {
      const codeVerifier = randomPKCECodeVerifier();
      const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);
      const state = randomState();
      const nonce = randomNonce();

      const tempOpts = cookieOptions(config, TEMP_COOKIE_MAX_AGE);
      const returnTo = authService.sanitizeReturnPath(c.req.query("returnTo"));
      setCookie(c, `${cookieName}_code_verifier`, codeVerifier, tempOpts);
      setCookie(c, `${cookieName}_state`, state, tempOpts);
      setCookie(c, `${cookieName}_nonce`, nonce, tempOpts);
      setCookie(c, `${cookieName}_return_to`, returnTo, tempOpts);

      const authUrl = await authService.buildLoginUrl(codeChallenge, state, nonce);
      return c.redirect(authUrl.toString());
    } catch (err) {
      log().withError(err).error("login_init_failed");
      return c.json(WebResponse.builder<string>().error("failed to initiate login").build(), 503);
    }
  });

  app.get("/api/callback", async (c) => {
    const errorParam = c.req.query("error");
    if (errorParam) {
      const errorDescription = c.req.query("error_description") || errorParam;
      return c.json(WebResponse.builder<string>().error(errorDescription).build(), 403);
    }

    const codeVerifier = getCookie(c, `${cookieName}_code_verifier`);
    const expectedState = getCookie(c, `${cookieName}_state`);
    const expectedNonce = getCookie(c, `${cookieName}_nonce`);

    if (!codeVerifier || !expectedState || !expectedNonce) {
      return c.json(
        WebResponse.builder<string>().error("session expired, please login again").build(),
        400,
      );
    }

    try {
      const incoming = new URL(c.req.url);
      const callbackUrl = new URL(config.oidc.redirectUri);
      callbackUrl.search = incoming.search;
      const tokenSet = await authService.exchangeCode(
        callbackUrl,
        codeVerifier,
        expectedState,
        expectedNonce,
      );

      const tokenOpts = cookieOptions(config);
      setCookie(c, `${cookieName}_access_token`, tokenSet.accessToken, tokenOpts);
      if (tokenSet.refreshToken) {
        setCookie(c, `${cookieName}_refresh_token`, tokenSet.refreshToken, tokenOpts);
      }
      if (tokenSet.idToken) {
        setCookie(c, `${cookieName}_id_token`, tokenSet.idToken, tokenOpts);
      }

      const returnTo = authService.sanitizeReturnPath(
        getCookie(c, `${cookieName}_return_to`) ?? "/",
      );

      deleteCookie(c, `${cookieName}_code_verifier`, { path: "/" });
      deleteCookie(c, `${cookieName}_state`, { path: "/" });
      deleteCookie(c, `${cookieName}_nonce`, { path: "/" });
      deleteCookie(c, `${cookieName}_return_to`, { path: "/" });

      return c.redirect(authService.buildClientRedirectUri(config.clientBaseRedirectUri, returnTo));
    } catch (err) {
      log().withError(err).error("token_exchange_failed");
      return c.json(WebResponse.builder<string>().error("token exchange failed").build(), 500);
    }
  });

  // No sign-in screen until production (config.devAutoLogin): a browser without a valid session — no cookie, or a
  // token the auth middleware refuses (expired, organization changed) — is signed in as the dev person and sent
  // back to the same /api/me, now with the cookies. The web never sees "signed out".
  if (config.devAutoLogin) {
    const { username, password } = config.devAutoLogin;
    // Builds its own response (not c.redirect): after a refused token the context's response is already final.
    const signIn = async () => {
      const tokenSet = await authService.passwordGrant(username, password);
      const tokenOpts = cookieOptions(config);
      const headers = new Headers({ location: "/api/me" });
      headers.append(
        "set-cookie",
        serialize(`${cookieName}_access_token`, tokenSet.accessToken, tokenOpts),
      );
      if (tokenSet.refreshToken) {
        headers.append(
          "set-cookie",
          serialize(`${cookieName}_refresh_token`, tokenSet.refreshToken, tokenOpts),
        );
      }
      if (tokenSet.idToken) {
        headers.append(
          "set-cookie",
          serialize(`${cookieName}_id_token`, tokenSet.idToken, tokenOpts),
        );
      }
      return new Response(null, { status: 307, headers });
    };
    const retry = async (c: Context<AuthEnv>) => {
      try {
        return await signIn();
      } catch (err) {
        log().withError(err).error("dev_auto_login_failed");
        return c.json(WebResponse.builder<string>().error("dev sign-in failed").build(), 401);
      }
    };
    app.use("/api/me", async (c, next) => {
      if (!getCookie(c, `${cookieName}_access_token`)) return retry(c);
      try {
        await next();
      } catch (err) {
        // the auth middleware refuses a token by throwing a 401
        if (err instanceof HTTPException && err.status === 401) return retry(c);
        throw err;
      }
      if (c.res.status === 401) c.res = await retry(c);
    });
  }

  // Demo role switch (dev only, same config): the user menu lists the personas — one demo person per role — and
  // switching signs the browser in as that person through Keycloak, so permissions stay the token's own.
  if (config.devAutoLogin) {
    const { password, personas } = config.devAutoLogin;
    app.get("/api/dev/personas", (c) =>
      c.json(WebResponse.builder<{ personas: string[] }>().data({ personas }).build(), 200),
    );
    app.post("/api/dev/switch", async (c) => {
      const body = (await c.req.json().catch(() => ({}))) as { username?: unknown };
      const username = typeof body.username === "string" ? body.username : "";
      if (!personas.includes(username)) {
        return c.json(WebResponse.builder<string>().error("not a demo persona").build(), 403);
      }
      try {
        const tokenSet = await authService.passwordGrant(username, password);
        const tokenOpts = cookieOptions(config);
        setCookie(c, `${cookieName}_access_token`, tokenSet.accessToken, tokenOpts);
        if (tokenSet.refreshToken) {
          setCookie(c, `${cookieName}_refresh_token`, tokenSet.refreshToken, tokenOpts);
        }
        if (tokenSet.idToken) {
          setCookie(c, `${cookieName}_id_token`, tokenSet.idToken, tokenOpts);
        }
        return c.json(WebResponse.builder<{ username: string }>().data({ username }).build(), 200);
      } catch (err) {
        log().withError(err).error("dev_switch_failed");
        return c.json(WebResponse.builder<string>().error("switch failed").build(), 502);
      }
    });
  }

  app.use("/api/me/*", authMw);
  app.use("/api/me", authMw);
  // app.use("/api/token/*", authMw);
  app.use("/api/logout", authMw);

  app.get("/api/me", async (c) => {
    const jwt = c.get("jwtPayload");

    const orgClaim = jwt.organization;
    let organization: OrganizationInfo = {};
    if (orgClaim) {
      for (const [, value] of Object.entries(orgClaim)) {
        organization[value.name] = { id: value.id };
      }
    }

    const response: MeResponse = {
      sub: jwt.sub ?? "",
      preferredUsername: jwt.preferred_username ?? "",
      email: jwt.email ?? "",
      resourceAccess: (jwt.resource_access as MeResponse["resourceAccess"]) ?? {},
      organization,
    };

    return c.json(WebResponse.builder<MeResponse>().data(response).build(), 200);
  });

  app.get("/api/me/status", async (c) => {
    const response: MeStatusResponse = { message: "success" };
    return c.json(WebResponse.builder<MeStatusResponse>().data(response).build(), 200);
  });

  app.post("/api/token/refresh", async (c) => {
    const refreshTokenValue = getCookie(c, `${cookieName}_refresh_token`);
    if (!refreshTokenValue) {
      return c.json(WebResponse.builder<string>().error("session expired").build(), 401);
    }

    try {
      const tokenSet = await authService.refreshToken(refreshTokenValue);

      const tokenOpts = cookieOptions(config);
      setCookie(c, `${cookieName}_access_token`, tokenSet.accessToken, tokenOpts);
      if (tokenSet.refreshToken) {
        setCookie(c, `${cookieName}_refresh_token`, tokenSet.refreshToken, tokenOpts);
      }
      if (tokenSet.idToken) {
        setCookie(c, `${cookieName}_id_token`, tokenSet.idToken, tokenOpts);
      }

      return c.json(
        WebResponse.builder<{ message: string }>().data({ message: "token refreshed" }).build(),
        200,
      );
    } catch (err) {
      log().withError(err).error("token_refresh_failed");
      deleteCookie(c, `${cookieName}_access_token`, { path: "/" });
      deleteCookie(c, `${cookieName}_refresh_token`, { path: "/" });
      deleteCookie(c, `${cookieName}_id_token`, { path: "/" });
      return c.json(WebResponse.builder<string>().error("session expired").build(), 401);
    }
  });

  const handleLogout = async (c: Context<AuthEnv>) => {
    const idToken = getCookie(c, `${cookieName}_id_token`);

    deleteCookie(c, `${cookieName}_access_token`, { path: "/" });
    deleteCookie(c, `${cookieName}_refresh_token`, { path: "/" });
    deleteCookie(c, `${cookieName}_id_token`, { path: "/" });

    try {
      const logoutUrl = await authService.buildLogoutUrl(idToken);
      return c.redirect(logoutUrl.toString());
    } catch (err) {
      log().withError(err).error("logout_url_build_failed");
      return c.redirect(config.clientBaseRedirectUri);
    }
  };

  app.get("/api/logout", handleLogout);
  app.post("/api/logout", handleLogout);

  return app;
}

export { createAuthHandler };
export type { AuthHandlerDeps };
