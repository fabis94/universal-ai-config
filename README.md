# universal-ai-config

Generate tool-specific AI config files from shared templates. Write your AI instructions, skills, agents, hooks, and MCP server configs once — generate config for Claude Code, GitHub Copilot, Cursor, and OpenAI Codex automatically.

## Table of Contents

- [Why](#why)
- [Install](#install)
- [Quick Start](#quick-start)
- [Shared Outputs: One Target Set per Machine](#shared-outputs-one-target-set-per-machine)
- [AGENTS.md](#agentsmd)
- [Template Structure](#template-structure)
- [Writing Templates](#writing-templates)
  - [Instructions](#instructions)
  - [Skills](#skills)
  - [Agents](#agents)
  - [Hooks](#hooks)
  - [MCP Servers](#mcp-servers)
  - [Reference Docs](#reference-docs)
- [Per-Target Overrides](#per-target-overrides)
- [EJS Template Variables](#ejs-template-variables)
- [Configuration](#configuration)
  - [Template Precedence & Shadowing](#template-precedence--shadowing)
- [CLI Reference](#cli-reference)
  - [`uac generate`](#uac-generate)
  - [`uac init`](#uac-init)
  - [`uac clean`](#uac-clean)
  - [`uac seed`](#uac-seed)
  - [`uac skill add`](#uac-skill-add)
- [Output Paths](#output-paths)
- [Complete Template Reference](#complete-template-reference)
- [Programmatic API](#programmatic-api)
- [Adding a New Target](#adding-a-new-target)

## Why

AI coding tools each have their own config formats stored in `.claude/`, `.github/`, `.cursor/`, `.codex/` (plus `AGENTS.md` files and `.agents/skills/`). Teams want shared AI config but each developer may use a different tool. This CLI generates target-specific config files from shared templates in `.universal-ai-config/`, so the tool-specific folders can be gitignored and each dev generates only what they need.

## Install & Run

```bash
npm install -D universal-ai-config

npm exec uac <command>
```

> **Non-JS projects:** Use `npx universal-ai-config` to run commands without installing, e.g. `npx universal-ai-config generate -t claude`.

## Quick Start

```bash
# Scaffold template directory with meta-instructions and config
uac init

# Generate for the targets in your config (set yours in the overrides file, see below)
uac generate

# Generate for specific targets — replaces the configured target set for this run
uac generate -t claude

# Or generate just Codex
uac generate -t codex

# Preview without writing files
uac generate --dry-run

# Seed example templates (instruction, skill, agent, hook)
uac seed examples
```

## Shared Outputs: One Target Set per Machine

> [!IMPORTANT]
> **Generate only the tools you use on your machine.** Each developer sets `targets` in their own gitignored overrides file (`universal-ai-config.overrides.ts`, see [Configuration](#overrides-config-universal-ai-configoverridests--ideally-gitignored)), and the generated folders stay gitignored. Generating every target at once — let alone committing all of it — is not the intended setup.

```typescript
// universal-ai-config.overrides.ts — gitignored, one per developer
import { defineConfig } from "universal-ai-config";

export default defineConfig({ targets: ["claude"] });
```

This matters because the tools now read each other's files: Claude, Cursor and Copilot all read `AGENTS.md`, Copilot runs Claude's `.claude/settings.json` hooks and reads Claude's `.mcp.json`, and Cursor runs Claude's hooks too. Generate two of these on one machine and the same instructions load twice and the same hooks run twice.

**The fallback.** When a run does include targets that read each other's files, uac generates **one** copy and warns (`uac generate` leads the warning with the fix above):

| When the run includes                                                         | uac generates                                     | Skipped                                                                                        |
| ----------------------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `codex`, or [`agentsMd.enable`](#agentsmd), plus any of claude/cursor/copilot | the `AGENTS.md` files only                        | `.claude/rules/`, `.cursor/rules/`, `.github/instructions/`, `.github/copilot-instructions.md` |
| `claude` + `copilot`                                                          | Claude's hooks (`.claude/settings.json`)          | `.github/hooks/hooks.json`                                                                     |
| `claude` + `copilot`                                                          | one root `.mcp.json`, rendered for Claude         | Copilot's own `.mcp.json` rendering                                                            |
| `claude` + `cursor`                                                           | both hook files (Cursor skips identical commands) | — (uac warns about each Claude hook Cursor would still run)                                    |

What a switched target loses:

- **Claude** (instructions → AGENTS.md): file-pattern scoping (`paths` globs); nested `AGENTS.md` files load only when Claude reads a file in that folder, and none load while a non-empty `CLAUDE.md`, `.claude/CLAUDE.md` or `CLAUDE.local.md` exists (uac warns).
- **Cursor** (instructions → AGENTS.md): glob-scoped and description-only (agent-decided) rules — they become always-on or folder-scoped.
- **Copilot** (instructions → AGENTS.md): `applyTo` patterns, `excludeAgent` and `name`; nested `AGENTS.md` files load only after Copilot views a file in that folder (CLI 1.0 and later).
- **Copilot** (hooks → Claude's): Copilot-only events (`userPromptTransformed`, `preMcpToolCall`, `postResult`, `prePRDescription`), `cwd`/`env`, and hooks in the GitHub cloud agent, which reads only `.github/hooks`. Copilot runs Claude-format hooks with Claude's tool names and payloads, and exit code 1 blocks the tool. A `prompt`, `agent` or `mcp_tool` handler makes Copilot reject Claude's whole hook file (uac warns).
- **Copilot** (MCP → Claude's `.mcp.json`): Copilot-specific server values (per-target `copilot` overrides) and Copilot-only fields such as `deferTools`.

Skills and agents need nothing: Cursor and Copilot prefer their own copy when Claude's is also present. `uac generate --verbose` lists what each target loses in your run. Details: [config reference](src/seed-types/meta-instructions/templates/docs/uac/config.md).

## AGENTS.md

Each tool's own instruction mechanism is the default. `AGENTS.md` files are generated only when nothing better exists or you ask for them:

- **Forced** whenever `codex` is a target — Codex reads nothing else. `agentsMd.enable: false` is ignored then, with a warning.
- **Opt-in** with `agentsMd.enable: true`, e.g. a Claude-only project that wants `AGENTS.md`.

While they're generated, every target that reads `AGENTS.md` (claude, cursor, copilot) skips **all** of its own instruction output, so nothing loads twice. uac never writes `CLAUDE.md`.

```typescript
export default defineConfig({
  agentsMd: {
    enable: true, // only matters without codex
    variation: "nested", // "nested" (default) | "concatenate" | "index"
    indexDir: ".agents/uac-instructions", // index variation only
    keepOverrideFiles: false, // true: never warn about or offer to delete AGENTS.override.md files
  },
});
```

| Variation          | Layout                                                                                                                                                                                                                                  |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nested` (default) | Always-on templates and folder-less globs (`**/*.ts`) → root `AGENTS.md`. Folder globs (`packages/web/**`) → `packages/web/AGENTS.md`. Tools load nested files only when they work in that folder (Codex only when launched inside it). |
| `concatenate`      | Everything → root `AGENTS.md`, each scoped section with a one-line scope note ("Applies to files in `packages/web/`"). Same behavior in every tool; every session pays the context cost.                                                |
| `index`            | Root `AGENTS.md` opens with a "Scoped instructions" list of folders → `<indexDir>/<name>.md` files the agent reads before editing there; folder-less sections and always-on ones follow inline.                                         |

- **Ownership:** generate overwrites every `AGENTS.md` it writes, root and nested, like any other output; `uac clean` (for codex, or any reader when `enable` is set) removes every `AGENTS.md` in the project plus the index dir. Keep a hand-written one with [`preserveOnClean`](#preserving-files-from-clean).
- **Switching** targets or variations leaves the old layout behind — run `uac generate --clean`.
- **Warnings:** a folder chain over 32 KiB (Codex silently cuts the rest — try `index`), a `CLAUDE.md` that hides `AGENTS.md` from Claude, and globs no folder layout can express (negated, `..`).
- `AGENTS.override.md` is no longer generated: Codex never loads it in a root launch, and it hides a same-folder `AGENTS.md`. `uac generate` and `uac clean` list leftover ones and, in a terminal, ask to delete them. Set `keepOverrideFiles: true` if yours are hand-written.

## Template Structure

```
your-project/
├── universal-ai-config.config.ts           # Shared config (committed)
├── universal-ai-config.overrides.ts # Personal overrides, e.g. your targets (gitignored)
└── .universal-ai-config/
    ├── instructions/          # Rules/instructions (markdown + EJS)
    │   ├── react-patterns.md
    │   └── security.md
    ├── skills/                # One folder per skill
    │   └── test-generation/
    │       └── SKILL.md
    ├── agents/                # Agent/subagent definitions
    │   └── code-reviewer.md
    ├── hooks/                 # Hook configs (JSON)
    │   ├── security.json
    │   └── quality.json
    ├── mcp/                   # MCP server configs (JSON)
    │   └── github.json
    └── docs/                  # Reference docs — never generated, linked via docPath()
        └── api-errors.md
```

## Writing Templates

Markdown templates use YAML frontmatter and [EJS](https://ejs.co/) for conditional content. JSON templates (hooks, MCP) support `{{variableName}}` interpolation from config variables — when the entire value is a placeholder (e.g. `"args": "{{myArgs}}"`), it resolves to the raw typed value (arrays, objects, etc.), enabling environment-specific configs via `overrides.ts`.

### Instructions

```markdown
---
description: TypeScript specific rules
globs: ["**/*.ts", "**/*.tsx"]
---

Use strict TypeScript. Prefer interfaces over type aliases for object shapes.
```

```markdown
---
description: Always applied coding standards
alwaysApply: true
---

Follow the project's coding standards at all times.

<% if (target === 'claude') { -%>
Use the Read tool to check existing patterns before creating new code.
<% } else { -%>
Check existing patterns before creating new code.
<% } -%>
```

#### Frontmatter Fields

| Field          | Type                 | Description                                                      |
| -------------- | -------------------- | ---------------------------------------------------------------- |
| `description`  | `string`             | What this instruction does                                       |
| `globs`        | `string \| string[]` | File patterns this applies to                                    |
| `alwaysApply`  | `boolean`            | Apply to all files regardless of context                         |
| `excludeAgent` | `string`             | Copilot-only: exclude from specific agent (e.g. `"code-review"`) |

> **AGENTS.md:** with `codex` as a target (or `agentsMd.enable`), instructions go to `AGENTS.md` files for every target that reads them — routed by `alwaysApply` and `globs` as described in [AGENTS.md](#agentsmd).

### Skills

Skills live in subdirectories with a `SKILL.md` file:

```markdown
---
name: test-generation
description: Generate tests for code
disableAutoInvocation: true
userInvocable: true
---

Generate comprehensive tests using vitest for the given code.
```

#### Frontmatter Fields

| Field                   | Type       | Description                                                                                         |
| ----------------------- | ---------- | --------------------------------------------------------------------------------------------------- |
| `name`                  | `string`   | Skill identifier — lowercase letters, digits and hyphens, matching the folder (uac warns otherwise) |
| `description`           | `string`   | What this skill does (required by the Agent Skills spec)                                            |
| `disableAutoInvocation` | `boolean`  | Prevent automatic triggering                                                                        |
| `userInvocable`         | `boolean`  | `false` hides it from the `/` menu (Claude/Copilot/Cursor)                                          |
| `allowedTools`          | `string[]` | Tools pre-approved while the skill runs (Claude/Copilot)                                            |
| `disallowedTools`       | `string[]` | Tools removed while the skill runs (Claude)                                                         |
| `model`                 | `string`   | Model to use (Claude)                                                                               |
| `forkContext`           | `boolean`  | Run in a forked subagent (Claude/Copilot); `background: false` waits for it (Claude)                |
| `skillPaths`            | `string[]` | Scope the skill to matching files (Claude `paths`, Cursor `paths`)                                  |
| `icon` / `color`        | `string`   | Custom Mode badge (Cursor; `color` is also a Claude agent field)                                    |
| `license`               | `string`   | Agent Skills spec field (all targets)                                                               |
| `compatibility`         | `string`   | Agent Skills spec field (all targets)                                                               |
| `metadata`              | `object`   | String-to-string map (all targets)                                                                  |
| `version` / `author`    | `string`   | Codex: written under `metadata`                                                                     |
| `codex`                 | `object`   | Codex-only UI/dependency metadata — drives the `agents/openai.yaml` sidecar                         |

More fields (`argumentHint`, `subagentType`, `hooks`, `whenToUse`, `effort`, …) and per-target support: [frontmatter reference](src/seed-types/meta-instructions/templates/docs/uac/frontmatter.md).

### Agents

```markdown
---
name: code-reviewer
description: Reviews code for quality
model: sonnet
tools: ["read", "grep", "glob"]
---

You are a code reviewer. Check for bugs and best practice violations.
```

#### Frontmatter Fields

| Field             | Type       | Description                                                                                    |
| ----------------- | ---------- | ---------------------------------------------------------------------------------------------- |
| `name`            | `string`   | Agent identifier                                                                               |
| `description`     | `string`   | What this agent does (Codex skips an agent without one)                                        |
| `model`           | `string`   | Model to use — IDs differ per target, so use a [per-target override](#per-target-overrides)    |
| `tools`           | `string[]` | Available tools (Claude/Copilot; Codex drops it)                                               |
| `disallowedTools` | `string[]` | Blocked tools (Claude)                                                                         |
| `permissionMode`  | `string`   | Permission mode (Claude)                                                                       |
| `skills`          | `string[]` | Skills to preload (Claude/Copilot; Codex drops it)                                             |
| `effort`          | `string`   | Reasoning effort (Claude `effort`, Copilot `reasoning-effort`, Codex `model_reasoning_effort`) |
| `background`      | `boolean`  | Keep the subagent in the background (Claude, Cursor `is_background`)                           |
| `readonly`        | `boolean`  | Restricted write permissions (Cursor)                                                          |
| `mcpServers`      | `object`   | MCP servers for the agent (Claude/Copilot; Codex agents inherit the session's)                 |
| `target`          | `string`   | `vscode` or `github-copilot` (Copilot)                                                         |
| `hooks`           | `object`   | Hook definitions (Claude/Copilot)                                                              |
| `codex`           | `object`   | Codex-only agent keys (`modelReasoningSummary`, `modelVerbosity`, `personality`, …)            |

Claude-only (`memory`, `maxTurns`, `isolation`, `autoCompactWindow`, …) and Copilot-only (`modelPolicy`, `includeCustomInstructions`, …) fields are in the [frontmatter reference](src/seed-types/meta-instructions/templates/docs/uac/frontmatter.md).

> **Per target:** Cursor writes `.cursor/agents/<name>.md` with `name`, `description`, `model`, `readonly` and `is_background`. Codex writes a standalone `.codex/agents/<name>.toml` (body becomes `developer_instructions`) and drops fields an agent file can't set (`skills`, `mcpServers`, `sandboxMode`, `permissionMode`, `tools`) with a warning. Copilot drops the VS Code Local-harness fields `handoffs`, `agents` and `argument-hint` with a warning. Claude and Cursor agent frontmatter is written as plain single-line values (`tools: Read, Grep`) because Cursor reads it line by line.

### Hooks

Hooks are JSON files that define handlers running at lifecycle events (pre-tool-use, session start, etc.). Unlike other template types, hooks use pure JSON with no EJS templating. Multiple `.json` files in the `hooks/` directory are deep-merged by event name. When two files produce an identical handler for a target, only the first is emitted — see [Template Precedence & Shadowing](#template-precedence--shadowing).

```json
{
  "hooks": {
    "preToolUse": [
      {
        "matcher": "Bash",
        "command": ".hooks/block-rm.sh",
        "timeout": 30
      }
    ],
    "postToolUse": [
      {
        "command": ".hooks/lint.sh",
        "timeout": 60
      }
    ]
  }
}
```

#### Handler Fields

| Field           | Type       | Description                                                                                                            |
| --------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------- |
| `type`          | `string`   | `command` (default), `http`, `mcp_tool`, `prompt`, `agent` — see the support table below                               |
| `command`       | `string`   | Shell command or script path (`command` handlers)                                                                      |
| `args`          | `string[]` | Argument list. Claude keeps it; Copilot, Cursor and Codex fold it into the command string                              |
| `url`           | `string`   | `http` handlers                                                                                                        |
| `server`/`tool` | `string`   | `mcp_tool` handlers                                                                                                    |
| `prompt`        | `string`   | `prompt` / `agent` handlers                                                                                            |
| `matcher`       | `string`   | Which tool/trigger the hook fires for. Tool names differ per tool: Claude/Codex `Bash`, Cursor `Shell`, Copilot `bash` |
| `timeout`       | `number`   | Timeout in seconds                                                                                                     |
| `failClosed`    | `boolean`  | Block the action when the hook fails (Cursor `failClosed`, Claude `onFailure: "block"`)                                |
| `cwd` / `env`   | various    | Working directory and environment (Copilot)                                                                            |
| `async`         | `boolean`  | Run in the background (Claude/Codex)                                                                                   |
| `statusMessage` | `string`   | Status message displayed while the hook runs (Claude/Codex)                                                            |

A handler missing its required field for a target (e.g. `command: { claude: "x.sh" }` has no command for copilot) is skipped for that target silently. A handler type a target can't run is dropped with a warning:

| Handler type | Claude | Copilot                 | Cursor | Codex |
| ------------ | ------ | ----------------------- | ------ | ----- |
| `command`    | ✓      | ✓                       | ✓      | ✓     |
| `http`       | ✓      | ✓                       | —      | —     |
| `mcp_tool`   | ✓      | —                       | —      | ✓     |
| `prompt`     | ✓      | ✓ (`sessionStart` only) | ✓      | —     |
| `agent`      | ✓      | —                       | —      | —     |

Full handler fields per target, matcher semantics and per-tool caveats: [hooks reference](src/seed-types/meta-instructions/templates/docs/uac/hooks.md).

#### Universal Event Names

Use camelCase event names. The CLI maps them to each target's format and silently drops unsupported events.

| Universal            | Claude               | Cursor               | Copilot               | Codex               |
| -------------------- | -------------------- | -------------------- | --------------------- | ------------------- |
| `sessionStart`       | `SessionStart`       | `sessionStart`       | `sessionStart`        | `SessionStart`      |
| `sessionEnd`         | `SessionEnd`         | `sessionEnd`         | `sessionEnd`          | `SessionEnd`        |
| `userPromptSubmit`   | `UserPromptSubmit`   | `beforeSubmitPrompt` | `userPromptSubmitted` | `UserPromptSubmit`  |
| `preToolUse`         | `PreToolUse`         | `preToolUse`         | `preToolUse`          | `PreToolUse`        |
| `postToolUse`        | `PostToolUse`        | `postToolUse`        | `postToolUse`         | `PostToolUse`       |
| `postToolUseFailure` | `PostToolUseFailure` | `postToolUseFailure` | `postToolUseFailure`  | —                   |
| `stop`               | `Stop`               | `stop`               | `agentStop`           | `Stop`              |
| `subagentStart`      | `SubagentStart`      | `subagentStart`      | `subagentStart`       | `SubagentStart`     |
| `subagentStop`       | `SubagentStop`       | `subagentStop`       | `subagentStop`        | `SubagentStop`      |
| `preCompact`         | `PreCompact`         | `preCompact`         | `preCompact`          | `PreCompact`        |
| `postCompact`        | `PostCompact`        | —                    | —                     | `PostCompact`       |
| `permissionRequest`  | `PermissionRequest`  | —                    | `permissionRequest`   | `PermissionRequest` |
| `notification`       | `Notification`       | —                    | `notification`        | —                   |
| `errorOccurred`      | —                    | —                    | `errorOccurred`       | —                   |

Claude has more events (`messageDisplay`, `directoryAdded`, `preModelSwitch`, `postModelSwitch`, `instructionsLoaded`, `fileChanged`, …), and so do Copilot (`userPromptTransformed`, `preMcpToolCall`, `postResult`, `prePRDescription`) and Codex (`preModelRequest`, `postModelRequest`, `interrupt`); the [hooks reference](src/seed-types/meta-instructions/templates/docs/uac/hooks.md) has the full table. Cursor-specific events (`beforeShellExecution`, `afterFileEdit`, etc.) can be used directly — they pass through to Cursor and are dropped for other targets.

### MCP Servers

MCP server configs define external tool servers available to AI assistants. Like hooks, they use JSON format with typed `{{variable}}` interpolation support. Multiple `.json` files in the `mcp/` directory are merged by server name, and the **first declaration of a name wins** — see [Template Precedence & Shadowing](#template-precedence--shadowing). Use exact-match placeholders like `"args": "{{myArgs}}"` to substitute entire typed values (arrays, objects) from config variables.

```json
{
  "mcpServers": {
    "github": {
      "type": "http",
      "url": "https://api.githubcopilot.com/mcp/",
      "headers": { "Authorization": "Bearer ${GITHUB_TOKEN}" }
    },
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"]
    }
  }
}
```

#### Server Fields

| Field     | Type                     | Required | Description                                                                                    |
| --------- | ------------------------ | -------- | ---------------------------------------------------------------------------------------------- |
| `command` | `string`                 | yes\*    | Command to launch the server (stdio)                                                           |
| `args`    | `string[]`               | no       | Arguments for the command                                                                      |
| `type`    | `string`                 | no       | `stdio`, `http` or `ws` (`sse` is deprecated). Cursor gets `stdio` by default; Codex infers it |
| `env`     | `Record<string, string>` | no       | Environment variables                                                                          |
| `url`     | `string`                 | yes\*    | Server URL (`http`/`ws`)                                                                       |
| `headers` | `Record<string, string>` | no       | HTTP headers. **Codex:** written as `http_headers`                                             |
| `timeout` | `number`                 | no       | Per-call timeout in milliseconds (Claude/Copilot)                                              |

\*A server must have either `command` or `url`. If neither is present after per-target override resolution, the server is dropped for that target.

**Environment variables:** write `${NAME}` for Claude, Copilot and Codex. Cursor documents `${env:NAME}` (`${NAME}` happens to work but isn't documented) — use a per-target override if you want to be strict: `"env": { "cursor": { "TOKEN": "${env:TOKEN}" }, "default": { "TOKEN": "${TOKEN}" } }`.

**Codex-specific fields** (camelCase → snake_case in TOML) include `cwd`, `envVars`, `enabledTools`, `disabledTools`, `bearerTokenEnvVar`, `envHttpHeaders`, `startupTimeoutSec`, `toolTimeoutSec`, `environmentId`, `oauth` (`clientId`, `clientSecret`, `callbackUrl`, `callbackPort`), `headersHelper` and `auth` (`"oauth"` or `"chatgpt"`). See the [MCP reference](src/seed-types/meta-instructions/templates/docs/uac/mcp.md) for every field per target.

Server fields support per-target overrides (same syntax as hooks):

```json
{
  "mcpServers": {
    "my-server": {
      "command": { "default": "npx", "cursor": "node" },
      "args": { "default": ["-y", "@my/server"], "cursor": ["./mcp-server.js"] }
    }
  }
}
```

Copilot now writes the portable root `.mcp.json` (`mcpServers`) that Copilot CLI, the Copilot app and VS Code's default Copilot harness read. VS Code's legacy `.vscode/mcp.json` is no longer generated, so its `inputs` / `${input:…}` variables, `envFile`, `sandbox`, `sandboxEnabled` and `dev` are dropped with a warning — use `${NAME}` environment variables instead.

### Reference Docs

Files under `docs/` in your templates directory (or in any `additionalTemplateDirs` entry) are **reference docs**. uac never generates them, and no AI tool loads them automatically. Link one from an instruction, skill, or agent with the `docPath()` helper, and agents read it only when they need it. Use them to keep always-on instructions short:

```markdown
---
description: API conventions
alwaysApply: true
---

Return errors as `{ code, message }`. Full error code table: <%= docPath('api-errors') %>
```

- `docPath('api-errors')` renders `.universal-ai-config/docs/api-errors.md`. Nested names like `docPath('api/errors')` work too.
- The path is project-root-relative, or absolute when the doc lives in a template directory outside the project (e.g. `~/.universal-ai-config/docs/`).
- The first template directory that has the doc wins, the same as templates. A name with no matching doc prints a warning during `uac generate`.
- Docs are read as-is, so EJS inside them is not rendered. Link sibling docs with relative links.

## Per-Target Overrides

Any frontmatter field, hook handler field, or MCP server field can accept per-target values instead of a single value. If a field's value is an object where **every key is a target name** (`claude`, `copilot`, `cursor`, `codex`) or `default`, it's resolved to the matching target's value during generation. If the target isn't listed, the `default` value is used. If neither is present, the field is omitted.

### Frontmatter

```yaml
---
description:
  claude: Use Claude Code conventions
  copilot: Use Copilot conventions
  cursor: Use Cursor conventions
  codex: Use Codex conventions
tools:
  default: ["read", "grep", "glob"]
  claude: ["Read", "Grep", "Glob"]
model:
  default: sonnet
  claude: opus
  copilot: claude-sonnet-5.5
  cursor: composer-2.5
  codex: gpt-6.1-sol
permissionMode:
  claude: acceptEdits
---
```

When generating for Claude: `tools: ["Read", "Grep", "Glob"]`, `model: opus`, `permissionMode: acceptEdits`. For Copilot: `tools: ["read", "grep", "glob"]` (default), `model: claude-sonnet-5.5`, `permissionMode` omitted. For Cursor: `model: composer-2.5`; Cursor agents don't take `tools` or `permissionMode`. For Codex: `model: gpt-6.1-sol`; `tools` and `permissionMode` are dropped with a warning (Codex agents inherit the session's tools and sandbox). Model IDs per target: [models reference](src/seed-types/meta-instructions/templates/docs/uac/models.md).

You can mix per-target and plain values freely — plain values apply to all targets:

```yaml
---
name: my-skill
description:
  claude: Claude-specific description
  copilot: Copilot-specific description
license: MIT
---
```

### Hooks

Hook handler fields (`command`, `matcher`, `timeout`, `description`) support the same syntax:

```json
{
  "hooks": {
    "preToolUse": [
      {
        "command": {
          "claude": ".hooks/claude-check.sh",
          "copilot": ".hooks/copilot-check.sh",
          "cursor": ".hooks/cursor-check.sh"
        },
        "matcher": {
          "claude": "Bash",
          "cursor": "Shell"
        },
        "timeout": 30
      }
    ]
  }
}
```

If `command` resolves to `undefined` for a target (i.e. that target isn't listed), the entire handler is skipped for that target.

> **Note:** Objects with non-target keys (e.g. `metadata: { category: "devops" }`) are **not** treated as overrides — they pass through unchanged.

## EJS Template Variables

All templates have access to these variables:

| Variable              | Type                                           | Description                                                            |
| --------------------- | ---------------------------------------------- | ---------------------------------------------------------------------- |
| `target`              | `'claude' \| 'copilot' \| 'cursor' \| 'codex'` | Current output target                                                  |
| `type`                | `'instructions' \| 'skills' \| 'agents'`       | Template type being rendered (hooks/MCP don't use EJS)                 |
| `config`              | `ResolvedConfig`                               | Full resolved config object                                            |
| `consumers`           | `Target[]`                                     | Every target that will read this output (e.g. all `AGENTS.md` readers) |
| `...config.variables` | `Record<string, unknown>`                      | Custom user variables spread into scope                                |

### Path Helpers

Templates have access to path helper functions. All `name` parameters are optional — omit to get the directory path. Output paths follow `outputDirs`.

**Output path helpers** — resolve to the target-specific output path:

| Function                   | Returns                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------ |
| `instructionPath(name?)`   | Target-specific output path (or directory) for an instruction                                    |
| `skillPath(name?)`         | Target-specific output path (or directory) for a skill's `SKILL.md`                              |
| `skillDirPath(name, rel?)` | Target-specific path to a skill's directory, or to a file inside it (use for reference/examples) |
| `agentPath(name?)`         | Target-specific output path (or directory) for an agent                                          |
| `docPath(name?)`           | Path to a [reference doc](#reference-docs) `docs/<name>.md` (or the docs directory)              |

**Template path helpers** — resolve to the source template path in the templates directory:

| Function                         | Returns                                                |
| -------------------------------- | ------------------------------------------------------ |
| `instructionTemplatePath(name?)` | Template source path (or directory) for an instruction |
| `skillTemplatePath(name?)`       | Template source path (or directory) for a skill        |
| `agentTemplatePath(name?)`       | Template source path (or directory) for an agent       |
| `hookTemplatePath(name?)`        | Template source path (or directory) for a hook         |
| `mcpTemplatePath(name?)`         | Template source path (or directory) for an MCP config  |

**MCP reference helpers** — produce the target-appropriate syntax for referencing an MCP server tool. Use in instruction/skill bodies so the AI knows the right reference string for its platform without writing `<% if (target...) %>` conditionals:

| Function                   | Returns                                          |
| -------------------------- | ------------------------------------------------ |
| `mcpToolRef(server, tool)` | Fully-qualified reference to a specific MCP tool |
| `mcpToolRef(server)`       | Wildcard reference to all tools on a server      |

Per-target output for `mcpToolRef('github', 'list_issues')` / `mcpToolRef('github')`:

| Target  | Specific tool (`mcpToolRef('github', 'list_issues')`) | Wildcard (`mcpToolRef('github')`)                                    |
| ------- | ----------------------------------------------------- | -------------------------------------------------------------------- |
| Claude  | `mcp__github__list_issues`                            | `mcp__github__*`                                                     |
| Codex   | `mcp__github__list_issues`                            | `mcp__github__.*` (regex pattern for hook matchers)                  |
| Copilot | `github/list_issues`                                  | `github/*`                                                           |
| Cursor  | `MCP:list_issues`                                     | `MCP:.*` (no server qualifier — Cursor hooks don't filter by server) |

For example, `<%= instructionPath('coding-style') %>` renders to:

| Target  | Output                                                                     |
| ------- | -------------------------------------------------------------------------- |
| Claude  | `.claude/rules/coding-style.md`                                            |
| Copilot | `.github/instructions/coding-style.instructions.md`                        |
| Cursor  | `.cursor/rules/coding-style.mdc`                                           |
| Codex   | the `AGENTS.md` file the instruction lands in — see [AGENTS.md](#agentsmd) |

Whenever `AGENTS.md` is generated, every target that reads it gets the `AGENTS.md` path too: root `AGENTS.md`, `<dir>/AGENTS.md` (`nested`), or `<indexDir>/<name>.md` (`index`).

And `<%= instructionPath() %>` (no argument) renders to:

| Target  | Output                                                               |
| ------- | -------------------------------------------------------------------- |
| Claude  | `.claude/rules`                                                      |
| Copilot | `.github/instructions`                                               |
| Cursor  | `.cursor/rules`                                                      |
| Codex   | `AGENTS.md` (and so for every target while `AGENTS.md` is generated) |

For skills, `<%= skillDirPath('deploy', 'reference.md') %>` renders to:

| Target  | Output                               |
| ------- | ------------------------------------ |
| Claude  | `.claude/skills/deploy/reference.md` |
| Copilot | `.github/skills/deploy/reference.md` |
| Cursor  | `.cursor/skills/deploy/reference.md` |
| Codex   | `.agents/skills/deploy/reference.md` |

Template path helpers are target-independent: `<%= instructionTemplatePath('coding-style') %>` always renders to `.universal-ai-config/instructions/coding-style.md` (or the configured `templatesDir`).

## Configuration

### Base config (`universal-ai-config.config.ts`) — committed

```typescript
import { defineConfig } from "universal-ai-config";

export default defineConfig({
  // Where templates live (default: '.universal-ai-config')
  templatesDir: ".universal-ai-config",

  // Additional directories to discover templates from (default: [])
  // Supports absolute paths, relative paths, and ~ for home directory
  additionalTemplateDirs: ["~/.universal-ai-config"],

  // Which targets to generate (default: all four). Prefer letting each developer
  // set their own in the overrides file — see "Shared Outputs" above
  targets: ["claude"],

  // Which types to generate (default: all)
  types: ["instructions", "skills", "agents", "hooks", "mcp"],

  // Custom EJS variables available in templates
  variables: {
    projectName: "my-app",
    useStrictMode: true,
  },

  // Override default output directories
  outputDirs: {
    claude: ".claude",
    copilot: ".github",
    cursor: ".cursor",
    codex: ".codex",
  },

  // Exclude templates by glob pattern (optional)
  exclude: ["agents/internal-only.md"],

  // Output paths `uac clean` must never delete (optional)
  preserveOnClean: [".claude/skills/manual/**"],

  // AGENTS.md output (forced when codex is a target) — see "AGENTS.md" above
  agentsMd: { variation: "nested" },
});
```

### Overrides config (`universal-ai-config.overrides.ts`) — (ideally gitignored)

```typescript
import { defineConfig } from "universal-ai-config";

export default defineConfig({
  // The tool I use on this machine — generate only that
  targets: ["claude"],

  // Extra variables for my local setup
  variables: {
    myPreferredStyle: "functional",
  },
});
```

### Template Exclusion

The `exclude` option accepts glob patterns to skip specific templates during generation. Patterns match against **input** template paths relative to the templates directory (e.g., `instructions/my-rule.md`, `skills/deploy-helper/SKILL.md`, `hooks/debug.json`, `mcp/internal.json`) — not output paths.

For instructions/skills/agents one input file maps to one output, so exclusion is 1:1. For **hooks** and **MCP**, multiple input JSON files merge into a single output file per target: excluding `hooks/debug.json` or `mcp/internal.json` drops every handler/server that file declared. The `exclude` option does not target individual hook handlers or named MCP servers — only the whole input file containing it. For MCP specifically, see [MCP Opt-In Filtering](#mcp-opt-in-filtering) below for server-name-level control.

**Array form** — same exclusions for all targets:

```typescript
export default defineConfig({
  exclude: ["agents/security-checker.md", "hooks/debug.json"],
});
```

**Per-target form** — different exclusions per target:

```typescript
export default defineConfig({
  exclude: {
    claude: ["agents/copilot-reviewer.md"],
    copilot: ["skills/**"],
    cursor: ["hooks/**"],
    codex: ["agents/codex-incompatible.md"],
    default: [],
  },
});
```

Supported glob syntax: `*` (single segment), `**` (recursive), `?` (single char), `{a,b}` (alternatives).

**Source-qualified form** — when several template directories declare the same name, prefix the path with the directory it came from to drop just that copy:

```typescript
export default defineConfig({
  additionalTemplateDirs: ["~/.universal-ai-config"],
  exclude: {
    // Use the shared copy of this instruction for Claude, keep the local one elsewhere
    claude: [".universal-ai-config/instructions/style.md"],
    default: [],
  },
});
```

An unqualified pattern still drops the template from **every** source. Any spelling of the directory works — as written in config, absolute, or `~`-relative — so `~/.universal-ai-config/...` and `/home/you/.universal-ai-config/...` address the same candidate. See [Template Precedence & Shadowing](#template-precedence--shadowing).

### Preserving Files From Clean

`uac clean` and `uac generate --clean` remove every path uac knows how to generate — including every `AGENTS.md` in your project tree (when cleaning codex, or any reader with `agentsMd.enable`), whether or not uac actually wrote it. If you keep a hand-authored, committed file at one of those paths, list it under `preserveOnClean`:

```typescript
export default defineConfig({
  preserveOnClean: ["docs/AGENTS.md"],
});
```

`preserveOnClean` is the mirror image of `exclude`: patterns match **output** paths relative to the project root (`AGENTS.md`, `.claude/skills/manual/**`), whereas `exclude` matches template **input** paths. It accepts the same per-target object form, and paths it spares are listed in the clean output so you can see what was skipped.

Cleaning a directory that contains a preserved file removes the directory's other contents and leaves the directory itself in place:

```typescript
// .claude/skills/manual/ survives; every other generated skill is removed
preserveOnClean: [".claude/skills/manual/**"];
```

### MCP Opt-In Filtering

MCP servers can heavily affect agent performance — every server adds tools, context, and latency. The `exclude` option is file-level; if a single `mcp/*.json` template declares multiple servers, excluding the whole file is all-or-nothing. For finer control, use the `mcp` config block to opt-in by server **name**:

```typescript
export default defineConfig({
  mcp: {
    forceOptIn: true,
    mcpServers: ["github", "playwright"],
  },
});
```

When `forceOptIn` is `true` for a target, only servers whose names appear in `mcpServers` are emitted, no matter how many input files declare them. When `forceOptIn` is `false` or unset (the default), all discovered servers pass through.

Both fields accept the standard per-target shape:

```typescript
export default defineConfig({
  mcp: {
    forceOptIn: { claude: true, codex: true, default: false },
    mcpServers: {
      claude: ["github"],
      copilot: ["github", "playwright"],
      codex: ["github", "playwright"],
      default: [],
    },
  },
});
```

- `mcpServers: []` with `forceOptIn: true` → no servers for that target, MCP output file skipped.
- Unknown names emit a `[uac]` warning at generate time; generation continues with the matched subset.
- Server-level filtering is **additive** with file-level `exclude` — you can use both.

### Additional Template Directories

The `additionalTemplateDirs` option lets you load templates from extra directories alongside the project-local `templatesDir`. This is useful for sharing common templates (e.g., MCP servers, coding standards) across projects from a central location like your home directory.

```typescript
export default defineConfig({
  additionalTemplateDirs: ["~/.universal-ai-config"],
});
```

- Paths can be absolute, relative to the project root, or use `~` for the home directory
- Generated files are always written to the project's output directories
- Name conflicts resolve by precedence — see below

### Template Precedence & Shadowing

Templates are discovered from `templatesDir` first, then from each `additionalTemplateDirs` entry in configured order. When the same name shows up more than once, **the first one in that chain wins**; the rest are _shadowed_. One rule, every type:

| Type                  | Identity                                            | What the loser loses                 |
| --------------------- | --------------------------------------------------- | ------------------------------------ |
| instructions / agents | filename without `.md`                              | the whole file                       |
| skills                | folder name                                         | the whole folder, extra files too    |
| hooks                 | JSON basename, then each identical resolved handler | that file / that handler             |
| mcp                   | JSON basename, then server name, then input `id`    | that file / that server / that input |

Two things shadowing deliberately does **not** do:

- **Skill folders are replaced, never merged.** If the winning `skills/review/` ships no `reference.md`, a shadowed copy's `reference.md` is not pulled in.
- **Hooks/MCP files with different basenames still merge.** Shadowing only resolves same-named files — splitting servers across `mcp/github.json` and `mcp/local.json` works as before. The sub-file identities (handler, server name, input `id`) are what make that merge first-wins too.

A skill folder without a `SKILL.md` never claims its name, so a lower-precedence directory with a real skill still wins it. Within a single directory — two `mcp/*.json` files declaring the same server name, say — files are read in alphabetical order, so the winner never depends on the filesystem.

**Using a lower-precedence copy.** Exclude the winner by its [source-qualified path](#template-exclusion) and the next candidate takes over. Because `exclude` is per-target, so is the outcome — one target can use the shared copy while another keeps the local one:

```typescript
export default defineConfig({
  additionalTemplateDirs: ["~/.universal-ai-config"],
  exclude: {
    claude: [".universal-ai-config/skills/review/SKILL.md"],
    default: [],
  },
});
```

**Seeing what lost.** `uac generate` reports shadowing in one line, and `--verbose` lists it:

```
✔ claude — 4 instructions, 15 skills, 1 hook (1 input)
ℹ 2 shadowed by higher-precedence sources (--verbose to list)
✔ Generated 21 file(s)
```

```
$ uac generate --verbose
ℹ 2 shadowed by higher-precedence sources:
  ↳ instructions/dup.md: ~/.universal-ai-config shadowed by .universal-ai-config
  ↳ mcp server "github": ~/.universal-ai-config/mcp/shared.json shadowed by .universal-ai-config/mcp/main.json
```

A collision that applies to only some targets is tagged with them (`[claude, cursor]`); one that applies to every target is listed once. Candidates you excluded yourself are not listed — only precedence losers are.

### Merge Behavior

- **Arrays** (`targets`, `types`, `exclude`, `additionalTemplateDirs`): overrides **replace** entirely
- **Objects** (`variables`, `outputDirs`): **deep-merged**; `mcp` and `agentsMd` merge field by field
- **Scalars** (`templatesDir`): overrides **replace**

To **concatenate** array fields (like `exclude`) instead of replacing, use the `mergeField` helper:

```ts
// universal-ai-config.overrides.ts
import { defineConfig, mergeField } from "universal-ai-config";
import base from "./universal-ai-config.config";

export default defineConfig({
  exclude: mergeField(base.exclude, ["additional-pattern/**"]),
});
```

`mergeField` handles all type combinations — plain arrays, per-target objects, and mixed. When mixing types, plain arrays are treated as the `default` value, and target-specific keys fall back to `default` when absent.

### Resolution Order (later wins)

1. Built-in defaults
2. `universal-ai-config.config.{ts,js,mjs,cjs,json}` (base)
3. `universal-ai-config.overrides.{ts,js,mjs,cjs,json}` (personal; the `universal-ai-config.overrides.config.*` spelling also works)
4. CLI flags (`--target`, `--type`, etc.) — `-t` replaces the target set for that run

## CLI Reference

When run without `--root`, every command except `uac init` searches **upward** from the current directory for the project root — the nearest ancestor that contains a `universal-ai-config.config.*` file or a `.universal-ai-config/` folder — so you can run uac from inside a package subdirectory of a monorepo and it still finds the root (printing an info line when it does). Passing `--root` disables the search. `uac init` always scaffolds into the current directory.

### `uac generate`

Generate config files for specified targets.

| Flag        | Short | Description                                           | Default         |
| ----------- | ----- | ----------------------------------------------------- | --------------- |
| `--target`  | `-t`  | Comma-separated targets (replaces the configured set) | All from config |
| `--type`    |       | Comma-separated types                                 | All from config |
| `--config`  | `-c`  | Config file path                                      | Auto-detected   |
| `--root`    | `-r`  | Project root                                          | Nearest root ↑  |
| `--dry-run` | `-d`  | Preview without writing                               | `false`         |
| `--clean`   |       | Remove existing files first                           | `false`         |
| `--verbose` | `-v`  | Per-file output instead of the summary                | `false`         |

uac decides which outputs to generate from this run's target set only: `-t copilot` generates Copilot's own hooks and `.mcp.json` even if your config also lists claude. Combining `--clean` with `--dry-run` previews the removals instead of performing them. Run `--clean` after switching targets or `agentsMd.variation`, so the old layout is removed. `--clean` is scoped by `--type`, and by `--target` when given; with no `--target` it removes artifacts for **every** target, not just the ones in your config — that's what clears stale output for a target you've since dropped from `targets`. Use [`preserveOnClean`](#preserving-files-from-clean) to protect hand-authored files.

### `uac init`

Scaffold `.universal-ai-config/` directory with meta-instruction templates and a `universal-ai-config.config.ts` config file. Seeds instruction and skill templates that teach AI tools how to manage universal-ai-config templates. Adds `universal-ai-config.overrides.*` to `.gitignore`.

| Flag     | Short | Description  | Default |
| -------- | ----- | ------------ | ------- |
| `--root` | `-r`  | Project root | cwd     |

### `uac clean`

Remove all generated config directories.

| Flag        | Short | Description                      | Default        |
| ----------- | ----- | -------------------------------- | -------------- |
| `--target`  | `-t`  | Comma-separated targets to clean | All registered |
| `--type`    |       | Comma-separated types to clean   | All            |
| `--config`  | `-c`  | Config file path                 | Auto-detected  |
| `--root`    | `-r`  | Project root                     | Nearest root ↑ |
| `--dry-run` | `-d`  | Print removals without deleting  | `false`        |

With no `--target`, clean removes artifacts for **every registered target** rather than only those in your config's `targets` — so dropping `codex` from `targets` still lets a later `uac clean` remove its stale `AGENTS.md` files and `.agents/skills/`. `--target` names the set being cleaned: everything those targets would generate goes, shared files included (`clean -t copilot` removes `.mcp.json`; the next generate restores it). Files shared with your own settings lose only uac's key (`hooks` in `.claude/settings.json`, `mcp_servers` in `.codex/config.toml`), and `.github/hooks/` keeps your hook scripts — only `hooks.json` is uac's. Use [`preserveOnClean`](#preserving-files-from-clean) to protect hand-authored files at uac-managed paths.

Config is loaded so that `outputDirs`, `preserveOnClean`, `templatesDir` and `agentsMd` are honored.

### `uac seed`

Seed the templates directory with pre-built template sets. Available seed types:

- **`meta-instructions`** — Instruction and skill templates that teach AI tools how to create, update, and manage universal-ai-config templates. This bootstraps the AI's ability to extend its own configuration. Also seeded automatically by `uac init`.
- **`examples`** — Example templates (instruction, skill, agent, hook) demonstrating template structure and frontmatter fields. Good for learning the format.
- **`gitignore`** — Updates `.gitignore` with patterns for all generated output files (target config dirs, MCP files, every `AGENTS.md`, the configured `agentsMd.indexDir`). Only `.github/hooks/hooks.json` is ignored, so hook scripts next to it can be committed. Also run automatically by `uac init`.

```bash
# Seed meta-instructions (also done by uac init)
uac seed meta-instructions

# Seed example templates
uac seed examples

# Update .gitignore with output patterns
uac seed gitignore

# Seed with custom project root
uac seed meta-instructions --root ./my-project
```

| Flag     | Short | Description  | Default        |
| -------- | ----- | ------------ | -------------- |
| `--root` | `-r`  | Project root | Nearest root ↑ |

The `meta-instructions` seed creates 20 files in the templates directory:

| File                                        | Purpose                                                                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `instructions/uac-usage.md`                 | Short uac CLI and config cheat sheet (always applied)                                                              |
| `instructions/uac-template-guide.md`        | Template authoring guide (applied to the templates directory)                                                      |
| `docs/uac/*.md`                             | Full reference, read on demand (8 files, listed under [Complete Template Reference](#complete-template-reference)) |
| `skills/update-ai-config/SKILL.md`          | Main entry point for creating or updating any template                                                             |
| `skills/import-existing-ai-config/SKILL.md` | Import existing target-specific configs as universal templates                                                     |
| `skills/ai-config-compress/SKILL.md`        | Compress LLM instructions to reduce token count                                                                    |

`update-ai-config` is the primary skill users should invoke — it analyzes intent and auto-delegates to internal type-specific skills (`update-instruction`, `update-skill`, `update-agent`, `update-hook`, `update-mcp`).

Existing files are overwritten to ensure templates stay up to date.

### `uac skill add`

Download skill(s) from a GitHub repo (or a local path) into `.universal-ai-config/skills/<name>/` as new skill templates, then run `uac generate` to produce the per-target outputs. Skills are always **copied** into the current project — no global installs or symlinks. Re-adding an existing skill **overrides** it (stale files are removed).

The positional `source` accepts GitHub shorthand (`owner/repo`, `owner/repo/subpath`, `owner/repo@skill`), a `github:` prefix, github.com URLs (including `/tree/<ref>/<subpath>`), a `#ref` / `#ref@skill` fragment, or a local filesystem path. With no skill selection flag and multiple skills found, an interactive wizard lets you pick which to install.

```bash
# List available skills without installing
uac skill add vercel-labs/agent-skills --list

# Pick interactively, or install specific skills non-interactively
uac skill add vercel-labs/agent-skills
uac skill add vercel-labs/agent-skills -s vercel-optimize -y

# Install a single named skill, or every skill from a local repo
uac skill add owner/repo@my-skill
uac skill add ./local/skills-repo --all
```

| Flag      | Short | Description                               | Default        |
| --------- | ----- | ----------------------------------------- | -------------- |
| `--skill` | `-s`  | Comma-separated skill names to install    | Prompt         |
| `--all`   |       | Install every discovered skill            | `false`        |
| `--list`  | `-l`  | List discovered skills without installing | `false`        |
| `--yes`   | `-y`  | Skip confirmation prompts                 | `false`        |
| `--ref`   |       | Branch, tag, or commit to fetch           | Default        |
| `--root`  | `-r`  | Project root                              | Nearest root ↑ |

## Output Paths

### Claude (`.claude/`)

| Type         | Output Path                                       |
| ------------ | ------------------------------------------------- |
| Instructions | `.claude/rules/<name>.md`                         |
| Skills       | `.claude/skills/<name>/SKILL.md`                  |
| Agents       | `.claude/agents/<name>.md`                        |
| Hooks        | `.claude/settings.json` (merged into `hooks` key) |
| MCP          | `.mcp.json`                                       |

### Copilot (`.github/`)

| Type                         | Output Path                                   |
| ---------------------------- | --------------------------------------------- |
| Instructions                 | `.github/instructions/<name>.instructions.md` |
| Instructions (`alwaysApply`) | `.github/copilot-instructions.md`             |
| Skills                       | `.github/skills/<name>/SKILL.md`              |
| Agents                       | `.github/agents/<name>.agent.md`              |
| Hooks                        | `.github/hooks/hooks.json`                    |
| MCP                          | `.mcp.json` (root, portable `mcpServers`)     |

### Cursor (`.cursor/`)

| Type         | Output Path                      |
| ------------ | -------------------------------- |
| Instructions | `.cursor/rules/<name>.mdc`       |
| Skills       | `.cursor/skills/<name>/SKILL.md` |
| Agents       | `.cursor/agents/<name>.md`       |
| Hooks        | `.cursor/hooks.json`             |
| MCP          | `.cursor/mcp.json`               |

### AGENTS.md (codex, or any reader with `agentsMd.enable`)

| Variation     | Output Paths                                                               |
| ------------- | -------------------------------------------------------------------------- |
| `nested`      | `AGENTS.md` + `<dir>/AGENTS.md` per folder-scoped instruction              |
| `concatenate` | `AGENTS.md`                                                                |
| `index`       | `AGENTS.md` + `<indexDir>/<name>.md` (default `.agents/uac-instructions/`) |

While these are generated, Claude, Cursor and Copilot write no instruction files of their own. uac 3 never writes `AGENTS.override.md` or `.vscode/mcp.json`.

### Codex (`.codex/` + `.agents/` + `AGENTS.md`)

| Type         | Output Path                                                           | Notes                                                                                  |
| ------------ | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Instructions | `AGENTS.md` files (see above)                                         | Codex reads nothing else; nested files load only when Codex is launched in that folder |
| Skills       | `.agents/skills/<name>/SKILL.md` (+ `agents/openai.yaml` when needed) | The open Agent Skills location. The sidecar carries `codex.*` metadata                 |
| Agents       | `.codex/agents/<name>.toml`                                           | Standalone role files (body becomes `developer_instructions`)                          |
| Hooks        | `.codex/hooks.json`                                                   | Handler order is kept stable: Codex trusts each hook by its position                   |
| MCP          | `.codex/config.toml`                                                  | Only the `mcp_servers` table is uac's; your other keys are kept                        |

- **`.codex/config.toml` is shared with user content.** uac only writes `[mcp_servers.*]`; anything else you put there survives regeneration, and `uac clean --target codex` only removes the `mcp_servers` key. Profiles now live in separate profile files, not `[profiles.*]` tables.
- **Effort:** `effort` maps to `model_reasoning_effort` (`low` … `xhigh`, `max`, `ultra`). **`disableAutoInvocation`** maps to `agents/openai.yaml` `policy.allow_implicit_invocation`.
- **Per-target overrides** are usually needed for `model` (Claude and Codex IDs differ).

See the [Codex reference](src/seed-types/meta-instructions/templates/docs/uac/codex.md) for every caveat.

## Complete Template Reference

The [UAC Template Guide](src/seed-types/meta-instructions/templates/instructions/uac-template-guide.md) covers template authoring: types, EJS and path helpers, per-target overrides, and a summary of each topic. The full per-target reference is split into on-demand docs:

| Doc                                                                                    | Covers                                                                               |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [`cli.md`](src/seed-types/meta-instructions/templates/docs/uac/cli.md)                 | Every command and flag, root resolution, clean behavior, `skill add` sources         |
| [`config.md`](src/seed-types/meta-instructions/templates/docs/uac/config.md)           | Config options, `agentsMd`, shared outputs, exclusion, precedence, `preserveOnClean` |
| [`frontmatter.md`](src/seed-types/meta-instructions/templates/docs/uac/frontmatter.md) | Every skill and agent field with per-target support, Codex skill metadata            |
| [`hooks.md`](src/seed-types/meta-instructions/templates/docs/uac/hooks.md)             | Handler fields, universal → per-target event mapping, matcher patterns               |
| [`mcp.md`](src/seed-types/meta-instructions/templates/docs/uac/mcp.md)                 | Server fields per target, output paths, opt-in filtering                             |
| [`tools.md`](src/seed-types/meta-instructions/templates/docs/uac/tools.md)             | Tool names per platform and common combinations                                      |
| [`models.md`](src/seed-types/meta-instructions/templates/docs/uac/models.md)           | Model identifiers per target                                                         |
| [`codex.md`](src/seed-types/meta-instructions/templates/docs/uac/codex.md)             | Codex output locations, caveats, values uac can't translate                          |

`uac seed meta-instructions` (run by `uac init`) seeds all of this into your project. The guide becomes a rule scoped to your templates directory, and the docs land in `.universal-ai-config/docs/uac/`, where your AI tools read them only when a link points there.

## Programmatic API

```typescript
import {
  generateProject,
  writeGeneratedFiles,
  cleanTargetFiles,
  loadProjectConfig,
} from "universal-ai-config";

// Generate files (nothing is written yet)
const { files, diagnostics, plan } = await generateProject({
  root: process.cwd(),
  targets: ["claude"],
  // Inline config overrides — no config file needed
  overrides: {
    variables: { projectName: "my-app" },
    exclude: ["agents/**"],
    outputDirs: { claude: ".custom-claude" },
  },
  onDiagnostic: (d) => console.warn(`[${d.target ?? "uac"}] ${d.code}: ${d.message}`),
});

// Write generated files to disk
const report = await writeGeneratedFiles(files, process.cwd());
console.log(`${report.written.length} written, ${report.unchanged.length} unchanged`);

// Clean generated files before regenerating
const config = await loadProjectConfig({ root: process.cwd() });
await cleanTargetFiles(process.cwd(), ["claude"], undefined, {
  outputDirs: config.outputDirs,
  preserveOnClean: config.preserveOnClean,
  templatesDir: config.templatesDir,
  agentsMd: config.agentsMd,
});
```

### `generateProject(options?)` / `generate(options?)`

`generateProject()` returns `{ files, diagnostics, plan }`; `generate()` is the same, returning only `files`. Neither touches disk.

| Option         | Type                               | Description                                                         |
| -------------- | ---------------------------------- | ------------------------------------------------------------------- |
| `root`         | `string`                           | Project root (default: `cwd`)                                       |
| `targets`      | `Target[]`                         | The run's target set — replaces the configured one                  |
| `types`        | `TemplateType[]`                   | Override types (highest priority)                                   |
| `config`       | `string`                           | Config file path                                                    |
| `overrides`    | `UserConfig`                       | Inline config overrides (any config field)                          |
| `templates`    | `InMemoryTemplate[]`               | Templates supplied in memory, ranked below file-discovered ones     |
| `onDiagnostic` | `(diagnostic: Diagnostic) => void` | Every warning and info of the run; without it, warnings are printed |
| `onShadowed`   | `(event: ShadowEvent) => void`     | **Deprecated** — use `onDiagnostic` and `code: "shadowed"`          |

Priority order: defaults → config file → overrides file → **inline overrides** → `targets`/`types`.

- **`files`** — `GeneratedFile[]`. `content` is a `string`, or a `Uint8Array` for a skill's non-markdown extra files (copied byte for byte); `mode` carries exec bits; `consumers` lists every target that reads the file (e.g. all `AGENTS.md` readers), with `target` the one it was rendered for.
- **`diagnostics`** — each has a `code`, `severity` (`warn`/`info`), `message`, optional `target`/`type`/`path`/`source`, and a typed `detail`. Codes: `served-by` (a target skipped its own output for a shared one), `shared-divergence`, `duplicate-hook-run`, `agents-md-forced`, `claude-md-present`, `agents-md-size`, `agents-md-glob`, `unsupported`, `legacy-field`, `skill-spec`, `mcp-unknown-server`, `missing-doc`, `suspicious-value`, `shadowed`.
- **`plan`** — the run's targets, the AGENTS.md layout and readers, and which target serves which (`servedBy`).

### `writeGeneratedFiles(files, root)`

Writes `GeneratedFile[]` to disk: bytes as-is, `mode` applied, and only `mergeKey` for files shared with user settings (Claude hooks in `settings.json`, Codex MCP in `config.toml`). Files whose content is already identical aren't rewritten. Returns `{ written, unchanged }`.

### `cleanTargetFiles(root, targets?, types?, options?)`

Removes everything the given targets generate (all registered targets if omitted; shared files included), for the given types (all if omitted). Returns the root-relative paths removed.

| Option                   | Type                              | Description                                                                |
| ------------------------ | --------------------------------- | -------------------------------------------------------------------------- |
| `dryRun`                 | `boolean`                         | Return what would be removed without touching disk                         |
| `outputDirs`             | `Partial<Record<Target, string>>` | Per-target output dirs; falls back to each target's default                |
| `preserveOnClean`        | `PerTargetValue<string[]>`        | Root-relative globs that must never be deleted                             |
| `templatesDir`           | `string`                          | Its input folders are never scanned for `AGENTS.md` files                  |
| `additionalTemplateDirs` | `string[]`                        | Skipped by the `AGENTS.md` scan, like `templatesDir`                       |
| `agentsMd`               | `{ enable?, indexDir? }`          | With `enable`, cleaning any AGENTS.md reader removes the `AGENTS.md` files |
| `onPreserve`             | `(path: string) => void`          | Called per existing path that `preserveOnClean` spared                     |

Unlike the CLI, this function does not load your config file — pass these from `loadProjectConfig()` if you need them honored. It never removes `AGENTS.override.md` files.

### `findAgentsOverrideFiles(root, options?)` / `removeAgentsOverrideFiles(root, paths)`

The API side of the CLI's question about leftover `AGENTS.override.md` files. `findAgentsOverrideFiles` returns them root-relative (none when `agentsMd.keepOverrideFiles` is set; template inputs and `preserveOnClean` paths left out) and takes `templatesDir`, `additionalTemplateDirs`, `preserveOnClean` and `agentsMd`, so a `ResolvedConfig` works as is. `removeAgentsOverrideFiles` deletes the paths you pass and returns those it removed. `generateProject()` reports the same files as an `agents-override-present` diagnostic.

### `loadProjectConfig(options?)`

Loads and resolves the full config chain. Accepts `inlineOverrides` for programmatic config.

## Adding a New Target

Create `src/targets/<name>/index.ts` implementing `TargetDefinition`. Paths are root-relative and POSIX; anything in the target's folder uses `ctx.outputDir`, so `outputDirs` works:

```typescript
import { defineTarget } from "../define-target.js";
import { normalizeGlobs } from "../../core/normalize-globs.js";

export default defineTarget({
  name: "zed",
  outputDir: ".zed",
  supportedTypes: ["instructions", "skills"],
  // Facts about what the tool also reads — uac's planner decides what to generate
  reads: {
    instructions: [{ from: "agentsMd", reconcile: "loads-both", loses: "glob scoping" }],
  },
  instructions: {
    frontmatterMap: {
      description: "description",
      globs: (value) => ({ paths: normalizeGlobs(value) }),
    },
    outputPath: (name, _fm, { outputDir }) => `${outputDir}/rules/${name}.md`,
    typeDir: ({ outputDir }) => `${outputDir}/rules`,
    ownedPaths: ({ outputDir }) => [`${outputDir}/rules`], // what `uac clean` removes
  },
  skills: {
    frontmatterMap: { name: "name", description: "description" },
    outputPath: (name, _fm, { outputDir }) => `${outputDir}/skills/${name}/SKILL.md`,
    typeDir: ({ outputDir }) => `${outputDir}/skills`,
    ownedPaths: ({ outputDir }) => [`${outputDir}/skills`],
  },
});
```

- **Type configs** can add `render` (one template → several files, or a non-markdown format), `combine` (several templates rendering to one path), and `frontmatterStyle: "line-safe"` for files a line-based parser reads.
- **`instructions: "agentsMd"`** marks a tool that reads only `AGENTS.md` (like Codex).
- **`reads`** declares, per type, the other outputs the tool reads and how it reconciles them: `loads-both`, `same-file`, `dedupes-identical` or `prefers-own`. With `loads-both` or `same-file`, the target skips its own output whenever the other one is generated in the same run.
- **Hooks** configs declare `events` (universal → native names), the `handlerTypes` the tool runs, `transform` and `outputPath(ctx)`; **MCP** configs `transform` and `outputPath(ctx)`, with an optional `mergeKey`/`format`.

Then register it in [src/targets/index.ts](src/targets/index.ts) and add the name to the `Target` union and the per-target key lists (config schema, override resolution, `mergeField`). Clean derives what to remove from `ownedPaths` and the hooks/MCP paths.

## License

MIT
