import { describe, it, expect } from "vite-plus/test";

import { codeKey, sameCode } from "./code-match.js";

describe("codeKey", () => {
  it("trims and lower-cases the code", () => {
    expect(codeKey("  FI2-1 ")).toBe("fi2-1");
  });
});

describe("sameCode", () => {
  it("matches codes that differ only by case", () => {
    expect(sameCode("fi2-1", "FI2-1")).toBe(true);
  });

  it("matches codes that differ only by surrounding spaces", () => {
    expect(sameCode(" FI2-1 ", "FI2-1")).toBe(true);
  });

  it("does not match different codes", () => {
    expect(sameCode("FI2-1", "FI2-2")).toBe(false);
  });
});
