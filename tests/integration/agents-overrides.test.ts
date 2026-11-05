import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import {
  findAgentsOverrideFiles,
  removeAgentsOverrideFiles,
} from "../../src/core/clean/agents-overrides.js";
import { cleanTargetFiles } from "../../src/core/clean/index.js";
import { generateProject } from "../../src/core/generate/index.js";
import { CliProject } from "./cli-project.js";

/** The terminal, as the commands see it: whether they may prompt, and the answers given. */
const terminal = vi.hoisted(() => ({
  interactive: false,
  answers: [] as boolean[],
  asked: [] as string[],
}));

vi.mock("../../src/commands/interactive.js", () => ({
  canPrompt: () => terminal.interactive,
  confirmAction: async (message: string) => {
    terminal.asked.push(message);
    return terminal.answers.shift() ?? false;
  },
}));

const FIXTURE = join(import.meta.dirname, "../fixtures/codex-overrides-project");
const LEFTOVERS = [
  "packages/frontend/AGENTS.override.md",
  "packages/app/lib/tests/AGENTS.override.md",
];

describe("leftover AGENTS.override.md files", () => {
  const projects: CliProject[] = [];
  async function project(): Promise<CliProject> {
    const p = await CliProject.create(FIXTURE);
    projects.push(p);
    for (const path of LEFTOVERS) await p.write(path, "uac 2.x output");
    return p;
  }
  async function existing(p: CliProject, paths: string[]): Promise<string[]> {
    const found: string[] = [];
    for (const path of paths) if (await p.exists(path)) found.push(path);
    return found;
  }

  beforeEach(() => {
    terminal.interactive = false;
    terminal.answers = [];
    terminal.asked = [];
  });
  afterEach(async () => {
    for (const p of projects.splice(0)) await p.dispose();
  });

  describe("findAgentsOverrideFiles", () => {
    it("finds them at any depth, sorted", async () => {
      const p = await project();
      await p.write("AGENTS.override.md");
      expect(await findAgentsOverrideFiles(p.root)).toEqual([
        "AGENTS.override.md",
        "packages/app/lib/tests/AGENTS.override.md",
        "packages/frontend/AGENTS.override.md",
      ]);
    });

    it("skips dependency trees and template inputs", async () => {
      const p = await project();
      await p.write("node_modules/dep/AGENTS.override.md");
      await p.write(".universal-ai-config/skills/x/AGENTS.override.md", "skill input");
      await p.write("shared/instructions/AGENTS.override.md", "input of another source");
      const found = await findAgentsOverrideFiles(p.root, {
        additionalTemplateDirs: ["shared"],
      });
      expect(found).toEqual([...LEFTOVERS].sort());
    });

    it("leaves out paths preserveOnClean keeps for any target", async () => {
      const p = await project();
      expect(
        await findAgentsOverrideFiles(p.root, {
          preserveOnClean: ["packages/frontend/**"],
        }),
      ).toEqual(["packages/app/lib/tests/AGENTS.override.md"]);
      expect(
        await findAgentsOverrideFiles(p.root, {
          preserveOnClean: { cursor: ["packages/app/**"] },
        }),
      ).toEqual(["packages/frontend/AGENTS.override.md"]);
    });

    it("finds none with agentsMd.keepOverrideFiles", async () => {
      const p = await project();
      expect(
        await findAgentsOverrideFiles(p.root, { agentsMd: { keepOverrideFiles: true } }),
      ).toEqual([]);
    });
  });

  describe("removeAgentsOverrideFiles", () => {
    it("removes the listed files, keeps their folders, and skips missing ones", async () => {
      const p = await project();
      const removed = await removeAgentsOverrideFiles(p.root, [
        ...LEFTOVERS,
        "gone/AGENTS.override.md",
      ]);
      expect(removed).toEqual(LEFTOVERS);
      expect(await existing(p, LEFTOVERS)).toEqual([]);
      expect(await p.exists("packages/frontend")).toBe(true);
    });

    it("refuses any other file", async () => {
      const p = await project();
      await expect(removeAgentsOverrideFiles(p.root, ["AGENTS.md"])).rejects.toThrow(
        /only removes AGENTS\.override\.md/,
      );
    });
  });

  it("cleanTargetFiles never removes them, for any target set", async () => {
    const p = await project();
    await cleanTargetFiles(p.root);
    await cleanTargetFiles(p.root, ["codex"], undefined, { agentsMd: { enable: true } });
    expect(await existing(p, LEFTOVERS)).toEqual(LEFTOVERS);
  });

  describe("generateProject", () => {
    it("warns with every path when instructions are generated, for any target", async () => {
      const p = await project();
      for (const targets of [["codex"], ["claude"]] as const) {
        const { diagnostics } = await generateProject({
          root: p.root,
          targets: [...targets],
          onDiagnostic: () => {},
        });
        const warning = diagnostics.find((d) => d.code === "agents-override-present");
        expect(warning?.severity).toBe("warn");
        expect(warning?.detail).toEqual({ paths: [...LEFTOVERS].sort() });
        expect(warning?.message).toMatch(
          /^Found 2 AGENTS\.override\.md files, probably left by uac 2\.x\./,
        );
        expect(warning?.message).toContain("agentsMd.keepOverrideFiles: true");
      }
    });

    it("stays quiet without instructions in the run, with keepOverrideFiles, or with none left", async () => {
      const p = await project();
      const codes = async (options: Parameters<typeof generateProject>[0]) =>
        (
          await generateProject({ root: p.root, onDiagnostic: () => {}, ...options })
        ).diagnostics.map((d) => d.code);

      expect(await codes({ targets: ["codex"], types: ["skills"] })).not.toContain(
        "agents-override-present",
      );
      expect(
        await codes({ targets: ["codex"], overrides: { agentsMd: { keepOverrideFiles: true } } }),
      ).not.toContain("agents-override-present");
      await removeAgentsOverrideFiles(p.root, LEFTOVERS);
      expect(await codes({ targets: ["codex"] })).not.toContain("agents-override-present");
    });
  });

  describe("CLI without a terminal", () => {
    it("generate and clean warn, list the files, and delete nothing", async () => {
      const p = await project();
      for (const [command, args] of [
        ["generate", ["-t", "codex"]],
        ["clean", []],
      ] as const) {
        const lines = await p.run(command, [...args]);
        const at = lines.findIndex((line) => line.includes("Found 2 AGENTS.override.md files"));
        expect(at, command).toBeGreaterThanOrEqual(0);
        expect(lines.slice(at + 1, at + 3).join("\n")).toContain(
          "packages/frontend/AGENTS.override.md",
        );
        expect(await existing(p, LEFTOVERS)).toEqual(LEFTOVERS);
      }
      expect(terminal.asked).toEqual([]);
    });

    it("clean only checks when instructions are being cleaned", async () => {
      const p = await project();
      const lines = await p.run("clean", ["--type", "skills"]);
      expect(lines.join("\n")).not.toContain("AGENTS.override.md");
    });
  });

  describe("CLI in a terminal", () => {
    beforeEach(() => {
      terminal.interactive = true;
    });

    it("generate asks after generating, and deletes them on yes", async () => {
      const p = await project();
      terminal.answers = [true];
      const lines = await p.run("generate", ["-t", "codex"]);
      expect(terminal.asked).toEqual(["Delete these 2 files?"]);
      expect(lines.at(-1)).toBe("Deleted 2 AGENTS.override.md files");
      expect(await existing(p, LEFTOVERS)).toEqual([]);
      expect(await p.exists("packages/frontend/AGENTS.md")).toBe(true);
    });

    it("keeps them on no, and says how to stop the warning", async () => {
      const p = await project();
      terminal.answers = [false];
      const lines = await p.run("generate", ["-t", "claude"]);
      expect(lines.at(-1)).toBe("Kept. Set agentsMd.keepOverrideFiles: true to stop this warning.");
      expect(await existing(p, LEFTOVERS)).toEqual(LEFTOVERS);
    });

    it("clean asks too, naming a single file as such", async () => {
      const p = await project();
      await removeAgentsOverrideFiles(p.root, [LEFTOVERS[1] as string]);
      terminal.answers = [true];
      await p.run("clean", ["-t", "claude"]);
      expect(terminal.asked).toEqual(["Delete this file?"]);
      expect(await existing(p, LEFTOVERS)).toEqual([]);
    });

    it("generate --clean asks once", async () => {
      const p = await project();
      terminal.answers = [false, false];
      await p.run("generate", ["-t", "codex", "--clean"]);
      expect(terminal.asked).toHaveLength(1);
    });

    it("never asks in a dry run", async () => {
      const p = await project();
      await p.run("generate", ["-t", "codex", "--dry-run"]);
      await p.run("clean", ["--dry-run"]);
      expect(terminal.asked).toEqual([]);
      expect(await existing(p, LEFTOVERS)).toEqual(LEFTOVERS);
    });

    it("never warns or asks with agentsMd.keepOverrideFiles", async () => {
      const p = await project();
      await p.config({ agentsMd: { keepOverrideFiles: true } });
      const lines = [...(await p.run("generate", ["-t", "codex"])), ...(await p.run("clean"))];
      expect(lines.join("\n")).not.toContain("AGENTS.override.md");
      expect(terminal.asked).toEqual([]);
      expect(await existing(p, LEFTOVERS)).toEqual(LEFTOVERS);
    });
  });
});
