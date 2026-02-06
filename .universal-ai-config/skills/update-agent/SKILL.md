---
name: update-agent
description: Create, update, or manage universal-ai-config agent templates. Handles finding existing agents, deciding whether to create or modify, and writing the template.
---

# Manage Agent Templates

Agents are specialized AI personas with scoped tools and permissions that run in isolated contexts.

**Important:** Agents are supported by Claude and Copilot only. Cursor does not support agents — consider using a skill with `forkContext: true` as an alternative for Cursor.

## Finding Existing Agents

List files in `.universal-ai-config/agents/` to discover existing agent templates. Read their frontmatter to understand each agent's purpose and capabilities.

## Deciding What to Do

- **Create new**: when you need a new specialized persona with distinct capabilities
- **Update existing**: when an agent needs adjusted tools, permissions, or system prompt
- **Delete**: when an agent is no longer needed

## Creating a New Agent

1. Create a `.md` file in `.universal-ai-config/agents/` with a descriptive name (e.g. `code-reviewer.md`)
2. Add YAML frontmatter with at minimum `name` and `description`
3. Write the agent's system prompt as the body

### Frontmatter Fields

| Field             | Description                                                                        |
| ----------------- | ---------------------------------------------------------------------------------- |
| `name`            | Agent identifier (lowercase with hyphens)                                          |
| `description`     | When to delegate to this agent (helps AI decide when to use it)                    |
| `tools`           | Tools this agent can use (omit to inherit all)                                     |
| `disallowedTools` | Tools to explicitly deny                                                           |
| `permissionMode`  | Permission level: `default`, `acceptEdits`, `dontAsk`, `bypassPermissions`, `plan` |
| `skills`          | Skills to preload into the agent's context                                         |
| `memory`          | Persistent memory scope: `user`, `project`, or `local`                             |
| `model`           | AI model to use (e.g. `sonnet`, `opus`, `haiku`)                                   |
| `target`          | Copilot-specific: scope to `vscode` or `github-copilot`                            |
| `mcpServers`      | MCP server configurations                                                          |
| `handoffs`        | Copilot-specific: other agents to hand off to                                      |

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
