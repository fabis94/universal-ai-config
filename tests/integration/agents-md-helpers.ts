import { join } from "node:path";
import { generateProject } from "../../src/core/generate/index.js";
import type { Diagnostic } from "../../src/core/diagnostics.js";
import type { AgentsMdConfig, GeneratedFile, InMemoryTemplate, Target } from "../../src/types.js";
import { text } from "../test-helpers.js";

export const AGENTS_MD_FIXTURE = join(import.meta.dirname, "../fixtures/agents-md-project");

interface AgentsMdRun {
  files: GeneratedFile[];
  diagnostics: Diagnostic[];
  /** Content of the file at `path` (throws when it wasn't generated) */
  read(path: string): string;
  paths: string[];
}

export async function runAgentsMd(
  targets: Target[],
  agentsMd: AgentsMdConfig = {},
  options: {
    root?: string;
    templates?: InMemoryTemplate[];
    exclude?: Record<string, string[]>;
  } = {},
): Promise<AgentsMdRun> {
  const diagnostics: Diagnostic[] = [];
  const { files } = await generateProject({
    root: options.root ?? AGENTS_MD_FIXTURE,
    targets,
    types: ["instructions"],
    overrides: { agentsMd, ...(options.exclude ? { exclude: options.exclude } : {}) },
    templates: options.templates,
    onDiagnostic: (d) => diagnostics.push(d),
  });
  return {
    files,
    diagnostics,
    paths: files.map((f) => f.path).sort(),
    read(path) {
      const file = files.find((f) => f.path === path);
      if (!file)
        throw new Error(`${path} was not generated; got ${files.map((f) => f.path).join(", ")}`);
      return text(file);
    },
  };
}
