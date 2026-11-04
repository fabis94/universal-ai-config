# Tool names reference

The `tools`, `allowedTools`, and `disallowedTools` frontmatter fields accept arrays of tool name strings. Tool names and MCP tool syntax differ per platform, so use per-target overrides when targeting multiple platforms. Hook `matcher` patterns per event are in [hooks.md](hooks.md#matcher-patterns).

## Claude Code

Claude uses PascalCase tool names.

**Built-in tools:**

| Tool              | Description                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| `Bash`            | Execute shell commands                                                                             |
| `Read`            | Read file contents                                                                                 |
| `Edit`            | Exact string replacements in files                                                                 |
| `Write`           | Create or overwrite files                                                                          |
| `Glob`            | Find files by glob pattern                                                                         |
| `Grep`            | Search file contents with regex                                                                    |
| `WebFetch`        | Fetch and process web content                                                                      |
| `WebSearch`       | Search the web                                                                                     |
| `Agent`           | Launch specialized sub-agents (renamed from `Task` in v2.1.63; `Task` still works as alias)        |
| `TodoWrite`       | Structured task management                                                                         |
| `NotebookEdit`    | Edit Jupyter notebook cells                                                                        |
| `AskUserQuestion` | Ask the user clarifying questions                                                                  |
| `EnterPlanMode`   | Switch to plan mode                                                                                |
| `ExitPlanMode`    | Exit plan mode                                                                                     |
| `Skill`           | Execute a slash command skill                                                                      |
| `ToolSearch`      | Search available MCP tools                                                                         |
| `SendMessage`     | Send a message to another agent (experimental — requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`) |

**MCP tools** use double-underscore syntax: `mcp__servername__toolname`. Use wildcards to allow all tools from a server: `mcp__servername__*`.

## GitHub Copilot

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

Specific tools can also be referenced by `<category>/<tool>` name, e.g. `web/fetch`, `search/codebase`, `search/usages`, `read/terminalLastCommand`.

**MCP tools** use slash syntax: `servername/toolname`. Use wildcards to allow all tools from a server: `servername/*`.

## Cursor

Cursor does not support `tools`, `allowedTools`, or `disallowedTools` in its configuration files. Tool restrictions are not configurable for the Cursor target.

For reference, Cursor's tool names (usable in hook `matcher` patterns): `Shell`, `Read`, `Write`, `Grep`, `Delete`, `Task`, `TabRead`, `TabWrite`. MCP tools use `MCP:<tool_name>` syntax.

MCP tools are available in Cursor but configured separately via MCP server settings, not through rule/agent frontmatter.

## Codex

Codex has **no named built-in tool list** and **no agent-level allow/deny list**. The agent-frontmatter fields `tools`, `allowedTools`, and `disallowedTools` are dropped for Codex with a warning.

Tool restriction in Codex lives **per-MCP-server** via the new `enabledTools` (allowlist) and `disabledTools` (denylist) fields on the MCP server config. Configure these in your `mcp/*.json` templates:

```json
{
  "mcpServers": {
    "github": {
      "url": "https://...",
      "enabledTools": ["search_code", "list_issues"]
    }
  }
}
```

For per-MCP filtering on agent-by-agent basis, use per-agent `mcpServers` overrides combined with `enabledTools` on the embedded server config.

## Per-Target Tool Overrides

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

## Common Tool Combinations

| Use Case     | Claude                                              | Copilot                                 | Codex                                                                |
| ------------ | --------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------- |
| Read-only    | `["Read", "Grep", "Glob"]`                          | `["read", "search"]`                    | Use per-server `enabledTools` on MCP servers — no agent-level filter |
| Full editor  | `["Read", "Edit", "Write", "Grep", "Glob", "Bash"]` | `["read", "edit", "search", "execute"]` | Same — restriction lives per-MCP-server in Codex                     |
| + web access | Add `"WebSearch"`, `"WebFetch"`                     | Add `"web"`                             | Web search lives in Codex's separate `web_search` config             |
| + sub-agents | Add `"Agent"` (or `"Task"` — both work)             | Add `"agent"`                           | Codex sub-agents are configured globally, not enabled per-agent      |
| All tools    | List explicitly — no wildcard                       | `["*"]` or omit `tools`                 | Default — omit per-server `enabledTools` to allow all                |
