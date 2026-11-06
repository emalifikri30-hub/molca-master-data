// FOUNDATION F-13 DATA_SOURCE (PRD-003 13-data-source.md): one PLC / OPC UA /
// MQTT connection that ASSET_TAGS.data_source_id points at. DSR-001 itself is
// blocked on CFG-001; this module only holds the rows the rest reads.
//
// PRD-003 DSR-001 (PO 2026-09-28): `node_naming` decides where tag addresses
// come from — `generated` is built from the machine's place in the hierarchy
// (opcua and mqtt), `manual` types each address (fixed vendor servers,
// device-published MQTT topics). The choice is per connection, never per tag;
// `generated` is the default for a new source.

import type {
  DATA_SOURCE_PROTOCOL_VALUES,
  NODE_NAMING_VALUES,
} from "../../../shared/database/schema/value-lists.js";
type DataSourceProtocol = (typeof DATA_SOURCE_PROTOCOL_VALUES)[number];
type DataSourceNodeNaming = (typeof NODE_NAMING_VALUES)[number];

type DataSource = {
  id: string;
  /** F-13 §9.1: the site the connection serves; never changes (rule 16). null only on old rows. */
  siteId: string | null;
  name: string;
  protocol: DataSourceProtocol;
  /** `generated` (default) / `manual` — DSR-001 rule 7. */
  nodeNaming: DataSourceNodeNaming;
  /** OPC UA only; required when nodeNaming = generated, else "". Typed as the
   * gateway shows it (PO 2026-10-06): a namespace URI or a numeric index. */
  namespaceUri: string;
  /** MQTT + generated only, optional; empty otherwise (H-DS-7 open on scope). */
  topicRoot: string;
  connectionConfig: Record<string, string>;
  validFrom: string;
  validTo: string | null;
};

export type { DataSource, DataSourceNodeNaming, DataSourceProtocol };
