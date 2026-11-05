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
6. **Is it long reference material only needed occasionally?** → a file agents read only when they need it, linked from an instruction or skill (see [Long Reference Material](#long-reference-material))

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

Template bodies (not frontmatter) are rendered with EJS once per target: `<%%%= target %>` prints the target being generated (`claude`, `copilot`, `cursor`, `codex`), and `<%%% if (target === 'claude') { %>` … `<%%% } %>` keeps text for one target. `type`, `consumers`, `config` and the config's `variables` are in scope too.

**Always use path helpers when referencing other templates** — never hardcode target-specific paths. `instructionPath`, `skillPath`, `skillDirPath` and `agentPath` return a template's output path for the target being generated (e.g. `<%%%= skillDirPath('deploy', 'reference.md') %>` for a file next to a skill's `SKILL.md`), the `…TemplatePath` helpers its source path, `docPath` one of uac's reference docs, and `mcpToolRef` the target's name for an MCP tool.

Every variable and helper, and what each returns per target: `<%%= docPath('uac/templates') %>`

### Per-Target Overrides

Any frontmatter field, hook handler field or MCP server field can take per-target values: an object whose keys are all target names or `default`, e.g. `model: { claude: claude-sonnet-5-5, copilot: claude-sonnet-5.5 }`. A target with no matching key and no `default` drops the field. Details: `<%%= docPath('uac/templates') %>`

## Long Reference Material

Keep always-on instructions short. Move long reference material (full tables, API details, edge cases) into a file agents read only when they need it: a supporting file next to a skill's `SKILL.md`, or a doc elsewhere in the repo that an instruction links to by its path.

Never add or edit files in `<%%= config.templatesDir %>/docs/`: that folder belongs to uac. It holds uac's own reference docs, which `uac seed meta-instructions` overwrites, and uac may change anything in it.

## Frontmatter Fields

<% if (standards.instructions) { -%>
### Instructions

`AGENTS.md` files have no frontmatter: where a file sits is its scope. The root `AGENTS.md` loads into **every** session on every tool, so keep it short and move detail into [files read on demand](#long-reference-material). How each tool loads nested files: `<%%= docPath('uac/standards') %>`

<% } else { -%>
### Instructions

Fields: `description`, `globs` (string or array), `alwaysApply`, and Copilot-only `name` and `excludeAgent`. `alwaysApply` instructions are loaded into **every** session on every target (they go in the root `AGENTS.md` when AGENTS.md is generated), so keep them short and move detail into [files read on demand](#long-reference-material). All instruction fields: `<%%= docPath('uac/frontmatter') %>`

### AGENTS.md

When `codex` is a target, or `agentsMd.enable` is true, instructions are written to AGENTS.md files instead, and **every target that reads AGENTS.md (Claude, Cursor, Copilot) skips its own instruction files** — so `globs`, `excludeAgent` and Cursor's agent-decided rules lose their effect there. `agentsMd.variation` picks the layout:

- `nested` (default): folder-scoped `globs` (`packages/web/**`) → `packages/web/AGENTS.md`; everything else → root `AGENTS.md`.
- `concatenate`: everything in root `AGENTS.md`, with a scope note on scoped sections.
- `index`: root `AGENTS.md` lists folders and the file to read for each (`<indexDir>/<name>.md`).

Run `uac generate --clean` after changing `globs` or the variation. Generate only the targets you use (`targets` in `universal-ai-config.overrides.ts`) to keep each tool on its own mechanism. Details and what each target loses: `<%%= docPath('uac/config') %>`

<% } -%>
### Skills

<% if (standards.skills) { -%>
Skills use the Agent Skills fields as the tools read them (`user-invocable`, not uac's `userInvocable`). Every field: `.agents/skills/update-skill/SKILL.md`
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
- Core handler fields: `command`, `matcher`, `timeout` (seconds). `type` defaults to `command`; other types run only on targets that support them.
- Handler fields accept per-target values. A handler whose `command` resolves to nothing for a target is skipped there, and identical handlers from different files are emitted once.
- With claude and copilot in one run, only Claude's hooks are written (Copilot runs them).

Full handler fields, the handler types and events each target runs, matcher patterns, and per-target caveats: `<%%= docPath('uac/hooks') %>`

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

<% if (standards.instructions) { -%>
- Instructions are the project's own `AGENTS.md` files; Codex loads nested ones only on the path it was launched in.
<% } else { -%>
- Instructions are the [AGENTS.md](#agentsmd) output; Codex loads nested AGENTS.md files only on the path it was launched in.
<% } -%>
<% if (standards.skills) { -%>
- Agents become `.codex/agents/<name>.toml`. Codex reads skills from `.agents/skills/` as they are.
<% } else { -%>
- Agents become `.codex/agents/<name>.toml`, and skills go to `.agents/skills/<name>/`.
<% } -%>
- Agents can't set `tools`, `permissionMode`, `skills` or `mcpServers` (they inherit the session's); those are dropped with a warning, and `claude-*` models need a per-target override.
- `.codex/config.toml` is shared with user content; uac owns only `[mcp_servers.*]`.

Output paths, caveats, and every value uac can't translate: `<%%= docPath('uac/codex') %>`

## Models

Model IDs differ per target even for the same model. Claude Code and Cursor use `claude-sonnet-5-5`, Copilot uses `claude-sonnet-5.5`, and uac doesn't translate between them, so set `model` per target. Current IDs per target: `<%%= docPath('uac/models') %>`
