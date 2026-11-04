---
name: update-agent
description: Create, update, or manage universal-ai-config agent templates. Handles finding existing agents, deciding whether to create or modify, and writing the template.
userInvocable: false
---

# Manage Agent Templates

Agents are specialized AI personas with scoped tools and permissions that run in isolated contexts.

**Important:** Agents are supported by Claude, Copilot, and Codex. Cursor does not support agents — consider using a skill with `forkContext: true` as an alternative for Cursor. Codex emits each agent as a standalone `.codex/agents/<name>.toml` file (body becomes `developer_instructions`); see `<%= docPath('uac/codex') %>`.

## Finding Existing Agents

List files in `<%= agentTemplatePath() %>/` to discover existing agent templates. Read their frontmatter to understand each agent's purpose and capabilities.

## Deciding What to Do

- **Create new**: when you need a new specialized persona with distinct capabilities
- **Update existing**: when an agent needs adjusted tools, permissions, or system prompt
- **Delete**: when an agent is no longer needed

## Creating a New Agent

1. Create a `.md` file in `<%= agentTemplatePath() %>/` with a descriptive name (e.g. `code-reviewer.md`)
2. Add YAML frontmatter with at minimum `name` and `description`
3. Write the agent's system prompt as the body

### Frontmatter Fields

Key fields: `name`, `description`, `model`, `tools`, `permissionMode`, `hooks`, plus Codex-specific `nicknameCandidates` and `sandboxMode`. Every field with its per-target support: `<%= docPath('uac/frontmatter') %>`. Per-target override syntax: `<%= instructionPath('uac-template-guide') %>`.

### Cross-target gotchas for agents

`model`, `permissionMode`, and `tools` don't carry over between targets. Set `model` per target, use `sandboxMode` for Codex instead of `permissionMode`, and restrict Codex tools per MCP server (`enabledTools`) instead of `tools`. Details: `<%= docPath('uac/codex') %>`. Model IDs per target: `<%= docPath('uac/models') %>`. Tool names per target: `<%= docPath('uac/tools') %>`.

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
