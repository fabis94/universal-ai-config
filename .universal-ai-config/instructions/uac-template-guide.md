---
description: Guide for creating and managing universal-ai-config templates
globs: [".universal-ai-config/**"]
---

# Universal AI Config Template Guide

This project uses **universal-ai-config** to manage AI tool configurations from a single set of templates.
Templates live in `<%= config.templatesDir %>/` and are rendered into target-specific config files (Claude, Copilot, Cursor) via `uac generate`.

## Template Types

Choose the right type based on what you need:

### Instructions (`<%= instructionTemplatePath() %>/*.md`)

Persistent context and rules that apply to AI conversations. Scoped by glob patterns or always-on.

**Use for:** coding conventions, project guidelines, style rules, architectural decisions, domain knowledge.

### Skills (`<%= skillTemplatePath() %>/*/SKILL.md`)

Reusable actions or workflows invocable as slash commands (e.g. `/skill-name`) or auto-triggered by the AI.

**Use for:** repeatable tasks like code generation patterns, deployments, reviews, migrations, project-specific workflows.

### Agents (`<%= agentTemplatePath() %>/*.md`)

Specialized AI personas with scoped tools and permissions that run in isolated contexts.

**Use for:** dedicated reviewers, debuggers, data analysts — any task needing restricted capabilities or a focused system prompt.

**Note:** Agents are supported by Claude and Copilot only (not Cursor).

### Hooks (`<%= hookTemplatePath() %>/*.json`)

Lifecycle automation that triggers on specific events (e.g. before tool use, after file edit, session start).

**Use for:** validation, formatting, linting, logging, security enforcement, environment setup.

## Decision Guide

Ask yourself:

1. **Is it context/knowledge the AI should always know?** → Instruction (with `alwaysApply: true` or `globs`)
2. **Is it a repeatable task or workflow?** → Skill
3. **Does it need an isolated AI with restricted tools?** → Agent
4. **Should it run automatically on a lifecycle event?** → Hook

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

- `<%= target %>` — current target ("claude", "copilot", "cursor")
- `<%= type %>` — template type ("instructions", "skills", "agents", "hooks")
- `<%= config.templatesDir %>` — templates directory path
- Custom variables from config are also available

**Output path helpers** — resolve to the target-specific output path. Omit the name to get the directory:

- `<%= instructionPath('name') %>` — output path for an instruction
- `<%= skillPath('name') %>` — output path for a skill
- `<%= agentPath('name') %>` — output path for an agent
- `<%= instructionPath() %>` — output directory for instructions (e.g. `.claude/rules`)

**Template path helpers** — resolve to the source template path. Omit the name to get the directory:

- `<%= instructionTemplatePath('name') %>` — template path for an instruction
- `<%= skillTemplatePath('name') %>` — template path for a skill
- `<%= agentTemplatePath('name') %>` — template path for an agent
- `<%= hookTemplatePath('name') %>` — template path for a hook
- `<%= instructionTemplatePath() %>` — template directory for instructions

For example, `<%= skillPath('deploy') %>` renders to:

- Claude: `.claude/skills/deploy/SKILL.md`
- Copilot: `.github/skills/deploy/SKILL.md`
- Cursor: `.cursor/skills/deploy/SKILL.md`

And `<%= instructionPath('coding-style') %>` renders to:

- Claude: `.claude/rules/coding-style.md`
- Copilot: `.github/instructions/coding-style.instructions.md`
- Cursor: `.cursor/rules/coding-style.mdc`

**Always use path helpers when referencing other templates** — never hardcode target-specific paths.

### Per-Target Overrides

Any frontmatter field can have per-target values:

```yaml
model:
  claude: claude-sonnet-4-5-20250929
  copilot: gpt-4o
  cursor: claude-3-5-sonnet
  default: gpt-4o
```

## Available Frontmatter Fields

### Instructions

| Field          | Description                                                  |
| -------------- | ------------------------------------------------------------ |
| `description`  | What the instruction covers                                  |
| `globs`        | File patterns to scope this instruction to (string or array) |
| `alwaysApply`  | If true, applies to all conversations regardless of files    |
| `excludeAgent` | Copilot-specific: exclude from specific agents               |

### Skills

| Field                   | Description                                          |
| ----------------------- | ---------------------------------------------------- |
| `name`                  | Skill identifier (becomes the slash command name)    |
| `description`           | When to use this skill                               |
| `disableAutoInvocation` | If true, only invocable manually via slash command   |
| `userInvocable`         | If false, only the AI can trigger it (Claude only)   |
| `allowedTools`          | Restrict which tools the skill can use (Claude only) |
| `model`                 | Override the AI model used (Claude only)             |
| `subagentType`          | Run in a specific subagent type (Claude only)        |
| `forkContext`           | If true, run in an isolated context (Claude only)    |
| `argumentHint`          | Hint for expected arguments (Claude only)            |
| `license`               | License info (Copilot/Cursor only)                   |
| `compatibility`         | Compatibility info (Copilot/Cursor only)             |
| `metadata`              | Extra metadata object (Copilot/Cursor only)          |
| `hooks`                 | Inline hook definitions for this skill (Claude only) |

### Agents

| Field             | Description                                          |
| ----------------- | ---------------------------------------------------- |
| `name`            | Agent identifier                                     |
| `description`     | When to delegate to this agent                       |
| `model`           | AI model to use                                      |
| `tools`           | Tools this agent can use                             |
| `disallowedTools` | Tools to deny (Claude only)                          |
| `permissionMode`  | Permission level (Claude only)                       |
| `skills`          | Skills to preload (Claude only)                      |
| `hooks`           | Inline hook definitions for this agent (Claude only) |
| `memory`          | Persistent memory scope (Claude only)                |
| `target`          | Target description (Copilot only)                    |
| `mcpServers`      | MCP server config (Copilot only)                     |
| `handoffs`        | Handoff targets (Copilot only)                       |

### Hooks

Hooks use JSON format with this structure:

```json
{
  "hooks": {
    "eventName": [{ "command": "script.sh", "matcher": "ToolName", "timeout": 30 }]
  }
}
```

#### Handler Fields

| Field         | Required | Description                             |
| ------------- | -------- | --------------------------------------- |
| `command`     | Yes      | Shell command or script path            |
| `matcher`     | No       | Regex pattern to filter when hook fires |
| `timeout`     | No       | Timeout in seconds                      |
| `description` | No       | Human-readable description              |

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

#### Per-Target Overrides in Hooks

Hook handler fields (`command`, `matcher`, `timeout`, `description`) support per-target values:

```json
{
  "command": {
    "claude": ".hooks/claude-check.sh",
    "copilot": ".hooks/copilot-check.sh",
    "default": ".hooks/check.sh"
  }
}
```

If `command` resolves to `undefined` for a target, the entire handler is skipped for that target.
