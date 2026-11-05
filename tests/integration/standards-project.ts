import { chmod } from "node:fs/promises";
import { join } from "node:path";
import { CliProject } from "./cli-project.js";

/** Config (`standards: true`) and the templates that stay templates: agents, hooks, MCP, plus ignored ones. */
const STANDARDS_FIXTURE = join(import.meta.dirname, "../fixtures/standards-project");

interface StandardFile {
  content: string | Uint8Array;
  mode?: number;
}

/**
 * The project's own standard files. They're written into a temp copy at test
 * time, never committed under `tests/fixtures`: AGENTS.md files, `.agents/skills`
 * and `.cursor/rules` there would be loaded by the tools working on uac itself,
 * and removed by `uac clean` in this repo.
 */
export const STANDARD_FILES: Record<string, StandardFile> = {
  "AGENTS.md": { content: "# Project\n\nUse pnpm. Run `pnpm check` before finishing.\n" },
  "packages/web/AGENTS.md": {
    content: "# Web package\n\nComponents use Vue 3 with <script setup>.\n",
  },
  "services/api/AGENTS.override.md": {
    content: "# API overrides\n\nNever touch the payments module.\n",
  },
  ".agents/skills/helper/SKILL.md": {
    content: [
      "---",
      "name: helper",
      "description: Helps with project tasks. Use when asked for help with the build.",
      "allowed-tools: Read Grep",
      "metadata:",
      "  owner: platform",
      "---",
      "",
      "Run `scripts/run.sh` and report what it prints. Literal EJS stays as written: <%= target %>",
      "",
    ].join("\n"),
  },
  ".agents/skills/helper/scripts/run.sh": { content: '#!/bin/sh\necho "hello"\n', mode: 0o755 },
  ".agents/skills/helper/assets/logo.png": {
    content: Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
      0x52, 0x00, 0x01, 0xff, 0xfe,
    ]),
  },
  ".agents/skills/deploy/SKILL.md": {
    content: [
      "---",
      "name: deploy",
      "description: Deploys the app. Use when asked to ship a release.",
      "disable-model-invocation: true",
      "---",
      "",
      "Deploy with `pnpm deploy`.",
      "",
    ].join("\n"),
  },
  ".cursor/rules/hand.mdc": {
    content:
      "---\ndescription: Hand-written Cursor rule\nalwaysApply: false\n---\n\nHand-written.\n",
  },
};

/** A temp copy of the standards fixture with the project's own standard files in place. */
export async function createStandardsProject(): Promise<CliProject> {
  const project = await CliProject.create(STANDARDS_FIXTURE);
  for (const [rel, file] of Object.entries(STANDARD_FILES)) {
    await project.write(rel, file.content);
    if (file.mode !== undefined) await chmod(join(project.root, rel), file.mode);
  }
  return project;
}
