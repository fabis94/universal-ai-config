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
- Skills: `.claude/skills/*/SKILL.md` — skill directories with frontmatter (`name`, `description`, `allowed-tools`, `model`, `context`, `agent`, `disable-model-invocation`, `user-invocable`, `argument-hint`)
- Agents: `.claude/agents/*.md` — agent files with frontmatter (`name`, `description`, `tools`, `disallowedTools`, `permissionMode`, `skills`, `memory`, `model`)
- Hooks: `.claude/settings.json` → `hooks` key — JSON with PascalCase event names (`PostToolUse`, `PreToolUse`, `SessionStart`, `Stop`)

**Copilot** (`.github/`):

- Instructions: `.github/copilot-instructions.md` (always-apply) and `.github/instructions/*.instructions.md` (with `applyTo` frontmatter)
- Skills: `.github/skills/*/SKILL.md` — skill directories with frontmatter (`name`, `description`, `license`, `compatibility`, `metadata`)
- Agents: `.github/agents/*.agent.md` — agent files with frontmatter (`description`, `tools`, `model`, `target`, `mcp-servers`, `handoffs`)
- Hooks: `.github/hooks/hooks.json` — JSON with version field and camelCase event names (`sessionStart`, `userPromptSubmitted`, `preToolUse`, `postToolUse`)

**Cursor** (`.cursor/`):

- Instructions: `.cursor/rules/*.mdc` or `.cursor/rules/*.md` — with `description`, `globs`, `alwaysApply` frontmatter
- Skills: `.cursor/skills/*/SKILL.md` — skill directories with frontmatter (`name`, `description`, `license`, `compatibility`, `metadata`, `disable-model-invocation`)
- Hooks: `.cursor/hooks.json` — JSON with version field and camelCase event names
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
| —                          | `excludeAgent`            | —                          | `excludeAgent`          |
| —                          | `mcp-servers`             | —                          | `mcpServers`            |

**Hook event mapping** (target-specific → universal):

| Claude         | Copilot               | Cursor         | Universal          |
| -------------- | --------------------- | -------------- | ------------------ |
| `SessionStart` | `sessionStart`        | `sessionStart` | `sessionStart`     |
| `PostToolUse`  | `postToolUse`         | `postToolUse`  | `postToolUse`      |
| `PreToolUse`   | `preToolUse`          | `preToolUse`   | `preToolUse`       |
| `Stop`         | —                     | —              | `stop`             |
| —              | `userPromptSubmitted` | —              | `userPromptSubmit` |

**Hook handler field mapping:**

| Claude                      | Copilot      | Cursor    | Universal |
| --------------------------- | ------------ | --------- | --------- |
| `command`                   | `bash`       | `command` | `command` |
| `timeout`                   | `timeoutSec` | `timeout` | `timeout` |
| `matcher` (in parent group) | —            | `matcher` | `matcher` |

### 3. Write Universal Templates

For each converted file:

1. Use the same base name as the source file (e.g. `.claude/rules/coding-style.md` → `<%= templatesDir %>/instructions/coding-style.md`)
2. Write the universal frontmatter and body content
3. If a template with the same name already exists, **overwrite it** (the import represents the latest version)

**File placement:**

- Instructions → `<%= templatesDir %>/instructions/{name}.md`
- Skills → `<%= templatesDir %>/skills/{name}/SKILL.md`
- Agents → `<%= templatesDir %>/agents/{name}.md`
- Hooks → `<%= templatesDir %>/hooks/{source-name}.json`

### 4. Handle Special Cases

- **Claude hooks**: Extract the `hooks` key from `.claude/settings.json`. Flatten the nested matcher group structure into individual handlers with `matcher` fields.
- **Copilot always-apply**: Convert `.github/copilot-instructions.md` to an instruction with `alwaysApply: true`.
- **Copilot hook `bash` field**: Convert to universal `command` field.
- **Copilot hook `timeoutSec` field**: Convert to universal `timeout` field (keep same units — check if seconds vs milliseconds).
- **Cursor `.mdc` files**: Read as regular markdown (the `.mdc` extension is just a convention).
- **Fields that only exist for one target**: Preserve them as-is. They'll be passed through to matching targets and ignored by others.

### 5. Verify

After importing, run `uac generate` targeting all configured targets and compare the generated output against the original source files to ensure the conversion is accurate.

Report to the user:

- How many files were imported per type
- Any files that couldn't be converted (with reasons)
- Whether the generated output matches the originals
