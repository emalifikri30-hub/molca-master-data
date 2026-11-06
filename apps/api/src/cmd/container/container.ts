import { registerLocationClasses } from "../../module/mes/location-classes/location-classes-module.js";
import type { TLocationClassesService } from "../../module/mes/location-classes/location-classes-service.js";
import { registerDataSources } from "../../module/mes/data-sources/data-sources-module.js";
import type { TDataSourcesService } from "../../module/mes/data-sources/data-sources-service.js";
import { registerProducts } from "../../module/mes/products/products-module.js";
import type { TProductsService } from "../../module/mes/products/products-service.js";
import { registerWorkMaster } from "../../module/mes/work-master/work-master-module.js";
import { registerKpiResults } from "../../module/mes/kpi-results/kpi-results-module.js";
import type { TKpiResultsService } from "../../module/mes/kpi-results/kpi-results-service.js";
import type { TWorkMasterService } from "../../module/mes/work-master/work-master-service.js";
import { registerReferenceData } from "../../module/mes/reference-data/reference-data-module.js";
import type { TReferenceDataService } from "../../module/mes/reference-data/reference-data-service.js";
import { registerFiscalYears } from "../../module/mes/fiscal-years/fiscal-years-module.js";
import type { TFiscalYearsService } from "../../module/mes/fiscal-years/fiscal-years-service.js";
import { registerShifts } from "../../module/mes/shifts/shifts-module.js";
import type { TShiftsService } from "../../module/mes/shifts/shifts-service.js";
import { registerAuditLog } from "../../module/mes/audit-log/audit-log-module.js";
import type { TAuditLogService } from "../../module/mes/audit-log/audit-log-service.js";
import {
  type AwilixContainer,
  createContainer as newContainer,
  InjectionMode,
  asValue,
  asClass,
  asFunction,
} from "awilix";

import type { Probe } from "../../module/health/health-service.js";
import type { AppConfig } from "../../shared/config/config.js";
import type { PostgresDB } from "../../shared/database/postgres.js";
import type { Transact } from "../../shared/database/transaction.js";

import { baseLogger } from "@molca/observability";
import { registerInfra } from "../../shared/infra-module.js";
import { registerTenant } from "../../shared/tenant/tenant-module.js";
import { registerPlatform } from "../../module/platform/platform-module.js";
import type { TPlatformTenantsService } from "../../module/platform/platform-tenants-service.js";
import type { FindTenant } from "../../shared/tenant/tenant-store.js";
import { registerHealth } from "../../module/health/health-module.js";
import { registerComment } from "../../module/comment/comment-module.js";
import { registerPost } from "../../module/post/post-module.js";
import { registerEnterprise } from "../../module/mes/enterprise/enterprise-module.js";
import { registerSites } from "../../module/mes/sites/sites-module.js";
import { registerAreas } from "../../module/mes/areas/areas-module.js";
import { registerWorkCenters } from "../../module/mes/work-centers/work-centers-module.js";
import { registerHierarchyDeactivation } from "../../module/mes/site-hierarchy/hierarchy-deactivation-module.js";
import type { HierarchyDeactivationService } from "../../module/mes/site-hierarchy/hierarchy-deactivation.js";
import { registerHierarchyTree } from "../../module/mes/site-hierarchy/hierarchy-tree-module.js";
import type { HierarchyTreeService } from "../../module/mes/site-hierarchy/hierarchy-tree-service.js";
import { registerWorkUnits } from "../../module/mes/work-units/work-units-module.js";
import { registerEquipmentFlows } from "../../module/mes/equipment-flows/equipment-flows-module.js";
import { registerAssetClasses } from "../../module/mes/asset-classes/asset-classes-module.js";
import { registerPeople } from "../../module/mes/people/people-module.js";
import { registerCrews } from "../../module/mes/crews/crews-module.js";
import { registerAssetTypes } from "../../module/mes/asset-types/asset-types-module.js";
import { registerAssets } from "../../module/mes/assets/assets-module.js";
import { registerAssetPlacements } from "../../module/mes/asset-placements/asset-placements-module.js";
import { registerAssetTags } from "../../module/mes/asset-tags/asset-tags-module.js";
import { registerAssetProductCodes } from "../../module/mes/asset-product-codes/asset-product-codes-module.js";
import { registerKpiFormulaSlots } from "../../module/mes/kpi-formula-slots/kpi-formula-slots-module.js";
import { registerKpiParameters } from "../../module/mes/kpi-parameters/kpi-parameters-module.js";
import { registerWorkUnitKpiBindings } from "../../module/mes/work-unit-kpi-bindings/work-unit-kpi-bindings-module.js";
import type { CommentReader, CommentWriter } from "../../module/comment/comment-repository.js";
import type { TCommentService } from "../../module/comment/comment-service.js";
import type { CommentClientContract, PlanningClientContract } from "@molca/contract-client";
import { PlanningClient } from "../../module/planning/planning-client.js";
import type { PostReader, PostWriter } from "../../module/post/post-repository.js";
import type { TPostService } from "../../module/post/post-service.js";
import type { AuthMiddleware } from "@molca/mes";
import type { EnterpriseStore } from "../../module/mes/enterprise/enterprise-store.js";
import type { TEnterpriseService } from "../../module/mes/enterprise/enterprise-service.js";
import type { SitesStore } from "../../module/mes/sites/sites-store.js";
import type { TSitesService } from "../../module/mes/sites/sites-service.js";
import type { AreasStore } from "../../module/mes/areas/areas-store.js";
import type { TAreasService } from "../../module/mes/areas/areas-service.js";
import type { WorkCentersStore } from "../../module/mes/work-centers/work-centers-store.js";
import type { TWorkCentersService } from "../../module/mes/work-centers/work-centers-service.js";
import type { WorkUnitsStore } from "../../module/mes/work-units/work-units-store.js";
import type { TWorkUnitsService } from "../../module/mes/work-units/work-units-service.js";
import type { EquipmentFlowsStore } from "../../module/mes/equipment-flows/equipment-flows-store.js";
import type { TEquipmentFlowsService } from "../../module/mes/equipment-flows/equipment-flows-service.js";
import type { AssetClassesStore } from "../../module/mes/asset-classes/asset-classes-store.js";
import type { TAssetClassesService } from "../../module/mes/asset-classes/asset-classes-service.js";
import type { AssetTypesStore } from "../../module/mes/asset-types/asset-types-store.js";
import type { TAssetTypesService } from "../../module/mes/asset-types/asset-types-service.js";
import type { AssetsStore } from "../../module/mes/assets/assets-store.js";
import type { TAssetsService } from "../../module/mes/assets/assets-service.js";
import type { AssetPlacementsStore } from "../../module/mes/asset-placements/asset-placements-store.js";
import type { TAssetPlacementsService } from "../../module/mes/asset-placements/asset-placements-service.js";
import type { AssetTagsStore } from "../../module/mes/asset-tags/asset-tags-store.js";
import type { TAssetTagsService } from "../../module/mes/asset-tags/asset-tags-service.js";
import type { AssetProductCodesStore } from "../../module/mes/asset-product-codes/asset-product-codes-store.js";
import type { TAssetProductCodesService } from "../../module/mes/asset-product-codes/asset-product-codes-service.js";
import type { KpiFormulaSlotsStore } from "../../module/mes/kpi-formula-slots/kpi-formula-slots-store.js";
import type { TKpiFormulaSlotsService } from "../../module/mes/kpi-formula-slots/kpi-formula-slots-service.js";
import type { KpiParametersStore } from "../../module/mes/kpi-parameters/kpi-parameters-store.js";
import type { TKpiParametersService } from "../../module/mes/kpi-parameters/kpi-parameters-service.js";
import type { WorkUnitKpiBindingsStore } from "../../module/mes/work-unit-kpi-bindings/work-unit-kpi-bindings-store.js";
import type { TWorkUnitKpiBindingsService } from "../../module/mes/work-unit-kpi-bindings/work-unit-kpi-bindings-service.js";

type Cradle = {
  db: PostgresDB;
  authMw: AuthMiddleware;
  findTenant: FindTenant;
  platformTenantsService: TPlatformTenantsService;
  transact: Transact;
  keycloakProbe: Probe;
  postgresProbe: Probe;
  commentReaderRepository: CommentReader;
  commentWriterRepository: CommentWriter;
  commentService: TCommentService;
  commentClient: CommentClientContract;
  planningBaseUrl: string;
  planningTimeoutMs: number;
  planningClient: PlanningClientContract;
  postReaderRepository: PostReader;
  postWriterRepository: PostWriter;
  postService: TPostService;
  enterpriseStore: EnterpriseStore;
  enterpriseService: TEnterpriseService;
  sitesStore: SitesStore;
  sitesService: TSitesService;
  areasStore: AreasStore;
  areasService: TAreasService;
  workCentersStore: WorkCentersStore;
  workCentersService: TWorkCentersService;
  workUnitsStore: WorkUnitsStore;
  workUnitsService: TWorkUnitsService;
  equipmentFlowsStore: EquipmentFlowsStore;
  equipmentFlowsService: TEquipmentFlowsService;
  assetClassesStore: AssetClassesStore;
  assetClassesService: TAssetClassesService;
  assetTypesStore: AssetTypesStore;
  assetTypesService: TAssetTypesService;
  assetsStore: AssetsStore;
  assetsService: TAssetsService;
  assetPlacementsStore: AssetPlacementsStore;
  assetPlacementsService: TAssetPlacementsService;
  assetTagsStore: AssetTagsStore;
  assetTagsService: TAssetTagsService;
  assetProductCodesStore: AssetProductCodesStore;
  assetProductCodesService: TAssetProductCodesService;
  kpiFormulaSlotsStore: KpiFormulaSlotsStore;
  kpiFormulaSlotsService: TKpiFormulaSlotsService;
  kpiParametersStore: KpiParametersStore;
  kpiParametersService: TKpiParametersService;
  workUnitKpiBindingsStore: WorkUnitKpiBindingsStore;
  workUnitKpiBindingsService: TWorkUnitKpiBindingsService;
  hierarchyDeactivationService: HierarchyDeactivationService;
  hierarchyTreeService: HierarchyTreeService;
  auditLogService: TAuditLogService;
  shiftsService: TShiftsService;
  fiscalYearsService: TFiscalYearsService;
  referenceDataService: TReferenceDataService;
  workMasterService: TWorkMasterService;
  kpiResultsService: TKpiResultsService;
  productsService: TProductsService;
  dataSourcesService: TDataSourcesService;
  locationClassesService: TLocationClassesService;
};

function createContainer(config: AppConfig): AwilixContainer<Cradle> {
  const container: AwilixContainer<Cradle> = newContainer<Cradle>({
    injectionMode: InjectionMode.PROXY,
    strict: true,
  });

  container.register({
    region: asValue(config.region),
    logger: asFunction(() => baseLogger).singleton(),
  });
  registerInfra(container, config);
  registerTenant(container);
  registerPlatform(container);
  registerHealth(container, config);
  registerComment(container);
  registerPost(container);
  registerEnterprise(container);
  registerSites(container);
  registerAreas(container);
  registerWorkCenters(container);
  registerWorkUnits(container);
  registerEquipmentFlows(container);
  registerAssetClasses(container);
  registerPeople(container);
  registerCrews(container);
  registerAssetTypes(container);
  registerAssets(container);
  registerAssetPlacements(container);
  registerAssetTags(container);
  registerAssetProductCodes(container);
  registerKpiFormulaSlots(container);
  registerKpiParameters(container);
  registerWorkUnitKpiBindings(container);
  registerHierarchyDeactivation(container);
  registerHierarchyTree(container);

  registerAuditLog(container);

  registerShifts(container);

  registerFiscalYears(container);

  registerReferenceData(container);

  registerWorkMaster(container);
  registerKpiResults(container);

  registerProducts(container);

  registerDataSources(container);

  registerLocationClasses(container);

  container.register({
    planningBaseUrl: asValue(config.planning.baseUrl),
    planningTimeoutMs: asValue(config.planning.timeoutMs),
    planningClient: asClass(PlanningClient).singleton(),
  });

  return container;
}

export { createContainer };
export type { Cradle };
