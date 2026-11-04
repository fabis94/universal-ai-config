import { consola } from "consola";
import type { ShadowEvent, Target, TemplateType } from "../types.js";

/** `warn` is printed by default; `info` only reaches an explicit `onDiagnostic` (and `--verbose`). */
export type DiagnosticSeverity = "info" | "warn";

/** Who produced a shared output another target reads instead of its own. */
type OutputSource = Target | "agentsMd";

/**
 * Structured data for each diagnostic code. The CLI groups on these fields and
 * API callers can act on them without parsing `message`.
 */
export interface DiagnosticDetails {
  /** A template, JSON file or merged entry lost a name collision to a higher-precedence source. */
  shadowed: ShadowEvent;
  /**
   * A target skipped its own output for a type because it reads another
   * output instead (AGENTS.md, or another target's file).
   */
  "served-by": {
    by: OutputSource;
    loses: string;
    /**
     * `overlap`: another target in the run produces the output (codex for
     * AGENTS.md) — usually fixed by generating fewer targets per machine.
     * `agents-md-enabled`: the project turned AGENTS.md on itself.
     */
    reason: "overlap" | "agents-md-enabled";
  };
  /** The shared output was rendered for `view`, and `reader` would have gotten something else. */
  "shared-divergence": {
    view: Target;
    reader: Target;
    name: string;
    kind: "missing" | "extra" | "different";
  };
  /** A tool will run another target's hook as well as its own, because the commands differ. */
  "duplicate-hook-run": { against: Target; event: string; command: string };
  /** `agentsMd.enable: false` was ignored because codex is a target. */
  "agents-md-forced": { enable: false };
  /** Claude reads AGENTS.md only while no non-empty CLAUDE.md exists. */
  "claude-md-present": { files: string[] };
  /** A folder's AGENTS.md chain is over Codex's combined budget. */
  "agents-md-size": { files: string[]; bytes: number; limit: number };
  /** A glob that can't be expressed by AGENTS.md routing. */
  "agents-md-glob": { template: string; glob: string; reason: "negated" | "parent-segment" };
  /** A template type, hook handler type, hook event or field a target can't express. */
  unsupported: { kind: "type" | "handler-type" | "event" | "field"; name: string };
  /** A field the target only accepts in a legacy format it no longer generates. */
  "legacy-field": { field: string };
  /** A skill that breaks the Agent Skills spec. */
  "skill-spec": { skill: string; field: string };
  /** `mcp.mcpServers` named a server no template declares. */
  "mcp-unknown-server": { names: string[]; known: string[] };
  /** `docPath()` named a doc no template source has. */
  "missing-doc": { name: string };
  /** A value the target accepts but that is likely wrong (wrong model family, wrong unit, …). */
  "suspicious-value": { field: string; value: unknown };
}

export type DiagnosticCode = keyof DiagnosticDetails;

interface DiagnosticBase {
  severity: DiagnosticSeverity;
  message: string;
  target?: Target;
  type?: TemplateType;
  /** Output path the diagnostic is about, root-relative */
  path?: string;
  /** Template path the diagnostic is about, root-relative */
  source?: string;
}

/** One diagnostic, discriminated on `code`; `detail` is typed per code. */
export type Diagnostic = {
  [C in DiagnosticCode]: DiagnosticBase & { code: C; detail: DiagnosticDetails[C] };
}[DiagnosticCode];

/** A diagnostic before the reporter fills in its target and type. */
export type DiagnosticInput = {
  [C in DiagnosticCode]: Omit<DiagnosticBase, "severity"> & {
    code: C;
    detail: DiagnosticDetails[C];
    severity?: DiagnosticSeverity;
  };
}[DiagnosticCode];

export type Reporter = (diagnostic: DiagnosticInput) => void;

/** Codes that are informational by default; everything else warns. */
const INFO_CODES: ReadonlySet<DiagnosticCode> = new Set(["shadowed"]);

function dedupeKey(d: Diagnostic): string {
  return [
    d.code,
    d.target ?? "",
    d.type ?? "",
    d.path ?? "",
    d.source ?? "",
    d.message,
    JSON.stringify(d.detail),
  ].join("\u0000");
}

/**
 * Collects every diagnostic of one generate run. Identical diagnostics are
 * kept once: a renderer that runs for several targets or passes must not
 * repeat itself.
 */
export class DiagnosticSink {
  readonly items: Diagnostic[] = [];
  private readonly seen = new Set<string>();

  constructor(private readonly listener?: (diagnostic: Diagnostic) => void) {}

  report(input: DiagnosticInput): void {
    const diagnostic = {
      ...input,
      severity: input.severity ?? (INFO_CODES.has(input.code) ? "info" : "warn"),
    } as Diagnostic;
    const key = dedupeKey(diagnostic);
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.items.push(diagnostic);
    this.listener?.(diagnostic);
  }

  /** A reporter that fills in `target` (and `type`) unless the diagnostic sets its own. */
  scoped(target?: Target, type?: TemplateType): Reporter {
    return (input) =>
      this.report({
        ...input,
        target: input.target ?? target,
        type: input.type ?? type,
      } as DiagnosticInput);
  }
}

/** The default listener for API callers that pass no `onDiagnostic`: print warnings. */
export function printDiagnostic(diagnostic: Diagnostic): void {
  if (diagnostic.severity !== "warn") return;
  consola.warn(formatDiagnostic(diagnostic));
}

/** One-line form: `[target] message`, or `[uac] message` when no target applies. */
export function formatDiagnostic(diagnostic: Diagnostic): string {
  return `[${diagnostic.target ?? "uac"}] ${diagnostic.message}`;
}
