# universal-ai-config

One source for your AI coding config (instructions, skills, agents, hooks and MCP servers) for **Claude Code**, **GitHub Copilot**, **Cursor** and **OpenAI Codex**. Keep it as templates that `uac` renders into each tool's own format, or in the open standards with uac filling the gaps.

```
.universal-ai-config/  ──── uac generate ────▶  .claude/  .github/  .cursor/  .codex/  AGENTS.md
```

## 🤔 Why

Every AI coding tool keeps its config in its own folders and format. A team that wants one shared config, while each developer uses a different tool, ends up copying rules between `.claude/`, `.github/`, `.cursor/` and `AGENTS.md` by hand.

uac gives the team one source, kept one of two ways:

- **Templates** (the default): you write templates in `.universal-ai-config/`, and uac renders each tool's native files from them. Each developer generates only the tools they use, and the generated folders stay out of git.
- **Open standards**: your instructions stay in `AGENTS.md` files and your skills in `.agents/skills/`, which most tools read on their own, and uac fills the gaps.

## 📦 Install

```bash
npm install -D universal-ai-config
```

Not a JavaScript project? Run any command without installing: `npx universal-ai-config <command>`.

## 🚀 Quick start

```bash
npx uac setup      # scaffold the project and pick the coding agents you use on this machine
npx uac generate   # render the templates for those agents
```

`setup` creates the config file, adds a `.gitignore` block for the generated folders, and seeds instructions and skills that teach your coding agent how uac works. From there, ask your agent: `/update-ai-config add a rule that we use pnpm`, or `/import-existing-ai-config` to turn an existing `.claude/` or `.cursor/` setup into templates.

For standards mode (see the two ways below), set `standards: true` in `universal-ai-config.config.ts` and run `uac setup` again: it offers to move uac's own instructions and skills into `AGENTS.md` and `.agents/skills/`. Moving existing templates over: [switching from template mode](.universal-ai-config/docs/uac/standards.md#switching-from-template-mode).

## 🔀 Two ways to use uac

Agents, hooks and MCP servers are templates either way. The choice is about instructions and skills.

### 🧩 Template mode (default, recommended)

Instructions and skills are templates in `.universal-ai-config/`, and uac renders each tool's own files from them.

- ✅ Each tool gets its best mechanism: glob-scoped rules, Copilot `applyTo` and `excludeAgent`, Cursor's agent-decided rules
- ✅ Per-tool values, EJS and path helpers in every template
- ✅ AGENTS.md only where it's needed (Codex, or opt-in), in the layout you pick
- ❌ Instructions and skills are uac templates, which tools can't read without uac
- ❌ A fresh clone needs `uac generate` before the tools see anything

### 📂 Standards mode (`standards`)

Instructions are your own `AGENTS.md` files and skills your own `.agents/skills/` folders, both committed. uac never writes, cleans or gitignores them.

- ✅ Open-standard files that any tool, teammate or cloud agent reads without uac
- ✅ Easy to adopt for a team already on AGENTS.md and Agent Skills: uac adds only what's missing
- ❌ Every tool depends on AGENTS.md, and each loads it differently. Claude ignores all of them while a `CLAUDE.md` has content, and loads nested ones only when it reads a file in that folder; Codex loads only those on the path it was launched from
- ❌ No glob-scoped or agent-decided rules: a file's folder is its scope
- ❌ No EJS or per-tool values in instructions and skills, and `exclude` only affects Claude's skill copies

What each tool loads, what you give up, and how to switch: [standards mode](.universal-ai-config/docs/uac/standards.md).

## ✨ What you get

In template mode, uac writes each tool's own files:

| Tool           | Generated into                            |
| -------------- | ----------------------------------------- |
| Claude Code    | `.claude/`, `.mcp.json`                   |
| GitHub Copilot | `.github/`, `.mcp.json`                   |
| Cursor         | `.cursor/`                                |
| OpenAI Codex   | `.codex/`, `.agents/skills/`, `AGENTS.md` |

In standards mode, the tools read your `AGENTS.md` and `.agents/skills/` themselves, and uac generates the rest into the same folders: agents, hooks, MCP servers, and skill copies for Claude ([what each tool gets](.universal-ai-config/docs/uac/standards.md#what-each-tool-gets)).

- 🎯 **Native files for every tool:** agents, hooks and MCP servers in each tool's own format, from Claude's `settings.json` hooks to Codex's TOML agents.
- 🧹 **Nothing loads twice:** where tools read each other's files, uac writes one copy and tells you.
- 🤖 **Your coding agent manages it:** setup teaches it how uac works and adds skills to create, update and import config.

## 🖥️ One set of tools per machine

> ⚠️ **Generate only the tools you use.** `uac setup` saves your choice as `targets` in `universal-ai-config.overrides.ts`, which is gitignored, so every developer has their own.

The tools read each other's files: Claude, Cursor and Copilot all read `AGENTS.md`, and Copilot runs Claude's hooks. When one run does include overlapping tools, uac writes one copy and warns about what each tool loses. Details: [shared outputs](.universal-ai-config/docs/uac/config.md#shared-outputs-and-one-target-set-per-machine).

## 🧩 Templates

Templates live in `.universal-ai-config/`, one folder per type:

| Folder           | Holds                                                 | Format         | Reference                                                              |
| ---------------- | ----------------------------------------------------- | -------------- | ---------------------------------------------------------------------- |
| `instructions/`  | Rules, always on or scoped by globs                   | Markdown + EJS | [frontmatter](.universal-ai-config/docs/uac/frontmatter.md)            |
| `skills/<name>/` | Slash commands and workflows, plus their extra files  | Markdown + EJS | [frontmatter](.universal-ai-config/docs/uac/frontmatter.md)            |
| `agents/`        | Subagents with their own tools and model              | Markdown + EJS | [frontmatter](.universal-ai-config/docs/uac/frontmatter.md)            |
| `hooks/`         | Commands that run on lifecycle events                 | JSON           | [hooks](.universal-ai-config/docs/uac/hooks.md)                        |
| `mcp/`           | MCP servers                                           | JSON           | [mcp](.universal-ai-config/docs/uac/mcp.md)                            |
| `docs/`          | Reference docs agents read on demand, never generated | Markdown       | [templates](.universal-ai-config/docs/uac/templates.md#reference-docs) |

An agent template, for example:

```markdown
---
name: code-reviewer
description: Reviews the current diff for bugs. Use after making changes.
model:
  claude: opus
  copilot: claude-sonnet-5.5
tools:
  claude: ["Read", "Grep", "Glob"]
  copilot: ["read", "search"]
---

Review the diff against the rules in <%= instructionPath("coding-style") %>.
```

A field takes one value, or a value per tool (`claude`, `copilot`, `cursor`, `codex`, `default`); a tool with neither drops the field. `instructionPath()` resolves to wherever that rule lands for the tool being generated. Every EJS variable and path helper: [templates](.universal-ai-config/docs/uac/templates.md).

## 📄 AGENTS.md

In template mode, each tool gets its own instruction format by default. uac writes `AGENTS.md` files only when Codex is a target (it reads nothing else) or you set `agentsMd.enable`; Claude, Cursor and Copilot then read those instead of their own files.

Always-on instructions go in the root `AGENTS.md`. `agentsMd.variation` decides where instructions scoped to a folder (`globs: packages/web/**`) go:

| Variation          | Scoped instructions go to                      | Trade-off                                                                                                                                                                                                                                   |
| ------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nested` (default) | `packages/web/AGENTS.md`                       | ⚠️ Least context, but tools load nested files inconsistently: Cursor on read or edit, Claude and Copilot only after reading a file in the folder, Codex only when launched inside it. An agent can edit code there without its instructions |
| `concatenate`      | the root `AGENTS.md`, with a scope note        | ✅ Every tool loads the same file at startup, so nothing is missed; every session pays for every instruction                                                                                                                                |
| `index`            | `<indexDir>/<name>.md`, listed in the root one | A short root file that loads the same way everywhere, but the agent has to follow the index and read the file                                                                                                                               |

Pick `concatenate` when your scoped instructions are short and you want the same behavior in every tool, `index` when they're too long for every session, and `nested` when your team mostly uses Cursor. Details: [AGENTS.md output](.universal-ai-config/docs/uac/config.md#agentsmd-output).

## ⚙️ Configuration

Two files at the project root:

```ts
// universal-ai-config.config.ts: committed, shared by the team
import { defineConfig } from "universal-ai-config";

export default defineConfig({
  additionalTemplateDirs: ["~/.universal-ai-config"], // templates shared across projects
  variables: { projectName: "my-app" }, // available in every template
});
```

```ts
// universal-ai-config.overrides.ts: gitignored, one per developer
import { defineConfig } from "universal-ai-config";

export default defineConfig({ targets: ["claude"] });
```

Every option, how the two files merge, and which template wins when several directories have the same name: [configuration](.universal-ai-config/docs/uac/config.md).

## 🛠️ Commands

| Command                  | What it does                                                         |
| ------------------------ | -------------------------------------------------------------------- |
| `uac setup` (`uac init`) | Set up the project or this machine's tools: a wizard in a terminal   |
| `uac generate`           | Render the templates for your tools                                  |
| `uac clean`              | Remove generated files                                               |
| `uac seed <set>`         | Add `meta-instructions`, `examples`, or the `.gitignore` block       |
| `uac skill add <source>` | Copy skills from a GitHub repo or a local folder into your templates |

uac finds the project root from any subfolder. Every flag: [CLI reference](.universal-ai-config/docs/uac/cli.md).

## 📚 Documentation

The full reference lives in [`.universal-ai-config/docs/uac/`](.universal-ai-config/docs/uac/). `uac setup` copies the same files into your project, where your coding agent reads them when it needs them.

| Doc                                                         | Covers                                                                       |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [cli](.universal-ai-config/docs/uac/cli.md)                 | Every command and flag, root resolution, what `clean` removes                |
| [config](.universal-ai-config/docs/uac/config.md)           | Options, AGENTS.md layouts, shared outputs, exclusion, precedence, overrides |
| [templates](.universal-ai-config/docs/uac/templates.md)     | EJS variables, path helpers, per-tool values, reference docs                 |
| [frontmatter](.universal-ai-config/docs/uac/frontmatter.md) | Every instruction, skill and agent field, and which tools support it         |
| [hooks](.universal-ai-config/docs/uac/hooks.md)             | Handler fields, event names per tool, matchers                               |
| [mcp](.universal-ai-config/docs/uac/mcp.md)                 | Server fields per tool, output paths, opt-in filtering                       |
| [tools](.universal-ai-config/docs/uac/tools.md)             | Tool names per tool, for `tools` and `allowedTools`                          |
| [models](.universal-ai-config/docs/uac/models.md)           | Model IDs per tool                                                           |
| [codex](.universal-ai-config/docs/uac/codex.md)             | Codex output paths and caveats                                               |
| [standards](.universal-ai-config/docs/uac/standards.md)     | Standards mode in depth                                                      |

## 🧑‍💻 Programmatic API

```ts
import { generateProject, writeGeneratedFiles } from "universal-ai-config";

const { files } = await generateProject({ root: process.cwd(), targets: ["claude"] });
await writeGeneratedFiles(files, process.cwd());
```

`generateProject()` loads the project's config like `uac generate` does, and returns the files, every diagnostic and the plan without writing anything. Every export and its options are documented in the type definitions, which your editor shows on hover; [`src/index.ts`](src/index.ts) lists them all.

## 🤝 Contributing

Run `pnpm check` (lint, unused code, tests, types) before opening a PR. How the code is organized, how docs are kept in sync, and how to add support for a new tool: [project conventions](.universal-ai-config/instructions/project-conventions.md) and the [`create-target`](.universal-ai-config/skills/create-target/SKILL.md) skill. How to test: [testing guidelines](.universal-ai-config/instructions/testing-guidelines.md).

## 📝 License

[MIT](LICENSE)
