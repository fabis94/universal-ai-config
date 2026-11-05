# Tool names reference

The `tools`, `allowedTools`, and `disallowedTools` frontmatter fields accept arrays of tool name strings. Tool names and MCP tool syntax differ per platform, so use per-target overrides when targeting multiple platforms. Hook `matcher` patterns per event are in [hooks.md](hooks.md#matcher-patterns).

## Claude Code

Claude uses PascalCase tool names — the exact strings permission rules, agent `tools` lists and hook matchers use. Canonical list: https://code.claude.com/docs/en/tools-reference.

**Built-in tools:**

| Tool                                                       | Description                                                                                              |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `Bash`                                                     | Execute shell commands                                                                                   |
| `PowerShell`                                               | Execute PowerShell commands (Windows)                                                                    |
| `Read`                                                     | Read file contents                                                                                       |
| `Edit`                                                     | Exact string replacements in files                                                                       |
| `Write`                                                    | Create or overwrite files                                                                                |
| `Glob`                                                     | Find files by glob pattern — **not in the default tool set on macOS, Linux and WSL** (see below)         |
| `Grep`                                                     | Search file contents with regex — **not in the default tool set on macOS, Linux and WSL** (see below)    |
| `LSP`                                                      | Language-server code intelligence                                                                        |
| `NotebookEdit`                                             | Edit Jupyter notebook cells                                                                              |
| `WebFetch`                                                 | Fetch and process web content                                                                            |
| `WebSearch`                                                | Search the web                                                                                           |
| `Agent`                                                    | Launch sub-agents (renamed from `Task` in v2.1.63; `Task` still works as an alias)                       |
| `SendMessage`                                              | Message a teammate, a resumed subagent, or another Claude Code session (only teammates need agent teams) |
| `ListAgents`                                               | List agents and sessions `SendMessage` can reach                                                         |
| `TaskCreate`, `TaskGet`, `TaskList`, `TaskUpdate`          | Session task tracking — offered by default only on Opus 4.7, Sonnet 4.6, Haiku 4.5 and earlier models    |
| `TaskStop`                                                 | Stop a background task                                                                                   |
| `TodoWrite`                                                | Legacy task checklist — **disabled by default** in favor of the `Task*` tools                            |
| `AskUserQuestion`                                          | Ask the user clarifying questions                                                                        |
| `EnterPlanMode`, `ExitPlanMode`                            | Switch into and out of plan mode                                                                         |
| `EnterWorktree`, `ExitWorktree`                            | Move the session into and out of a git worktree                                                          |
| `Skill`                                                    | Invoke a skill                                                                                           |
| `ToolSearch`                                               | Search deferred tools (MCP and others)                                                                   |
| `ListMcpResourcesTool`, `ReadMcpResourceTool`              | List and read MCP resources                                                                              |
| `WaitForMcpServers`                                        | Wait for MCP servers to finish connecting                                                                |
| `Monitor`                                                  | Watch a background process                                                                               |
| `CronCreate`, `CronDelete`, `CronList`                     | Scheduled tasks                                                                                          |
| `ScheduleWakeup`, `RemoteTrigger`, `PushNotification`      | Wake-ups, remote triggers and notifications                                                              |
| `Workflow`                                                 | Run a dynamic workflow                                                                                   |
| `Artifact`, `SendUserFile`, `ReportFindings`               | Publish a page, send a file, report review findings                                                      |
| `EndConversation`                                          | End the conversation — deny rules can't remove it while other tools remain                               |
| `SendFeedback`, `ShareOnboardingGuide`, `SubagentHandback` | Feedback, onboarding and auto-mode hand-back (plan-, platform- or mode-dependent)                        |

**Platform and default-set caveats:**

- **`Glob` / `Grep`:** on macOS, Linux and WSL, Claude Code leaves them out of the default tool set and searches with `find` / `grep` through `Bash`. Those searches reach hooks and permission rules as **`Bash`** calls, so a hook matcher on `Grep|Glob` never fires there. A skill's `allowedTools` and settings allow rules don't bring them back; an agent `tools` list that names `Glob`/`Grep` and leaves out `Bash` does.
- **Task tools:** on other models, set `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` to get them. Background and cloud sessions always have them.

**MCP tools** use double-underscore syntax: `mcp__servername__toolname`. Use wildcards to allow all tools from a server: `mcp__servername__*`.

## GitHub Copilot

Copilot uses lowercase **tool aliases** that each group multiple underlying tools:

| Alias     | Description           | Includes                                            |
| --------- | --------------------- | --------------------------------------------------- |
| `execute` | Run shell commands    | shell, Bash, powershell                             |
| `read`    | Read files            | Read, NotebookRead                                  |
| `edit`    | Edit files            | Edit, MultiEdit, Write, NotebookEdit                |
| `search`  | Search for files/text | Grep, Glob                                          |
| `agent`   | Invoke subagents      | custom-agent, Task                                  |
| `web`     | Web search and fetch  | WebSearch, WebFetch (not in the GitHub cloud agent) |
| `todo`    | Task management       | TodoWrite (not in the GitHub cloud agent)           |

`"*"` enables all tools (the default when `tools` is omitted). Unrecognized names are silently ignored.

`<category>/<tool>` names such as `web/fetch`, `search/codebase` or `read/terminalLastCommand` are **VS Code Local-harness names** — legacy since VS Code's default switched to the Copilot harness, which doesn't map them. Qualified client tools (`browser/<tool>`, `vscode/<tool>`) still work. User-defined tool sets are deprecated.

**MCP tools** use slash syntax in agent `tools`: `servername/toolname`, or `servername/*` for all of a server's tools. At runtime (and in hook matchers) Copilot names MCP tools `servername-toolname`.

## Cursor

Cursor reads no `tools`, `allowedTools`, or `disallowedTools` from uac's output, and uac drops them for Cursor. To restrict a Cursor agent, set `readonly: true` (see [frontmatter.md](frontmatter.md)).

Cursor's local tool names, for hook `matcher` patterns: `Shell`, `Read`, `Write`, `Delete`, `Grep`, `List`, `Fetch` (not `WebFetch`), `ReadLints`, `WriteShellStdin`. MCP tools are `MCP:<tool_name>` (the server name is not part of it). Matching is an unanchored regex, so `Read` also matches `ReadLints`.

## Codex

Codex has **no named built-in tool list** and **no agent-level allow/deny list**. The agent fields `tools` and `disallowedTools` are dropped for Codex with a warning. A skill's `allowedTools` is dropped silently.

Tool restriction in Codex lives **per MCP server**, via `enabledTools` (allowlist) and `disabledTools` (denylist) on the server config in your `mcp/*.json` templates:

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

Codex agents inherit the parent session's MCP servers and can't change them, so there is no per-agent MCP filtering.

## Per-Target Tool Overrides

Since tool names differ between platforms, use per-target overrides:

```yaml
# Agent with read-only tools (naming Glob/Grep without Bash keeps them on every platform)
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
# Skill that pre-approves specific tools
allowedTools:
  claude: ["Read", "Grep", "Glob", "WebSearch"]
  copilot: ["read", "search", "web"]
```

## Common Tool Combinations

| Use Case     | Claude                                              | Copilot                                 | Cursor                        | Codex                                                                |
| ------------ | --------------------------------------------------- | --------------------------------------- | ----------------------------- | -------------------------------------------------------------------- |
| Read-only    | `["Read", "Grep", "Glob"]`                          | `["read", "search"]`                    | `readonly: true` on the agent | Use per-server `enabledTools` on MCP servers — no agent-level filter |
| Full editor  | `["Read", "Edit", "Write", "Grep", "Glob", "Bash"]` | `["read", "edit", "search", "execute"]` | Default                       | Same — restriction lives per MCP server in Codex                     |
| + web access | Add `"WebSearch"`, `"WebFetch"`                     | Add `"web"`                             | Default                       | Web search lives in Codex's separate `web_search` config             |
| + sub-agents | Add `"Agent"` (or `"Task"` — both work)             | Add `"agent"`                           | Default                       | Codex sub-agents are configured globally, not enabled per-agent      |
| All tools    | List explicitly — no wildcard                       | `["*"]` or omit `tools`                 | Default                       | Default — omit per-server `enabledTools` to allow all                |
