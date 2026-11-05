import { describe, expect, it } from "vitest";
import { flattenCommand, shellQuote } from "../../src/core/shell.js";

describe("shellQuote", () => {
  it("leaves safe bare words alone", () => {
    expect(shellQuote("--flag=a,b")).toBe("--flag=a,b");
    expect(shellQuote("./scripts/run.sh")).toBe("./scripts/run.sh");
  });

  it("single-quotes words with spaces or shell characters", () => {
    expect(shellQuote("two words")).toBe("'two words'");
    expect(shellQuote("$HOME")).toBe("'$HOME'");
    expect(shellQuote("")).toBe("''");
  });

  it("escapes embedded single quotes", () => {
    expect(shellQuote("it's")).toBe("'it'\\''s'");
  });
});

describe("flattenCommand", () => {
  it("returns the command unchanged without args", () => {
    expect(flattenCommand("node hook.js")).toBe("node hook.js");
    expect(flattenCommand("node hook.js", [])).toBe("node hook.js");
  });

  it("appends quoted args", () => {
    expect(flattenCommand("node", ["hook.js", "a b", "it's"])).toBe(
      "node hook.js 'a b' 'it'\\''s'",
    );
  });
});
