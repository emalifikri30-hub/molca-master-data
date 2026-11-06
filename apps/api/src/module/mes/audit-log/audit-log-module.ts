import { asClass, type AwilixContainer } from "awilix";

import { AuditLogService } from "./audit-log-service.js";
import { AuditLogStore } from "./audit-log-store.js";

function registerAuditLog(container: AwilixContainer) {
  container.register({
    auditLogStore: asClass(AuditLogStore).scoped(),
    auditLogService: asClass(AuditLogService).scoped(),
  });
}

export { registerAuditLog };
