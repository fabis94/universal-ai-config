---
name: import-existing-ai-config
description: Import existing AI tool configurations (from Claude, Copilot, Cursor, or Codex) into universal-ai-config templates. Converts target-specific files into universal templates.
argumentHint: "[target: claude|copilot|cursor|codex]"
---

# Import Existing AI Config

Convert existing target-specific AI configuration files into universal-ai-config templates. The user must specify which target to import from.

## Usage

The user should specify the source target: `claude`, `copilot`, `cursor`, or `codex`.

## Import Process

### 1. Identify Source Files

Scan the target's config directory for existing configuration files:

**Claude** (`.claude/`):

- Instructions: `.claude/rules/*.md` — each file has `description` and optional `paths` frontmatter
- Skills: `.claude/skills/*/SKILL.md` — skill directories with frontmatter (`name`, `description`, `allowed-tools`, `disallowed-tools`, `model`, `context`, `agent`, `background`, `disable-model-invocation`, `user-invocable`, `argument-hint`, `when_to_use`, `arguments`, `effort`, `shell`, `hooks`, `paths`). Skill directories may also contain extra supporting files (references, examples, scripts) alongside `SKILL.md`.
- Agents: `.claude/agents/*.md` — agent files with frontmatter (`name`, `description`, `tools`, `disallowedTools`, `permissionMode`, `skills`, `hooks`, `memory`, `model`, `autoCompactWindow`, `omitClaudeMd`, `experimental`). `tools` may be a comma string (`Read, Grep`) — convert it to an array.
- Hooks: `.claude/settings.json` → `hooks` key — JSON with PascalCase event names (see the hooks doc for the full list). Handler `onFailure: "block"`/`"continue"` → universal `failClosed: true`/`false`.
- MCP: `.mcp.json` — JSON with `mcpServers` wrapper containing server configs (`type`, `command`, `args`, `env`, `url`, `headers`, `timeout`, …)
- Commands (deprecated): `.claude/commands/*.md` — single-file slash commands with optional frontmatter (`description`, `allowed-tools`, `argument-hint`, `model`). May include subdirectories for namespacing (e.g. `.claude/commands/frontend/component.md` — command name is `component`). Body may use `$ARGUMENTS` placeholder, a "!" prefix for bash execution, and `@` prefix for file references.

**Copilot** (`.github/`):

- Instructions: `.github/copilot-instructions.md` (always-apply) and `.github/instructions/*.instructions.md` (with `applyTo` frontmatter)
- Skills: `.github/skills/*/SKILL.md` — skill directories with frontmatter (`name`, `description`, `allowed-tools`, `disable-model-invocation`, `user-invocable`, `argument-hint`, `context`, `license`, `compatibility`, `metadata`). May contain extra supporting files alongside `SKILL.md`.
- Agents: `.github/agents/*.agent.md` — agent files with frontmatter (`name`, `description`, `tools`, `model`, `target`, `mcp-servers`, `skills`, `reasoning-effort`, `model-policy`, `metadata`, `include-custom-instructions`, `deferred-tool-loading`, `strict-tools-list`, `github`, `hooks`). `handoffs`, `agents` and `argument-hint` are VS Code Local-harness fields that uac no longer emits — tell the user they're dropped.
- Hooks: `.github/hooks/*.json` (uac's own file is `hooks.json`; other JSON or script files there are user hook config and scripts — leave them) — `version: 1` and Copilot's camelCase event names
- MCP: root `.mcp.json` or `.github/mcp.json` (`mcpServers` wrapper, `tools` list), or the legacy `.vscode/mcp.json` (`servers` wrapper, may include an `inputs` array)

**Cursor** (`.cursor/`):

- Instructions: `.cursor/rules/*.mdc` or `.cursor/rules/*.md` — with `description`, `globs`, `alwaysApply` frontmatter
- Skills: `.cursor/skills/*/SKILL.md` — skill directories with frontmatter (`name`, `description`, `paths`, `user-invocable`, `icon`, `color`, `license`, `compatibility`, `metadata`, `disable-model-invocation`). May contain extra supporting files alongside `SKILL.md`.
- Agents: `.cursor/agents/*.md` — agent files with frontmatter (`name`, `description`, `model`, `readonly`, `is_background`)
- Hooks: `.cursor/hooks.json` — JSON with version field and Cursor's camelCase event names, including Cursor-specific ones like `beforeShellExecution`
- MCP: `.cursor/mcp.json` — JSON with `mcpServers` wrapper; `type` may be missing (Cursor infers transport from `command` vs `url`); env vars as `${env:NAME}`

**Codex** (mix of root + `.codex/` + `.agents/`):

- Instructions: `AGENTS.md` at the project root and in nested folders (free-form markdown, no frontmatter), plus legacy `<dir>/AGENTS.override.md` files. Split into separate universal instructions: one per `## heading` block of the root file, and one per nested file with `globs: ["<dir>/**"]`. A line like "Applies to files matching `x`" under a heading is a uac scope note — turn it into `globs`. A root file that starts with a "Scoped instructions" list was written by uac's `index` variation: import each linked file as an instruction with `globs` for its folders.
- Skills: `.agents/skills/*/SKILL.md` (root-relative, the open Agent Skills standard location) — minimal frontmatter (`name`, `description`, `license`, `compatibility`, `metadata`; `metadata.version`/`metadata.author` map to universal `version`/`author`). Sidecar `agents/openai.yaml` next to SKILL.md contains UI metadata (`interface.display_name`, etc.), invocation policy (`policy.allow_implicit_invocation`), and MCP dependencies (`dependencies.tools[]`).
- Agents: `.codex/agents/*.toml` — standalone TOML files with fields `name`, `description`, `developer_instructions` (body), `model`, `model_reasoning_effort`, `model_reasoning_summary`, `model_verbosity`, `personality`, `service_tier`, `nickname_candidates`, `skills.bundled` / `skills.include_instructions`. Codex ignores `sandbox_mode` and `mcp_servers` in agent files and only uses `[[skills.config]]` to disable skills — don't import those; tell the user.
- Hooks: `.codex/hooks.json` — JSON with PascalCase event names. Handler types `command` (single shell string — args inline; `commandWindows`, `async`, `additionalContextLimit`) and `mcp_tool` (`server`, `tool`, `input`); plus `matcher`, `timeout`, `statusMessage`.
- MCP: `.codex/config.toml` `[mcp_servers.<name>]` tables — TOML format with snake_case fields (`command`, `args`, `env`, `url`, `cwd`, `env_vars`, `http_headers`, `http_headers_helper`, `bearer_token_env_var`, `env_http_headers`, `oauth`, `auth`, `environment_id`, `enabled_tools`, `tools.<tool>.*`, …; full list in the MCP doc). Other top-level keys in `config.toml` (`[model_providers.*]`, `[permissions.*]`, `personality`, etc.) are user content — preserve them; don't import as templates. Codex no longer reads `[profiles.*]` tables there (profiles are separate files).

### 2. Convert to Universal Format

For each file found, convert it to a universal-ai-config template:

**Frontmatter mapping** (target-specific → universal):

| Claude                     | Copilot                       | Cursor                     | Codex                                                                                                | Universal                                                                                                         |
| -------------------------- | ----------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `paths` (rules)            | `applyTo`                     | `globs`                    | (folder of a nested AGENTS.md)                                                                       | `globs`                                                                                                           |
| (no paths field)           | (copilot-instructions.md)     | `alwaysApply: true`        | (root AGENTS.md section)                                                                             | `alwaysApply: true`                                                                                               |
| `paths` (skills)           | —                             | `paths` (skills)           | —                                                                                                    | `skillPaths`                                                                                                      |
| `disable-model-invocation` | `disable-model-invocation`    | `disable-model-invocation` | `policy.allow_implicit_invocation: false` (inverted)                                                 | `disableAutoInvocation`                                                                                           |
| `user-invocable`           | `user-invocable`              | `user-invocable`           | —                                                                                                    | `userInvocable`                                                                                                   |
| `allowed-tools`            | `allowed-tools`               | —                          | —                                                                                                    | `allowedTools`                                                                                                    |
| `disallowed-tools`         | —                             | —                          | —                                                                                                    | `disallowedTools` (skills)                                                                                        |
| `context: fork`            | `context: fork`               | —                          | —                                                                                                    | `forkContext: true`                                                                                               |
| `agent`                    | —                             | —                          | —                                                                                                    | `subagentType`                                                                                                    |
| `argument-hint`            | `argument-hint` (skills)      | —                          | —                                                                                                    | `argumentHint`                                                                                                    |
| `when_to_use`              | —                             | —                          | —                                                                                                    | `whenToUse`                                                                                                       |
| `shell` (skills)           | —                             | —                          | —                                                                                                    | `skillShell`                                                                                                      |
| `hooks`                    | `hooks` (agents)              | —                          | —                                                                                                    | `hooks`                                                                                                           |
| (commands: manual-only)    | —                             | —                          | —                                                                                                    | `disableAutoInvocation`                                                                                           |
| —                          | `excludeAgent`                | —                          | —                                                                                                    | `excludeAgent`                                                                                                    |
| `license`                  | `license`                     | `license`                  | `license`                                                                                            | `license`                                                                                                         |
| `compatibility`            | `compatibility`               | `compatibility`            | `compatibility`                                                                                      | `compatibility`                                                                                                   |
| `metadata`                 | `metadata`                    | `metadata`                 | `metadata`                                                                                           | `metadata`                                                                                                        |
| —                          | —                             | `icon`                     | —                                                                                                    | `icon`                                                                                                            |
| `color` (agents)           | —                             | `color` (skills)           | —                                                                                                    | `color`                                                                                                           |
| —                          | `target`                      | —                          | —                                                                                                    | `target`                                                                                                          |
| `mcpServers`               | `mcp-servers`                 | —                          | —                                                                                                    | `mcpServers`                                                                                                      |
| `skills`                   | `skills`                      | —                          | —                                                                                                    | `skills`                                                                                                          |
| `effort`                   | `reasoning-effort`            | —                          | `model_reasoning_effort` (agent TOML)                                                                | `effort`                                                                                                          |
| —                          | `model-policy`                | —                          | —                                                                                                    | `modelPolicy`                                                                                                     |
| —                          | `include-custom-instructions` | —                          | —                                                                                                    | `includeCustomInstructions`                                                                                       |
| —                          | `deferred-tool-loading`       | —                          | —                                                                                                    | `deferredToolLoading`                                                                                             |
| —                          | `strict-tools-list`           | —                          | —                                                                                                    | `strictToolsList`                                                                                                 |
| —                          | `github`                      | —                          | —                                                                                                    | `github`                                                                                                          |
| `background`               | —                             | `is_background` (agents)   | —                                                                                                    | `background`                                                                                                      |
| —                          | —                             | `readonly` (agents)        | —                                                                                                    | `readonly`                                                                                                        |
| `autoCompactWindow`        | —                             | —                          | —                                                                                                    | `autoCompactWindow`                                                                                               |
| `omitClaudeMd`             | —                             | —                          | —                                                                                                    | `omitClaudeMd`                                                                                                    |
| `experimental`             | —                             | —                          | —                                                                                                    | `experimental`                                                                                                    |
| —                          | —                             | —                          | `metadata.version` (SKILL.md)                                                                        | `version`                                                                                                         |
| —                          | —                             | —                          | `metadata.author` (SKILL.md)                                                                         | `author`                                                                                                          |
| —                          | —                             | —                          | `interface.*` (openai.yaml)                                                                          | `codex.interface.*`                                                                                               |
| —                          | —                             | —                          | `dependencies.tools[]` (openai.yaml)                                                                 | `codex.dependencies.tools[]`                                                                                      |
| —                          | —                             | —                          | `nickname_candidates` (agent TOML)                                                                   | `nicknameCandidates`                                                                                              |
| —                          | —                             | —                          | `model_reasoning_summary`, `model_verbosity`, `personality`, `service_tier`, `skills.*` (agent TOML) | `codex.modelReasoningSummary`, `codex.modelVerbosity`, `codex.personality`, `codex.serviceTier`, `codex.skills.*` |

**Hook event mapping** (target-specific → universal): read the per-target event table in `<%= docPath('uac/hooks') %>` in reverse. Find the source event in its target's column and use the name in the Universal column. Cursor-specific events missing from the table (e.g. `beforeShellExecution`, `afterFileEdit`) should be preserved as-is — they pass through to Cursor and are dropped for other targets.

**Hook handler field mapping:**

| Claude                      | Copilot                                         | Cursor       | Codex                       | Universal    |
| --------------------------- | ----------------------------------------------- | ------------ | --------------------------- | ------------ |
| `command`                   | `command` (or `bash`; `powershell` is separate) | `command`    | `command`                   | `command`    |
| `timeout`                   | `timeoutSec` (or `timeout`)                     | `timeout`    | `timeout`                   | `timeout`    |
| `matcher` (in parent group) | `matcher`                                       | `matcher`    | `matcher` (in parent group) | `matcher`    |
| `onFailure: "block"`        | —                                               | `failClosed` | —                           | `failClosed` |
| —                           | `cwd`, `env`                                    | —            | —                           | `cwd`, `env` |

**MCP server conversion** (target-specific → universal):

The universal MCP format uses `mcpServers` as the wrapper key, with each server having `type`, `command`, `args`, `env`, `url`, and `headers` fields plus target-specific fields listed in `<%= docPath('uac/mcp') %>`.

| Source                                       | Conversion                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude `.mcp.json`                           | Copy `mcpServers` as-is (already matches universal format)                                                                                                                                                                                                                                                                                                                                  |
| Copilot `.mcp.json` / `.github/mcp.json`     | Copy `mcpServers`; `tools` → `enabledTools` (drop it when it is `["*"]`, uac's default); `oauthClientId` → `oauth.clientId`; `oauthScopes` → `scopes`; `type: "local"` → `"stdio"`                                                                                                                                                                                                          |
| Copilot `.vscode/mcp.json` (legacy)          | Rename `servers` → `mcpServers`. Drop `inputs`, `envFile`, `sandbox`, `sandboxEnabled` and `dev` — uac no longer writes them — and replace `${input:name}` references with `${ENV_VAR}` environment variables; tell the user which secrets to set                                                                                                                                           |
| Cursor `.cursor/mcp.json`                    | Copy `mcpServers`; add `type: "stdio"` for servers with `command`. `${env:NAME}` works only in Cursor — use `${NAME}`, or a per-target value                                                                                                                                                                                                                                                |
| Codex `.codex/config.toml` `[mcp_servers.*]` | Parse TOML, take only the `mcp_servers` table (other top-level keys are user content). Rename snake_case keys to their camelCase universal names (`enabled_tools` → `enabledTools`), except `http_headers` → `headers`, `http_headers_helper` → `headersHelper`, `experimental_environment` → `environmentId`, `tools` → `toolSettings`, and `oauth.client_id` etc. → `oauth.clientId` etc. |

### 3. Write Universal Templates

For each converted file:

1. Use the same base name as the source file (e.g. `.claude/rules/coding-style.md` → `<%= instructionTemplatePath('coding-style') %>`)
2. Write the universal frontmatter and body content. Copy and paste the body content, instead of trying to use EJS `include()` or something equivalent, because the source files will be deleted afterwards.
3. If a template with the same name already exists, **overwrite it** (the import represents the latest version)

**File placement:**

- Instructions → `<%= instructionTemplatePath('{name}') %>`
- Skills → `<%= skillTemplatePath('{name}') %>`
- Agents → `<%= agentTemplatePath('{name}') %>`
- Hooks → `<%= hookTemplatePath('{source-name}') %>`
- MCP → `<%= mcpTemplatePath('{source-name}') %>`
- Commands → `<%= skillTemplatePath('{name}') %>` (commands convert to skills)

### 4. Handle Special Cases

- **Claude hooks**: Extract the `hooks` key from `.claude/settings.json`. Flatten the nested matcher group structure into individual handlers with `matcher` fields.
- **Copilot always-apply**: Convert `.github/copilot-instructions.md` to an instruction with `alwaysApply: true`.
- **Copilot hook `bash` field**: Convert to universal `command` field (`command` is cross-platform; a separate `powershell` command has no universal field — use a per-target override or tell the user).
- **Copilot hook `timeoutSec` field**: Convert to universal `timeout` field (both use seconds).
- **Cursor `.mdc` files**: Read as regular markdown (the `.mdc` extension is just a convention).
- **Copilot MCP `servers` key** (legacy `.vscode/mcp.json`): Rename to `mcpServers` in the universal template.
- **Copilot MCP `inputs` array**: Not supported anymore — Copilot sessions skip servers that need `${input:…}`. Convert to environment variables (see the table above).
- **Cursor MCP missing `type`**: Add `"type": "stdio"` for servers with `command`, or `"type": "http"` for servers with `url`.
- **SSE servers** (`type: "sse"`): the transport is deprecated. Keep it only if the server has no HTTP endpoint; otherwise switch to `"http"`.
- **MCP env var references**: Leave `${ENV_VAR}` syntax as-is — it's passed through to generated output. If values look like they could be config variables, consider converting to `{{varName}}` syntax and adding a `variables` entry in the config file.
- **Fields that only exist for one target**: In templates, rename them to their universal name too (the table above; every field: `<%= docPath('uac/frontmatter') %>`). uac writes a universal field only for the targets that support it, and silently drops a key it doesn't know, such as a native `when_to_use`.
- **Skill extra files**: When importing skill directories, copy **all** files in the directory — not just `SKILL.md`. Extra files (references, examples, scripts, data) should be placed in the same relative paths within the universal template's skill directory (e.g. `.claude/skills/my-skill/references/example.md` → `<%= skillTemplatePath() %>/my-skill/references/example.md`). During generation, `.md` extra files are rendered through EJS (with access to `target`, `config`, path helpers), while non-`.md` files are copied as-is.
- **Claude commands → skills**: Commands are single `.md` files but skills are directories. Create a skill directory and place the converted command content as `SKILL.md` inside it. Use the filename (without `.md`) as the skill name.
- **Claude commands: `disableAutoInvocation`**: Commands are manual-only (no auto-invocation by the AI). Set `disableAutoInvocation: true` on the converted skill to preserve this behavior.
- **Claude commands: namespaced subdirectories**: Subdirectories in `.claude/commands/` are organizational only — they don't affect the command name. Use the filename as the skill name. If two commands from different subdirectories share a filename, disambiguate by prefixing with the subdirectory name (e.g. `frontend-component`).
- **Claude commands: rewrite body to agent-agnostic language**: Command bodies use Claude-specific syntax that must be converted to plain, agent-agnostic instructions:
  - `$ARGUMENTS` → Describe what input is expected. E.g., `Fix issue #$ARGUMENTS` becomes "The user will specify an issue number when invoking this skill. Fix the GitHub issue specified by the user."
  - Pre-executed bash (a "!" followed by a backticked command) → Convert to step-by-step instructions for the agent to run itself. E.g., the pre-executed git status becomes "Run `git status` to see current changes". The agent runs these as tool calls rather than having them pre-executed.
  - `@filepath` (file references) → Convert to instructions to read those files. E.g., `@src/utils/helpers.js` becomes "Read the file `src/utils/helpers.js`".
- **Claude commands: personal commands**: Personal commands from `~/.claude/commands/` are user-level, not project-level. Only import project commands (`.claude/commands/`) by default — flag personal commands and ask the user whether to include them.

### 5. Verify

After importing, run `uac generate -t <source target>`. It writes over the source files at the same paths, so check the conversion with `git diff`. (Generate one target at a time: with several, tools that read each other's files share one copy — see `<%= docPath('uac/config') %>`.)

### 6. Clean Up

Ask the user first. Then delete every imported original that the generate in step 5 didn't write over, e.g. `.claude/commands/`, `.github/mcp.json`, `.cursor/rules/*.md` (uac writes `.mdc`). Otherwise tools keep loading it next to the new output.

Report to the user:

- How many files were imported per type
- Any files that couldn't be converted (with reasons)
- Whether the generated output matches the originals
- Which originals were deleted
