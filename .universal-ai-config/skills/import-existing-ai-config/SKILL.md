---
name: import-existing-ai-config
description: Import existing AI tool configurations (from Claude, Copilot, or Cursor) into universal-ai-config templates. Converts target-specific files into universal templates.
argumentHint: "[target: claude|copilot|cursor]"
---

# Import Existing AI Config

Convert existing target-specific AI configuration files into universal-ai-config templates. The user must specify which target to import from.

## Usage

The user should specify the source target: `claude`, `copilot`, or `cursor`.

## Import Process

### 1. Identify Source Files

Scan the target's config directory for existing configuration files:

**Claude** (`.claude/`):

- Instructions: `.claude/rules/*.md` — each file has `description` and optional `paths` frontmatter
- Skills: `.claude/skills/*/SKILL.md` — skill directories with frontmatter (`name`, `description`, `allowed-tools`, `model`, `context`, `agent`, `disable-model-invocation`, `user-invocable`, `argument-hint`, `hooks`)
- Agents: `.claude/agents/*.md` — agent files with frontmatter (`name`, `description`, `tools`, `disallowedTools`, `permissionMode`, `skills`, `hooks`, `memory`, `model`)
- Hooks: `.claude/settings.json` → `hooks` key — JSON with PascalCase event names (`SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `Stop`, `SubagentStart`, `SubagentStop`, `PreCompact`, `PermissionRequest`, `Notification`)
- MCP: `.mcp.json` — JSON with `mcpServers` wrapper containing server configs (`type`, `command`, `args`, `env`, `url`, `headers`)

**Copilot** (`.github/`):

- Instructions: `.github/copilot-instructions.md` (always-apply) and `.github/instructions/*.instructions.md` (with `applyTo` frontmatter)
- Skills: `.github/skills/*/SKILL.md` — skill directories with frontmatter (`name`, `description`, `license`, `compatibility`, `metadata`)
- Agents: `.github/agents/*.agent.md` — agent files with frontmatter (`name`, `description`, `tools`, `model`, `target`, `mcp-servers`, `handoffs`)
- Hooks: `.github/hooks/hooks.json` — JSON with version field and camelCase event names (`sessionStart`, `sessionEnd`, `userPromptSubmitted`, `preToolUse`, `postToolUse`, `errorOccurred`)
- MCP: `.vscode/mcp.json` — JSON with `servers` wrapper (not `mcpServers`), may include `inputs` array for interactive secret prompts

**Cursor** (`.cursor/`):

- Instructions: `.cursor/rules/*.mdc` or `.cursor/rules/*.md` — with `description`, `globs`, `alwaysApply` frontmatter
- Skills: `.cursor/skills/*/SKILL.md` — skill directories with frontmatter (`name`, `description`, `license`, `compatibility`, `metadata`, `disable-model-invocation`)
- Hooks: `.cursor/hooks.json` — JSON with version field and camelCase event names (`sessionStart`, `sessionEnd`, `beforeSubmitPrompt`, `preToolUse`, `postToolUse`, `postToolUseFailure`, `stop`, `subagentStart`, `subagentStop`, `preCompact`, plus Cursor-specific events like `beforeShellExecution`, `afterFileEdit`)
- MCP: `.cursor/mcp.json` — JSON with `mcpServers` wrapper, omits `type` field (Cursor infers transport from `command` vs `url`)
- Note: Cursor does not have agents

### 2. Convert to Universal Format

For each file found, convert it to a universal-ai-config template:

**Frontmatter mapping** (target-specific → universal):

| Claude                     | Copilot                   | Cursor                     | Universal               |
| -------------------------- | ------------------------- | -------------------------- | ----------------------- |
| `paths`                    | `applyTo`                 | `globs`                    | `globs`                 |
| (no paths field)           | (copilot-instructions.md) | `alwaysApply: true`        | `alwaysApply: true`     |
| `disable-model-invocation` | —                         | `disable-model-invocation` | `disableAutoInvocation` |
| `user-invocable`           | —                         | —                          | `userInvocable`         |
| `allowed-tools`            | —                         | —                          | `allowedTools`          |
| `context: fork`            | —                         | —                          | `forkContext: true`     |
| `agent`                    | —                         | —                          | `subagentType`          |
| `argument-hint`            | —                         | —                          | `argumentHint`          |
| `hooks`                    | —                         | —                          | `hooks`                 |
| —                          | `excludeAgent`            | —                          | `excludeAgent`          |
| —                          | `license`                 | `license`                  | `license`               |
| —                          | `compatibility`           | `compatibility`            | `compatibility`         |
| —                          | `metadata`                | `metadata`                 | `metadata`              |
| —                          | `target`                  | —                          | `target`                |
| —                          | `mcp-servers`             | —                          | `mcpServers`            |
| —                          | `handoffs`                | —                          | `handoffs`              |

**Hook event mapping** (target-specific → universal):

| Claude               | Copilot               | Cursor               | Universal            |
| -------------------- | --------------------- | -------------------- | -------------------- |
| `SessionStart`       | `sessionStart`        | `sessionStart`       | `sessionStart`       |
| `SessionEnd`         | `sessionEnd`          | `sessionEnd`         | `sessionEnd`         |
| `UserPromptSubmit`   | `userPromptSubmitted` | `beforeSubmitPrompt` | `userPromptSubmit`   |
| `PreToolUse`         | `preToolUse`          | `preToolUse`         | `preToolUse`         |
| `PostToolUse`        | `postToolUse`         | `postToolUse`        | `postToolUse`        |
| `PostToolUseFailure` | —                     | `postToolUseFailure` | `postToolUseFailure` |
| `Stop`               | —                     | `stop`               | `stop`               |
| `SubagentStart`      | —                     | `subagentStart`      | `subagentStart`      |
| `SubagentStop`       | —                     | `subagentStop`       | `subagentStop`       |
| `PreCompact`         | —                     | `preCompact`         | `preCompact`         |
| `PermissionRequest`  | —                     | —                    | `permissionRequest`  |
| `Notification`       | —                     | —                    | `notification`       |
| —                    | `errorOccurred`       | —                    | `errorOccurred`      |

Cursor-specific events (e.g. `beforeShellExecution`, `afterFileEdit`) should be preserved as-is — they pass through to Cursor and are dropped for other targets.

**Hook handler field mapping:**

| Claude                      | Copilot      | Cursor    | Universal |
| --------------------------- | ------------ | --------- | --------- |
| `command`                   | `bash`       | `command` | `command` |
| `timeout`                   | `timeoutSec` | `timeout` | `timeout` |
| `matcher` (in parent group) | —            | `matcher` | `matcher` |

**MCP server conversion** (target-specific → universal):

The universal MCP format uses `mcpServers` as the wrapper key, with each server having `type`, `command`, `args`, `env`, `url`, and `headers` fields.

| Source                     | Conversion                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------- |
| Claude `.mcp.json`         | Copy `mcpServers` as-is (already matches universal format)                          |
| Copilot `.vscode/mcp.json` | Rename `servers` → `mcpServers`, add `type` field if missing, copy `inputs`         |
| Cursor `.cursor/mcp.json`  | Copy `mcpServers`, add `type: "stdio"` for servers with `command` (Cursor omits it) |

### 3. Write Universal Templates

For each converted file:

1. Use the same base name as the source file (e.g. `.claude/rules/coding-style.md` → `<%= instructionTemplatePath('coding-style') %>`)
2. Write the universal frontmatter and body content. Copy and paste the body content, instead of trying to use EJS `include()` or something equivalent, because the source files will be deleted afterwards.
3. If a template with the same name already exists, **overwrite it** (the import represents the latest version)

**File placement:**

- Instructions → `<%= instructionTemplatePath('{name}') %>`
- Skills → `<%= skillTemplatePath('{name}') %>`
- Agents → `<%= agentTemplatePath('{name}') %>`
- Hooks → `<%= hookTemplatePath('{source-name}') %>`
- MCP → `<%= mcpTemplatePath('{source-name}') %>`

### 4. Handle Special Cases

- **Claude hooks**: Extract the `hooks` key from `.claude/settings.json`. Flatten the nested matcher group structure into individual handlers with `matcher` fields.
- **Copilot always-apply**: Convert `.github/copilot-instructions.md` to an instruction with `alwaysApply: true`.
- **Copilot hook `bash` field**: Convert to universal `command` field.
- **Copilot hook `timeoutSec` field**: Convert to universal `timeout` field (both use seconds).
- **Cursor `.mdc` files**: Read as regular markdown (the `.mdc` extension is just a convention).
- **Copilot MCP `servers` key**: Rename to `mcpServers` in the universal template.
- **Copilot MCP `inputs` array**: Preserve as-is — it's included in Copilot output only, ignored by Claude/Cursor.
- **Cursor MCP missing `type`**: Add `"type": "stdio"` for servers with `command`, or `"type": "sse"` for servers with `url`.
- **MCP env var references**: Leave `${ENV_VAR}` syntax as-is — it's passed through to generated output. If values look like they could be config variables, consider converting to `{{varName}}` syntax and adding a `variables` entry in the config file.
- **Fields that only exist for one target**: Preserve them as-is. They'll be passed through to matching targets and ignored by others.

### 5. Verify

After importing, run `uac generate` targeting all configured targets and compare the generated output against the original source files to ensure the conversion is accurate.

Report to the user:

- How many files were imported per type
- Any files that couldn't be converted (with reasons)
- Whether the generated output matches the originals
