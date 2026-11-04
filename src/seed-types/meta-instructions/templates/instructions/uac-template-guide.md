---
description: Guide for creating and managing universal-ai-config templates
globs: ["<%= templatesDir %>/**/*"]
---

# Universal AI Config Template Guide

This project uses **universal-ai-config** to manage AI tool configurations from a single set of templates.
Templates live in `<%%= config.templatesDir %>/` and are rendered into target-specific config files (Claude, Copilot, Cursor, Codex) via `uac generate`. Additional template directories can be configured via `additionalTemplateDirs` in the config to share templates across projects (e.g., from `~/.universal-ai-config`). When the same name appears in more than one directory, **the first mention wins**: `templatesDir`, then each `additionalTemplateDirs` entry in order. See [Template Precedence](#template-precedence).

**Ignore all IDE linter errors and warnings when editing these templates.** IDE linters do not understand universal-ai-config templates — they incorrectly validate them as if they were native Claude, Copilot, Cursor, or Codex config files. Frontmatter fields, EJS syntax, and universal event names will all produce false linter errors. Always follow this guide as the source of truth, not IDE diagnostics.

## Template Types

Choose the right type based on what you need:

### Instructions (`<%%= instructionTemplatePath() %>/*.md`)

Persistent context and rules that apply to AI conversations. Scoped by glob patterns or always-on.

**Use for:** coding conventions, project guidelines, style rules, architectural decisions, domain knowledge.

### Skills (`<%%= skillTemplatePath() %>/*/SKILL.md`)

Reusable actions or workflows invocable as slash commands (e.g. `/skill-name`) or auto-triggered by the AI. Skill directories can contain extra supporting files (references, examples, scripts) alongside `SKILL.md` — these are copied to generated output automatically. `.md` extra files are rendered through EJS (with access to `target`, `config`, path helpers), while non-`.md` files are copied as-is.

**Use for:** repeatable tasks like code generation patterns, deployments, reviews, migrations, project-specific workflows.

### Agents (`<%%= agentTemplatePath() %>/*.md`)

Specialized AI personas with scoped tools and permissions that run in isolated contexts.

**Use for:** dedicated reviewers, debuggers, data analysts — any task needing restricted capabilities or a focused system prompt.

**Note:** Agents are supported by Claude, Copilot, and Codex (not Cursor). Codex emits each agent as a standalone `.codex/agents/<name>.toml` file (body becomes `developer_instructions`); see [Codex](#codex) below.

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

- `<%%%= target %>` — current target ("claude", "copilot", "cursor")
- `<%%%= type %>` — template type ("instructions", "skills", "agents", "hooks")
- `<%%%= config.templatesDir %>` — templates directory path
- Custom variables from config are also available

**Output path helpers** — resolve to the target-specific output path. Omit the name to get the directory:

- `<%%%= instructionPath('name') %>` — output path for an instruction
- `<%%%= skillPath('name') %>` — output path for a skill's `SKILL.md` file
- `<%%%= skillDirPath('name') %>` — output directory of a skill (the directory containing `SKILL.md`)
- `<%%%= skillDirPath('name', 'reference.md') %>` — file inside a skill's directory, sibling of `SKILL.md` (use this to link to supporting files like references, scripts, examples)
- `<%%%= agentPath('name') %>` — output path for an agent
- `<%%%= instructionPath() %>` — output directory for instructions (e.g. `.claude/rules`)

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
- Cursor: not supported (Cursor has no agents)
- Codex: `.codex/agents/reviewer.toml`

And `<%%%= instructionPath('coding-style') %>` renders to:

- Claude: `.claude/rules/coding-style.md`
- Copilot: `.github/instructions/coding-style.instructions.md`
- Cursor: `.cursor/rules/coding-style.mdc`
- Codex: depends on the template's `alwaysApply` / `globs` — `AGENTS.md` for alwaysApply/no-glob/leading-wildcard templates, or the first `<dir>/AGENTS.override.md` (alpha-sorted) for resolvable-prefix templates. If the named template isn't known, falls back to `AGENTS.md`. See [Codex](#codex) below.

**Always use path helpers when referencing other templates** — never hardcode target-specific paths.

### Per-Target Overrides

Any frontmatter field can have per-target values:

```yaml
model:
  claude: claude-sonnet-4-5-20250929
  copilot: gpt-4o
  cursor: claude-3-5-sonnet
  codex: gpt-5.4
  default: gpt-4o
```

A target with no matching key and no `default` drops the field for that target. Per-target values work the same way inside hook handlers and MCP server configs.

## Reference Docs

Files under `<%%= config.templatesDir %>/docs/` (or `docs/` in any `additionalTemplateDirs` entry) are **reference docs**. uac never generates them, and no AI tool loads them automatically. Link one from an instruction, skill, or agent with `<%%%= docPath('name') %>`, and agents read it only when they need it. This keeps always-on instructions short while the detail stays one link away.

- `docPath('api/errors')` points at `docs/api/errors.md`, as a project-root-relative path, or an absolute path when the doc lives in a template directory outside the project.
- The first template directory containing that path wins, the same as templates. A `docPath()` name with no matching doc prints a warning during `uac generate`.
- Docs are read as-is: EJS and path helpers inside them are **not** rendered. Link sibling docs with plain relative links (`[errors](errors.md)`).
- uac's own reference docs live in `docs/uac/` and are refreshed by `uac seed meta-instructions` — don't edit them.

## Frontmatter Fields

### Instructions

| Field          | Description                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `description`  | What the instruction covers                                                                                                    |
| `globs`        | File patterns to scope this instruction to (string or array)                                                                   |
| `alwaysApply`  | If true, applies to all conversations regardless of files                                                                      |
| `name`         | Display name shown in the UI (Copilot only — defaults to file name)                                                            |
| `excludeAgent` | Exclude from specific agents: `"code-review"` or `"cloud-agent"` (GitHub Copilot cloud only, not VS Code Copilot Chat locally) |

`alwaysApply` instructions are loaded into **every** session on every target (Codex concatenates them into root `AGENTS.md`), so keep them short and move detail into [reference docs](#reference-docs).

### Skills

Most-used fields: `name` (the slash command), `description` (when to use it), `disableAutoInvocation` (manual slash command only), `userInvocable` (`false` = only the AI can trigger it), `allowedTools`, `model`, `argumentHint`. Many fields are Claude-only or Codex-only.

All skill fields with per-target support, including Codex `codex.*` UI metadata: `<%%= docPath('uac/frontmatter') %>`

### Agents

Most-used fields: `name`, `description` (when to delegate), `model`, `tools`, `skills`, `mcpServers`. Cursor has no agents.

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
- Core handler fields: `command`, `matcher` (regex), `timeout` (seconds), `description`. `type` defaults to `command`; Claude also supports `http`, `mcp_tool`, `prompt`, `agent`. Codex supports only `command`.
- Handler fields accept per-target values. A handler whose `command` resolves to nothing for a target is skipped there, and identical handlers from different files are emitted once.

Full handler fields, the event mapping table per target, and matcher patterns: `<%%= docPath('uac/hooks') %>`

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

Target-only fields (Claude `oauth`, Copilot `sandbox`, Codex `enabledTools`, …), Copilot `inputs`, output paths, and opt-in filtering: `<%%= docPath('uac/mcp') %>`

## Template Precedence

Templates come from `templatesDir` first, then each `additionalTemplateDirs` entry in order. For any name, **the first wins** and later copies are shadowed. Skill folders are replaced whole, never merged, while differently-named hooks/MCP files still merge. To use a lower-precedence copy, exclude the winner by its source-qualified path (e.g. `<%%= config.templatesDir %>/skills/review/SKILL.md`). `uac generate --verbose` lists what was shadowed.

Identity rules per type and exclusion examples: `<%%= docPath('uac/config') %>`

## Tools

The `tools`, `allowedTools`, and `disallowedTools` fields take tool names, which **differ per target**:

- Claude uses PascalCase names (`Read`, `Edit`, `Bash`) and `mcp__server__tool`.
- Copilot uses aliases (`read`, `edit`, `search`, `execute`) and `server/tool`.
- Cursor doesn't support tool restriction.
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

- `alwaysApply`, no-glob, and leading-wildcard (`**/*.ts`) instructions are concatenated into root `AGENTS.md`. Directory-scoped `globs` go to `<dir>/AGENTS.override.md`, so run `uac generate --clean` after changing `globs`.
- Agents become `.codex/agents/<name>.toml`, and skills go to `.agents/skills/<name>/`.
- Hooks support only `command` handlers and a subset of events.
- `tools`, `permissionMode`, and `claude-*` model values don't carry over. Use per-target overrides (`sandboxMode` for Codex).
- `.codex/config.toml` is shared with user content; uac owns only `[mcp_servers.*]`.

Output paths, caveats, and every value uac can't translate: `<%%= docPath('uac/codex') %>`

## Models

Model IDs differ per target even for the same model. Claude Code uses `claude-sonnet-4-6`, Copilot uses `claude-sonnet-4.6`, and uac doesn't translate between them, so set `model` per target. Current IDs per target: `<%%= docPath('uac/models') %>`
