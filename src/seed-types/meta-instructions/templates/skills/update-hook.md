---
name: update-hook
description: Create, update, or manage universal-ai-config hook templates. Handles finding existing hooks, deciding whether to create or modify, and writing the template.
---

# Manage Hook Templates

Hooks are lifecycle automation that triggers on specific events during AI sessions. They use JSON format (not markdown).

## Finding Existing Hooks

List files in `<%%= hookTemplatePath() %>/` to discover existing hook templates (`.json` files). Read them to understand what events are already handled.

**Note:** Hooks from multiple files are merged by event name during generation. You can organize hooks by concern (e.g. `linting.json`, `security.json`).

## Additional Template Directories

This project may have additional template directories configured via `additionalTemplateDirs` in the config file (`universal-ai-config.config.ts` or `universal-ai-config.overrides.ts`). If the user asks to update a template that doesn't exist in the main templates directory, or explicitly refers to shared/global/external templates:

1. Read the config file(s) to find `additionalTemplateDirs` paths
2. Search those directories for the relevant hook file
3. **IMPORTANT:** Before editing any file outside the main `<%%= config.templatesDir %>/` directory, ask the user for explicit confirmation — these are shared templates that may affect other projects

## Deciding What to Do

- **Create new file**: for an entirely new concern or automation area
- **Update existing file**: modify handlers or add events to an existing hook file
- **Merge strategy**: since hooks merge by event, you can split hooks across files for better organization without conflicts
- **Delete**: remove a hook file when the automation is no longer needed

## Creating a New Hook

1. Create a `.json` file in `<%%= hookTemplatePath() %>/` with a descriptive name (e.g. `linting.json`)
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

See the **Hooks** section in `<%%= instructionPath('uac-template-guide') %>` for the complete reference: all 13 universal event names, handler fields (`command`, `matcher`, `timeout`, `description`), event name mappings per target, and per-target override syntax.

Use camelCase event names (e.g. `sessionStart`, `preToolUse`, `postToolUse`). The CLI maps them to each target's format and silently drops unsupported events.

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

## After Changes

Run `uac generate` to regenerate target-specific config files and verify the output.

**Reminder:** Always edit templates in `<%%= hookTemplatePath() %>/` — never edit generated target-specific files directly.
