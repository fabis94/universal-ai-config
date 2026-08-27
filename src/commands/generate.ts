import { defineCommand } from "citty";
import { consola } from "consola";
import pc from "picocolors";
import { generate } from "../core/generate.js";
import { writeGeneratedFiles } from "../core/writer.js";
import { runClean } from "./run-clean.js";
import { resolveCliRoot } from "./resolve-root.js";
import type { GeneratedFile, ShadowEvent, Target, TemplateType } from "../types.js";

interface TypeStats {
  count: number;
  inputs: number;
}

/**
 * Split two source-qualified paths into their differing directory prefixes when
 * they share a trailing path, so a collision can be reported as
 * `instructions/dup.md: shared-templates shadowed by .universal-ai-config`
 * instead of repeating the identical tail twice. Returns undefined when there's
 * nothing to factor out.
 */
function splitCommonTail(
  losing: string,
  winning: string,
): { tail: string; losing: string; winning: string } | undefined {
  const a = losing.split("/");
  const b = winning.split("/");
  let shared = 0;
  while (
    shared < a.length &&
    shared < b.length &&
    a[a.length - 1 - shared] === b[b.length - 1 - shared]
  )
    shared += 1;
  if (shared === 0) return undefined;

  const losingPrefix = a.slice(0, a.length - shared).join("/");
  const winningPrefix = b.slice(0, b.length - shared).join("/");
  if (!losingPrefix || !winningPrefix) return undefined;

  return {
    tail: a.slice(a.length - shared).join("/"),
    losing: losingPrefix,
    winning: winningPrefix,
  };
}

/** One line describing a candidate that lost a name collision. */
function formatShadow(event: ShadowEvent): string {
  const scopePrefix =
    event.scope === "server"
      ? `mcp server "${event.name}": `
      : event.scope === "input"
        ? `mcp input "${event.name}": `
        : event.scope === "handler"
          ? `hooks ${event.name} handler: `
          : "";

  if (event.losingPath === event.winningPath) {
    return `${scopePrefix}duplicate within ${event.winningPath}`;
  }

  const compact = splitCommonTail(event.losingPath, event.winningPath);
  const body = compact
    ? `${compact.tail}: ${compact.losing} shadowed by ${compact.winning}`
    : `${event.losingPath} shadowed by ${event.winningPath}`;

  return `${scopePrefix}${body}`;
}

interface SummaryLine {
  text: string;
  /** Shadow notes are printed plain, under the target line they belong to */
  shadow: boolean;
}

function formatTargetSummary(files: GeneratedFile[], shadows: ShadowEvent[]): SummaryLine[] {
  const byTarget = new Map<string, Map<string, TypeStats>>();
  for (const file of files) {
    let types = byTarget.get(file.target);
    if (!types) {
      types = new Map<string, TypeStats>();
      byTarget.set(file.target, types);
    }
    const stats = types.get(file.type) ?? { count: 0, inputs: 0 };
    stats.count += 1;
    if (file.inputCount !== undefined) stats.inputs += file.inputCount;
    types.set(file.type, stats);
  }

  const shadowsByTarget = new Map<string, ShadowEvent[]>();
  for (const event of shadows) {
    const existing = shadowsByTarget.get(event.target);
    if (existing) existing.push(event);
    else shadowsByTarget.set(event.target, [event]);
  }
  // A target can shadow candidates without emitting files (everything excluded)
  for (const target of shadowsByTarget.keys()) {
    if (!byTarget.has(target)) byTarget.set(target, new Map());
  }

  const lines: SummaryLine[] = [];
  for (const [target, types] of byTarget) {
    const parts = [...types.entries()].map(([type, { count, inputs }]) => {
      const label = `${count} ${count === 1 ? type.replace(/s$/, "") : type}`;
      return inputs > 0 ? `${label} (${inputs} input${inputs === 1 ? "" : "s"})` : label;
    });
    lines.push({
      text: parts.length > 0 ? `${target} — ${parts.join(", ")}` : target,
      shadow: false,
    });
    for (const event of shadowsByTarget.get(target) ?? []) {
      lines.push({ text: pc.dim(`  ↳ ${formatShadow(event)}`), shadow: true });
    }
  }
  return lines;
}

/** Verbose mode prints per-file lines instead of the target summary — list shadows flat. */
function printShadows(shadows: ShadowEvent[]): void {
  for (const event of shadows) {
    consola.log(pc.dim(`  ↳ ${event.target}: ${formatShadow(event)}`));
  }
}

export default defineCommand({
  meta: {
    name: "generate",
    description: "Generate config files for specified targets",
  },
  args: {
    target: {
      type: "string",
      alias: "t",
      description: "Comma-separated targets: claude,copilot,cursor",
    },
    type: {
      type: "string",
      description: "Comma-separated types: instructions,skills,agents,hooks,mcp",
    },
    config: {
      type: "string",
      alias: "c",
      description: "Config file path",
    },
    root: {
      type: "string",
      alias: "r",
      description: "Project root (default: nearest uac root, searching up from cwd)",
    },
    "dry-run": {
      type: "boolean",
      alias: "d",
      description: "Print what would be generated without writing",
      default: false,
    },
    clean: {
      type: "boolean",
      description: "Remove existing generated files before generating",
      default: false,
    },
    verbose: {
      type: "boolean",
      alias: "v",
      description: "Show per-file output instead of summary",
      default: false,
    },
  },
  async run({ args }) {
    const root = resolveCliRoot(args.root);
    const targets = args.target
      ? (args.target.split(",").map((s) => s.trim()) as Target[])
      : undefined;
    const types = args.type
      ? (args.type.split(",").map((s) => s.trim()) as TemplateType[])
      : undefined;

    if (args.clean) {
      await runClean({
        root,
        targets,
        types,
        configPath: args.config,
        verbose: args.verbose,
        dryRun: args["dry-run"],
      });
    }

    const shadows: ShadowEvent[] = [];
    const files = await generate({
      root,
      targets,
      types,
      config: args.config,
      onShadowed: (event) => shadows.push(event),
    });

    if (args["dry-run"]) {
      if (args.verbose) {
        consola.info(`Would generate ${files.length} file(s):\n`);
        for (const file of files) {
          const inputs =
            file.inputCount !== undefined
              ? `, ${file.inputCount} input${file.inputCount === 1 ? "" : "s"}`
              : "";
          consola.log(`  ${file.path} (${file.target}/${file.type} ← ${file.sourcePath}${inputs})`);
        }
        printShadows(shadows);
      } else {
        for (const line of formatTargetSummary(files, shadows)) {
          if (line.shadow) consola.log(line.text);
          else consola.info(line.text);
        }
        consola.info(`Would generate ${files.length} file(s)`);
      }
      return;
    }

    await writeGeneratedFiles(files, root, { verbose: args.verbose });

    if (args.verbose) {
      printShadows(shadows);
    } else {
      for (const line of formatTargetSummary(files, shadows)) {
        if (line.shadow) consola.log(line.text);
        else consola.success(line.text);
      }
    }
    consola.success(`Generated ${files.length} file(s)`);
  },
});
