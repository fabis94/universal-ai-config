import { afterEach, describe, expect, it, vi } from "vitest";
import { consola } from "consola";
import {
  DiagnosticSink,
  formatDiagnostic,
  printDiagnostic,
  type Diagnostic,
} from "../../src/core/diagnostics.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DiagnosticSink", () => {
  it("defaults severity to warn, and to info for shadowed", () => {
    const sink = new DiagnosticSink();
    sink.report({ code: "missing-doc", message: "m", detail: { name: "x" } });
    sink.report({
      code: "shadowed",
      message: "s",
      detail: {
        target: "claude",
        type: "skills",
        scope: "template",
        name: "a",
        losingPath: "b/skills/a/SKILL.md",
        winningPath: "a/skills/a/SKILL.md",
        losingSource: "b",
        winningSource: "a",
      },
    });
    expect(sink.items.map((d) => d.severity)).toEqual(["warn", "info"]);
  });

  it("keeps an explicit severity", () => {
    const sink = new DiagnosticSink();
    sink.report({ code: "missing-doc", severity: "info", message: "m", detail: { name: "x" } });
    expect(sink.items[0]!.severity).toBe("info");
  });

  it("drops exact duplicates but keeps diagnostics that differ only in detail", () => {
    const listener = vi.fn();
    const sink = new DiagnosticSink(listener);
    const base = { code: "missing-doc", message: "same" } as const;
    sink.report({ ...base, detail: { name: "a" } });
    sink.report({ ...base, detail: { name: "a" } });
    sink.report({ ...base, detail: { name: "b" } });
    expect(sink.items).toHaveLength(2);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("scoped() fills in target and type unless the diagnostic sets its own", () => {
    const sink = new DiagnosticSink();
    const report = sink.scoped("codex", "agents");
    report({ code: "unsupported", message: "a", detail: { kind: "field", name: "tools" } });
    report({
      code: "unsupported",
      target: "claude",
      type: "skills",
      message: "b",
      detail: { kind: "field", name: "tools" },
    });
    expect(sink.items.map((d) => [d.target, d.type])).toEqual([
      ["codex", "agents"],
      ["claude", "skills"],
    ]);
  });
});

describe("printDiagnostic", () => {
  const warning: Diagnostic = {
    code: "unsupported",
    severity: "warn",
    target: "codex",
    message: 'agent "x": "tools" dropped',
    detail: { kind: "field", name: "tools" },
  };

  it("prints warnings prefixed with the target", () => {
    const warn = vi.spyOn(consola, "warn").mockImplementation(() => {});
    printDiagnostic(warning);
    expect(warn).toHaveBeenCalledWith('[codex] agent "x": "tools" dropped');
  });

  it("stays quiet for info", () => {
    const warn = vi.spyOn(consola, "warn").mockImplementation(() => {});
    printDiagnostic({ ...warning, severity: "info" });
    expect(warn).not.toHaveBeenCalled();
  });

  it("uses [uac] when no target applies", () => {
    expect(formatDiagnostic({ ...warning, target: undefined })).toBe(
      '[uac] agent "x": "tools" dropped',
    );
  });
});
