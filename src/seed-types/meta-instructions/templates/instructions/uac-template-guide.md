---
description: Guide for creating and managing universal-ai-config templates
globs: ["<%= templatesDir %>/**"]
---

# Universal AI Config Template Guide

This project uses **universal-ai-config** to manage AI tool configurations from a single set of templates.
Templates live in `<%%= config.templatesDir %>/` and are rendered into target-specific config files (Claude, Copilot, Cursor) via `uac generate`. Additional template directories can be configured via `additionalTemplateDirs` in the config to share templates across projects (e.g., from `~/.universal-ai-config`). The main `templatesDir` always takes priority on name conflicts.

## Template Types

Choose the right type based on what you need:

### Instructions (`<%%= instructionTemplatePath() %>/*.md`)

Persistent context and rules that apply to AI conversations. Scoped by glob patterns or always-on.

**Use for:** coding conventions, project guidelines, style rules, architectural decisions, domain knowledge.

### Skills (`<%%= skillTemplatePath() %>/*/SKILL.md`)

Reusable actions or workflows invocable as slash commands (e.g. `/skill-name`) or auto-triggered by the AI.

**Use for:** repeatable tasks like code generation patterns, deployments, reviews, migrations, project-specific workflows.

### Agents (`<%%= agentTemplatePath() %>/*.md`)

Specialized AI personas with scoped tools and permissions that run in isolated contexts.

**Use for:** dedicated reviewers, debuggers, data analysts — any task needing restricted capabilities or a focused system prompt.

**Note:** Agents are supported by Claude and Copilot only (not Cursor).

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

## Important: Avoid Backticks with Exclamation Marks in Skill Templates

Claude Code has a known bug where skill file (SKILL.md) content is incorrectly passed through a Bash permission checker. When backticks and exclamation marks appear together, they get misinterpreted as shell operators — backticks as command substitution and `!` as bash history expansion.

**When writing skill templates**, avoid combining backticks with exclamation marks in the markdown body. Backticks on their own are fine, but exclamation marks inside or adjacent to backtick-wrapped text will trigger false permission errors. If you need to use an exclamation mark near code references, use double quotes or **bold** instead of backticks for that reference.

This limitation only affects **skill templates** — instructions, agents, and hooks are not impacted.

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

- `<%%= target %>` — current target ("claude", "copilot", "cursor")
- `<%%= type %>` — template type ("instructions", "skills", "agents", "hooks")
- `<%%= config.templatesDir %>` — templates directory path
- Custom variables from config are also available

**Output path helpers** — resolve to the target-specific output path. Omit the name to get the directory:

- `<%%= instructionPath('name') %>` — output path for an instruction
- `<%%= skillPath('name') %>` — output path for a skill
- `<%%= agentPath('name') %>` — output path for an agent
- `<%%= instructionPath() %>` — output directory for instructions (e.g. `.claude/rules`)

**Template path helpers** — resolve to the source template path. Omit the name to get the directory:

- `<%%= instructionTemplatePath('name') %>` — template path for an instruction
- `<%%= skillTemplatePath('name') %>` — template path for a skill
- `<%%= agentTemplatePath('name') %>` — template path for an agent
- `<%%= hookTemplatePath('name') %>` — template path for a hook
- `<%%= mcpTemplatePath('name') %>` — template path for an MCP config
- `<%%= instructionTemplatePath() %>` — template directory for instructions

For example, `<%%= skillPath('deploy') %>` renders to:

- Claude: `.claude/skills/deploy/SKILL.md`
- Copilot: `.github/skills/deploy/SKILL.md`
- Cursor: `.cursor/skills/deploy/SKILL.md`

And `<%%= instructionPath('coding-style') %>` renders to:

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

| Field                   | Description                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| `name`                  | Skill identifier (becomes the slash command name)                                              |
| `description`           | When to use this skill                                                                         |
| `disableAutoInvocation` | If true, only invocable manually via slash command                                             |
| `userInvocable`         | If false, only the AI can trigger it (Claude only)                                             |
| `allowedTools`          | Restrict which tools the skill can use (Claude only) — see [Available Tools](#available-tools) |
| `model`                 | Override the AI model used (Claude only)                                                       |
| `subagentType`          | Run in a specific subagent type (Claude only)                                                  |
| `forkContext`           | If true, run in an isolated context (Claude only)                                              |
| `argumentHint`          | Hint for expected arguments (Claude only)                                                      |
| `license`               | License info (Copilot/Cursor only)                                                             |
| `compatibility`         | Compatibility info (Copilot/Cursor only)                                                       |
| `metadata`              | Extra metadata object (Copilot/Cursor only)                                                    |
| `hooks`                 | Inline hook definitions for this skill (Claude only)                                           |

### Agents

| Field             | Description                                                           |
| ----------------- | --------------------------------------------------------------------- |
| `name`            | Agent identifier                                                      |
| `description`     | When to delegate to this agent                                        |
| `model`           | AI model to use                                                       |
| `tools`           | Tools this agent can use — see [Available Tools](#available-tools)    |
| `disallowedTools` | Tools to deny (Claude only) — see [Available Tools](#available-tools) |
| `permissionMode`  | Permission level (Claude only)                                        |
| `skills`          | Skills to preload (Claude only)                                       |
| `hooks`           | Inline hook definitions for this agent (Claude only)                  |
| `memory`          | Persistent memory scope (Claude only)                                 |
| `target`          | Target description (Copilot only)                                     |
| `mcpServers`      | MCP server config (Copilot only)                                      |
| `handoffs`        | Handoff targets (Copilot only)                                        |

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

### Variable Interpolation (Hooks & MCP)

JSON templates (hooks and MCP) support `{{variableName}}` interpolation from config variables. Variables are replaced before JSON parsing.

```json
{
  "env": {
    "API_HOST": "{{apiHost}}"
  }
}
```

Variables are defined in `universal-ai-config.config.ts` under the `variables` key. Unmatched `{{placeholders}}` are left as-is.

**Important:** `{{varName}}` is for uac config variables. Use `${ENV_VAR}` for runtime environment variable references that should pass through to generated output unchanged.

### MCP Servers

MCP server configs define external tool servers. They use JSON format with this structure:

```json
{
  "mcpServers": {
    "server-name": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@some/mcp-server"],
      "env": {
        "API_KEY": "${API_KEY}"
      }
    }
  }
}
```

#### Server Fields

| Field     | Required | Description                           |
| --------- | -------- | ------------------------------------- |
| `command` | Yes\*    | Command to launch the server (stdio)  |
| `args`    | No       | Arguments for the command             |
| `type`    | No       | Transport type (`"stdio"` or `"sse"`) |
| `env`     | No       | Environment variables                 |
| `url`     | Yes\*    | Server URL (SSE/HTTP transport)       |
| `headers` | No       | HTTP headers (SSE/HTTP transport)     |

\*A server must have either `command` or `url`. If neither is present after override resolution, the server is dropped for that target.

#### Per-Target Overrides in MCP

Server fields support per-target values (same syntax as hooks):

```json
{
  "command": {
    "default": "npx",
    "cursor": "node"
  },
  "args": {
    "default": ["-y", "@my/server"],
    "cursor": ["./mcp-server.js"]
  }
}
```

#### Copilot Inputs

An optional `inputs` array provides interactive secret prompts for Copilot:

```json
{
  "mcpServers": { ... },
  "inputs": [
    {
      "type": "promptString",
      "id": "github-token",
      "description": "GitHub PAT",
      "password": true
    }
  ]
}
```

The `inputs` array is only included in Copilot output — Claude and Cursor ignore it.

#### MCP Output Paths

| Target  | Output Path        | Wrapper Key  | Notes                         |
| ------- | ------------------ | ------------ | ----------------------------- |
| Claude  | `.mcp.json`        | `mcpServers` | Project root                  |
| Copilot | `.vscode/mcp.json` | `servers`    | Includes `inputs` if provided |
| Cursor  | `.cursor/mcp.json` | `mcpServers` | Omits `type` field            |

Multiple `.json` files in the `mcp/` directory are merged by server name (last-wins for duplicates). `inputs` arrays are concatenated.

## Available Tools

The `tools`, `allowedTools`, and `disallowedTools` frontmatter fields accept arrays of tool name strings. Both built-in tools and MCP server tools can be referenced. Tool names and MCP syntax differ per platform, so use per-target overrides when targeting multiple platforms.

### Claude Code

Claude uses PascalCase tool names.

**Built-in tools:**

| Tool              | Description                           |
| ----------------- | ------------------------------------- |
| `Bash`            | Execute shell commands                |
| `Read`            | Read file contents                    |
| `Edit`            | Exact string replacements in files    |
| `Write`           | Create or overwrite files             |
| `Glob`            | Find files by glob pattern            |
| `Grep`            | Search file contents with regex       |
| `WebFetch`        | Fetch and process web content         |
| `WebSearch`       | Search the web                        |
| `Task`            | Launch specialized sub-agents         |
| `TaskOutput`      | Retrieve output from background tasks |
| `TaskStop`        | Stop a running background task        |
| `TodoWrite`       | Structured task management            |
| `NotebookEdit`    | Edit Jupyter notebook cells           |
| `AskUserQuestion` | Ask the user clarifying questions     |
| `EnterPlanMode`   | Switch to plan mode                   |
| `ExitPlanMode`    | Exit plan mode                        |
| `Skill`           | Execute a slash command skill         |

**MCP tools** use double-underscore syntax: `mcp__servername__toolname`. Use wildcards to allow all tools from a server: `mcp__servername__*`.

**Hook matcher patterns** are regex strings that filter when hooks fire. What the matcher filters depends on the event:

| Event                                                                  | Matches on          | Example values                                     |
| ---------------------------------------------------------------------- | ------------------- | -------------------------------------------------- |
| `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest` | tool name           | `Bash`, `Edit\|Write`, `mcp__.*`                   |
| `SessionStart`                                                         | how session started | `startup`, `resume`, `clear`, `compact`            |
| `SessionEnd`                                                           | why session ended   | `clear`, `logout`, `prompt_input_exit`, `other`    |
| `Notification`                                                         | notification type   | `permission_prompt`, `idle_prompt`, `auth_success` |
| `SubagentStart`, `SubagentStop`                                        | agent type          | `Bash`, `Explore`, `Plan`, or custom agent names   |
| `PreCompact`                                                           | trigger type        | `manual`, `auto`                                   |

`UserPromptSubmit` and `Stop` don't support matchers — they always fire on every occurrence.

### GitHub Copilot

Copilot uses lowercase **tool aliases** that each group multiple underlying tools:

| Alias     | Description           | Includes                             |
| --------- | --------------------- | ------------------------------------ |
| `execute` | Run shell commands    | shell, Bash, powershell              |
| `read`    | Read files            | Read, NotebookRead                   |
| `edit`    | Edit files            | Edit, MultiEdit, Write, NotebookEdit |
| `search`  | Search for files/text | Grep, Glob                           |
| `agent`   | Invoke subagents      | custom-agent, Task                   |
| `web`     | Web search and fetch  | WebSearch, WebFetch                  |
| `todo`    | Task management       | TodoWrite                            |

`"*"` enables all tools (the default when `tools` is omitted). Unrecognized names are silently ignored.

**MCP tools** use slash syntax: `servername/toolname`. Use wildcards to allow all tools from a server: `servername/*`.

### Cursor

Cursor does not support `tools`, `allowedTools`, or `disallowedTools` in its configuration files. Tool restrictions are not configurable for the Cursor target.

For reference, Cursor's internal tool names (usable in hook `matcher` patterns): `read_file`, `edit_file`, `run_terminal_command`, `file_search`, `codebase_search`, `grep_search`, `list_dir`, `delete_file`.

MCP tools are available in Cursor but configured separately via MCP server settings, not through rule/agent frontmatter.

### Per-Target Tool Overrides

Since tool names differ between platforms, use per-target overrides:

```yaml
# Agent with read-only tools
tools:
  claude: ["Read", "Grep", "Glob"]
  copilot: ["read", "search"]
```

```yaml
# Agent with full editing capabilities + MCP tools
tools:
  claude: ["Read", "Edit", "Write", "Grep", "Glob", "Bash", "mcp__github__search_code"]
  copilot: ["read", "edit", "search", "execute", "github/search_code"]
```

```yaml
# Skill restricted to specific tools
allowedTools:
  claude: ["Read", "Grep", "Glob", "WebSearch"]
  copilot: ["read", "search", "web"]
```

### Common Tool Combinations

| Use Case     | Claude                                              | Copilot                                 |
| ------------ | --------------------------------------------------- | --------------------------------------- |
| Read-only    | `["Read", "Grep", "Glob"]`                          | `["read", "search"]`                    |
| Full editor  | `["Read", "Edit", "Write", "Grep", "Glob", "Bash"]` | `["read", "edit", "search", "execute"]` |
| + web access | Add `"WebSearch"`, `"WebFetch"`                     | Add `"web"`                             |
| + sub-agents | Add `"Task"`                                        | Add `"agent"`                           |
| All tools    | List explicitly — no wildcard                       | `["*"]` or omit `tools`                 |
