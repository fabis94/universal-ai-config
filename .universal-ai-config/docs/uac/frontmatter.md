# Skill and agent frontmatter reference

Every frontmatter field uac understands for **skills** and **agents**, with the targets that use it. Fields a target doesn't support are dropped for that target. Any field can take per-target values (`{ claude: ..., copilot: ..., default: ... }`). The instructions field table lives in the template guide itself.

## Skills

| Field                   | Description                                                                                                                                                           |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                  | Skill identifier (becomes the slash command name)                                                                                                                     |
| `description`           | When to use this skill                                                                                                                                                |
| `version`               | Semver-style version string (Codex SKILL.md spec; harmless passthrough on others)                                                                                     |
| `author`                | Skill author attribution (Codex SKILL.md spec; harmless passthrough on others)                                                                                        |
| `disableAutoInvocation` | If true, only invocable manually via slash command. **Codex:** auto-maps to `policy.allow_implicit_invocation: false` in `agents/openai.yaml`                         |
| `userInvocable`         | If false, only the AI can trigger it (Claude/Copilot)                                                                                                                 |
| `allowedTools`          | Restrict which tools the skill can use (Claude only) — see [tools.md](tools.md)                                                                                       |
| `model`                 | Override the AI model used (Claude only)                                                                                                                              |
| `subagentType`          | Run in a specific subagent type (Claude only)                                                                                                                         |
| `forkContext`           | If true, run in an isolated context (Claude/Copilot)                                                                                                                  |
| `argumentHint`          | Hint for expected arguments (Claude/Copilot)                                                                                                                          |
| `whenToUse`             | Additional trigger phrases or example requests appended to `description` (Claude only)                                                                                |
| `arguments`             | Named positional arguments for `$name` substitution; space-separated string or array (Claude only)                                                                    |
| `effort`                | Effort level when active: `low`, `medium`, `high`, `xhigh`, `max` (Claude only)                                                                                       |
| `skillPaths`            | Glob patterns that limit when this skill auto-loads; activates only when matching files are in scope (Claude only)                                                    |
| `skillShell`            | Shell for `` !`command` `` blocks in this skill: `bash` or `powershell` (Claude only)                                                                                 |
| `license`               | License info (Copilot/Cursor/Codex)                                                                                                                                   |
| `compatibility`         | Compatibility info (Copilot/Cursor/Codex)                                                                                                                             |
| `metadata`              | Extra metadata object (Copilot/Cursor/Codex)                                                                                                                          |
| `hooks`                 | Inline hook definitions for this skill (Claude only)                                                                                                                  |
| `codex`                 | Nested Codex-only UI/policy/dependency metadata that drives the `agents/openai.yaml` sidecar emission — see [Codex skill metadata](#codex-skill-metadata-codex) below |

### Codex skill metadata (`codex.*`)

Codex skills support a sidecar `agents/openai.yaml` file with UI metadata, invocation policy, and tool dependencies. uac emits this sidecar automatically when any `codex.*` key (or `disableAutoInvocation`) is set on a skill template.

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

| Field                   | Description                                                                                                                                                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                  | Agent identifier                                                                                                                                                                                               |
| `description`           | When to delegate to this agent                                                                                                                                                                                 |
| `model`                 | AI model to use; Copilot also accepts an array of prioritized models. **Codex emits a warning** if a value starts with `claude-` without a per-target override — Codex models are `gpt-5.4`, `gpt-4.1`, etc.   |
| `tools`                 | Tools this agent can use — see [tools.md](tools.md). **Codex: dropped with warning** (Codex uses per-MCP `enabledTools`, not agent-level)                                                                      |
| `disallowedTools`       | Tools to deny (Claude only) — see [tools.md](tools.md)                                                                                                                                                         |
| `permissionMode`        | Permission level (Claude only). **Codex: dropped with warning** — use `sandboxMode` per-target override                                                                                                        |
| `skills`                | Skills to preload (Claude and Codex — emits `skills.config` in the agent TOML)                                                                                                                                 |
| `hooks`                 | Inline hook definitions for this agent (Claude/Copilot — Copilot requires `chat.useCustomAgentHooks` setting)                                                                                                  |
| `memory`                | Persistent memory scope (Claude only)                                                                                                                                                                          |
| `mcpServers`            | MCP servers available to this agent (Claude, Copilot, Codex)                                                                                                                                                   |
| `maxTurns`              | Maximum agentic turns before the subagent stops (Claude only)                                                                                                                                                  |
| `background`            | If true, always run as a background task (Claude only)                                                                                                                                                         |
| `effort`                | Effort level when active: `low`, `medium`, `high`, `xhigh`, `max` (Claude). **Codex:** auto-maps to `model_reasoning_effort` when value is in `{minimal, low, medium, high, xhigh}` — `max` drops with warning |
| `isolation`             | Set to `worktree` to run in a temporary git worktree (Claude only)                                                                                                                                             |
| `color`                 | Display color: `red`, `blue`, `green`, `yellow`, `purple`, `orange`, `pink`, `cyan` (Claude only)                                                                                                              |
| `initialPrompt`         | Auto-submitted as first user turn when this agent runs as the main session agent (Claude only)                                                                                                                 |
| `target`                | Target description (Copilot only)                                                                                                                                                                              |
| `handoffs`              | Handoff targets (Copilot only)                                                                                                                                                                                 |
| `subAgents`             | Subagent names accessible within this agent; `"*"` for all or `[]` for none (Copilot only)                                                                                                                     |
| `argumentHint`          | Guidance text for user interaction (Copilot only)                                                                                                                                                              |
| `userInvocable`         | If false, hides agent from the agents dropdown (Copilot only — default: true)                                                                                                                                  |
| `disableAutoInvocation` | If true, prevents this agent from being invoked by other agents as a subagent (Copilot only)                                                                                                                   |
| `nicknameCandidates`    | Display nickname pool for spawned worker copies (Codex only)                                                                                                                                                   |
| `sandboxMode`           | Sandbox mode: `read-only`, `workspace-write`, `danger-full-access` (Codex only)                                                                                                                                |
