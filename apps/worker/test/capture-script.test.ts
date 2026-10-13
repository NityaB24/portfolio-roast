import { describe, expect, it } from "vitest";
import { EXTRACT_SIGNALS_SCRIPT } from "../src/capture";

describe("EXTRACT_SIGNALS_SCRIPT", () => {
  it("is syntactically valid JavaScript", () => {
    // Parsing only; the script needs a DOM to run.
    expect(() => new Function(`return ${EXTRACT_SIGNALS_SCRIPT.replace(/^\(\(\) =>/, "(() =>").replace(/\)\(\)$/, ")")}`)).not.toThrow();
  });
});
