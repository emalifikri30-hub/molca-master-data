import { describe, it, expect } from "vite-plus/test";
import { authAudienceWarning, parseOptionalList } from "./config.js";

describe("parseOptionalList", () => {
  it("returns undefined when unset", () => {
    expect(parseOptionalList(undefined)).toBeUndefined();
  });

  it("returns undefined for an empty string", () => {
    expect(parseOptionalList("")).toBeUndefined();
  });

  it("returns undefined when only separators and blanks", () => {
    expect(parseOptionalList(" , ")).toBeUndefined();
  });

  it("returns a single item", () => {
    expect(parseOptionalList("a")).toEqual(["a"]);
  });

  it("splits, trims and drops empty items", () => {
    expect(parseOptionalList("a, b ,,c")).toEqual(["a", "b", "c"]);
  });
});

describe("authAudienceWarning", () => {
  it("says nothing when AUTH_AUDIENCE is unset", () => {
    expect(authAudienceWarning({})).toBeUndefined();
  });

  it("warns, naming the audience and the lock-out risk, when it is set", () => {
    const warning = authAudienceWarning({ audience: ["dx-master-data"] });
    expect(warning).toContain("dx-master-data");
    expect(warning).toContain("401");
    expect(warning).toContain("audience mapper");
  });
});
