import { defineCommand } from "citty";
import { consola } from "consola";
import pc from "picocolors";
import { generate } from "../core/generate/index.js";
import { writeGeneratedFiles } from "../core/writer.js";
import { runClean } from "./run-clean.js";
import { resolveCliRoot } from "./resolve-root.js";
import type { GeneratedFile, ShadowEvent, Target, TemplateType } from "../types.js";

interface TypeStats {
  count: number;
  inputs: number;
}

/** Names the thing that collided, for scopes where the path alone doesn't say it. */
function scopeLabel(event: ShadowEvent): string {
  switch (event.scope) {
    case "server":
      return `mcp server "${event.name}"`;
    case "input":
      return `mcp input "${event.name}"`;
    case "handler":
      return `hooks ${event.name} handler`;
    default:
      return "";
  }
}

/** One line describing a candidate that lost a name collision. */
function formatShadow(event: ShadowEvent): string {
  const label = scopeLabel(event);

  // A whole template or JSON file losing to the same path in another source dir:
  // both sides share a relative path, so name it once and contrast the dirs.
  if (!label && event.losingSource !== event.winningSource) {
    const relative = event.losingSource
      ? event.losingPath.slice(event.losingSource.length + 1)
      : event.losingPath;
    return `${relative}: ${event.losingSource} shadowed by ${event.winningSource}`;
  }

  if (event.losingPath === event.winningPath) {
    return `${label}: duplicate within ${event.winningPath}`;
  }

  const prefix = label ? `${label}: ` : "";
  return `${prefix}${event.losingPath} shadowed by ${event.winningPath}`;
}

function formatTargetSummary(files: GeneratedFile[]): string[] {
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

  const lines: string[] = [];
  for (const [target, types] of byTarget) {
    const parts = [...types.entries()].map(([type, { count, inputs }]) => {
      const label = `${count} ${count === 1 ? type.replace(/s$/, "") : type}`;
      return inputs > 0 ? `${label} (${inputs} input${inputs === 1 ? "" : "s"})` : label;
    });
    lines.push(`${target} — ${parts.join(", ")}`);
  }
  return lines;
}

interface ShadowGroup {
  event: ShadowEvent;
  targets: string[];
}

/**
 * Collapse the per-target events into one entry per distinct collision. The same
 * template usually loses for every target, and that shouldn't print four times —
 * but a per-target `exclude` can make targets disagree, so the targets a
 * collision applies to are tracked and shown when they're only a subset.
 */
function groupShadows(shadows: ShadowEvent[]): ShadowGroup[] {
  const groups = new Map<string, ShadowGroup>();
  for (const event of shadows) {
    const key = [event.scope, event.type, event.name, event.losingPath, event.winningPath].join(
      "\u0000",
    );
    const existing = groups.get(key);
    if (existing) existing.targets.push(event.target);
    else groups.set(key, { event, targets: [event.target] });
  }
  return [...groups.values()];
}

/** Single line for the default output — the detail lives behind `--verbose`. */
function formatShadowSummary(shadows: ShadowEvent[]): string | undefined {
  const count = groupShadows(shadows).length;
  if (count === 0) return undefined;
  return `${count} shadowed by higher-precedence sources (--verbose to list)`;
}

/** Full list for `--verbose`: one line per distinct collision. */
function printShadowDetails(shadows: ShadowEvent[], allTargets: Set<string>): void {
  const groups = groupShadows(shadows);
  if (groups.length === 0) return;

  consola.info(`${groups.length} shadowed by higher-precedence sources:`);
  for (const { event, targets } of groups) {
    // Only worth naming targets when a collision didn't apply to all of them
    const scope = targets.length < allTargets.size ? ` [${targets.join(", ")}]` : "";
    consola.log(pc.dim(`  ↳ ${formatShadow(event)}${scope}`));
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

    const allTargets = new Set<string>([
      ...files.map((f) => f.target),
      ...shadows.map((s) => s.target),
    ]);
    const shadowSummary = formatShadowSummary(shadows);

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
        printShadowDetails(shadows, allTargets);
      } else {
        for (const line of formatTargetSummary(files)) {
          consola.info(line);
        }
        if (shadowSummary) consola.info(shadowSummary);
        consola.info(`Would generate ${files.length} file(s)`);
      }
      return;
    }

    await writeGeneratedFiles(files, root, { verbose: args.verbose });

    if (args.verbose) {
      printShadowDetails(shadows, allTargets);
    } else {
      for (const line of formatTargetSummary(files)) {
        consola.success(line);
      }
      if (shadowSummary) consola.info(shadowSummary);
    }
    consola.success(`Generated ${files.length} file(s)`);
  },
});
