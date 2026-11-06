import { describe, expect, it } from "vite-plus/test";

import {
  cleanSegment,
  findSegmentClash,
  generatedAddress,
  namespaceForm,
  nsPart,
  segmentClashMessage,
  wasCleaned,
} from "./generated-address.js";

// PRD-003 US-FND-DSR-001 — worked examples of F-04 §9.7.1, copied from the
// story: packer PCK01 placed on ENT1 › JKT1 › AS › L01 › S01, tag Total_Count.
const placed = { enterprise: "ENT1", site: "JKT1", area: "AS", workCenter: "L01", workUnit: "S01" };
const base = {
  protocol: "opcua",
  nodeNaming: "generated",
  namespaceUri: "ns-u-1",
  topicRoot: "",
  codes: placed,
  assetTag: "PCK01",
  tagName: "Total_Count",
} as const;

describe("generatedAddress (DSR-001 / F-04 §9.7.1)", () => {
  it("builds the OPC UA node from the placement path, URI namespace (AC-8)", () => {
    expect(generatedAddress(base)).toBe("nsu=ns-u-1;s=ENT1/JKT1/AS/L01/S01/PCK01/Total_Count");
    expect(
      generatedAddress({ ...base, assetTag: "PCK02", codes: { ...placed, workUnit: "S02" } }),
    ).toBe("nsu=ns-u-1;s=ENT1/JKT1/AS/L01/S02/PCK02/Total_Count");
  });

  it("builds the MQTT topic, one value per topic, root optional (AC-19)", () => {
    const mqtt = { ...base, protocol: "mqtt" } as const;
    expect(generatedAddress(mqtt)).toBe("ENT1/JKT1/AS/L01/S01/PCK01/Total_Count");
    expect(generatedAddress({ ...mqtt, topicRoot: "molca" })).toBe(
      "molca/ENT1/JKT1/AS/L01/S01/PCK01/Total_Count",
    );
  });

  it("starts with the enterprise code, cleaned like every segment (F-04 §9.7.1, PO 2026-10-02)", () => {
    // Two enterprises may both have a site JKT1; the first segment keeps them apart.
    const other = { ...placed, enterprise: "NUS-1" };
    expect(generatedAddress({ ...base, codes: other })).toBe(
      "nsu=ns-u-1;s=NUS_1/JKT1/AS/L01/S01/PCK01/Total_Count",
    );
    expect(generatedAddress({ ...base, codes: other })).not.toBe(generatedAddress(base));
  });

  it("stays empty on a manual source (rule 9)", () => {
    expect(generatedAddress({ ...base, nodeNaming: "manual" })).toBe("");
  });

  it("stays empty without an active placement — never a stale address (rule 13)", () => {
    expect(generatedAddress({ ...base, codes: null })).toBe("");
    // Multi-lane tag whose own work unit is unset.
    expect(generatedAddress({ ...base, codes: null, protocol: "mqtt" })).toBe("");
  });

  it("stays empty for a protocol with no scheme in the spec", () => {
    expect(generatedAddress({ ...base, protocol: "other" })).toBe("");
  });
});

describe("namespace typed as the gateway shows it (DSR-001 AC-8b, PO 2026-10-06)", () => {
  it("gives a URI the nsu= form and previews it", () => {
    expect(nsPart("urn:molca:MJK")).toBe("nsu=urn:molca:MJK");
    expect(generatedAddress({ ...base, namespaceUri: "urn:molca:MJK" })).toBe(
      "nsu=urn:molca:MJK;s=ENT1/JKT1/AS/L01/S01/PCK01/Total_Count",
    );
  });

  it("gives a namespace number the ns= form", () => {
    expect(nsPart("2")).toBe("ns=2");
    expect(generatedAddress({ ...base, namespaceUri: "2" })).toBe(
      "ns=2;s=ENT1/JKT1/AS/L01/S01/PCK01/Total_Count",
    );
  });

  it("reads a whole number as an index and a URI as a URI", () => {
    expect(namespaceForm("2")).toBe("index");
    expect(namespaceForm("0")).toBe("index");
    expect(namespaceForm("urn:molca:MJK")).toBe("uri");
  });

  it("reads a value that is neither as invalid — the save is refused (AC-8b)", () => {
    expect(namespaceForm("abc")).toBe("invalid");
    expect(namespaceForm("-1")).toBe("invalid");
  });
});

describe("cleaned segments (F-04 §9.7.1, PO 2026-10-02)", () => {
  it("cleans a site code with `-` into the segment FI_2 (SIT-001 AC-11, DSR-001 AC-8)", () => {
    const codes = { ...placed, site: "FI-2" };
    expect(generatedAddress({ ...base, codes })).toBe(
      "nsu=ns-u-1;s=ENT1/FI_2/AS/L01/S01/PCK01/Total_Count",
    );
    expect(wasCleaned(["FI-2", "AS"])).toBe(true);
    expect(wasCleaned(["JKT1", "AS"])).toBe(false);
  });

  it("keeps a floor tag as typed and cleans it in the address (AST-002 AC-10, DSR-001 AC-10)", () => {
    expect(cleanSegment("ANRITSU 57-1")).toBe("ANRITSU_57_1");
    expect(generatedAddress({ ...base, assetTag: "ANRITSU 57-1" })).toBe(
      "nsu=ns-u-1;s=ENT1/JKT1/AS/L01/S01/ANRITSU_57_1/Total_Count",
    );
  });

  it("finds a sibling that cleans to the same segment (SIT-001 AC-16)", () => {
    const siblings = [{ code: "FI-2" }, { code: "AS" }];
    expect(findSegmentClash(siblings, "FI_2")?.code).toBe("FI-2");
    expect(findSegmentClash(siblings, "FI-2")).toBeUndefined();
    expect(segmentClashMessage("FI-2", "FI_2")).toBe(
      "FI-2 and FI_2 both become FI_2 in the tag address. Change one of them.",
    );
  });

  it("names both floor tags on a clash (AST-002 AC-11)", () => {
    expect(segmentClashMessage("MITSUM-1", "MITSUM 1")).toBe(
      "MITSUM-1 and MITSUM 1 both become MITSUM_1 in the tag address. Change one of them.",
    );
  });
});
