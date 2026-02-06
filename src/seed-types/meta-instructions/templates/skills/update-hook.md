---
name: update-hook
description: Create, update, or manage universal-ai-config hook templates. Handles finding existing hooks, deciding whether to create or modify, and writing the template.
---

# Manage Hook Templates

Hooks are lifecycle automation that triggers on specific events during AI sessions. They use JSON format (not markdown).

## Finding Existing Hooks

List files in `<%= templatesDir %>/hooks/` to discover existing hook templates (`.json` files). Read them to understand what events are already handled.

**Note:** Hooks from multiple files are merged by event name during generation. You can organize hooks by concern (e.g. `linting.json`, `security.json`).

## Deciding What to Do

- **Create new file**: for an entirely new concern or automation area
- **Update existing file**: modify handlers or add events to an existing hook file
- **Merge strategy**: since hooks merge by event, you can split hooks across files for better organization without conflicts
- **Delete**: remove a hook file when the automation is no longer needed

## Creating a New Hook

1. Create a `.json` file in `<%= templatesDir %>/hooks/` with a descriptive name (e.g. `linting.json`)
2. Use the standard hook JSON structure

### JSON Structure

```json
{
  "hooks": {
    "eventName": [
      {
        "command": "path/to/script.sh",
        "matcher": "ToolName",
        "timeout": 5000,
        "description": "What this hook does"
      }
    ]
  }
}
```

### Available Events

| Event              | When it fires                      | Matcher                          |
| ------------------ | ---------------------------------- | -------------------------------- |
| `sessionStart`     | Session begins or resumes          | How started: `startup`, `resume` |
| `userPromptSubmit` | User submits a prompt              | N/A                              |
| `preToolUse`       | Before a tool executes (can block) | Tool name                        |
| `postToolUse`      | After a tool succeeds              | Tool name                        |
| `stop`             | AI finishes responding             | N/A                              |

### Handler Fields

| Field         | Required | Description                                               |
| ------------- | -------- | --------------------------------------------------------- |
| `command`     | Yes      | Shell command to execute                                  |
| `matcher`     | No       | Regex to filter when handler fires (e.g. `"Write\|Edit"`) |
| `timeout`     | No       | Timeout in milliseconds                                   |
| `description` | No       | Human-readable description                                |

### Per-Target Overrides

Hook fields support per-target overrides at the handler level:

```json
{
  "hooks": {
    "postToolUse": [
      {
        "command": {
          "claude": "./scripts/lint-claude.sh",
          "copilot": "./scripts/lint-copilot.sh",
          "default": "./scripts/lint.sh"
        },
        "matcher": "Write|Edit"
      }
    ]
  }
}
```

### Example

```json
{
  "hooks": {
    "postToolUse": [
      {
        "matcher": "Write|Edit",
        "command": "./scripts/format-file.sh",
        "timeout": 10000,
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

## After Changes

Run `uac generate` to regenerate target-specific config files and verify the output.
