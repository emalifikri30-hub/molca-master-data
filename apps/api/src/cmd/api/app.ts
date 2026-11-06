import { createLocationClassesHandler } from "../../module/mes/location-classes/location-classes-handler.js";
import { createDataSourcesHandler } from "../../module/mes/data-sources/data-sources-handler.js";
import { createProductsHandler } from "../../module/mes/products/products-handler.js";
import { createWorkMasterHandler } from "../../module/mes/work-master/work-master-handler.js";
import { createKpiResultsHandler } from "../../module/mes/kpi-results/kpi-results-handler.js";
import { createReferenceDataHandler } from "../../module/mes/reference-data/reference-data-handler.js";
import { createFiscalYearsHandler } from "../../module/mes/fiscal-years/fiscal-years-handler.js";
import { createShiftsHandler } from "../../module/mes/shifts/shifts-handler.js";
import { createAuditLogHandler } from "../../module/mes/audit-log/audit-log-handler.js";
import { startOtel } from "@molca/observability";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";

// Start the OTel SDK before anything else loads so instrumentation can patch
// modules. In prod this is a no-op (already started by --import instrumentation.mjs).
// Postgres instrumentation is app-specific, so it is passed in here.
startOtel({ instrumentations: [new PgInstrumentation()] });

import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { httpInstrumentationMiddleware } from "@hono/otel";

import { createContainer } from "../container/container.js";
import { authAudienceWarning, loadConfig } from "../../shared/config/config.js";
import { createHealthHandler } from "../../module/health/health-handler.js";
import { createCommentHandler } from "../../module/comment/comment-handler.js";
import { createPostHandler } from "../../module/post/post-handler.js";
import { createEnterpriseHandler } from "../../module/mes/enterprise/enterprise-handler.js";
import { createSitesHandler } from "../../module/mes/sites/sites-handler.js";
import { createHierarchyDeactivationHandler } from "../../module/mes/site-hierarchy/hierarchy-deactivation-handler.js";
import { createHierarchyTreeHandler } from "../../module/mes/site-hierarchy/hierarchy-tree-handler.js";
import { createAreasHandler } from "../../module/mes/areas/areas-handler.js";
import { createWorkCentersHandler } from "../../module/mes/work-centers/work-centers-handler.js";
import { createWorkUnitsHandler } from "../../module/mes/work-units/work-units-handler.js";
import { createEquipmentFlowsHandler } from "../../module/mes/equipment-flows/equipment-flows-handler.js";
import { createAssetClassesHandler } from "../../module/mes/asset-classes/asset-classes-handler.js";
import { createAssetTypesHandler } from "../../module/mes/asset-types/asset-types-handler.js";
import { createAssetsHandler } from "../../module/mes/assets/assets-handler.js";
import { createAssetPlacementsHandler } from "../../module/mes/asset-placements/asset-placements-handler.js";
import { createAssetTagsHandler } from "../../module/mes/asset-tags/asset-tags-handler.js";
import { createAssetProductCodesHandler } from "../../module/mes/asset-product-codes/asset-product-codes-handler.js";
import { createKpiFormulaSlotsHandler } from "../../module/mes/kpi-formula-slots/kpi-formula-slots-handler.js";
import { createKpiParametersHandler } from "../../module/mes/kpi-parameters/kpi-parameters-handler.js";
import { createWorkUnitKpiBindingsHandler } from "../../module/mes/work-unit-kpi-bindings/work-unit-kpi-bindings-handler.js";
import { appErrorHandler } from "../../shared/errors/app-error-handler.js";
import { transactionMiddleware } from "../../shared/database/transaction-middleware.js";
import { auditMiddleware } from "../../shared/audit/audit-middleware.js";
import { createTenantMiddleware } from "../../shared/tenant/tenant-middleware.js";
import { createTenantHandler } from "../../module/tenant/tenant-handler.js";
import { baseLogger, observability } from "@molca/observability";
import { createPlatformApi } from "../../module/platform/platform-api.js";
import { WebResponse } from "@molca/network";
import { createCallerOrganizationMiddleware } from "../../shared/tenant/caller-organization.js";

const config = loadConfig();
const container = createContainer(config);

const audienceWarning = authAudienceWarning(config.auth);
if (audienceWarning) baseLogger.warn(audienceWarning);

const app = new Hono();

app.use("*", httpInstrumentationMiddleware());
app.use("*", observability());
app.use(
  "*",
  cors({
    origin: config.cors.allowedOrigins,
  }),
);

app.route(
  "/health",
  createHealthHandler({
    keycloakProbe: container.resolve("keycloakProbe"),
    postgresProbe: container.resolve("postgresProbe"),
  }),
);

// dx-platform's service account (cross-repo contract §0, E-2 exception). Mounted before
// the tenant API: its token has no organization, and the tenant API refuses such a token.
app.route(
  "/",
  createPlatformApi({
    authMw: container.resolve("authMw"),
    transact: container.resolve("transact"),
    platformTenantsService: container.resolve("platformTenantsService"),
  }),
);

const api = new Hono().basePath("/api/v1");

// Every master-data route requires the bearer token the BFF injects.
// The browser never calls this port directly.
api.use("*", container.resolve("authMw"));
// Every request must name one Keycloak organization in its token; none or several is refused (F-00 rule 6, E-2).
// One exception: USR's service client reads a tenant it names in X-Tenant-Id (contract §0b).
api.use("*", createCallerOrganizationMiddleware());
// Every request works in the one tenant of the signed-in organization (F-00 rule 6, E-2).
// An organization with no tenant in force today is refused before any handler runs.
api.use(
  "*",
  createTenantMiddleware({
    findTenant: container.resolve("findTenant"),
    timeZone: config.installTimeZone,
  }),
);
// One write request = one transaction: every row it writes commits together or
// not at all, and a refusal or failure rolls back (#18).
api.use("*", transactionMiddleware(container.resolve("transact")));
// The system writes each save's audit rows, in that transaction (F-14 §9.2).
api.use("*", auditMiddleware(container.resolve("auditLogService"), container.resolve("db")));

api.route("/tenant", createTenantHandler());

api.route(
  "/posts",
  createPostHandler({
    authMw: container.resolve("authMw"),
    postService: container.resolve("postService"),
  }),
);

api.route(
  "/comments",
  createCommentHandler({
    authMw: container.resolve("authMw"),
    commentService: container.resolve("commentService"),
  }),
);

api.route(
  "/enterprise",
  createEnterpriseHandler({ enterpriseService: container.resolve("enterpriseService") }),
);

api.route("/sites", createSitesHandler({ sitesService: container.resolve("sitesService") }));

api.route("/areas", createAreasHandler({ areasService: container.resolve("areasService") }));

api.route(
  "/work-centers",
  createWorkCentersHandler({ workCentersService: container.resolve("workCentersService") }),
);

api.route(
  "/work-units",
  createWorkUnitsHandler({ workUnitsService: container.resolve("workUnitsService") }),
);

api.route(
  "/equipment-flows",
  createEquipmentFlowsHandler({
    equipmentFlowsService: container.resolve("equipmentFlowsService"),
  }),
);

api.route(
  "/asset-classes",
  createAssetClassesHandler({ assetClassesService: container.resolve("assetClassesService") }),
);

api.route(
  "/asset-types",
  createAssetTypesHandler({ assetTypesService: container.resolve("assetTypesService") }),
);

api.route("/assets", createAssetsHandler({ assetsService: container.resolve("assetsService") }));

api.route(
  "/asset-placements",
  createAssetPlacementsHandler({
    assetPlacementsService: container.resolve("assetPlacementsService"),
  }),
);

api.route(
  "/asset-tags",
  createAssetTagsHandler({ assetTagsService: container.resolve("assetTagsService") }),
);

api.route(
  "/asset-product-codes",
  createAssetProductCodesHandler({
    assetProductCodesService: container.resolve("assetProductCodesService"),
  }),
);

api.route(
  "/kpi-formula-slots",
  createKpiFormulaSlotsHandler({
    kpiFormulaSlotsService: container.resolve("kpiFormulaSlotsService"),
  }),
);

api.route(
  "/kpi-parameters",
  createKpiParametersHandler({
    kpiParametersService: container.resolve("kpiParametersService"),
  }),
);

api.route(
  "/work-unit-kpi-bindings",
  createWorkUnitKpiBindingsHandler({
    workUnitKpiBindingsService: container.resolve("workUnitKpiBindingsService"),
  }),
);

api.route(
  "/site-hierarchy",
  createHierarchyDeactivationHandler({
    hierarchyDeactivationService: container.resolve("hierarchyDeactivationService"),
  }),
);

api.route(
  "/site-hierarchy/tree",
  createHierarchyTreeHandler({
    hierarchyTreeService: container.resolve("hierarchyTreeService"),
  }),
);

api.route(
  "/audit-log",
  createAuditLogHandler({ auditLogService: container.resolve("auditLogService") }),
);

api.route("/shifts", createShiftsHandler({ shiftsService: container.resolve("shiftsService") }));

api.route(
  "/fiscal-years",
  createFiscalYearsHandler({ fiscalYearsService: container.resolve("fiscalYearsService") }),
);

api.route(
  "/reference-data",
  createReferenceDataHandler({ referenceDataService: container.resolve("referenceDataService") }),
);

api.route(
  "/kpi-results",
  createKpiResultsHandler({ kpiResultsService: container.resolve("kpiResultsService") }),
);

api.route(
  "/work-master",
  createWorkMasterHandler({ workMasterService: container.resolve("workMasterService") }),
);

api.route(
  "/products",
  createProductsHandler({ productsService: container.resolve("productsService") }),
);

api.route(
  "/data-sources",
  createDataSourcesHandler({ dataSourcesService: container.resolve("dataSourcesService") }),
);

api.route(
  "/location-classes",
  createLocationClassesHandler({
    locationClassesService: container.resolve("locationClassesService"),
  }),
);

app.route("/", api);

app.notFound((c) => {
  return c.json(WebResponse.builder<string>().error("This address doesn't exist.").build(), 404);
});

app.onError(appErrorHandler);

export { container };
export default app;
