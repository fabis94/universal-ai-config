# Hooks reference

Hook templates live in `.universal-ai-config/hooks/*.json`. Every file merges into one output per target. This page has the full handler field list, the universal → per-target event mapping, matcher patterns, and the Codex limits.

## Structure

Hooks use JSON format with this structure:

```json
{
  "hooks": {
    "eventName": [{ "command": "script.sh", "matcher": "ToolName", "timeout": 30 }]
  }
}
```

## Handler Fields

| Field            | Required | Targets       | Description                                                                                                                                                                                                         |
| ---------------- | -------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`           | No       | All           | Handler type: `command` (default), `http`, `mcp_tool`, `prompt`, `agent`                                                                                                                                            |
| `command`        | Yes\*    | All           | Shell command or script path (`command` type)                                                                                                                                                                       |
| `args`           | No       | Claude/Codex  | Argument list; when present, `command` is resolved as executable and spawned directly. **Codex doesn't accept the array form — uac flattens `command + args` into a single shell-escaped string** for Codex output. |
| `url`            | Yes\*    | Claude        | Request URL (`http` type)                                                                                                                                                                                           |
| `headers`        | No       | Claude        | HTTP headers (`http` type)                                                                                                                                                                                          |
| `allowedEnvVars` | No       | Claude        | Env vars forwarded to the HTTP request (`http` type)                                                                                                                                                                |
| `server`         | Yes\*    | Claude        | MCP server name (`mcp_tool` type)                                                                                                                                                                                   |
| `tool`           | Yes\*    | Claude        | MCP tool name (`mcp_tool` type)                                                                                                                                                                                     |
| `input`          | No       | Claude        | MCP tool input (`mcp_tool` type)                                                                                                                                                                                    |
| `prompt`         | Yes\*    | Claude/Cursor | Prompt text (`prompt` or `agent` type)                                                                                                                                                                              |
| `model`          | No       | Claude/Cursor | Model name (`prompt` or `agent` type)                                                                                                                                                                               |
| `async`          | No       | Claude        | If true, runs in background without blocking                                                                                                                                                                        |
| `asyncRewake`    | No       | Claude        | If true, runs in background and wakes Claude on exit code 2 (implies `async`)                                                                                                                                       |
| `shell`          | No       | Claude        | Shell to use: `bash` (default) or `powershell`                                                                                                                                                                      |
| `if`             | No       | Claude        | Permission-rule syntax to filter when this hook runs (e.g. `"Bash(git *)"`)                                                                                                                                         |
| `statusMessage`  | No       | Claude/Codex  | Custom spinner message shown while the hook runs                                                                                                                                                                    |
| `once`           | No       | Claude        | If true, runs once per session then is removed (skill frontmatter hooks only)                                                                                                                                       |
| `matcher`        | No       | All           | Regex pattern to filter when hook fires                                                                                                                                                                             |
| `timeout`        | No       | All           | Timeout in seconds                                                                                                                                                                                                  |
| `description`    | No       | All           | Human-readable description                                                                                                                                                                                          |
| `loopLimit`      | No       | Cursor        | Max automatic follow-ups (`null` = unlimited, default: 5)                                                                                                                                                           |
| `failClosed`     | No       | Cursor        | If true, blocks the action when the hook fails                                                                                                                                                                      |

\*Required for that handler type.

## Universal Event Names

Use camelCase event names. The CLI maps them to each target's format and silently drops unsupported events.

| Universal             | Claude                | Cursor               | Copilot               | Codex               |
| --------------------- | --------------------- | -------------------- | --------------------- | ------------------- |
| `sessionStart`        | `SessionStart`        | `sessionStart`       | `sessionStart`        | `SessionStart`      |
| `sessionEnd`          | `SessionEnd`          | `sessionEnd`         | `sessionEnd`          | —                   |
| `userPromptSubmit`    | `UserPromptSubmit`    | `beforeSubmitPrompt` | `userPromptSubmitted` | `UserPromptSubmit`  |
| `preToolUse`          | `PreToolUse`          | `preToolUse`         | `preToolUse`          | `PreToolUse`        |
| `postToolUse`         | `PostToolUse`         | `postToolUse`        | `postToolUse`         | `PostToolUse`       |
| `postToolUseFailure`  | `PostToolUseFailure`  | `postToolUseFailure` | —                     | —                   |
| `stop`                | `Stop`                | `stop`               | —                     | `Stop`              |
| `subagentStart`       | `SubagentStart`       | `subagentStart`      | —                     | —                   |
| `subagentStop`        | `SubagentStop`        | `subagentStop`       | —                     | —                   |
| `preCompact`          | `PreCompact`          | `preCompact`         | —                     | —                   |
| `permissionRequest`   | `PermissionRequest`   | —                    | —                     | `PermissionRequest` |
| `notification`        | `Notification`        | —                    | —                     | —                   |
| `setup`               | `Setup`               | —                    | —                     | —                   |
| `userPromptExpansion` | `UserPromptExpansion` | —                    | —                     | —                   |
| `permissionDenied`    | `PermissionDenied`    | —                    | —                     | —                   |
| `postToolBatch`       | `PostToolBatch`       | —                    | —                     | —                   |
| `stopFailure`         | `StopFailure`         | —                    | —                     | —                   |
| `teammateIdle`        | `TeammateIdle`        | —                    | —                     | —                   |
| `instructionsLoaded`  | `InstructionsLoaded`  | —                    | —                     | —                   |
| `configChange`        | `ConfigChange`        | —                    | —                     | —                   |
| `cwdChanged`          | `CwdChanged`          | —                    | —                     | —                   |
| `fileChanged`         | `FileChanged`         | —                    | —                     | —                   |
| `worktreeCreate`      | `WorktreeCreate`      | —                    | —                     | —                   |
| `worktreeRemove`      | `WorktreeRemove`      | —                    | —                     | —                   |
| `postCompact`         | `PostCompact`         | —                    | —                     | —                   |
| `elicitation`         | `Elicitation`         | —                    | —                     | —                   |
| `elicitationResult`   | `ElicitationResult`   | —                    | —                     | —                   |
| `taskCreated`         | `TaskCreated`         | —                    | —                     | —                   |
| `taskCompleted`       | `TaskCompleted`       | —                    | —                     | —                   |
| `errorOccurred`       | —                     | —                    | `errorOccurred`       | —                   |

**Codex:** supports only `type: "command"` handlers — other handler types (`http`, `mcp_tool`, `prompt`, `agent`) drop with a warning. Codex `command` is a single shell string; uac flattens any `args` array into a shell-escaped string when emitting for Codex.

Cursor-specific events (`workspaceOpen`, `beforeShellExecution`, `afterFileEdit`, etc.) can be used directly — they pass through to Cursor and are dropped for other targets. For `subagentStart`/`subagentStop` on Cursor, the matcher filters on subagent type: `generalPurpose`, `explore`, or `shell`.

## Per-Target Overrides in Hooks

Hook handler fields (`command`, `matcher`, `timeout`, `description`) support per-target values:

```json
{
  "command": {
    "claude": ".hooks/claude-check.sh",
    "copilot": ".hooks/copilot-check.sh",
    "default": ".hooks/check.sh"
  }
}
```

If `command` resolves to `undefined` for a target, the entire handler is skipped for that target.

## Duplicate Handlers

Every `.json` file in `hooks/` merges into one output, so a handler declared in two files would otherwise run twice. Handlers have no name to key on, so uac compares the **resolved** handler: when two files produce an identical handler for a target, only the first one is emitted. Comparing after per-target resolution means `{ "command": { "claude": "x" } }` and `{ "command": "x" }` collapse into one handler for Claude while staying separate everywhere else.

Two handlers that differ in any field — a different `matcher`, `timeout`, or command — are both kept. That's a merge, not a collision.

## Matcher patterns

`matcher` is a regex that filters when a hook fires. What it matches depends on the event (Claude Code):

| Event                                                                  | Matches on          | Example values                                     |
| ---------------------------------------------------------------------- | ------------------- | -------------------------------------------------- |
| `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest` | tool name           | `Bash`, `Edit\|Write`, `mcp__.*`                   |
| `SessionStart`                                                         | how session started | `startup`, `resume`, `clear`, `compact`            |
| `SessionEnd`                                                           | why session ended   | `clear`, `logout`, `prompt_input_exit`, `other`    |
| `Notification`                                                         | notification type   | `permission_prompt`, `idle_prompt`, `auth_success` |
| `SubagentStart`, `SubagentStop`                                        | agent type          | `Bash`, `Explore`, `Plan`, or custom agent names   |
| `PreCompact`                                                           | trigger type        | `manual`, `auto`                                   |

`UserPromptSubmit` and `Stop` don't support matchers — they always fire on every occurrence.

Tool names differ per target — see [tools.md](tools.md). Cursor's tool names (usable in hook `matcher` patterns): `Shell`, `Read`, `Write`, `Grep`, `Delete`, `Task`, `TabRead`, `TabWrite`; MCP tools use `MCP:<tool_name>`. Codex MCP tool matchers use regex form `mcp__server__.*`.
