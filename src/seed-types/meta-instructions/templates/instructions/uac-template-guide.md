---
description: Guide for creating and managing universal-ai-config templates
globs: ["<%= templatesDir %>/**/*"]
---

# Universal AI Config Template Guide

This project uses **universal-ai-config** to manage AI tool configurations from a single set of templates.
Templates live in `<%%= config.templatesDir %>/` and are rendered into target-specific config files (Claude, Copilot, Cursor, Codex) via `uac generate`. Additional template directories can be configured via `additionalTemplateDirs` in the config to share templates across projects (e.g., from `~/.universal-ai-config`). When the same name appears in more than one directory, **the first mention wins**: `templatesDir`, then each `additionalTemplateDirs` entry in order. See [Template Precedence](#template-precedence).

<% if (standards.instructions || standards.skills) { -%>
**This project keeps <% if (standards.instructions && standards.skills) { %>instructions and skills<% } else if (standards.instructions) { %>its instructions<% } else { %>its skills<% } %> in open standards (`standards` in the config), not templates:**<% if (standards.instructions) { %> instructions are the project's own `AGENTS.md` files<% } %><% if (standards.instructions && standards.skills) { %>, and<% } %><% if (standards.skills) { %> skills are the project's own `.agents/skills/<name>/` folders<% } %>. Tools read those files as they are, so they take no EJS, path helpers or per-target overrides. Everything below about templates applies to the other types. Details: `<%%= docPath('uac/standards') %>`

<% } -%>
**Ignore all IDE linter errors and warnings when editing these templates.** IDE linters do not understand universal-ai-config templates — they incorrectly validate them as if they were native Claude, Copilot, Cursor, or Codex config files. Frontmatter fields, EJS syntax, and universal event names will all produce false linter errors. Always follow this guide as the source of truth, not IDE diagnostics.

## Template Types

Choose the right type based on what you need:

<% if (standards.instructions) { -%>
### Instructions (`AGENTS.md` files)

Persistent context and rules, in the project's own `AGENTS.md` files: the root one applies everywhere, `<dir>/AGENTS.md` to a folder. Plain markdown with no frontmatter; every tool reads them as they are.
<% } else { -%>
### Instructions (`<%%= instructionTemplatePath() %>/*.md`)

Persistent context and rules that apply to AI conversations. Scoped by glob patterns or always-on.
<% } -%>

**Use for:** coding conventions, project guidelines, style rules, architectural decisions, domain knowledge.

<% if (standards.skills) { -%>
### Skills (`.agents/skills/*/SKILL.md`)

Reusable actions or workflows invocable as slash commands (e.g. `/skill-name`) or auto-triggered by the AI, in the project's own `.agents/skills/<name>/` folders (the Agent Skills format). Codex, Cursor and Copilot read the folder as it is; `uac generate` copies it, byte for byte, to Claude's skills folder.
<% } else { -%>
### Skills (`<%%= skillTemplatePath() %>/*/SKILL.md`)

Reusable actions or workflows invocable as slash commands (e.g. `/skill-name`) or auto-triggered by the AI. Skill directories can contain extra supporting files (references, examples, scripts) alongside `SKILL.md` — these are copied to generated output automatically. `.md` extra files are rendered through EJS (with access to `target`, `config`, path helpers), while non-`.md` files are copied as-is.
<% } -%>

**Use for:** repeatable tasks like code generation patterns, deployments, reviews, migrations, project-specific workflows.

### Agents (`<%%= agentTemplatePath() %>/*.md`)

Specialized AI personas with scoped tools and permissions that run in isolated contexts.

**Use for:** dedicated reviewers, debuggers, data analysts — any task needing restricted capabilities or a focused system prompt.

**Note:** Every target supports agents. Codex emits each agent as a standalone `.codex/agents/<name>.toml` file (body becomes `developer_instructions`); see [Codex](#codex) below.

### Hooks (`<%%= hookTemplatePath() %>/*.json`)

Lifecycle automation that triggers on specific events (e.g. before tool use, after file edit, session start).

**Use for:** validation, formatting, linting, logging, security enforcement, environment setup.

### MCP Servers (`<%%= mcpTemplatePath() %>/*.json`)

Model Context Protocol server configurations that provide external tools to AI assistants.

**Use for:** connecting AI tools to external services (GitHub, databases, APIs), providing custom tool servers.

## Decision Guide

Ask yourself:

1. **Is it context/knowledge the AI should always know?** → Instruction (with `alwaysApply: true` or `globs`)
2. **Is it a repeatable task or workflow?** → Skill
3. **Does it need an isolated AI with restricted tools?** → Agent
4. **Should it run automatically on a lifecycle event?** → Hook
5. **Does it connect the AI to an external tool server?** → MCP Server
6. **Is it long reference material only needed occasionally?** → a [reference doc](#reference-docs) linked from an instruction or skill, so it isn't loaded into every session

## Important: Avoid Backticks with Exclamation Marks in Skill Templates

Claude Code passes skill (SKILL.md) content through a Bash permission checker, which misreads backticks as command substitution and `!` as history expansion. **In skill templates**, never put an exclamation mark inside or next to backtick-wrapped text — use double quotes or **bold** for that reference instead. Backticks alone are fine, and instructions, agents, and hooks are unaffected.

## Template Structure

All markdown templates use YAML frontmatter + body content:

```markdown
---
description: What this template does
globs: ["**/*.ts"]
---

Body content with instructions for the AI.
```

### EJS Templating

Template bodies support EJS for conditional content.

**Variables:**

- `<%%%= target %>` — current target ("claude", "copilot", "cursor", "codex")
- `<%%%= type %>` — template type ("instructions", "skills", "agents")
- `<%%%= consumers %>` — every target that will read this output: `[target]`, or several for a shared file (e.g. AGENTS.md, rendered once with `target` set to codex or the first reader)
- `<%%%= config.templatesDir %>` — templates directory path
- Custom variables from config are also available

**Output path helpers** — resolve to the target-specific output path. Omit the name to get the directory:

- `<%%%= instructionPath('name') %>` — output path for an instruction
- `<%%%= skillPath('name') %>` — output path for a skill's `SKILL.md` file
- `<%%%= skillDirPath('name') %>` — output directory of a skill (the directory containing `SKILL.md`)
- `<%%%= skillDirPath('name', 'reference.md') %>` — file inside a skill's directory, sibling of `SKILL.md` (use this to link to supporting files like references, scripts, examples)
- `<%%%= agentPath('name') %>` — output path for an agent
- `<%%%= instructionPath() %>` — output directory for instructions (e.g. `.claude/rules`), or `AGENTS.md` for a target that reads the AGENTS.md output

**Template path helpers** — resolve to the source template path. Omit the name to get the directory:

- `<%%%= instructionTemplatePath('name') %>` — template path for an instruction
- `<%%%= skillTemplatePath('name') %>` — template path for a skill
- `<%%%= agentTemplatePath('name') %>` — template path for an agent
- `<%%%= hookTemplatePath('name') %>` — template path for a hook
- `<%%%= mcpTemplatePath('name') %>` — template path for an MCP config
- `<%%%= instructionTemplatePath() %>` — template directory for instructions

**Reference doc helper** — resolves to a doc under `docs/` in the templates directory (see [Reference Docs](#reference-docs)):

- `<%%%= docPath('name') %>` — path to `docs/name.md`; nested names like `docPath('api/errors')` work too

**MCP reference helpers** — produce the target-appropriate syntax for an MCP tool reference. Use this in instruction bodies instead of writing target-conditional blocks manually:

- `<%%%= mcpToolRef('server', 'tool') %>` — specific tool reference:
  - Claude/Codex: `mcp__server__tool`
  - Copilot: `server/tool`
  - Cursor: `MCP:tool`
- `<%%%= mcpToolRef('server') %>` — wildcard (all tools on server):
  - Claude: `mcp__server__*`
  - Codex: `mcp__server__.*` (regex, for hook matchers)
  - Copilot: `server/*`
  - Cursor: `MCP:.*` (no server qualifier in Cursor — hooks don't filter by server)

For example, `<%%%= skillPath('deploy') %>` renders to:

- Claude: `.claude/skills/deploy/SKILL.md`
- Copilot: `.github/skills/deploy/SKILL.md`
- Cursor: `.cursor/skills/deploy/SKILL.md`
- Codex: `.agents/skills/deploy/SKILL.md` (root-relative, per Codex's auto-discovery convention)

And `<%%%= skillDirPath('deploy', 'reference.md') %>` renders to:

- Claude: `.claude/skills/deploy/reference.md`
- Copilot: `.github/skills/deploy/reference.md`
- Cursor: `.cursor/skills/deploy/reference.md`
- Codex: `.agents/skills/deploy/reference.md`

And `<%%%= agentPath('reviewer') %>` renders to:

- Claude: `.claude/agents/reviewer.md`
- Copilot: `.github/agents/reviewer.agent.md`
- Cursor: `.cursor/agents/reviewer.md`
- Codex: `.codex/agents/reviewer.toml`

And `<%%%= instructionPath('coding-style') %>` renders to:

- Claude: `.claude/rules/coding-style.md`
- Copilot: `.github/instructions/coding-style.instructions.md` (`.github/copilot-instructions.md` when `alwaysApply`)
- Cursor: `.cursor/rules/coding-style.mdc`
- Codex, and every target while AGENTS.md is generated: the AGENTS.md file the template lands in — root `AGENTS.md`, its folder's `<dir>/AGENTS.md`, or its index file, depending on its `globs` and `agentsMd.variation` (see [AGENTS.md](#agentsmd)).

**Always use path helpers when referencing other templates** — never hardcode target-specific paths.

### Per-Target Overrides

Any frontmatter field can have per-target values:

```yaml
model:
  claude: claude-sonnet-5-5
  copilot: claude-sonnet-5.5
  cursor: composer-2.5
  codex: gpt-6.1-sol
  default: claude-sonnet-5-5
```

A target with no matching key and no `default` drops the field for that target. Per-target values work the same way inside hook handlers and MCP server configs.

## Reference Docs

Files under `<%%= config.templatesDir %>/docs/` (or `docs/` in any `additionalTemplateDirs` entry) are **reference docs**. uac never generates them, and no AI tool loads them automatically. Link one from an instruction, skill, or agent with `<%%%= docPath('name') %>`, and agents read it only when they need it. This keeps always-on instructions short while the detail stays one link away.

- `docPath('api/errors')` points at `docs/api/errors.md`, as a project-root-relative path, or an absolute path when the doc lives in a template directory outside the project.
- The first template directory containing that path wins, the same as templates. A `docPath()` name with no matching doc prints a warning during `uac generate`.
- Docs are read as-is: EJS and path helpers inside them are **not** rendered. Link sibling docs with plain relative links (`[errors](errors.md)`).
- uac's own reference docs live in `docs/uac/` and are refreshed by `uac seed meta-instructions` — don't edit them.

## Frontmatter Fields

<% if (standards.instructions) { -%>
### Instructions

`AGENTS.md` files have no frontmatter: where a file sits is its scope. The root `AGENTS.md` loads into **every** session on every tool, so keep it short and move detail into [reference docs](#reference-docs). How each tool loads nested files: `<%%= docPath('uac/standards') %>`

<% } else { -%>
### Instructions

| Field          | Description                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `description`  | What the instruction covers                                                                                                    |
| `globs`        | File patterns to scope this instruction to (string or array)                                                                   |
| `alwaysApply`  | If true, applies to all conversations regardless of files                                                                      |
| `name`         | Display name shown in the UI (Copilot only — defaults to file name)                                                            |
| `excludeAgent` | Exclude from specific agents: `"code-review"` or `"cloud-agent"` (GitHub Copilot cloud only, not VS Code Copilot Chat locally) |

`alwaysApply` instructions are loaded into **every** session on every target (they go in the root `AGENTS.md` when AGENTS.md is generated), so keep them short and move detail into [reference docs](#reference-docs).

### AGENTS.md

When `codex` is a target, or `agentsMd.enable` is true, instructions are written to AGENTS.md files instead, and **every target that reads AGENTS.md (Claude, Cursor, Copilot) skips its own instruction files** — so `globs`, `excludeAgent` and Cursor's agent-decided rules lose their effect there. `agentsMd.variation` picks the layout:

- `nested` (default): folder-scoped `globs` (`packages/web/**`) → `packages/web/AGENTS.md`; everything else → root `AGENTS.md`.
- `concatenate`: everything in root `AGENTS.md`, with a scope note on scoped sections.
- `index`: root `AGENTS.md` lists folders and the file to read for each (`<indexDir>/<name>.md`).

Run `uac generate --clean` after changing `globs` or the variation. Generate only the targets you use (`targets` in `universal-ai-config.overrides.ts`) to keep each tool on its own mechanism. Details and what each target loses: `<%%= docPath('uac/config') %>`

<% } -%>
### Skills

<% if (standards.skills) { -%>
Skills use the Agent Skills fields as the tools read them: `name` (matches the folder), `description` (when to use it), `license`, `compatibility`, `metadata` (string values), `allowed-tools`. Tool-specific fields such as `disable-model-invocation`, `user-invocable` or `argument-hint` work where a tool knows them and are ignored elsewhere.
<% } else { -%>
Most-used fields: `name` (the slash command), `description` (when to use it), `disableAutoInvocation` (manual slash command only), `userInvocable` (`false` = only the AI can trigger it), `allowedTools`, `model`, `argumentHint`. Many fields are Claude-only or Codex-only.

All skill fields with per-target support, including Codex `codex.*` UI metadata: `<%%= docPath('uac/frontmatter') %>`
<% } -%>

### Agents

Most-used fields: `name`, `description` (when to delegate), `model`, `tools`, `skills`, `mcpServers`. Cursor agents take only `name`, `description`, `model`, `readonly` and `background`.

All agent fields with per-target support: `<%%= docPath('uac/frontmatter') %>`

## Hooks

Hooks are JSON files; every file in `hooks/` merges into one output per target:

```json
{
  "hooks": {
    "preToolUse": [{ "command": "./scripts/check.sh", "matcher": "Bash", "timeout": 30 }]
  }
}
```

- Use **camelCase universal event names** — `sessionStart`, `sessionEnd`, `userPromptSubmit`, `preToolUse`, `postToolUse`, `stop`, and more. uac maps them to each target's name and silently drops events a target doesn't support.
- Core handler fields: `command`, `matcher`, `timeout` (seconds). `type` defaults to `command`; other types run only where supported (Claude: all; Copilot: `http`, `prompt`; Cursor: `prompt`; Codex: `mcp_tool`).
- Handler fields accept per-target values. A handler whose `command` resolves to nothing for a target is skipped there, and identical handlers from different files are emitted once.
- With claude and copilot in one run, only Claude's hooks are written (Copilot runs them).

Full handler fields, the event mapping table per target, matcher patterns, and per-target caveats: `<%%= docPath('uac/hooks') %>`

## Variables in JSON Templates

Hooks and MCP templates use `{{variableName}}` placeholders, filled from `variables` in the config:

- `"{{var}}"` as the **entire** value resolves to the raw typed value (array, object, number, boolean).
- `{{var}}` inside other text is string interpolation.
- `${ENV_VAR}` is left alone — use it for runtime environment variables that should pass through to the output unchanged.

Worked example: `<%%= docPath('uac/config') %>`

## MCP Servers

MCP templates are JSON files in `mcp/`:

```json
{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["-y", "@some/mcp-server"],
      "env": { "API_KEY": "${API_KEY}" }
    }
  }
}
```

- Core fields: `command` + `args` (stdio) or `url` + `headers` (HTTP), plus `type` and `env`. A server needs `command` or `url`, or it is dropped for that target.
- Server fields accept per-target values.
- All `mcp/*.json` files merge by server name; the first declaration wins.
- `mcp.forceOptIn` + `mcp.mcpServers` in the config limit which servers each target gets.
- Claude and Copilot share the root `.mcp.json`; with both in one run it is rendered for Claude.

Target-only fields (Claude `alwaysLoad`, Copilot `deferTools`, Codex `enabledTools`, …), output paths, and opt-in filtering: `<%%= docPath('uac/mcp') %>`

## Template Precedence

Templates come from `templatesDir` first, then each `additionalTemplateDirs` entry in order. For any name, **the first wins** and later copies are shadowed. Skill folders are replaced whole, never merged, while differently-named hooks/MCP files still merge. To use a lower-precedence copy, exclude the winner by its source-qualified path (e.g. `<%%= config.templatesDir %>/skills/review/SKILL.md`). `uac generate --verbose` lists what was shadowed.

Identity rules per type and exclusion examples: `<%%= docPath('uac/config') %>`

## Tools

The `tools`, `allowedTools`, and `disallowedTools` fields take tool names, which **differ per target**:

- Claude uses PascalCase names (`Read`, `Edit`, `Bash`) and `mcp__server__tool`.
- Copilot uses aliases (`read`, `edit`, `search`, `execute`) and `server/tool`.
- Cursor has no tool lists (Cursor agents have `readonly`).
- Codex has no agent-level tool list; it restricts tools per MCP server (`enabledTools`).

So always give tool lists per target:

```yaml
tools:
  claude: ["Read", "Grep", "Glob"]
  copilot: ["read", "search"]
```

Full tool lists per target and common combinations: `<%%= docPath('uac/tools') %>`

## Codex

Codex differs most from the other targets:

- Instructions are the [AGENTS.md](#agentsmd) output; Codex loads nested AGENTS.md files only on the path it was launched in.
- Agents become `.codex/agents/<name>.toml`, and skills go to `.agents/skills/<name>/`.
- Agents can't set `tools`, `permissionMode`, `skills` or `mcpServers` (they inherit the session's); those are dropped with a warning, and `claude-*` models need a per-target override.
- `.codex/config.toml` is shared with user content; uac owns only `[mcp_servers.*]`.

Output paths, caveats, and every value uac can't translate: `<%%= docPath('uac/codex') %>`

## Models

Model IDs differ per target even for the same model. Claude Code and Cursor use `claude-sonnet-5-5`, Copilot uses `claude-sonnet-5.5`, and uac doesn't translate between them, so set `model` per target. Current IDs per target: `<%%= docPath('uac/models') %>`
