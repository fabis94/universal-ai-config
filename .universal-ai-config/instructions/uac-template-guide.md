---
description: Guide for creating and managing universal-ai-config templates
globs: [".universal-ai-config/**"]
---

# Universal AI Config Template Guide

This project uses **universal-ai-config** to manage AI tool configurations from a single set of templates.
Templates live in `.universal-ai-config/` and are rendered into target-specific config files (Claude, Copilot, Cursor) via `uac generate`.

## Template Types

Choose the right type based on what you need:

### Instructions (`.universal-ai-config/instructions/*.md`)

Persistent context and rules that apply to AI conversations. Scoped by glob patterns or always-on.

**Use for:** coding conventions, project guidelines, style rules, architectural decisions, domain knowledge.

### Skills (`.universal-ai-config/skills/*/SKILL.md`)

Reusable actions or workflows invocable as slash commands (e.g. `/skill-name`) or auto-triggered by the AI.

**Use for:** repeatable tasks like code generation patterns, deployments, reviews, migrations, project-specific workflows.

### Agents (`.universal-ai-config/agents/*.md`)

Specialized AI personas with scoped tools and permissions that run in isolated contexts.

**Use for:** dedicated reviewers, debuggers, data analysts — any task needing restricted capabilities or a focused system prompt.

**Note:** Agents are supported by Claude and Copilot only (not Cursor).

### Hooks (`.universal-ai-config/hooks/*.json`)

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

Template bodies support EJS for conditional content:

- `<%= target %>` — current target ("claude", "copilot", "cursor")
- `<%= type %>` — template type ("instructions", "skills", "agents", "hooks")
- `<%= config.templatesDir %>` — templates directory path
- Custom variables from config are also available

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

| Field                   | Description                                        |
| ----------------------- | -------------------------------------------------- |
| `name`                  | Skill identifier (becomes the slash command name)  |
| `description`           | When to use this skill                             |
| `disableAutoInvocation` | If true, only invocable manually via slash command |
| `userInvocable`         | If false, only the AI can trigger it               |
| `allowedTools`          | Restrict which tools the skill can use             |
| `model`                 | Override the AI model used                         |
| `subagentType`          | Run in a specific subagent type                    |
| `forkContext`           | If true, run in an isolated context                |
| `argumentHint`          | Hint for expected arguments                        |

### Agents

| Field             | Description                                    |
| ----------------- | ---------------------------------------------- |
| `name`            | Agent identifier                               |
| `description`     | When to delegate to this agent                 |
| `tools`           | Tools this agent can use                       |
| `disallowedTools` | Tools to deny                                  |
| `permissionMode`  | Permission level                               |
| `skills`          | Skills to preload                              |
| `memory`          | Persistent memory scope (user, project, local) |
| `model`           | AI model to use                                |

### Hooks

Hooks use JSON format with this structure:

```json
{
  "hooks": {
    "eventName": [{ "command": "script.sh", "matcher": "ToolName", "timeout": 5000 }]
  }
}
```

Events: `sessionStart`, `userPromptSubmit`, `preToolUse`, `postToolUse`, `stop`
