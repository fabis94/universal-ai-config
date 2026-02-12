---
name: update-agent
description: Create, update, or manage universal-ai-config agent templates. Handles finding existing agents, deciding whether to create or modify, and writing the template.
---

# Manage Agent Templates

Agents are specialized AI personas with scoped tools and permissions that run in isolated contexts.

**Important:** Agents are supported by Claude and Copilot only. Cursor does not support agents — consider using a skill with `forkContext: true` as an alternative for Cursor.

## Finding Existing Agents

List files in `<%= agentTemplatePath() %>/` to discover existing agent templates. Read their frontmatter to understand each agent's purpose and capabilities.

## Additional Template Directories

This project may have additional template directories configured via `additionalTemplateDirs`. To find them, search the project root for **all** config files matching `universal-ai-config.*` (e.g. `universal-ai-config.config.ts`, `universal-ai-config.overrides.config.ts`, and any other variants) and read the `additionalTemplateDirs` field from each. If the user asks to update a template that doesn't exist in the main templates directory, or explicitly refers to shared/global/external templates:

1. Read all `universal-ai-config.*` config files in the project root to find `additionalTemplateDirs` paths
2. Search those directories for the relevant agent
3. **IMPORTANT:** Before editing any file outside the main `<%= config.templatesDir %>/` directory, ask the user for explicit confirmation — these are shared templates that may affect other projects

## Deciding What to Do

- **Create new**: when you need a new specialized persona with distinct capabilities
- **Update existing**: when an agent needs adjusted tools, permissions, or system prompt
- **Delete**: when an agent is no longer needed

## Creating a New Agent

1. Create a `.md` file in `<%= agentTemplatePath() %>/` with a descriptive name (e.g. `code-reviewer.md`)
2. Add YAML frontmatter with at minimum `name` and `description`
3. Write the agent's system prompt as the body

### Frontmatter Fields

See the **Agents** section in `<%= instructionPath('uac-template-guide') %>` for the complete field reference and per-target override syntax. Key fields: `name`, `description`, `model`, `tools`, `permissionMode`, `hooks`.

### Example

```markdown
---
name: security-reviewer
description: Reviews code for security vulnerabilities and best practices. Use proactively after code changes.
tools: ["Read", "Grep", "Glob", "Bash"]
model: sonnet
---

You are a security-focused code reviewer. When invoked:

1. Identify the changed files
2. Check for common vulnerabilities (injection, XSS, auth issues)
3. Review dependency usage for known CVEs
4. Report findings by severity (critical, warning, info)
```

## After Changes

Run `uac generate` to regenerate target-specific config files and verify the output.

**Reminder:** Always edit templates in `<%= agentTemplatePath() %>/` — never edit generated target-specific files directly.
