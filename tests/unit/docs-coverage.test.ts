import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { ArgsDef, CommandDef } from "citty";
import { targets } from "../../src/targets/index.js";
import { userConfigSchema } from "../../src/config/schema.js";
import { DEFAULT_CONFIG } from "../../src/config/defaults.js";
import { renderEjs } from "../../src/core/parser.js";
import { DIAGNOSTIC_CODES } from "../../src/core/diagnostics.js";
import generateCommand from "../../src/commands/generate.js";
import initCommand from "../../src/commands/init/index.js";
import cleanCommand from "../../src/commands/clean.js";
import seedCommand from "../../src/commands/seed.js";
import skillAddCommand from "../../src/commands/skill/add.js";

// Everything a user can write (a field, hook event, config option, flag, EJS helper) or see
// (a diagnostic code) must be named in the reference doc that covers it, so a new one can't
// ship undocumented. These checks prove a name is there, not that its description is right.
const DOCS_DIR = join(
  import.meta.dirname,
  "../../src/seed-types/meta-instructions/templates/docs/uac",
);

const doc = (name: string): string => readFileSync(join(DOCS_DIR, `${name}.md`), "utf-8");

/** Words inside a doc's inline code: `allowedTools`, `codex.interface.icon`, `--dry-run, -d`. */
function codeWords(markdown: string): Set<string> {
  const spans = [...markdown.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]!);
  return new Set(spans.flatMap((span) => span.split(/[^\w-]+/)).filter(Boolean));
}

/** The `## ` section whose heading starts with `heading`, subsections included. */
function section(markdown: string, heading: string): string {
  const found = markdown.split(/^## /m).find((s) => s.startsWith(heading));
  if (!found) throw new Error(`no "## ${heading}" section`);
  return found;
}

function undocumented(names: Iterable<string>, words: Set<string>): string[] {
  return [...new Set(names)].filter((name) => !words.has(name)).sort();
}

describe("the reference docs name everything users write or see", () => {
  it.each([
    ["instructions", "Instructions"],
    ["skills", "Skills"],
    ["agents", "Agents"],
  ] as const)("frontmatter.md: every %s field a target maps", (type, heading) => {
    const fields = Object.values(targets).flatMap((target) => {
      const config = target[type];
      return config && config !== "agentsMd" ? Object.keys(config.frontmatterMap) : [];
    });
    const words = codeWords(section(doc("frontmatter"), heading));
    expect(undocumented(fields, words), `add to "## ${heading}" in frontmatter.md`).toEqual([]);
  });

  it("hooks.md: every hook event and handler type", () => {
    const names = Object.values(targets).flatMap((target) => [
      ...Object.keys(target.hooks?.events ?? {}),
      ...(target.hooks?.handlerTypes ?? []),
    ]);
    expect(undocumented(names, codeWords(doc("hooks"))), "add to hooks.md").toEqual([]);
  });

  it("config.md: every config option, agentsMd and mcp fields included", () => {
    const { shape } = userConfigSchema;
    const options = [
      ...Object.keys(shape),
      ...Object.keys(shape.agentsMd.unwrap().shape),
      ...Object.keys(shape.mcp.unwrap().shape),
    ];
    expect(undocumented(options, codeWords(doc("config"))), "add to config.md").toEqual([]);
  });

  it.each([
    ["`uac generate`", generateCommand],
    ["`uac init`", initCommand],
    ["`uac clean`", cleanCommand],
    ["`uac seed", seedCommand],
    ["`uac skill add", skillAddCommand],
  ] as [string, CommandDef][])("cli.md: every flag of %s", (heading, command) => {
    const flags = Object.entries(command.args as ArgsDef)
      .filter(([, arg]) => arg.type !== "positional")
      .map(([name]) => `--${name}`);
    const words = codeWords(section(doc("cli"), heading));
    expect(undocumented(flags, words), `add to the ${heading} section of cli.md`).toEqual([]);
  });

  it("templates.md: every EJS variable and path helper", () => {
    // Everything in scope while a template renders, read from EJS itself
    const scope = renderEjs("<%= Object.keys(locals).join(' ') %>", {
      target: "claude",
      type: "skills",
      config: { ...DEFAULT_CONFIG, standards: false },
    }).split(" ");
    expect(undocumented(scope, codeWords(doc("templates"))), "add to templates.md").toEqual([]);
  });

  it("some doc: every diagnostic code", () => {
    const words = new Set(
      readdirSync(DOCS_DIR).flatMap((name) => [...codeWords(doc(name.replace(/\.md$/, "")))]),
    );
    expect(
      undocumented(DIAGNOSTIC_CODES, words),
      "name it where the doc explains that behavior",
    ).toEqual([]);
  });
});

describe("the reference docs name nothing that's gone", () => {
  it("hooks.md: every event in the event table is a target's event", () => {
    const events = new Set(
      Object.values(targets).flatMap((t) => Object.keys(t.hooks?.events ?? {})),
    );
    const table = section(doc("hooks"), "Universal Event Names");
    const rows = [...table.matchAll(/^\| `(\w+)`/gm)].map((m) => m[1]!);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((event) => !events.has(event))).toEqual([]);
  });

  it("config.md: every option in the Options list is a config option", () => {
    const options = new Set(Object.keys(userConfigSchema.shape));
    const listed = [...section(doc("config"), "Options").matchAll(/^- `(\w+)`/gm)].map(
      (m) => m[1]!,
    );
    expect(listed.length).toBeGreaterThan(0);
    expect(listed.filter((option) => !options.has(option))).toEqual([]);
  });
});
