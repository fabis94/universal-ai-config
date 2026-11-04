import type { DiagnosticSink } from "../diagnostics.js";
import type { ResolvedConfig } from "../../types.js";
import type { ShadowReporter } from "./select.js";

/** Everything one generate run shares across its stages. */
export interface GenerateRun {
  root: string;
  config: ResolvedConfig;
  sink: DiagnosticSink;
  /** Reports shadowed candidates (through `sink`) */
  shadow: ShadowReporter;
}
