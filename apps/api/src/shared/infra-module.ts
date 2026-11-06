import { asFunction, type AwilixContainer } from "awilix";
import { createAuthMiddleware, createKeycloakJwks, bearerToken } from "@molca/mes";
import type { AppConfig } from "./config/config.js";
import { createPostgresDb } from "./database/postgres.js";
import { createTransact } from "./database/transaction.js";

function registerInfra(container: AwilixContainer, config: AppConfig) {
  container.register({
    db: asFunction(() =>
      createPostgresDb({
        connectionString: config.database.url,
        max: config.database.maxConnection,
        connectionTimeoutMillis: config.database.connectTimeoutMs,
        idleTimeoutMillis: config.database.idleTimeoutMs,
      }),
    )
      .singleton()
      .disposer((conn) => conn.$client.end()),
    // Wraps a multi-row write so it commits whole or not at all (shared/database/transaction.ts).
    transact: asFunction(({ db }) => createTransact(db)).singleton(),
    authMw: asFunction(() =>
      createAuthMiddleware({
        issuer: config.oidc.baseUri,
        getKey: createKeycloakJwks(config.oidc.baseUri),
        getToken: bearerToken(),
        audience: config.auth.audience,
        allowedAzp: config.auth.allowedAzp,
      }),
    ).singleton(),
  });
}

export { registerInfra };
