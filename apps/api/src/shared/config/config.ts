type AppConfig = {
  applicationAlias: string;
  region: string;
  database: {
    url: string;
    logger: boolean;
    maxConnection: number;
    idleTimeoutMs: number;
    connectTimeoutMs: number;
  };
  oidc: {
    host: string;
    baseUri: string;
    tokenUri: string;
    clientId: string;
    clientSecret: string;
  };
  cors: {
    allowedOrigins: string[];
  };
  keycloak: {
    realms: string;
    timeout: number;
  };
  /**
   * IANA time zone of the install (PRD-005 TNT-G8 b): "today" for a tenant's
   * validity is the date there. Same `INSTALL_TIME_ZONE` setting as dx-platform;
   * defaults to the server's own zone.
   */
  installTimeZone: string;
  /**
   * dx-production-planning (PRD-003 SIT-002, KPI-008, PRO-001): the one cross-service read.
   * `baseUrl` has no trailing slash. PLANNING_API_URL is required: there is no default.
   */
  planning: {
    baseUrl: string;
    timeoutMs: number;
  };
  /**
   * Opt-in JWT checks (both off when unset or empty: only signature, issuer and expiry are checked).
   * `audience`: set AUTH_AUDIENCE only after the realm's audience mapper is in place, or every caller 401s.
   * `allowedAzp`: AUTH_ALLOWED_AZP must list every legitimate caller, the browser client and every
   * service-account client (e.g. dx-platform, dx-user-management).
   */
  auth: {
    audience?: string[];
    allowedAzp?: string[];
  };
};

const DEFAULT_KEYCLOAK_TIMEOUT = 30_000;
const DEFAULT_DB_IDLE_TIMEOUT_MS = 30_000;
const DEFAULT_DB_MAX_CONN = 20;
const DEFAULT_DB_CONN_TIMEOUT_MS = 5_000;
const DEFAULT_PLANNING_TIMEOUT_MS = 5_000;

function parseDbIdleTimeout(raw: string | undefined): number {
  if (raw === undefined || raw === "") return DEFAULT_DB_IDLE_TIMEOUT_MS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`DATABASE_IDLE_TIMEOUT_MS must be a positive number: got "${raw}"`);
  }
  return Math.floor(n);
}

function parseDbConnTimeout(raw: string | undefined): number {
  if (raw === undefined || raw === "") return DEFAULT_DB_CONN_TIMEOUT_MS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`DATABASE_CONN_TIMEOUT_MS must be a positive number: got "${raw}"`);
  }
  return Math.floor(n);
}

function parseDbMaxConn(raw: string | undefined): number {
  if (raw === undefined || raw === "") return DEFAULT_DB_MAX_CONN;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`DATABASE_MAX_CONN must be a positive number: got "${raw}"`);
  }
  return Math.floor(n);
}

function parseTimeout(raw: string | undefined): number {
  if (raw === undefined || raw === "") return DEFAULT_KEYCLOAK_TIMEOUT;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`KEYCLOAK_TIMEOUT must be a positive number: got "${raw}"`);
  }
  return Math.floor(n);
}

function parsePlanningTimeout(raw: string | undefined): number {
  if (raw === undefined || raw === "") return DEFAULT_PLANNING_TIMEOUT_MS;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`PLANNING_TIMEOUT_MS must be a positive integer: got "${raw}"`);
  }
  return n;
}

function parseListUrl(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function parseCorsUrl(raw?: string): string[] {
  const corsUrls = parseListUrl(raw ?? "");
  const allowedOrigins = corsUrls.length === 0 ? ["http://localhost:3000"] : corsUrls;
  return allowedOrigins;
}

/** Comma-separated list; undefined when unset or when it holds no items. */
function parseOptionalList(raw: string | undefined): string[] | undefined {
  const items = (raw ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  return items.length > 0 ? items : undefined;
}

/** Fails at start-up on a zone Intl does not know, instead of on the first request. */
function parseTimeZone(raw: string): string {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: raw });
  } catch {
    throw new Error(`INSTALL_TIME_ZONE must be an IANA time zone: got "${raw}"`);
  }
  return raw;
}

const REQUIRED_VARS = [
  "OIDC_HOST",
  "OIDC_BASE_URI",
  "OIDC_TOKEN_URI",
  "OIDC_CLIENT_ID",
  "OIDC_CLIENT_SECRET",
  "DATABASE_URL",
  "KEYCLOAK_REALMS",
  "REGION_CODE",
  "APPLICATION_ALIAS",
  "PLANNING_API_URL",
] as const;

function loadConfig(): AppConfig {
  const missing = REQUIRED_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  return {
    applicationAlias: process.env.APPLICATION_ALIAS!,
    database: {
      url: process.env.DATABASE_URL!,
      logger: process.env.NODE_ENV === "development",
      maxConnection: parseDbMaxConn(process.env.DATABASE_MAX_CONN),
      idleTimeoutMs: parseDbIdleTimeout(process.env.DATABASE_IDLE_TIMEOUT_MS),
      connectTimeoutMs: parseDbConnTimeout(process.env.DATABASE_CONN_TIMEOUT_MS),
    },
    oidc: {
      host: process.env.OIDC_HOST!,
      baseUri: process.env.OIDC_BASE_URI!,
      clientId: process.env.OIDC_CLIENT_ID!,
      clientSecret: process.env.OIDC_CLIENT_SECRET!,
      tokenUri: process.env.OIDC_TOKEN_URI!,
    },
    cors: {
      allowedOrigins: parseCorsUrl(process.env.CORS_ALLOWED_ORIGINS),
    },
    keycloak: {
      realms: process.env.KEYCLOAK_REALMS!,
      timeout: parseTimeout(process.env.KEYCLOAK_TIMEOUT),
    },
    auth: {
      audience: parseOptionalList(process.env.AUTH_AUDIENCE),
      allowedAzp: parseOptionalList(process.env.AUTH_ALLOWED_AZP),
    },
    planning: {
      // Trailing slashes stripped so the client joins paths without a double slash.
      baseUrl: process.env.PLANNING_API_URL!.replace(/\/+$/, ""),
      timeoutMs: parsePlanningTimeout(process.env.PLANNING_TIMEOUT_MS),
    },
    region: process.env.REGION_CODE!,
    installTimeZone: parseTimeZone(
      process.env.INSTALL_TIME_ZONE || Intl.DateTimeFormat().resolvedOptions().timeZone,
    ),
  };
}

/**
 * The start-up warning for AUTH_AUDIENCE, or undefined when it is unset. Keycloak
 * tokens carry `aud: account` (and `realm-management` for service accounts) unless
 * an audience mapper adds this API, so a set AUTH_AUDIENCE without that mapper
 * 401s every caller, the BFF included.
 */
function authAudienceWarning(auth: AppConfig["auth"]): string | undefined {
  if (!auth.audience) return undefined;
  return (
    `AUTH_AUDIENCE is set (${auth.audience.join(", ")}): every token without that audience gets 401, ` +
    "this API's own BFF included. Keycloak does not add it by default; it needs an audience mapper " +
    "on every calling client (README, API token checks). Unset AUTH_AUDIENCE if callers start to 401."
  );
}

export { authAudienceWarning, loadConfig, parseOptionalList };
export type { AppConfig };
