/**
 * Template-mode regression harness: a snapshot of everything uac decides
 * across every fixture — generated files, diagnostics, what clean removes,
 * the .gitignore block and the meta-instructions seed.
 *
 * It exists so refactors of the planner, locator, clean and seed can prove
 * they changed nothing. Update the snapshot only on purpose (`vitest -u`),
 * after checking that every changed line is intended. Every fixture runs
 * through it with its own config, so `standards-project` pins standards mode
 * too.
 */
import { createHash } from "node:crypto";
import { cp, mkdtemp, readdir, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { loadProjectConfig } from "../../src/config/loader.js";
import { findAgentsOverrideFiles } from "../../src/core/clean/agents-overrides.js";
import { cleanTargetFiles } from "../../src/core/clean/index.js";
import { generateProject } from "../../src/core/generate/index.js";
import { writeGeneratedFiles } from "../../src/core/writer.js";
import { buildGitignoreBlock } from "../../src/seed-types/gitignore/index.js";
import { getTemplates } from "../../src/seed-types/meta-instructions/index.js";
import type {
  GeneratedFile,
  ResolvedConfig,
  Target,
  TemplateType,
  UserConfig,
} from "../../src/types.js";

const FIXTURES_DIR = join(import.meta.dirname, "../fixtures");
const ALL_TARGETS: Target[] = ["claude", "copilot", "cursor", "codex"];
const ALL_TYPES: TemplateType[] = ["instructions", "skills", "agents", "hooks", "mcp"];

/** Every target set worth comparing: the fixture's own, each target alone, and all four. */
const TARGET_SETS: Array<Target[] | undefined> = [
  undefined,
  ...ALL_TARGETS.map((t) => [t]),
  ALL_TARGETS,
];

/** Config variations that change routing, ownership or output paths. */
const VARIANTS: Record<string, UserConfig> = {
  default: {},
  "agentsMd.enable": { agentsMd: { enable: true } },
  "agentsMd.index": { agentsMd: { variation: "index" } },
  "agentsMd.concatenate": { agentsMd: { variation: "concatenate" } },
  "types-no-instructions": { types: ["skills", "agents", "hooks", "mcp"] },
  outputDirs: { outputDirs: { claude: "custom-claude", cursor: "custom-cursor" } },
};

/** Fixtures run through every variant; the rest only through `default`. */
const VARIANT_FIXTURES = new Set(["basic-project", "agents-md-project", "pick-one-project"]);

const projectFixtures = (await readdir(FIXTURES_DIR, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && entry.name !== "remote-skills-repo")
  .map((entry) => entry.name)
  .sort();

function sha(content: string | Uint8Array): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

function summarizeFile(file: GeneratedFile) {
  return {
    path: file.path,
    target: file.target,
    type: file.type,
    consumers: file.consumers,
    sourcePath: file.sourcePath,
    mode: file.mode,
    mergeKey: file.mergeKey,
    bytes: Buffer.byteLength(file.content),
    sha: sha(file.content),
  };
}

async function generateSummary(root: string, targets: Target[] | undefined, overrides: UserConfig) {
  try {
    const { files, diagnostics, plan } = await generateProject({
      root,
      targets,
      overrides,
      onDiagnostic: () => {},
    });
    return {
      files: files.map(summarizeFile),
      diagnostics: diagnostics.map((d) => ({
        code: d.code,
        severity: d.severity,
        target: d.target,
        type: d.type,
        path: d.path,
        source: d.source,
        message: d.message,
      })),
      plan: {
        agentsMd: plan.agentsMd,
        servedBy: plan.servedBy,
        duplicateRunChecks: plan.duplicateRunChecks,
      },
    };
  } catch (error) {
    return { error: (error as Error).message };
  }
}

describe("template-mode regression: generate", () => {
  for (const fixture of projectFixtures) {
    const variants = VARIANT_FIXTURES.has(fixture) ? Object.keys(VARIANTS) : ["default"];
    for (const variant of variants) {
      for (const targets of TARGET_SETS) {
        const label = `${fixture} [${variant}] -t ${targets?.join(",") ?? "(config)"}`;
        it(label, async () => {
          const summary = await generateSummary(
            join(FIXTURES_DIR, fixture),
            targets,
            VARIANTS[variant] ?? {},
          );
          expect(summary).toMatchSnapshot();
        });
      }
    }
  }
});

/** Clean options exactly as `runClean` builds them from the resolved config. */
async function cleanDry(
  root: string,
  config: ResolvedConfig,
  targets: Target[] | undefined,
  types: TemplateType[],
): Promise<string[]> {
  const removed = await cleanTargetFiles(root, targets, types, {
    dryRun: true,
    outputDirs: config.outputDirs,
    preserveOnClean: config.preserveOnClean,
    templatesDir: config.templatesDir,
    additionalTemplateDirs: config.additionalTemplateDirs,
    agentsMd: config.agentsMd,
  });
  return removed.sort();
}

/** Hand-written files clean must leave alone, or (AGENTS.md) must remove only when uac owns it. */
const EXTRA_FILES = [
  "AGENTS.md",
  "packages/web/AGENTS.md",
  "services/api/AGENTS.override.md",
  ".github/hooks/pre-commit.sh",
  ".github/workflows/ci.yml",
  ".cursor/rules/hand.mdc",
  ".agents/skills/hand/SKILL.md",
  ".agents/uac-instructions/stale.md",
  "CLAUDE.md",
];

const CLEAN_VARIANTS: Record<string, UserConfig> = {
  default: {},
  "agentsMd.enable": { agentsMd: { enable: true } },
  preserve: {
    preserveOnClean: { claude: [".claude/skills/**"], codex: ["AGENTS.md"], default: [] },
  },
  keepOverrideFiles: { agentsMd: { keepOverrideFiles: true } },
};

describe("template-mode regression: clean (dry run)", () => {
  const roots: string[] = [];
  afterAll(async () => {
    for (const root of roots) await rm(root, { recursive: true, force: true });
  });

  for (const fixture of ["basic-project", "agents-md-project", "pick-one-project"]) {
    for (const [variant, overrides] of Object.entries(CLEAN_VARIANTS)) {
      it(`${fixture} [${variant}]`, async () => {
        const root = await mkdtemp(join(tmpdir(), "uac-regression-"));
        roots.push(root);
        await cp(join(FIXTURES_DIR, fixture), root, { recursive: true });
        await writeFile(
          join(root, "universal-ai-config.config.json"),
          JSON.stringify(overrides, null, 2),
        );
        const { files } = await generateProject({
          root,
          targets: ALL_TARGETS,
          onDiagnostic: () => {},
        });
        await writeGeneratedFiles(files, root);
        for (const rel of EXTRA_FILES) {
          await mkdir(dirname(join(root, rel)), { recursive: true });
          await writeFile(join(root, rel), "hand-written\n");
        }

        const config = await loadProjectConfig({ root });
        const result: Record<string, unknown> = {};
        for (const targets of [undefined, ...ALL_TARGETS.map((t) => [t])]) {
          for (const types of [config.types, ...ALL_TYPES.map((t) => [t])]) {
            const key = `-t ${targets?.join(",") ?? "(all)"} --type ${types.join(",")}`;
            result[key] = await cleanDry(root, config, targets, types);
          }
        }
        result["override files"] = await findAgentsOverrideFiles(root, config);
        expect(result).toMatchSnapshot();
      });
    }
  }
});

/** Every subset of `ALL_TYPES`, in a stable order. */
function typeSubsets(): TemplateType[][] {
  const subsets: TemplateType[][] = [];
  for (let mask = 0; mask < 1 << ALL_TYPES.length; mask++) {
    subsets.push(ALL_TYPES.filter((_, i) => (mask & (1 << i)) !== 0));
  }
  return subsets;
}

describe("template-mode regression: seeds", () => {
  it(".gitignore block for every types subset", async () => {
    const config = await loadProjectConfig({ root: join(FIXTURES_DIR, "basic-project") });
    const blocks = Object.fromEntries(
      typeSubsets().map((types) => [
        types.join(",") || "(none)",
        buildGitignoreBlock({ ...config, types }),
      ]),
    );
    expect(blocks).toMatchSnapshot();
  });

  it("meta-instructions for every types subset", () => {
    const seeds = Object.fromEntries(
      typeSubsets().map((types) => [
        types.join(",") || "(none)",
        getTemplates(".universal-ai-config", types).map((t) => ({
          relativePath: t.relativePath,
          bytes: Buffer.byteLength(t.content),
          sha: sha(t.content),
        })),
      ]),
    );
    expect(seeds).toMatchSnapshot();
  });
});
