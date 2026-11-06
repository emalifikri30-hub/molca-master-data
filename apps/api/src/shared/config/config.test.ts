import { describe, it, expect, beforeEach, afterEach } from "vite-plus/test";
import { loadConfig } from "./config.js";

const VALID_ENV = {
  OIDC_HOST: "http://localhost:9099/realms/test",
  OIDC_BASE_URI: "http://localhost:9099/realms/test",
  OIDC_TOKEN_URI: "http://localhost:9099/realms/test",
  OIDC_CLIENT_ID: "clientId",
  OIDC_CLIENT_SECRET: "clientSecret",
  DATABASE_URL: "postgresql://user:password@localhost:5432/my-database",
  KEYCLOAK_TIMEOUT: "30000",
  KEYCLOAK_REALMS: "lnd",
  REGION_CODE: "sea",
  APPLICATION_ALIAS: "library-test",
  PLANNING_API_URL: "http://planning.test",
};

describe("loadConfig", () => {
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    originalEnv = { ...process.env };
    for (const [key, value] of Object.entries(VALID_ENV)) {
      process.env[key] = value;
    }
    delete process.env.PROXY_UPSTREAM_TIMEOUT_MS;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should load all config values from environment", () => {
    const config = loadConfig();

    expect(config.oidc.baseUri).toBe("http://localhost:9099/realms/test");
    expect(config.region).toBe("sea");
  });

  it("reads the install time zone from INSTALL_TIME_ZONE (TNT-G8 b)", () => {
    process.env.INSTALL_TIME_ZONE = "Asia/Jakarta";
    expect(loadConfig().installTimeZone).toBe("Asia/Jakarta");
  });

  it("defaults the install time zone to the server's own", () => {
    delete process.env.INSTALL_TIME_ZONE;
    expect(loadConfig().installTimeZone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  it("refuses an install time zone Intl does not know", () => {
    process.env.INSTALL_TIME_ZONE = "Mars/Olympus";
    expect(() => loadConfig()).toThrow(
      'INSTALL_TIME_ZONE must be an IANA time zone: got "Mars/Olympus"',
    );
  });

  it("requires PLANNING_API_URL: there is no localhost default", () => {
    delete process.env.PLANNING_API_URL;

    expect(() => loadConfig()).toThrow("Missing required environment variables: PLANNING_API_URL");
  });

  it("strips trailing slashes from PLANNING_API_URL and defaults the timeout to 5000", () => {
    process.env.PLANNING_API_URL = "http://planning.test//";
    delete process.env.PLANNING_TIMEOUT_MS;

    expect(loadConfig().planning).toEqual({ baseUrl: "http://planning.test", timeoutMs: 5000 });
  });

  it("refuses a PLANNING_TIMEOUT_MS that is not a positive integer", () => {
    process.env.PLANNING_TIMEOUT_MS = "1.5";

    expect(() => loadConfig()).toThrow('PLANNING_TIMEOUT_MS must be a positive integer: got "1.5"');
  });

  it("should throw if a single required variable is missing", () => {
    delete process.env.OIDC_BASE_URI;

    expect(() => loadConfig()).toThrow("Missing required environment variables: OIDC_BASE_URI");
  });

  it("should throw if REGION_CODE is missing", () => {
    delete process.env.REGION_CODE;

    expect(() => loadConfig()).toThrow("Missing required environment variables: REGION_CODE");
  });

  it("should throw when all variables are missing", () => {
    for (const key of Object.keys(VALID_ENV)) {
      delete process.env[key];
    }

    expect(() => loadConfig()).toThrow("Missing required environment variables:");
  });
});
