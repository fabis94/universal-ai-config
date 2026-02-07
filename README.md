# universal-ai-config

Generate tool-specific AI config files from shared templates. Write your AI instructions, skills, agents, and hooks once — generate config for Claude Code, GitHub Copilot, and Cursor automatically.

## Table of Contents

- [Why](#why)
- [Install](#install)
- [Quick Start](#quick-start)
- [Template Structure](#template-structure)
- [Writing Templates](#writing-templates)
  - [Instructions](#instructions)
  - [Skills](#skills)
  - [Agents](#agents)
  - [Hooks](#hooks)
- [Per-Target Overrides](#per-target-overrides)
- [EJS Template Variables](#ejs-template-variables)
- [Configuration](#configuration)
- [CLI Reference](#cli-reference)
  - [`uac generate`](#uac-generate)
  - [`uac init`](#uac-init)
  - [`uac clean`](#uac-clean)
  - [`uac seed`](#uac-seed)
- [Output Paths](#output-paths)
- [Frontmatter Mapping Reference](#frontmatter-mapping-reference)
- [Programmatic API](#programmatic-api)
- [Adding a New Target](#adding-a-new-target)

## Why

AI coding tools each have their own config formats stored in `.claude/`, `.github/`, `.cursor/`. Teams want shared AI config but each developer may use a different tool. This CLI generates target-specific config files from shared templates in `.universal-ai-config/`, so the tool-specific folders can be gitignored and each dev generates only what they need.

## Install & Run

```bash
npm install -D universal-ai-config

npm run uac <command>
```

> **Non-JS projects:** Use `npx uac` to run commands without installing, e.g. `npx uac generate -t claude`.

## Quick Start

```bash
# Scaffold template directory with examples
uac init

# Generate config for all targets
uac generate

# Generate for specific targets
uac generate -t claude,cursor

# Preview without writing files
uac generate --dry-run

# Seed AI-assisted template management skills
uac seed meta-instructions
```

## Template Structure

```
your-project/
├── universal-ai-config.config.ts           # Shared config (committed)
├── universal-ai-config.overrides.config.ts # Personal overrides (gitignored)
└── .universal-ai-config/
    ├── instructions/          # Rules/instructions (markdown + EJS)
    │   ├── react-patterns.md
    │   └── security.md
    ├── skills/                # One folder per skill
    │   └── test-generation/
    │       └── SKILL.md
    ├── agents/                # Agent/subagent definitions
    │   └── code-reviewer.md
    └── hooks/                 # Hook configs (JSON, no templating)
        ├── security.json
        └── quality.json
```

## Writing Templates

Templates are markdown files with YAML frontmatter. The body supports [EJS](https://ejs.co/) for conditional content per target.

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

### Skills

Skills live in subdirectories with a `SKILL.md` file:

```markdown
---
name: test-generation
description: Generate tests for code
disableAutoInvocation: true
userInvocable: /test
---

Generate comprehensive tests using vitest for the given code.
```

#### Frontmatter Fields

| Field                   | Type                | Description                            |
| ----------------------- | ------------------- | -------------------------------------- |
| `name`                  | `string`            | Skill identifier                       |
| `description`           | `string`            | What this skill does                   |
| `disableAutoInvocation` | `boolean`           | Prevent automatic triggering           |
| `userInvocable`         | `boolean \| string` | Slash command trigger (Claude only)    |
| `allowedTools`          | `string[]`          | Tools this skill can use (Claude only) |
| `model`                 | `string`            | Model to use (Claude only)             |
| `subagentType`          | `string`            | Agent type (Claude only)               |
| `forkContext`           | `boolean`           | Fork context (Claude only)             |
| `argumentHint`          | `string`            | Hint for arguments (Claude only)       |
| `license`               | `string`            | License info (Copilot/Cursor)          |
| `compatibility`         | `string`            | Compatibility info (Copilot/Cursor)    |
| `metadata`              | `object`            | Extra metadata (Copilot/Cursor)        |
| `hooks`                 | `object`            | Hook definitions (Claude only)         |

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

| Field             | Type       | Description                       |
| ----------------- | ---------- | --------------------------------- |
| `name`            | `string`   | Agent identifier                  |
| `description`     | `string`   | What this agent does              |
| `model`           | `string`   | Model to use                      |
| `tools`           | `string[]` | Available tools                   |
| `disallowedTools` | `string[]` | Blocked tools (Claude only)       |
| `permissionMode`  | `string`   | Permission mode (Claude only)     |
| `skills`          | `string[]` | Available skills (Claude only)    |
| `hooks`           | `object`   | Hook definitions (Claude only)    |
| `memory`          | `string`   | Memory scope (Claude only)        |
| `target`          | `string`   | Target description (Copilot only) |
| `mcpServers`      | `object`   | MCP server config (Copilot only)  |
| `handoffs`        | `string[]` | Handoff targets (Copilot only)    |

> **Note:** Cursor does not support agents. The CLI will warn and skip agent generation for the `cursor` target.

### Hooks

Hooks are JSON files that define automated scripts running at lifecycle events (pre-tool-use, session start, etc.). Unlike other template types, hooks use pure JSON with no EJS templating. Multiple `.json` files in the `hooks/` directory are deep-merged by event name.

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

| Field         | Type     | Required | Description                             |
| ------------- | -------- | -------- | --------------------------------------- |
| `command`     | `string` | yes      | Shell command or script path            |
| `matcher`     | `string` | no       | Regex pattern to filter when hook fires |
| `timeout`     | `number` | no       | Timeout in seconds                      |
| `description` | `string` | no       | Human-readable description              |

#### Universal Event Names

Use camelCase event names. The CLI maps them to each target's format and silently drops unsupported events.

| Universal            | Claude               | Cursor               | Copilot               |
| -------------------- | -------------------- | -------------------- | --------------------- |
| `sessionStart`       | `SessionStart`       | `sessionStart`       | `sessionStart`        |
| `sessionEnd`         | `SessionEnd`         | `sessionEnd`         | `sessionEnd`          |
| `userPromptSubmit`   | `UserPromptSubmit`   | `beforeSubmitPrompt` | `userPromptSubmitted` |
| `preToolUse`         | `PreToolUse`         | `preToolUse`         | `preToolUse`          |
| `postToolUse`        | `PostToolUse`        | `postToolUse`        | `postToolUse`         |
| `postToolUseFailure` | `PostToolUseFailure` | `postToolUseFailure` | —                     |
| `stop`               | `Stop`               | `stop`               | —                     |
| `subagentStart`      | `SubagentStart`      | `subagentStart`      | —                     |
| `subagentStop`       | `SubagentStop`       | `subagentStop`       | —                     |
| `preCompact`         | `PreCompact`         | `preCompact`         | —                     |
| `permissionRequest`  | `PermissionRequest`  | —                    | —                     |
| `notification`       | `Notification`       | —                    | —                     |
| `errorOccurred`      | —                    | —                    | `errorOccurred`       |

Cursor-specific events (`beforeShellExecution`, `afterFileEdit`, etc.) can be used directly — they pass through to Cursor and are dropped for other targets.

## Per-Target Overrides

Any frontmatter field or hook handler field can accept per-target values instead of a single value. If a field's value is an object where **every key is a target name** (`claude`, `copilot`, `cursor`) or `default`, it's resolved to the matching target's value during generation. If the target isn't listed, the `default` value is used. If neither is present, the field is omitted.

### Frontmatter

```yaml
---
description:
  claude: Use Claude Code conventions
  copilot: Use Copilot conventions
  cursor: Use Cursor conventions
tools:
  default: ["read", "grep", "glob"]
  claude: ["Read", "Grep", "Glob"]
model:
  default: sonnet
  claude: opus
  copilot: gpt-4o
permissionMode:
  claude: acceptEdits
---
```

When generating for Claude: `tools: ["Read", "Grep", "Glob"]`, `model: opus`, `permissionMode: acceptEdits`. For Copilot: `tools: ["read", "grep", "glob"]` (default), `model: gpt-4o`, `permissionMode` omitted. For Cursor: `tools: ["read", "grep", "glob"]` (default), `model: sonnet` (default), `permissionMode` omitted.

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
          "cursor": "Bash"
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

| Variable              | Type                                     | Description                                        |
| --------------------- | ---------------------------------------- | -------------------------------------------------- |
| `target`              | `'claude' \| 'copilot' \| 'cursor'`      | Current output target                              |
| `type`                | `'instructions' \| 'skills' \| 'agents'` | Template type being rendered (hooks don't use EJS) |
| `config`              | `ResolvedConfig`                         | Full resolved config object                        |
| `...config.variables` | `Record<string, unknown>`                | Custom user variables spread into scope            |

### Path Helpers

Templates have access to path helper functions. All `name` parameters are optional — omit to get the directory path.

**Output path helpers** — resolve to the target-specific output path:

| Function                 | Returns                                                       |
| ------------------------ | ------------------------------------------------------------- |
| `instructionPath(name?)` | Target-specific output path (or directory) for an instruction |
| `skillPath(name?)`       | Target-specific output path (or directory) for a skill        |
| `agentPath(name?)`       | Target-specific output path (or directory) for an agent       |

**Template path helpers** — resolve to the source template path in the templates directory:

| Function                         | Returns                                                |
| -------------------------------- | ------------------------------------------------------ |
| `instructionTemplatePath(name?)` | Template source path (or directory) for an instruction |
| `skillTemplatePath(name?)`       | Template source path (or directory) for a skill        |
| `agentTemplatePath(name?)`       | Template source path (or directory) for an agent       |
| `hookTemplatePath(name?)`        | Template source path (or directory) for a hook         |

For example, `<%= instructionPath('coding-style') %>` renders to:

| Target  | Output                                              |
| ------- | --------------------------------------------------- |
| Claude  | `.claude/rules/coding-style.md`                     |
| Copilot | `.github/instructions/coding-style.instructions.md` |
| Cursor  | `.cursor/rules/coding-style.mdc`                    |

And `<%= instructionPath() %>` (no argument) renders to:

| Target  | Output                 |
| ------- | ---------------------- |
| Claude  | `.claude/rules`        |
| Copilot | `.github/instructions` |
| Cursor  | `.cursor/rules`        |

Template path helpers are target-independent: `<%= instructionTemplatePath('coding-style') %>` always renders to `.universal-ai-config/instructions/coding-style.md` (or the configured `templatesDir`).

## Configuration

### Base config (`universal-ai-config.config.ts`) — committed

```typescript
import { defineConfig } from "universal-ai-config";

export default defineConfig({
  // Where templates live (default: '.universal-ai-config')
  templatesDir: ".universal-ai-config",

  // Which targets to generate (default: all three)
  targets: ["claude", "copilot", "cursor"],

  // Which types to generate (default: all)
  types: ["instructions", "skills", "agents", "hooks"],

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
  },
});
```

### Overrides config (`universal-ai-config.overrides.config.ts`) — (ideally gitignored)

```typescript
import { defineConfig } from "universal-ai-config";

export default defineConfig({
  // I only use Claude and Cursor
  targets: ["claude", "cursor"],

  // Extra variables for my local setup
  variables: {
    myPreferredStyle: "functional",
  },
});
```

### Merge Behavior

- **Arrays** (`targets`, `types`): overrides **replace** entirely
- **Objects** (`variables`, `outputDirs`): **deep-merged**
- **Scalars** (`templatesDir`): overrides **replace**

### Resolution Order (later wins)

1. Built-in defaults
2. `universal-ai-config.{ts,js,mjs,cjs}` (base)
3. `universal-ai-config.overrides.{ts,js,mjs,cjs}` (personal)
4. CLI flags (`--target`, `--type`, etc.)

## CLI Reference

### `uac generate`

Generate config files for specified targets.

| Flag        | Short | Description                 | Default         |
| ----------- | ----- | --------------------------- | --------------- |
| `--target`  | `-t`  | Comma-separated targets     | All from config |
| `--type`    |       | Comma-separated types       | All from config |
| `--config`  | `-c`  | Config file path            | Auto-detected   |
| `--root`    | `-r`  | Project root                | cwd             |
| `--dry-run` | `-d`  | Preview without writing     | `false`         |
| `--clean`   |       | Remove existing files first | `false`         |

### `uac init`

Scaffold `.universal-ai-config/` directory with example templates. Creates a `universal-ai-config.config.ts` config file if one doesn't exist. Adds `universal-ai-config.overrides.*` to `.gitignore`.

| Flag     | Short | Description  | Default |
| -------- | ----- | ------------ | ------- |
| `--root` | `-r`  | Project root | cwd     |

### `uac clean`

Remove all generated config directories.

| Flag       | Short | Description                      | Default |
| ---------- | ----- | -------------------------------- | ------- |
| `--target` | `-t`  | Comma-separated targets to clean | All     |
| `--root`   | `-r`  | Project root                     | cwd     |

### `uac seed`

Seed the templates directory with pre-built template sets. Currently available seed types:

- **`meta-instructions`** — Creates instruction and skill templates that teach AI tools how to create, update, and manage universal-ai-config templates. This bootstraps the AI's ability to extend its own configuration.

```bash
# Seed with default templates directory
uac seed meta-instructions

# Seed with custom project root
uac seed meta-instructions --root ./my-project
```

| Flag     | Short | Description  | Default |
| -------- | ----- | ------------ | ------- |
| `--root` | `-r`  | Project root | cwd     |

The `meta-instructions` seed creates 7 files in the templates directory:

| File                                        | Purpose                                                        |
| ------------------------------------------- | -------------------------------------------------------------- |
| `instructions/uac-template-guide.md`        | Decision guide for choosing the right template type            |
| `skills/update-ai-config/SKILL.md`          | Dispatcher — analyzes intent and delegates to the right skill  |
| `skills/update-instruction/SKILL.md`        | Full lifecycle management for instruction templates            |
| `skills/update-skill/SKILL.md`              | Full lifecycle management for skill templates                  |
| `skills/update-agent/SKILL.md`              | Full lifecycle management for agent templates                  |
| `skills/update-hook/SKILL.md`               | Full lifecycle management for hook templates                   |
| `skills/import-existing-ai-config/SKILL.md` | Import existing target-specific configs as universal templates |

Existing files are overwritten to ensure templates stay up to date.

## Output Paths

### Claude (`.claude/`)

| Type         | Output Path                                       |
| ------------ | ------------------------------------------------- |
| Instructions | `.claude/rules/<name>.md`                         |
| Skills       | `.claude/skills/<name>/SKILL.md`                  |
| Agents       | `.claude/agents/<name>.md`                        |
| Hooks        | `.claude/settings.json` (merged into `hooks` key) |

### Copilot (`.github/`)

| Type                         | Output Path                                   |
| ---------------------------- | --------------------------------------------- |
| Instructions                 | `.github/instructions/<name>.instructions.md` |
| Instructions (`alwaysApply`) | `.github/copilot-instructions.md`             |
| Skills                       | `.github/skills/<name>/SKILL.md`              |
| Agents                       | `.github/agents/<name>.agent.md`              |
| Hooks                        | `.github/hooks/hooks.json`                    |

### Cursor (`.cursor/`)

| Type         | Output Path                      |
| ------------ | -------------------------------- |
| Instructions | `.cursor/rules/<name>.mdc`       |
| Skills       | `.cursor/skills/<name>/SKILL.md` |
| Agents       | Not supported                    |
| Hooks        | `.cursor/hooks.json`             |

## Frontmatter Mapping Reference

<details>
<summary>Instructions mapping</summary>

| Universal      | Claude        | Copilot                             | Cursor              |
| -------------- | ------------- | ----------------------------------- | ------------------- |
| `description`  | `description` | `description`                       | `description`       |
| `globs`        | `paths`       | `applyTo` (comma-joined)            | `globs`             |
| `alwaysApply`  | omits `paths` | routes to `copilot-instructions.md` | `alwaysApply: true` |
| `excludeAgent` | —             | `excludeAgent`                      | —                   |

</details>

<details>
<summary>Skills mapping</summary>

| Universal               | Claude                     | Copilot         | Cursor                     |
| ----------------------- | -------------------------- | --------------- | -------------------------- |
| `name`                  | `name`                     | `name`          | `name`                     |
| `description`           | `description`              | `description`   | `description`              |
| `disableAutoInvocation` | `disable-model-invocation` | —               | `disable-model-invocation` |
| `userInvocable`         | `user-invocable`           | —               | —                          |
| `allowedTools`          | `allowed-tools`            | —               | —                          |
| `model`                 | `model`                    | —               | —                          |
| `subagentType`          | `agent`                    | —               | —                          |
| `forkContext`           | `context: fork`            | —               | —                          |
| `argumentHint`          | `argument-hint`            | —               | —                          |
| `license`               | —                          | `license`       | `license`                  |
| `compatibility`         | —                          | `compatibility` | `compatibility`            |
| `metadata`              | —                          | `metadata`      | `metadata`                 |
| `hooks`                 | `hooks`                    | —               | —                          |

</details>

<details>
<summary>Agents mapping</summary>

| Universal         | Claude            | Copilot       |
| ----------------- | ----------------- | ------------- |
| `name`            | `name`            | `name`        |
| `description`     | `description`     | `description` |
| `model`           | `model`           | `model`       |
| `tools`           | `tools`           | `tools`       |
| `disallowedTools` | `disallowedTools` | —             |
| `permissionMode`  | `permissionMode`  | —             |
| `skills`          | `skills`          | —             |
| `hooks`           | `hooks`           | —             |
| `memory`          | `memory`          | —             |
| `target`          | —                 | `target`      |
| `mcpServers`      | —                 | `mcp-servers` |
| `handoffs`        | —                 | `handoffs`    |

</details>

<details>
<summary>Hooks mapping</summary>

| Aspect            | Claude                              | Copilot                    | Cursor                    |
| ----------------- | ----------------------------------- | -------------------------- | ------------------------- |
| Output file       | `.claude/settings.json`             | `.github/hooks/hooks.json` | `.cursor/hooks.json`      |
| Merge behavior    | Merges into `hooks` key             | Standalone file            | Standalone file           |
| Event names       | PascalCase                          | camelCase (some renamed)   | camelCase (some renamed)  |
| `command` field   | `command`                           | `bash`                     | `command`                 |
| `timeout` field   | `timeout`                           | `timeoutSec`               | `timeout`                 |
| `matcher` support | Yes (groups handlers)               | Dropped                    | Yes (flat)                |
| Handler structure | Nested: `{ matcher, hooks: [...] }` | Flat: `{ type, bash }`     | Flat: `{ type, command }` |
| Version wrapper   | None                                | `"1"` (string)             | `1` (number)              |

</details>

## Programmatic API

```typescript
import { generate, defineConfig } from "universal-ai-config";

const files = await generate({
  root: process.cwd(),
  targets: ["claude"],
  dryRun: true,
});

for (const file of files) {
  console.log(file.path); // ".claude/rules/react-patterns.md"
  console.log(file.content); // Rendered file content
  console.log(file.target); // "claude"
  console.log(file.type); // "instructions"
}
```

## Adding a New Target

Create a single file in `src/targets/` implementing `TargetDefinition`:

```typescript
import { defineTarget } from "../define-target.js";

export default defineTarget({
  name: "zed",
  outputDir: ".zed",
  supportedTypes: ["instructions"],
  instructions: {
    frontmatterMap: {
      globs: "path",
    },
    getOutputPath: (name) => `prompts/${name}.md`,
  },
});
```

Then add one line to [src/targets/index.ts](src/targets/index.ts):

```typescript
import zed from "./zed/index.js";
export const targets = { claude, copilot, cursor, zed };
```

## License

MIT
