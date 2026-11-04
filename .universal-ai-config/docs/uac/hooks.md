# Hooks reference

Hook templates live in `.universal-ai-config/hooks/*.json`. Every file merges into one output per target. This page has the full handler field list, the handler types and events each target runs, matcher patterns, and per-target caveats.

## Structure

Hooks use JSON format with this structure:

```json
{
  "hooks": {
    "eventName": [{ "command": "script.sh", "matcher": "ToolName", "timeout": 30 }]
  }
}
```

## Output files

| Target  | File                       | Notes                                                                                                                             |
| ------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Claude  | `.claude/settings.json`    | Only the `hooks` key is uac's; your other settings are kept                                                                       |
| Copilot | `.github/hooks/hooks.json` | Not generated when claude is also in the run — Copilot reads Claude's hooks instead (see [below](#claude-and-copilot-in-one-run)) |
| Cursor  | `.cursor/hooks.json`       |                                                                                                                                   |
| Codex   | `.codex/hooks.json`        |                                                                                                                                   |

## Handler Fields

| Field                    | Required | Targets               | Description                                                                                                                                                |
| ------------------------ | -------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`                   | No       | All                   | Handler type: `command` (default), `http`, `mcp_tool`, `prompt`, `agent` — see [Handler types](#handler-types)                                             |
| `command`                | Yes\*    | All                   | Shell command or script path (`command` type)                                                                                                              |
| `args`                   | No       | All                   | Argument list. Claude spawns `command` with these args directly; Copilot, Cursor and Codex take one command string, so uac appends the args shell-quoted   |
| `url`                    | Yes\*    | Claude/Copilot        | Request URL (`http` type)                                                                                                                                  |
| `headers`                | No       | Claude/Copilot        | HTTP headers (`http` type)                                                                                                                                 |
| `allowedEnvVars`         | No       | Claude/Copilot        | Env vars forwarded to the HTTP request (`http` type)                                                                                                       |
| `server`                 | Yes\*    | Claude/Codex          | MCP server name (`mcp_tool` type)                                                                                                                          |
| `tool`                   | Yes\*    | Claude/Codex          | MCP tool name (`mcp_tool` type)                                                                                                                            |
| `input`                  | No       | Claude/Codex          | MCP tool input (`mcp_tool` type). Codex fills `${field.nested}` placeholders from the event                                                                |
| `prompt`                 | Yes\*    | Claude/Copilot/Cursor | Prompt text (`prompt` or `agent` type)                                                                                                                     |
| `model`                  | No       | Claude/Cursor         | Model name (`prompt` or `agent` type)                                                                                                                      |
| `async`                  | No       | Claude/Codex          | Run in the background without blocking. Background hooks can't block or rewrite the action                                                                 |
| `asyncRewake`            | No       | Claude                | Run in the background and wake Claude on exit code 2 (implies `async`)                                                                                     |
| `shell`                  | No       | Claude                | Shell to use: `bash` (default) or `powershell`                                                                                                             |
| `if`                     | No       | Claude                | One permission rule that filters when the hook runs (e.g. `"Bash(git *)"`). Only evaluated on tool events — on any other event a hook with `if` never runs |
| `statusMessage`          | No       | Claude/Codex          | Custom spinner message shown while the hook runs                                                                                                           |
| `once`                   | No       | Claude                | Run once per session, then remove (skill frontmatter hooks only)                                                                                           |
| `cwd`                    | No       | Copilot               | Working directory for the command                                                                                                                          |
| `env`                    | No       | Copilot               | Environment variables for the command                                                                                                                      |
| `commandWindows`         | No       | Codex                 | Windows-only command override                                                                                                                              |
| `additionalContextLimit` | No       | Codex                 | How much `additionalContext` the hook may send to the model before Codex saves the full text to disk                                                       |
| `matcher`                | No       | All                   | Filters when the hook fires — see [Matcher patterns](#matcher-patterns)                                                                                    |
| `timeout`                | No       | All                   | Timeout in seconds (written as `timeoutSec` for Copilot)                                                                                                   |
| `description`            | No       | Claude                | Human-readable description                                                                                                                                 |
| `loopLimit`              | No       | Cursor                | Max automatic follow-ups (`null` = unlimited, default: 5)                                                                                                  |
| `failClosed`             | No       | Cursor/Claude         | Block the action when the hook fails. Cursor: `failClosed`; Claude: `onFailure: "block"` (`false` → `"continue"`) on `command` and `http` handlers         |

\*Required for that handler type.

## Handler types

Each target runs only some handler types. A handler of a type the target can't run is dropped for that target with a warning.

| Target  | Handler types                                                            |
| ------- | ------------------------------------------------------------------------ |
| Claude  | `command`, `http`, `mcp_tool`, `prompt`, `agent` (experimental)          |
| Copilot | `command`, `http`, `prompt` (on `sessionStart` only)                     |
| Cursor  | `command`, `prompt`                                                      |
| Codex   | `command`, `mcp_tool` (Codex parses `prompt` and `agent` but skips them) |

A handler that is **missing its required field** after per-target resolution (`command`, `url`, `server` + `tool`, or `prompt`) is dropped silently. That is how a handler opts a target out — see [Per-Target Overrides](#per-target-overrides-in-hooks).

## Universal Event Names

Use camelCase event names. The CLI maps them to each target's format and silently drops events a target doesn't have.

| Universal               | Claude                | Cursor               | Copilot                 | Codex               |
| ----------------------- | --------------------- | -------------------- | ----------------------- | ------------------- |
| `sessionStart`          | `SessionStart`        | `sessionStart`       | `sessionStart`          | `SessionStart`      |
| `sessionEnd`            | `SessionEnd`          | `sessionEnd`         | `sessionEnd`            | `SessionEnd`        |
| `userPromptSubmit`      | `UserPromptSubmit`    | `beforeSubmitPrompt` | `userPromptSubmitted`   | `UserPromptSubmit`  |
| `preToolUse`            | `PreToolUse`          | `preToolUse`         | `preToolUse`            | `PreToolUse`        |
| `postToolUse`           | `PostToolUse`         | `postToolUse`        | `postToolUse`           | `PostToolUse`       |
| `postToolUseFailure`    | `PostToolUseFailure`  | `postToolUseFailure` | `postToolUseFailure`    | —                   |
| `stop`                  | `Stop`                | `stop`               | `agentStop`             | `Stop`              |
| `subagentStart`         | `SubagentStart`       | `subagentStart`      | `subagentStart`         | `SubagentStart`     |
| `subagentStop`          | `SubagentStop`        | `subagentStop`       | `subagentStop`          | `SubagentStop`      |
| `preCompact`            | `PreCompact`          | `preCompact`         | `preCompact`            | `PreCompact`        |
| `postCompact`           | `PostCompact`         | —                    | —                       | `PostCompact`       |
| `permissionRequest`     | `PermissionRequest`   | —                    | `permissionRequest`     | `PermissionRequest` |
| `notification`          | `Notification`        | —                    | `notification`          | —                   |
| `setup`                 | `Setup`               | —                    | —                       | —                   |
| `userPromptExpansion`   | `UserPromptExpansion` | —                    | —                       | —                   |
| `permissionDenied`      | `PermissionDenied`    | —                    | —                       | —                   |
| `postToolBatch`         | `PostToolBatch`       | —                    | —                       | —                   |
| `stopFailure`           | `StopFailure`         | —                    | —                       | —                   |
| `teammateIdle`          | `TeammateIdle`        | —                    | —                       | —                   |
| `instructionsLoaded`    | `InstructionsLoaded`  | —                    | —                       | —                   |
| `configChange`          | `ConfigChange`        | —                    | —                       | —                   |
| `cwdChanged`            | `CwdChanged`          | —                    | —                       | —                   |
| `fileChanged`           | `FileChanged`         | —                    | —                       | —                   |
| `worktreeCreate`        | `WorktreeCreate`      | —                    | —                       | —                   |
| `worktreeRemove`        | `WorktreeRemove`      | —                    | —                       | —                   |
| `elicitation`           | `Elicitation`         | —                    | —                       | —                   |
| `elicitationResult`     | `ElicitationResult`   | —                    | —                       | —                   |
| `taskCreated`           | `TaskCreated`         | —                    | —                       | —                   |
| `taskCompleted`         | `TaskCompleted`       | —                    | —                       | —                   |
| `messageDisplay`        | `MessageDisplay`      | —                    | —                       | —                   |
| `directoryAdded`        | `DirectoryAdded`      | —                    | —                       | —                   |
| `preModelSwitch`        | `PreModelSwitch`      | —                    | —                       | —                   |
| `postModelSwitch`       | `PostModelSwitch`     | —                    | —                       | —                   |
| `errorOccurred`         | —                     | —                    | `errorOccurred`         | —                   |
| `userPromptTransformed` | —                     | —                    | `userPromptTransformed` | —                   |
| `preMcpToolCall`        | —                     | —                    | `preMcpToolCall`        | —                   |
| `postResult`            | —                     | —                    | `postResult`            | —                   |
| `prePRDescription`      | —                     | —                    | `prePRDescription`      | —                   |
| `preModelRequest`       | —                     | —                    | —                       | `PreModelRequest`   |
| `postModelRequest`      | —                     | —                    | —                       | `PostModelRequest`  |
| `interrupt`             | —                     | —                    | —                       | `Interrupt`         |

Copilot's `agentStop` fires when the main agent finishes a turn (and when each subagent finishes) — it is not `sessionEnd`. `permissionRequest` and `notification` don't fire in the GitHub cloud agent.

Cursor-specific events (`workspaceOpen`, `beforeShellExecution`, `afterShellExecution`, `beforeMCPExecution`, `afterMCPExecution`, `beforeReadFile`, `afterFileEdit`, `afterAgentResponse`, `afterAgentThought`, `beforeTabFileRead`, `afterTabFileEdit`) can be used directly — they pass through to Cursor and are dropped for other targets.

## Per-Target Overrides in Hooks

Hook handler fields support per-target values:

```json
{
  "command": {
    "claude": ".hooks/claude-check.sh",
    "copilot": ".hooks/copilot-check.sh",
    "default": ".hooks/check.sh"
  }
}
```

If a required field (`command` for a command handler) resolves to nothing for a target, the handler is skipped for that target.

## Duplicate Handlers

Every `.json` file in `hooks/` merges into one output, so a handler declared in two files would otherwise run twice. Handlers have no name to key on, so uac compares the **resolved** handler: when two files produce an identical handler for a target, only the first one is emitted. Comparing after per-target resolution means `{ "command": { "claude": "x" } }` and `{ "command": "x" }` collapse into one handler for Claude while staying separate everywhere else.

Two handlers that differ in any field — a different `matcher`, `timeout`, or command — are both kept. That's a merge, not a collision.

Handlers keep the order they have in the templates (files alphabetically, then declaration order). Codex relies on that: see [Codex](#codex).

## Script paths

Hooks run from the session's working folder, which isn't always the project root (Codex in a subfolder, a monorepo package). Prefer commands that don't depend on it:

- Claude (and Cursor, which sets the same variable): `"$CLAUDE_PROJECT_DIR/scripts/check.sh"`
- Any target: `"$(git rev-parse --show-toplevel)/scripts/check.sh"`

## Matcher patterns

What `matcher` matches depends on the event. In Claude Code:

| Event                                                                                      | Matches on          | Example values                                            |
| ------------------------------------------------------------------------------------------ | ------------------- | --------------------------------------------------------- |
| `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `PermissionDenied` | tool name           | `Bash`, `Edit\|Write`, `mcp__github__.*`                  |
| `SessionStart`                                                                             | how session started | `startup`, `resume`, `clear`, `compact`, `fork`           |
| `SessionEnd`                                                                               | why session ended   | `clear`, `logout`, `prompt_input_exit`, `resume`, `other` |
| `Notification`                                                                             | notification type   | `permission_prompt`, `idle_prompt`, `auth_success`        |
| `SubagentStart`, `SubagentStop`                                                            | agent type          | `general-purpose`, `Explore`, `Plan`, custom agent names  |
| `PreCompact`, `PostCompact`                                                                | trigger type        | `manual`, `auto`                                          |
| `Setup`                                                                                    | setup kind          | `init`, `maintenance`                                     |
| `DirectoryAdded`                                                                           | how it was added    | `slash_command`, `register_repo_root`                     |
| `PreModelSwitch`, `PostModelSwitch`                                                        | canonical model     | model names                                               |

`UserPromptSubmit`, `PostToolBatch`, `Stop`, `TeammateIdle`, `TaskCreated`, `TaskCompleted`, `WorktreeCreate`, `WorktreeRemove`, `MessageDisplay` and `CwdChanged` don't support matchers — they fire on every occurrence.

Matcher syntax per target:

- **Claude:** a matcher made only of letters, digits, `_`, `-`, spaces, `,` and `|` is an exact name or a `|`/`,` list of exact names; anything else is an unanchored JavaScript regex. So `mcp__my-server` matches exactly that name — use `mcp__my-server__.*` for all of a server's tools.
- **Cursor:** an unanchored regex on Cursor's tool names: `Shell` (not `Bash`), `Read`, `Write`, `Grep`, `Delete`, `Task`, `Fetch`, `MCP:<tool>`. Being unanchored, `Read` also matches `ReadLints`.
- **Copilot:** compiled as `^(?:PATTERN)$` against Copilot's runtime names: `bash`, `powershell`, `view`, `create`, `edit`, `grep`, `glob`, `task`, `web_fetch`, `ask_user`, and `serverName-toolName` for MCP tools. Matchers apply to `preToolUse`, `postToolUse`, `permissionRequest`, `preCompact`, `subagentStart` and `notification`.
- **Codex:** matches Claude-style tool names (`Bash`, `mcp__server__.*`). `SessionEnd` matches the end reason, `SubagentStart`/`SubagentStop` the subagent type, `PreCompact`/`PostCompact` the trigger; `PreModelRequest`, `PostModelRequest` and `Interrupt` ignore matchers.

Tool names per target: [tools.md](tools.md).

## Per-target caveats

### Claude

- Claude reads hooks only from the launch folder's `.claude/settings.json` (`settings.local.json` also from the git root).
- `if` only works on tool events (`PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `PermissionDenied`).
- `onFailure` has no effect on `Stop`, `SubagentStop`, `TaskCompleted`, `TeammateIdle`, or `async` hooks; on `PermissionRequest` a blocked hook denies the request.
- `agent` handlers are experimental.

### Copilot

- Repo hooks load only in trusted folders. `--yolo`, `--allow-all` and `--allow-all-tools` don't trust a folder; `--trust-folder`, the trusted-folders list or `COPILOT_ALLOW_ALL=true` do.
- The GitHub cloud agent reads only `.github/hooks/*.json`, so commit hook scripts there. uac owns only `.github/hooks/hooks.json`; `clean` leaves your scripts alone.

### Cursor

- Cursor also runs Claude's hooks from `.claude/settings.json` (always in the CLI; in the IDE behind the "Include Third-Party Plugins, Skills, and Other Configs" toggle, on by default) — but only when some Claude hook group has a `matcher` key. It imports `preToolUse`, `postToolUse`, `userPromptSubmit`, `stop`, `subagentStop`, `sessionStart`, `sessionEnd` and `preCompact`, translating `Bash` → `Shell` and `Edit` → `Write`, and skips a Claude handler whose command is identical to one in `.cursor/hooks.json`. uac keeps Cursor's own file and warns (`duplicate-hook-run`) about every Claude hook Cursor would still run: one whose command differs per target, or one meant for Claude only.
- Claude-format `Stop` hooks have no loop limit in Cursor and no `stop_hook_active` flag, so a Stop hook that keeps the agent going can loop forever. Cursor's own file keeps `loop_limit`.
- Hooks (and MCP) load from the git root; rules, skills and agents from the working folder.
- Prompt hooks don't run in cloud agents or from plugins.

### Codex

- Codex trusts each hook separately, by a hash tied to its position in the file. Any `uac generate` that changes or reorders a handler makes Codex skip that hook until it is re-trusted in `/hooks`. uac keeps handler order exactly as templated so unrelated edits don't reset trust.
- Hooks are enabled with `features.hooks` (formerly `features.codex_hooks`). A hand-written `[hooks]` table in `.codex/config.toml` merges with `.codex/hooks.json` and produces a startup warning.
- Hooks run from the session's working folder: a relative command breaks when Codex is launched in a subfolder (see [Script paths](#script-paths)).
- `mcp_tool` hooks reuse an existing MCP connection (they don't start servers), and `SessionEnd` doesn't run them.

## Claude and Copilot in one run

Copilot runs every hook in `.claude/settings.json` as well as its own, so with both targets in one run every hook would fire twice in Copilot. uac then writes only Claude's hooks and warns. Usually you only need one of these targets on a machine — set `targets` in `universal-ai-config.overrides.ts` (see [config.md](config.md#shared-outputs-and-one-target-set-per-machine)).

When Copilot runs Claude-format hooks, it:

- passes Claude's tool names and snake_case payloads (`tool_name`, `tool_input` — with Copilot's own argument names inside);
- blocks the tool on exit code 1, and ignores `decision: "block"` and `continue: false`;
- **rejects the whole file** if any handler is `prompt`, `agent` or `mcp_tool` — then Copilot runs none of these hooks. uac warns when that happens; keep such handlers out of the claude target with a per-target override, or generate copilot on its own.
