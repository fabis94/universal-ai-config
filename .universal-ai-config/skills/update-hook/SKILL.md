---
name: update-hook
description: Create, update, or manage universal-ai-config hook templates. Handles finding existing hooks, deciding whether to create or modify, and writing the template.
userInvocable: false
---

# Manage Hook Templates

Hooks are lifecycle automation that triggers on specific events during AI sessions. They use JSON format (not markdown).

## Finding Existing Hooks

List files in `<%= hookTemplatePath() %>/` to discover existing hook templates (`.json` files). Read them to understand what events are already handled.

**Note:** Hooks from multiple files are merged by event name during generation; if two files produce an identical handler for a target, only the first is emitted. You can organize hooks by concern (e.g. `linting.json`, `security.json`).

## Deciding What to Do

- **Create new file**: for an entirely new concern or automation area
- **Update existing file**: modify handlers or add events to an existing hook file
- **Merge strategy**: since hooks merge by event, you can split hooks across files for better organization without conflicts
- **Delete**: remove a hook file when the automation is no longer needed

## Creating a New Hook

1. Create a `.json` file in `<%= hookTemplatePath() %>/` with a descriptive name (e.g. `linting.json`)
2. Use the standard hook JSON structure

### JSON Structure

```json
{
  "hooks": {
    "eventName": [
      {
        "command": "path/to/script.sh",
        "matcher": "ToolName",
        "timeout": 30,
        "description": "What this hook does"
      }
    ]
  }
}
```

### Events, Handler Fields, and Per-Target Overrides

Use camelCase event names (e.g. `sessionStart`, `preToolUse`, `postToolUse`). The CLI maps them to each target's format and silently drops events a target doesn't support. Handler fields (`command`, `matcher`, `timeout`, `description`) accept per-target values.

Before using an event or handler field, check `<%= docPath('uac/hooks') %>`. It has the per-target event mapping table (which targets support each event — Codex supports only a small subset), every handler field with the targets that use it, and matcher patterns. Codex supports only `type: "command"` handlers.

### Example

```json
{
  "hooks": {
    "postToolUse": [
      {
        "matcher": "Write|Edit",
        "command": "./scripts/format-file.sh",
        "timeout": 60,
        "description": "Auto-format files after edits"
      }
    ],
    "sessionStart": [
      {
        "command": "echo 'Session started at $(date)'",
        "description": "Log session start"
      }
    ]
  }
}
```
