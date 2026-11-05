# Frontmatter reference

Every frontmatter field uac understands for **instructions**, **skills** and **agents**, with the targets that use it. Fields a target doesn't support are dropped for that target (with a warning where the target would otherwise lose something). Any field can take per-target values (`{ claude: ..., copilot: ..., default: ... }`, see [templates.md](templates.md#per-target-values)).

## Instructions

Output: `.claude/rules/<name>.md`, `.github/instructions/<name>.instructions.md` (`.github/copilot-instructions.md` when `alwaysApply`), `.cursor/rules/<name>.mdc`, or the AGENTS.md files whenever those are generated ([config.md](config.md#agentsmd-output)).

| Field          | Targets | Description                                                                                                                    |
| -------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `description`  | All     | What the instruction covers                                                                                                    |
| `globs`        | All     | File patterns to scope this instruction to (string or array)                                                                   |
| `alwaysApply`  | All     | If true, applies to all conversations regardless of files                                                                      |
| `name`         | Copilot | Display name shown in the UI (defaults to the file name)                                                                       |
| `excludeAgent` | Copilot | Exclude from specific agents: `"code-review"` or `"cloud-agent"` (GitHub Copilot cloud only, not VS Code Copilot Chat locally) |

`alwaysApply` instructions are loaded into **every** session on every target (they go in the root `AGENTS.md` when AGENTS.md is generated), so keep them short and move detail into [reference docs](templates.md#reference-docs). While AGENTS.md is generated, `globs` only place an instruction in an AGENTS.md file (with a one-line scope note where needed), and `name` and `excludeAgent` have no effect.

## Skills

Output: `.claude/skills/<name>/SKILL.md`, `.github/skills/…`, `.cursor/skills/…`, and `.agents/skills/<name>/SKILL.md` for Codex. Every skill is checked against the [Agent Skills spec](https://agentskills.io/specification) at generate time: `name` 1–64 lowercase letters, digits and single hyphens, matching the skill's folder; a non-empty `description` of at most 1024 characters; `compatibility` of at most 500; `metadata` values that are strings.

| Field                   | Targets                        | Description                                                                                                                                               |
| ----------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                  | All                            | Skill identifier (becomes the slash command name); must match the skill's folder                                                                          |
| `description`           | All                            | When to use this skill. Required — Codex and Cursor break without it                                                                                      |
| `disableAutoInvocation` | Claude, Copilot, Cursor, Codex | If true, only invocable manually. **Codex:** becomes `policy.allow_implicit_invocation: false` in `agents/openai.yaml`                                    |
| `userInvocable`         | Claude, Copilot, Cursor        | Boolean. `false` hides the skill from the `/` menu so only the AI triggers it                                                                             |
| `allowedTools`          | Claude, Copilot                | Tools pre-approved (no permission prompt) while the skill runs — not a restriction; see [tools.md](tools.md)                                              |
| `disallowedTools`       | Claude                         | Tools removed from the model while the skill is active (`disallowed-tools`)                                                                               |
| `model`                 | Claude                         | Override the model (same values as `/model`) — see [models.md](models.md)                                                                                 |
| `subagentType`          | Claude                         | Run in a specific subagent type                                                                                                                           |
| `forkContext`           | Claude, Copilot                | If true, run in an isolated subagent (`context: fork`). Claude runs forked skills in the background, with a narrower tool set, unless `background: false` |
| `background`            | Claude                         | With `forkContext`: `false` waits for the forked subagent's result in the invoking turn (default `true`)                                                  |
| `argumentHint`          | Claude, Copilot                | Hint for expected arguments                                                                                                                               |
| `whenToUse`             | Claude                         | Extra trigger phrases or example requests appended to `description`                                                                                       |
| `arguments`             | Claude                         | Named positional arguments for `$name` substitution; space-separated string or array                                                                      |
| `effort`                | Claude                         | Effort level when active: `low`, `medium`, `high`, `xhigh`, `max`                                                                                         |
| `skillPaths`            | Claude, Cursor                 | Glob patterns that scope the skill to matching files (`paths`)                                                                                            |
| `skillShell`            | Claude                         | Shell for `` !`command` `` blocks: `bash` or `powershell`                                                                                                 |
| `icon`                  | Cursor                         | Icon on the skill's Custom Mode badge                                                                                                                     |
| `color`                 | Cursor                         | Badge color: `default`, `green`, `cyan`, `blue`, `purple`, `magenta`, `orange`, `yellow`, `red`, `brand`                                                  |
| `license`               | All                            | License name or bundled license file (Agent Skills spec; accepted but unused by Claude, undocumented by Cursor)                                           |
| `compatibility`         | All                            | Environment requirements (Agent Skills spec)                                                                                                              |
| `metadata`              | All                            | Map of string keys to string values (Agent Skills spec)                                                                                                   |
| `version`               | Codex                          | Written as `metadata.version` (not a spec field)                                                                                                          |
| `author`                | Codex                          | Written as `metadata.author` (not a spec field)                                                                                                           |
| `hooks`                 | Claude                         | Inline hook definitions for this skill                                                                                                                    |
| `codex`                 | Codex                          | Codex-only UI, policy and dependency metadata for the `agents/openai.yaml` sidecar — see [below](#codex-skill-metadata-codex)                             |

Codex reads only `name` and `description` from SKILL.md; its behavior settings live in `agents/openai.yaml`.

### Codex skill metadata (`codex.*`)

Codex skills support a sidecar `agents/openai.yaml` file with UI metadata, invocation policy, and tool dependencies. uac emits it when any `codex.interface` / `codex.dependencies` key (or `disableAutoInvocation`) is set on a skill template.

| Universal frontmatter path                                          | `agents/openai.yaml` key      | Description                              |
| ------------------------------------------------------------------- | ----------------------------- | ---------------------------------------- |
| `codex.interface.displayName`                                       | `interface.display_name`      | User-facing skill name                   |
| `codex.interface.shortDescription`                                  | `interface.short_description` | Short UI description                     |
| `codex.interface.iconSmall`                                         | `interface.icon_small`        | Path to small icon (SVG)                 |
| `codex.interface.iconLarge`                                         | `interface.icon_large`        | Path to large icon (PNG)                 |
| `codex.interface.brandColor`                                        | `interface.brand_color`       | Hex color for UI theming                 |
| `codex.interface.defaultPrompt`                                     | `interface.default_prompt`    | Pre-populated prompt when skill selected |
| `codex.dependencies.tools[]`                                        | `dependencies.tools[]`        | MCP dependency declarations              |
| `codex.dependencies.tools[].{type,value,description,transport,url}` | (same, snake_case)            | Per-dependency fields                    |

## Agents

Output: `.claude/agents/<name>.md`, `.github/agents/<name>.agent.md`, `.cursor/agents/<name>.md`, `.codex/agents/<name>.toml`.

Claude and Cursor agent files use **line-safe frontmatter**: one plain `key: value` per line, newlines in `description` folded to spaces, and `tools` / `disallowedTools` written as `A, B`. Cursor reads agent files (its own and `.claude/agents/`) by splitting each line at the first `:`, so quoted YAML would reach it with the quotes. Values YAML can't hold unquoted (e.g. a `description` containing `: `) stay quoted.

| Field                       | Targets                | Description                                                                                                                                                           |
| --------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                      | All                    | Agent identifier                                                                                                                                                      |
| `description`               | All                    | When to delegate to this agent. **Codex:** required — an agent without one (or with an empty body) isn't generated                                                    |
| `model`                     | All                    | Model to use — see [models.md](models.md). Copilot also accepts an array. **Codex** warns about a `claude-…` value without a per-target override                      |
| `tools`                     | Claude, Copilot        | Tools this agent can use — see [tools.md](tools.md). **Codex:** dropped with a warning (no agent-level tool list)                                                     |
| `disallowedTools`           | Claude                 | Tools to deny — see [tools.md](tools.md). **Codex:** dropped with a warning                                                                                           |
| `permissionMode`            | Claude                 | `default` (alias `manual`), `acceptEdits`, `auto`, `dontAsk`, `bypassPermissions`, `plan` — see the note below. **Codex:** dropped with a warning                     |
| `skills`                    | Claude, Copilot        | Skills to preload. **Codex:** dropped with a warning (agent files can only disable skills)                                                                            |
| `hooks`                     | Claude, Copilot        | Inline hook definitions for this agent. Copilot: Copilot harness and CLI (not the cloud agent); VS Code's Local harness needs `chat.useHooks` and a trusted workspace |
| `memory`                    | Claude                 | Persistent memory scope                                                                                                                                               |
| `mcpServers`                | Claude, Copilot        | MCP servers available to this agent (`mcp-servers` for Copilot). **Codex:** dropped with a warning (agents inherit the session's servers)                             |
| `maxTurns`                  | Claude                 | Maximum agentic turns before the subagent stops                                                                                                                       |
| `background`                | Claude, Cursor         | Keep the agent in the background even when asked to wait (Claude subagents start in the background by default). Cursor: `is_background`                               |
| `readonly`                  | Cursor                 | Run with restricted write permissions                                                                                                                                 |
| `effort`                    | Claude, Copilot, Codex | `low`, `medium`, `high`, `xhigh`, `max`. Copilot: `reasoning-effort`. **Codex:** `model_reasoning_effort` (also accepts `ultra`, `none`, `minimal`)                   |
| `isolation`                 | Claude                 | `worktree` runs the agent in a temporary git worktree                                                                                                                 |
| `color`                     | Claude                 | Display color: `red`, `blue`, `green`, `yellow`, `purple`, `orange`, `pink`, `cyan`                                                                                   |
| `initialPrompt`             | Claude                 | Auto-submitted as the first user turn when the agent runs as the main session agent                                                                                   |
| `autoCompactWindow`         | Claude                 | Lower auto-compact window, in tokens (`100000`–`1000000`)                                                                                                             |
| `omitClaudeMd`              | Claude                 | Start the subagent without the user, project and local CLAUDE.md files                                                                                                |
| `experimental`              | Claude                 | Map of experimental options, e.g. `{ cacheTtl: "1h" }` (unstable)                                                                                                     |
| `target`                    | Copilot                | Editor schema: `vscode` (Local) or `github-copilot` (Copilot). On GitHub it also limits the environment. Other values are dropped with a warning                      |
| `modelPolicy`               | Copilot                | `preferred` (default) or `required` — whether users may pick other models (`model-policy`)                                                                            |
| `includeCustomInstructions` | Copilot                | Also load the repository's custom instructions (`include-custom-instructions`)                                                                                        |
| `deferredToolLoading`       | Copilot                | Load tools on demand (`deferred-tool-loading`)                                                                                                                        |
| `strictToolsList`           | Copilot                | Offer only the listed tools (`strict-tools-list`)                                                                                                                     |
| `github`                    | Copilot                | GitHub settings block (e.g. permissions)                                                                                                                              |
| `metadata`                  | Copilot                | Name/value string pairs (not used by VS Code)                                                                                                                         |
| `userInvocable`             | Copilot                | Boolean. `false` hides the agent from the agents dropdown (default `true`)                                                                                            |
| `disableAutoInvocation`     | Copilot                | If true, other agents can't invoke this one as a subagent                                                                                                             |
| `nicknameCandidates`        | Codex                  | Display nickname pool for spawned worker copies (undocumented upstream; may be removed)                                                                               |
| `codex`                     | Codex                  | Codex-only agent keys — see [below](#codex-agent-settings-codex)                                                                                                      |

Copilot agent keys are written in kebab-case, the form Copilot CLI parses.

**Claude `permissionMode`:** Claude Code ignores an agent's `permissionMode` when the main session is in `bypassPermissions`, `acceptEdits` or auto mode — and interactive sessions now start in auto mode unless the user configures another default. In practice the field applies only when the session is in `default` or `dontAsk`. Prefer `default` over its alias `manual`.

### Dropped fields

| Field                  | Target  | Why                                                                                                                           |
| ---------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `handoffs`             | Copilot | Only VS Code's Local harness accepts it; the default Copilot harness rejects agents that set it. Warns                        |
| `subAgents` (`agents`) | Copilot | Same — Local harness only. Copilot delegates with its built-in `task` tool. Warns                                             |
| `argumentHint`         | Copilot | Same — Local harness only (still emitted for Copilot **skills**). Warns                                                       |
| `sandboxMode`          | Codex   | Codex ignores `sandbox_mode` in agent files since 0.149 — agents inherit the session's sandbox. Warns                         |
| `permissionMode`       | Codex   | Agents inherit the session's sandbox and approvals; set `sandbox_mode` / `default_permissions` in `.codex/config.toml`. Warns |
| `skills`, `mcpServers` | Codex   | Agent files can't preload skills or change MCP servers; Codex drops the whole agent over an unknown key. Warns                |

### Codex agent settings (`codex.*`)

Written snake_cased into `.codex/agents/<name>.toml`:

| Universal frontmatter path         | TOML key                      | Description                                             |
| ---------------------------------- | ----------------------------- | ------------------------------------------------------- |
| `codex.modelReasoningSummary`      | `model_reasoning_summary`     | Reasoning summary detail                                |
| `codex.modelVerbosity`             | `model_verbosity`             | Response verbosity                                      |
| `codex.personality`                | `personality`                 | Agent personality                                       |
| `codex.serviceTier`                | `service_tier`                | Service tier                                            |
| `codex.skills.bundled.enabled`     | `skills.bundled.enabled`      | `false` turns off Codex's bundled skills for this agent |
| `codex.skills.includeInstructions` | `skills.include_instructions` | `false` omits the automatic skills instructions block   |
