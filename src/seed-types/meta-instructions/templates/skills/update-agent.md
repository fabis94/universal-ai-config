---
name: update-agent
description: Create, update, or manage universal-ai-config agent templates. Handles finding existing agents, deciding whether to create or modify, and writing the template.
userInvocable: false
---

# Manage Agent Templates

Agents are specialized AI personas with scoped tools and permissions that run in isolated contexts.

Every target supports agents. Cursor agents (`.cursor/agents/<name>.md`) take only `name`, `description`, `model`, `readonly` and `background`. Codex emits each agent as a standalone `.codex/agents/<name>.toml` file (body becomes `developer_instructions`) and skips an agent with no `description` or an empty body; see `<%%= docPath('uac/codex') %>`.

## Finding Existing Agents

List files in `<%%= agentTemplatePath() %>/` to discover existing agent templates. Read their frontmatter to understand each agent's purpose and capabilities.

## Deciding What to Do

- **Create new**: when you need a new specialized persona with distinct capabilities
- **Update existing**: when an agent needs adjusted tools, permissions, or system prompt
- **Delete**: when an agent is no longer needed; then run `uac generate --clean` so its output goes too

## Creating a New Agent

1. Create a `.md` file in `<%%= agentTemplatePath() %>/` with a descriptive name (e.g. `code-reviewer.md`)
2. Add YAML frontmatter with at minimum `name` and `description`
3. Write the agent's system prompt as the body

### Frontmatter Fields

Key fields: `name`, `description`, `model`, `effort`, `tools`, `permissionMode`, `skills`, `hooks`, plus Cursor's `readonly`, Copilot's `modelPolicy`, and the Codex-only `codex` block. Every field with its per-target support: `<%%= docPath('uac/frontmatter') %>`. Per-target override syntax: `<%%= docPath('uac/templates') %>`.

### Cross-target gotchas for agents

`model`, `permissionMode`, and `tools` don't carry over between targets. Set `model` per target. Codex agents inherit the session's sandbox, approvals and MCP servers, so `permissionMode`, `tools`, `skills` and `mcpServers` are dropped for Codex (set sandboxing in `.codex/config.toml`; restrict tools per MCP server with `enabledTools`). Copilot's default harness rejects `handoffs`, `subAgents` and `argumentHint`, so uac drops them. Details: `<%%= docPath('uac/codex') %>`. Model IDs per target: `<%%= docPath('uac/models') %>`. Tool names per target: `<%%= docPath('uac/tools') %>`.

### Example

```markdown
---
name: security-reviewer
description: Reviews code for security vulnerabilities and best practices. Use proactively after code changes.
tools:
  claude: ["Read", "Grep", "Glob", "Bash"]
  copilot: ["read", "search", "execute"]
model:
  claude: sonnet
  copilot: claude-sonnet-5.5
  codex: gpt-6.1-sol
---

You are a security-focused code reviewer. When invoked:

1. Identify the changed files
2. Check for common vulnerabilities (injection, XSS, auth issues)
3. Review dependency usage for known CVEs
4. Report findings by severity (critical, warning, info)
```
