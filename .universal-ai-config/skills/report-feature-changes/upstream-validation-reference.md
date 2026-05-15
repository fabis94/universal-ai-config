# Upstream Validation Reference for universal-ai-config

This document is the **source of truth for what uac assumes about each supported AI coding tool**, and where to verify those assumptions against current upstream documentation.

It is intended to be consumed by a `validate-upstream` skill (or similar) that periodically crawls vendor documentation to detect drift: renamed fields, new events, deprecated features, new template types, etc.

The document deliberately does **not** record the current state of "which tool supports which feature." That state lives in the source code (`src/targets/*/index.ts`) and changes constantly upstream. The skill's job is to compare uac's implementation against authoritative documentation; this document tells it **what kinds of things to check** and **where to look**.

---

## How to use this document

A validation run consists of three passes:

1. **Pick a tool to validate.** Each tool has its own section in Part 2 with documentation URLs grouped by tier.
2. **For each feature category in Part 1**, locate the relevant documentation page(s) for that tool, then compare against uac's implementation files listed under "Where in uac." Report any discrepancies.
3. **Aggregate findings** into a structured changeset proposal (additions, renames, removals, deprecations, beta-status changes).

Skills that consume this document should treat **Tier 1 sources as authoritative**, Tier 2 as supporting evidence for _when_ something changed, and Tier 3 as helpful but always verifiable against Tier 1.

---

## Part 1: Feature Categories to Validate

Each category below is generic across tools. For every supported tool, the skill should walk this list and check whether uac's implementation still matches upstream reality.

### 1.1 File locations & naming conventions

**What to validate**

- Top-level output directory for each tool (e.g. `.claude/`, `.github/`, `.cursor/`).
- Subdirectory paths for each template type (instructions, skills, agents, hooks, mcp).
- File extensions and naming patterns (`.md`, `.mdc`, `.instructions.md`, `.agent.md`, `SKILL.md`).
- Special files outside the normal subdirectory tree (e.g. always-apply instruction files, settings files, root-level MCP files).

**Where in uac**

- `src/targets/<tool>/index.ts` → `outputDir` and each `getOutputPath()` function
- `src/core/writer.ts` → `CLEAN_PATHS` and `CLEAN_MCP_PATHS` constants

**What to look for in docs**

Sections titled "Configuration files," "Project structure," "Custom instructions," "Where to put your rules," "Repository setup."

---

### 1.2 Supported template types

**What to validate**

Which abstract template types each tool supports. uac's universal types are: `instructions`, `skills`, `agents`, `hooks`, `mcp`. Tools may add new types upstream (e.g. a tool gains support for "agents" when it previously didn't) or remove existing ones.

**Where in uac**

- `src/targets/<tool>/index.ts` → `supportedTypes` array
- `src/types.ts` → `TemplateType` union

**What to look for in docs**

Top-level navigation for customization/configuration. Look for any new capability that resembles one of uac's universal types but is missing from `supportedTypes`. Also look for warnings that an existing type is deprecated.

---

### 1.3 Frontmatter schemas per template type

**What to validate**

For each template type the tool supports, the full set of accepted frontmatter fields. Common variations:

- Field renames (e.g. `paths` → `globs`)
- New optional fields (e.g. a tool adds `model` to skills)
- New required fields
- Field value format changes (string vs. array, comma-separated vs. YAML list)
- Deprecation of fields

**Where in uac**

- `src/targets/<tool>/index.ts` → `frontmatterMap` inside each `TemplateTypeConfig`
- `src/types.ts` → `UniversalFrontmatter` interface (universal field names)
- Documentation that lists fields: `src/seed-types/meta-instructions/templates/instructions/uac-template-guide.md`

**What to look for in docs**

Reference tables labeled "Frontmatter," "Metadata," "Configuration fields," "Properties." Look for YAML examples at the top of file-type documentation pages.

---

### 1.4 Lifecycle hooks

**What to validate**

- **Event names** — the canonical event name strings each tool accepts (e.g. PascalCase vs. camelCase, renames like `userPromptSubmit` → `userPromptSubmitted`).
- **Handler field names** — the keys inside each handler object (e.g. `command` vs. `bash`, `timeout` vs. `timeoutSec`).
- **Hook config file location** — single file vs. directory of files, wrapper key (e.g. `hooks`, `version`).
- **Handler grouping/nesting** — whether handlers are flat arrays or grouped by matcher.
- **Matcher semantics per event** — what string the `matcher` field filters on (tool name, session reason, notification type, etc.). This is often different for different events within the same tool.
- **Events that do not accept matchers** — some events fire unconditionally.

**Where in uac**

- `src/targets/<tool>/index.ts` → `EVENT_NAME_MAP` constant, `transform*Hooks()` function, `hooks` config block
- `src/types.ts` → `UniversalHookHandler` interface

**What to look for in docs**

Sections titled "Hooks reference," "Lifecycle events," "Hook configuration," "Hook events." Look for an enumerated table of events; that's usually the authoritative list. Watch for events labeled **beta**, **experimental**, or **preview**.

---

### 1.5 Tool system

**What to validate**

- **Built-in tool names** — the canonical strings used to refer to a tool in `tools`, `allowed-tools`, `disallowedTools` frontmatter, and in hook `matcher` patterns.
- **Tool name casing convention** — PascalCase, lowercase aliases, snake_case, etc.
- **Tool grouping** — whether tools are individual or grouped into aliases that imply multiple underlying tools.
- **MCP tool reference syntax** — how MCP-server-provided tools are addressed in config (e.g. `mcp__server__tool`, `server/tool`).
- **Wildcard support** — whether `mcp__server__*` or equivalent is accepted.
- **Tool restriction mechanisms** — whether the tool supports `allowed`/`disallowed` lists at all, and at what scope (skill, agent, both).
- **New built-in tools** — vendors regularly add tools (e.g. notebook editors, plan-mode tools, monitoring tools).

**Where in uac**

- `src/targets/<tool>/index.ts` → `frontmatterMap` entries for `tools`, `allowedTools`, `disallowedTools`
- Documentation that lists tools: `src/seed-types/meta-instructions/templates/instructions/uac-template-guide.md` → "Available Tools" section

**What to look for in docs**

Pages titled "Tools," "Tool reference," "Available tools," "Permission rules." Also check release notes — new tools are almost always announced.

---

### 1.6 MCP integration

**What to validate**

- **Config file location** (e.g. `.mcp.json`, `.vscode/mcp.json`, `.cursor/mcp.json`).
- **Wrapper key** at the top of the file (e.g. `mcpServers`, `servers`).
- **Per-server fields** — `type`, `command`, `args`, `env`, `url`, `headers`, plus any new fields (`envFile`, `cwd`, `sandbox`, etc.).
- **Transport types supported** — stdio, sse, http, streamable-http.
- **Whether `type` field is required, optional, or omitted** by the tool.
- **Special top-level fields** — e.g. interactive secret prompts (`inputs` array), dev-mode flags.
- **Authentication mechanisms** — OAuth flows, secret references, header injection.

**Where in uac**

- `src/targets/<tool>/index.ts` → `transform*MCP()` function and `mcp` config block
- `src/types.ts` → `UniversalMCPServer` and `UniversalMCPInput` interfaces

**What to look for in docs**

Pages titled "MCP," "Model Context Protocol," "External tools," "Add an MCP server." Vendors sometimes maintain a separate MCP reference page distinct from the general MCP setup guide.

---

### 1.7 Variable interpolation & secrets

**What to validate**

- Environment variable reference syntax (e.g. `${VAR}`, `${env:VAR}`).
- Secret/input reference syntax for tools that have interactive prompts (e.g. `${input:id}`).
- Whether variable substitution happens at config-load time or runtime.
- Any `.env`-style file conventions the tool reads automatically.

**Where in uac**

- `src/core/resolve-json-variables.ts` (uac's own `{{var}}` syntax — this is uac's, not the vendor's, but the documentation must not collide with vendor syntax)
- Documentation in `src/seed-types/meta-instructions/templates/instructions/uac-template-guide.md` distinguishing `{{var}}` (uac) from `${ENV_VAR}` (vendor passthrough)

**What to look for in docs**

Search for `${`, "environment variable," "secret," "input" inside MCP and hooks documentation.

---

### 1.8 Permission & safety system

**What to validate**

- Permission modes / levels accepted in config (e.g. `default`, `acceptEdits`, `plan`, `bypassPermissions`, `acceptAll`).
- Where permission modes can be specified (settings file, agent frontmatter, skill frontmatter, CLI flag).
- Permission rule syntax (e.g. `Bash(git *)`, glob patterns for file edits).
- Auto-approval mechanisms and what disables them.

**Where in uac**

- `src/targets/<tool>/index.ts` → `frontmatterMap` entries for `permissionMode`
- `src/types.ts` → `UniversalFrontmatter.permissionMode`

**What to look for in docs**

Pages titled "Permissions," "Permission modes," "Safety," "Auto-approve," "Trusted commands."

---

### 1.9 Memory & context scoping

**What to validate**

- File names and directory locations that the tool loads automatically as context (e.g. `CLAUDE.md`, `AGENTS.md`, `.cursorrules`).
- Scope hierarchy — user vs. project vs. directory-local vs. enterprise.
- Auto-loaded memory mechanisms.
- Import/include syntax for chaining context files (e.g. `@import`).
- Whether the tool has adopted the cross-vendor `AGENTS.md` open standard.

**Where in uac**

- This is largely outside uac's current scope (uac doesn't currently manage CLAUDE.md / AGENTS.md), but changes here often signal new template types worth supporting.

**What to look for in docs**

Pages titled "Memory," "Context," "AGENTS.md," "Project instructions," "Repository setup."

---

### 1.10 Model identifiers

**What to validate**

- Accepted model name strings and aliases (e.g. `sonnet`, `opus`, `gpt-4o`, full versioned IDs).
- Where model can be specified (agent, skill, settings file).
- Whether aliases (`sonnet`) are accepted alongside fully-qualified IDs (`claude-sonnet-4-5-20250929`).
- Inheritance keywords (e.g. `inherit`).

**Where in uac**

- `src/targets/<tool>/index.ts` → `frontmatterMap` entries for `model`
- Documentation examples in template guides (these often contain stale model IDs)

**What to look for in docs**

Pages titled "Models," "Model selection," "Available models," plus release notes for new model launches.

---

### 1.11 Versioning, status, and deprecations

**What to validate**

- Current stable version of the tool.
- Features explicitly labeled **beta**, **preview**, **experimental** — these can change schema without notice and the meta-instruction templates should reflect that.
- Features explicitly **deprecated** — uac should warn or stop generating these.
- Breaking changes between versions.

**Where in uac**

- Surfacing of beta status: `src/seed-types/meta-instructions/templates/instructions/uac-template-guide.md`
- README.md — claims about which features are supported

**What to look for in docs**

Banners at the top of doc pages, dedicated migration/upgrade guides, and the changelog. Vendors often mark beta features inline with badges next to feature names in navigation.

---

### 1.12 Tool-specific / unique features

**What to validate**

Features that exist on only one tool today and have no universal equivalent. These are candidates for either:

- Adding to uac's universal model (if multiple tools converge on similar functionality)
- Pass-through-only fields (preserved in frontmatter but only emitted for one target)

Examples to watch for: special context modes, plan/explore modes, sub-agent invocation primitives, memory commands, chat slash-command primitives, IDE-specific events.

**Where in uac**

- `src/targets/<tool>/index.ts` — passthrough fields appear directly in `frontmatterMap` as identity renames
- `src/types.ts` → `UniversalFrontmatter` interface

**What to look for in docs**

Anything in a tool's docs that has no analog in the other tools' docs is a candidate for this category.

---

## Part 2: Documentation Sources per Tool

Each tool's section follows the same template:

- **Tier 1 — Authoritative reference docs** — official reference pages. Treat as ground truth.
- **Tier 2 — Announcements & change history** — changelog, release notes, official blog. Use to determine _when_ something changed.
- **Tier 3 — Community & adjacent resources** — high-quality third-party sources. Verify findings against Tier 1.
- **Per-feature page index** — for each Part 1 feature category, the specific URL(s) most likely to contain the answer.

---

### 2.1 Claude Code (Anthropic)

#### Tier 1 — Authoritative reference docs

- Docs home: https://code.claude.com/docs/en/overview
- Full docs map (machine-readable index): https://code.claude.com/docs/en/claude_code_docs_map
- LLM-readable index: https://code.claude.com/docs/llms.txt
- Features overview: https://code.claude.com/docs/en/features-overview
- Settings reference: https://code.claude.com/docs/en/settings
- Source repository (CLI behavior, plugins directory): https://github.com/anthropics/claude-code
- Skills reference repo (open-standard examples): https://github.com/anthropics/skills

#### Tier 2 — Announcements & change history

- Official changelog page: https://code.claude.com/docs/en/changelog
- Raw CHANGELOG.md in repo: https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md
- GitHub releases (tagged): https://github.com/anthropics/claude-code/releases
- Anthropic news: https://www.anthropic.com/news
- Anthropic engineering blog: https://www.anthropic.com/engineering

#### Tier 3 — Community & adjacent resources

- Community changelog mirror (high-signal diff tracking): https://github.com/marckrenn/claude-code-changelog
- X feed auto-tracking changes: https://x.com/ClaudeCodeLog
- ClaudeLog third-party docs/mirror: https://claudelog.com
- Hooks deep dive (community): https://github.com/disler/claude-code-hooks-mastery

#### Per-feature index

| Feature category                             | URL(s)                                                                                                                                                                             |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File locations & naming                      | https://code.claude.com/docs/en/features-overview, https://code.claude.com/docs/en/settings                                                                                        |
| Frontmatter — instructions/memory            | https://code.claude.com/docs/en/memory                                                                                                                                             |
| Frontmatter — skills                         | https://code.claude.com/docs/en/skills, https://code.claude.com/docs/en/agent-sdk/slash-commands, https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices |
| Frontmatter — agents                         | https://code.claude.com/docs/en/sub-agents, https://platform.claude.com/docs/en/agent-sdk/subagents                                                                                |
| Hooks (events, fields, matchers)             | https://code.claude.com/docs/en/hooks                                                                                                                                              |
| MCP                                          | https://code.claude.com/docs/en/mcp, https://code.claude.com/docs/en/agent-sdk/mcp                                                                                                 |
| Tool system                                  | https://code.claude.com/docs/en/settings, https://code.claude.com/docs/en/sub-agents, https://platform.claude.com/docs/en/agent-sdk/permissions                                    |
| Permission modes                             | https://code.claude.com/docs/en/permission-modes                                                                                                                                   |
| Memory scopes                                | https://code.claude.com/docs/en/memory                                                                                                                                             |
| Model identifiers                            | https://code.claude.com/docs/en/sub-agents, https://code.claude.com/docs/en/permission-modes, plus the changelog for new releases                                                  |
| Plugins (affects MCP, skills, hooks scoping) | https://code.claude.com/docs/en/plugins, https://code.claude.com/docs/en/plugins-reference                                                                                         |

---

### 2.2 GitHub Copilot

#### Tier 1 — Authoritative reference docs

- GitHub Copilot docs home: https://docs.github.com/en/copilot
- VS Code Copilot docs home: https://code.visualstudio.com/docs/copilot/overview
- VS Code docs source repo (good for raw diffs): https://github.com/microsoft/vscode-docs

#### Tier 2 — Announcements & change history

- GitHub changelog filtered to Copilot: https://github.blog/changelog/label/copilot/
- GitHub changelog top-level: https://github.blog/changelog/
- GitHub blog (product news): https://github.blog/news-insights/product-news/
- VS Code monthly release notes index (Copilot section per release): https://code.visualstudio.com/updates
- VS Code blog (deeper feature posts): https://code.visualstudio.com/blogs
- Visual Studio (IDE) Copilot what's new on Microsoft Learn: https://learn.microsoft.com/en-us/visualstudio/ide/

#### Tier 3 — Community & adjacent resources

- Awesome Copilot (instructions, skills, agents, hooks community examples): https://github.com/github/awesome-copilot
- VS Code Insiders (early preview of upcoming features): https://code.visualstudio.com/insiders/

#### Per-feature index

| Feature category                                 | URL(s)                                                                                                                                                                                                                                 |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File locations & naming                          | https://docs.github.com/en/copilot/reference/custom-instructions-support, https://docs.github.com/en/copilot/how-tos/configure-custom-instructions                                                                                     |
| Frontmatter — instructions                       | https://docs.github.com/copilot/customizing-copilot/adding-custom-instructions-for-github-copilot, https://code.visualstudio.com/docs/copilot/customization/custom-instructions                                                        |
| Frontmatter — skills                             | https://code.visualstudio.com/docs/copilot/customization/agent-skills, https://docs.github.com/en/copilot/concepts/agents/about-agent-skills, https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/create-skills |
| Frontmatter — agents                             | https://code.visualstudio.com/docs/copilot/customization/custom-agents, https://docs.github.com/en/copilot/reference/custom-agents-configuration, https://code.visualstudio.com/docs/copilot/agents/subagents                          |
| Hooks                                            | Folded into agent plugins docs under https://code.visualstudio.com/docs/copilot — search "hooks" in left nav; verify against latest monthly release notes at https://code.visualstudio.com/updates                                     |
| MCP                                              | https://code.visualstudio.com/docs/copilot/customization/mcp-servers, https://code.visualstudio.com/docs/copilot/reference/mcp-configuration, https://learn.microsoft.com/en-us/visualstudio/ide/mcp-servers                           |
| Tool system (aliases like `read`, `edit`, `web`) | https://code.visualstudio.com/docs/copilot/customization/custom-agents, https://code.visualstudio.com/docs/copilot/customization/agent-skills, https://code.visualstudio.com/docs/copilot/agents/subagents                             |
| Permission / agent modes                         | https://code.visualstudio.com/docs/copilot/agents/overview, https://learn.microsoft.com/en-us/visualstudio/ide/copilot-agent-mode                                                                                                      |
| Memory / AGENTS.md                               | https://docs.github.com/en/copilot/reference/custom-instructions-support, https://code.visualstudio.com/docs/copilot/customization/custom-instructions                                                                                 |
| Model identifiers                                | https://docs.github.com/en/copilot — search "models"; per-release notes at https://code.visualstudio.com/updates                                                                                                                       |
| Coding (cloud) agent                             | https://code.visualstudio.com/docs/copilot/copilot-cloud-agent, https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/create-custom-agents                                                                        |

---

### 2.3 Cursor IDE

#### Tier 1 — Authoritative reference docs

- Cursor docs home: https://cursor.com/docs
- Older mirror (still active): https://docs.cursor.com

#### Tier 2 — Announcements & change history

- Cursor changelog (primary): https://cursor.com/changelog
- Legacy changelog (pre-1.0 / 0.x history): https://changelog.cursor.sh
- Cursor blog: https://cursor.com/blog
- Forum announcements: https://forum.cursor.com/c/announcements

#### Tier 3 — Community & adjacent resources

- Cursor forum (semi-official, monitored by staff): https://forum.cursor.com
- Cursor marketplace (skills, hooks, MCP servers in one place): https://cursor.com/marketplace
- GitButler hooks deep dive: https://blog.gitbutler.com/cursor-hooks-deep-dive
- TypeScript hook types (community, mirrors official schema): https://github.com/johnlindquist/cursor-hooks

#### Per-feature index

| Feature category                             | URL(s)                                                                                                          |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| File locations & naming                      | https://cursor.com/docs/context/rules, https://cursor.com/docs                                                  |
| Frontmatter — rules/instructions             | https://cursor.com/docs/context/rules                                                                           |
| Frontmatter — skills                         | https://cursor.com/docs/skills (linked from docs home navigation)                                               |
| Hooks (all events, handler fields, matchers) | https://cursor.com/docs/hooks, https://cursor.com/docs/hooks.md (markdown view often more complete)             |
| MCP                                          | https://cursor.com/docs/mcp, https://cursor.com/docs/cli/mcp, https://cursor.com/docs/context/mcp-extension-api |
| Tool system / internal tool names            | https://cursor.com/docs/hooks, https://cursor.com/docs/context/mcp-extension-api                                |
| Model identifiers                            | https://cursor.com/changelog (model launches are announced per release)                                         |

---

### 2.4 Cross-cutting standards (apply to all tools)

These open standards are increasingly adopted across vendors. Changes here affect multiple tools at once.

- **Agent Skills open standard:** https://agentskills.io
- **AGENTS.md cross-vendor spec:** https://github.com/agentsmd/agents.md
- **Model Context Protocol (MCP) spec:** https://modelcontextprotocol.io
- **MCP reference servers:** https://github.com/modelcontextprotocol/servers
- **Anthropic skills reference repo (cross-vendor compatible):** https://github.com/anthropics/skills

---

### Important architectural notes about Codex (before section 2.5)

Codex differs structurally from Claude Code, Copilot, and Cursor in ways that affect how uac maps onto it:

| Structural aspect     | Claude Code / Copilot / Cursor                                      | Codex                                                                                                                                                      |
| --------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Config file format    | JSON / YAML frontmatter / `.mdc`                                    | **TOML** (`~/.codex/config.toml` and `<project>/.codex/config.toml`)                                                                                       |
| MCP config location   | Separate file (`.mcp.json`, `.vscode/mcp.json`, etc.)               | **Inside `config.toml`** as `[mcp_servers.<name>]` tables                                                                                                  |
| Hooks config location | Separate file (`.claude/settings.json`, `.cursor/hooks.json`, etc.) | **`.codex/hooks.json`** (or inline `[hooks]` in `config.toml`)                                                                                             |
| Instructions format   | Frontmatter + markdown body                                         | **Free-form `AGENTS.md`** — no frontmatter, no structured fields                                                                                           |
| Rules / exec policy   | No direct equivalent                                                | **Starlark `.rules` files** — Codex-only, pattern-match command prefixes                                                                                   |
| Skills                | SKILL.md with YAML frontmatter                                      | **SKILL.md** — same Agent Skills open standard, compatible format. UI/policy/dependency metadata lives in a sidecar `agents/openai.yaml` next to SKILL.md. |
| Subagents             | Per-target files                                                    | **Standalone `.codex/agents/<role>.toml`** files (auto-discovered) or inline `[agents.<role>]` tables in `config.toml`                                     |
| Hook event casing     | Claude: PascalCase; Copilot/Cursor: camelCase                       | **PascalCase** (same as Claude Code): `SessionStart`, `PreToolUse`, etc. — but a strict subset of Claude's events                                          |

uac's Codex target supports skills (same SKILL.md standard), instructions (consolidated into `AGENTS.md` / `AGENTS.override.md`), agents (standalone TOML files), hooks (dedicated `.codex/hooks.json`), and MCP servers (`[mcp_servers.*]` tables in `.codex/config.toml`, sharing the file with user-managed sections). Codex-only features like Starlark `.rules` and plugins are not implemented but users can hand-author them in `.codex/config.toml` and uac preserves the user-managed sections.

---

## 2.5 OpenAI Codex

### Tier 1 — Authoritative reference docs

- Docs home: https://developers.openai.com/codex
- Full LLM-readable docs (single-file): https://developers.openai.com/codex/llms-full.txt
- Config basics: https://developers.openai.com/codex/config-basic
- Config reference (all keys, types, defaults): https://developers.openai.com/codex/config-reference
- Advanced config (profiles, providers, sandbox, notifications): https://developers.openai.com/codex/config-advanced
- Sample config (annotated example): https://developers.openai.com/codex/config-sample
- Customization overview (AGENTS.md + skills + MCP + subagents — hierarchy explained): https://developers.openai.com/codex/concepts/customization
- Open-source repo (Rust CLI, issues, discussions): https://github.com/openai/codex

### Tier 2 — Announcements & change history

- Official changelog (dated, monthly sections): https://developers.openai.com/codex/changelog
- GitHub releases (tagged, release notes per version): https://github.com/openai/codex/releases
- GitHub discussions (feature requests, community): https://github.com/openai/codex/discussions
- OpenAI blog (product announcements): https://openai.com/blog
- OpenAI newsroom: https://openai.com/news

### Tier 3 — Community & adjacent resources

- Official community forum / Discord: links from https://developers.openai.com/codex/open-source navigation
- GitHub issues (bug reports, feature tracking): https://github.com/openai/codex/issues
- Codex for Open Source program: https://developers.openai.com/codex/open-source

### Per-feature index

| Feature category (from Part 1)         | Most relevant URL(s)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File locations & naming                | https://developers.openai.com/codex/config-basic, https://developers.openai.com/codex/config-reference                                                                                                                                                                                                                                                                                                                                                                                                     |
| Frontmatter — instructions (AGENTS.md) | https://developers.openai.com/codex/guides/agents-md — no frontmatter; scoping via directory placement. Config keys `project_doc_max_bytes`, `project_doc_fallback_filenames`, `model_instructions_file`, `project_root_markers`                                                                                                                                                                                                                                                                           |
| Frontmatter — skills (SKILL.md)        | https://developers.openai.com/codex/skills + https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview — same Agent Skills open standard. Required: `name`, `description`. Optional: `version`, `author`. Sidecar `agents/openai.yaml` for UI/policy/dependency metadata.                                                                                                                                                                                                                 |
| Frontmatter — agents/subagents         | https://developers.openai.com/codex/subagents — defined in `[agents.<role>]` TOML tables in `config.toml` OR standalone `.codex/agents/<role>.toml` files. Key fields: `name`, `description`, `developer_instructions`, `model`, `model_reasoning_effort`, `sandbox_mode`, `mcp_servers`, `skills.config`, `nickname_candidates`                                                                                                                                                                           |
| Hooks (events, fields, matchers)       | https://developers.openai.com/codex/hooks — six events PascalCase (`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PermissionRequest`, `Stop`). Handler fields: `type` (only `command` runs), `command` (single shell string — not split into args), `matcher`, `timeout`, `statusMessage`.                                                                                                                                                                                              |
| MCP                                    | https://developers.openai.com/codex/mcp, https://developers.openai.com/codex/config-reference — `[mcp_servers.<name>]` tables inside `config.toml`. Fields: `command`, `args`, `env`, `url`, `cwd`, `env_vars`, `http_headers`, `bearer_token_env_var`, `env_http_headers`, `startup_timeout_sec`, `startup_timeout_ms`, `tool_timeout_sec`, `enabled`, `required`, `enabled_tools`, `disabled_tools`, `oauth_resource`, `scopes`, `experimental_environment`. Transport inferred from `command` vs `url`. |
| Tool system                            | https://developers.openai.com/codex/agent-approvals-security, https://developers.openai.com/codex/subagents — no agent-level allow/deny list; restriction lives per-MCP-server via `enabled_tools` / `disabled_tools`. No named built-in tool list documented.                                                                                                                                                                                                                                             |
| Variable interpolation & secrets       | https://developers.openai.com/codex/mcp, https://developers.openai.com/codex/config-reference — env values via `env`; env-var forwarding via `env_vars`; bearer tokens via `bearer_token_env_var`; HTTP headers via `http_headers` (static) and `env_http_headers` (env-pulled). No `${VAR}` template syntax.                                                                                                                                                                                              |
| Permission & safety / approval         | https://developers.openai.com/codex/agent-approvals-security, https://developers.openai.com/codex/concepts/sandboxing, https://developers.openai.com/codex/config-reference — `approval_policy` (`untrusted` / `on-request` / `never` / granular), `sandbox_mode` (`read-only` / `workspace-write` / `danger-full-access`), `approvals_reviewer` (`user` / `auto_review`). Named profiles: `:read-only`, `:workspace`, `:danger-no-sandbox`.                                                               |
| Rules (Codex-only feature)             | https://developers.openai.com/codex/rules — `.rules` files using Starlark `prefix_rule()`. Fields: `pattern`, `decision` (`allow`/`prompt`/`forbidden`), `justification`, `match`, `not_match`. **Not implemented in uac** — no universal equivalent.                                                                                                                                                                                                                                                      |
| Memory & context scoping               | https://developers.openai.com/codex/guides/agents-md, https://developers.openai.com/codex/config-reference — config layers: system → user (`~/.codex/config.toml`) → project (`.codex/config.toml`, trusted only) → worktree. AGENTS.md walks up directory tree. `[memories]` feature off-by-default.                                                                                                                                                                                                      |
| Model identifiers                      | https://developers.openai.com/codex/cli/slash-commands, https://developers.openai.com/codex/changelog — `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.3-Codex`, `gpt-4.1`, `gpt-4.1-mini`. Pair with `model_reasoning_effort` (`minimal`/`low`/`medium`/`high`/`xhigh`) and `model_reasoning_summary`.                                                                                                                                                                                                                 |
| Plugins (Codex-only)                   | https://developers.openai.com/codex/plugins, https://developers.openai.com/codex/plugins/build — bundles skills + MCP + apps. Manifest at `.codex-plugin/plugin.json`. **Not implemented in uac** — no universal equivalent.                                                                                                                                                                                                                                                                               |
| Versioning, status, beta features      | https://developers.openai.com/codex/changelog, https://developers.openai.com/codex/config-reference — Profiles: experimental in config-advanced but treated stable in main reference. Memories: off-by-default. `features.*` flag table per key.                                                                                                                                                                                                                                                           |

### Additional Codex-specific pages to monitor

These pages don't map cleanly to Part 1 feature categories but are highly change-sensitive:

| Page                                                 | Why to monitor                                                                                                                      |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| https://developers.openai.com/codex/config-reference | The single most change-sensitive page — any new config key, renamed field, or removed option appears here first                     |
| https://developers.openai.com/codex/hooks            | Hook event additions/removals, new handler fields, matcher semantics changes                                                        |
| https://developers.openai.com/codex/skills           | SKILL.md spec changes, invocation policy, `agents/openai.yaml` schema                                                               |
| https://developers.openai.com/codex/plugins/build    | Plugin manifest schema; changes affect future bundling of skills + MCP                                                              |
| https://developers.openai.com/codex/subagents        | Subagent config schema changes (`[agents.*]` table structure, standalone TOML file fields)                                          |
| https://developers.openai.com/codex/rules            | Starlark rule format changes, new `decision` values, `execpolicy` preview → stable graduation                                       |
| https://github.com/openai/codex/releases             | Binary releases; check for deprecation notices in release notes (e.g. `--full-auto` was deprecated in favor of permission profiles) |

### Deferred uac coverage (not implemented, users can hand-author)

The Codex target in uac (v1) doesn't have first-class universal-template plumbing for these Codex-only surfaces. Users can hand-author them directly in `.codex/config.toml` and uac preserves those sections across regenerates (only `[mcp_servers.*]` is uac-owned):

- Profile system (`[profiles.<name>]`)
- Model providers (`[model_providers.<id>]`)
- Permissions profiles (`[permissions.<name>]`)
- Shell environment policy (`shell_environment_policy.*`)
- Personality / verbosity / reasoning summary (`personality`, `model_verbosity`, `model_reasoning_summary`, `plan_mode_reasoning_effort`, `service_tier`)
- Memories (`[memories]`)
- Web search (`web_search`, `tools.web_search`)
- Feature flags (`features.*`)
- TUI customization (`[tui]`)
- History / state (`history.persistence`, `history.max_bytes`, `sqlite_home`)
- OTel / analytics / feedback (`[otel]`, `analytics.enabled`, `feedback.enabled`)
- Auto-review (`review_model`, `auto_review.policy`, `approvals_reviewer`)
- OAuth callback config (`mcp_oauth_callback_port`, `mcp_oauth_callback_url`, `mcp_oauth_credentials_store`)
- AGENTS.md loader knobs (`project_doc_max_bytes`, `project_doc_fallback_filenames`, `project_root_markers`, `model_instructions_file`)
- Agents global (`agents.max_threads`, `agents.max_depth`, `agents.job_max_runtime_seconds`)
- Starlark `.rules` files (Codex-only experimental exec policy)
- Plugins (`.codex-plugin/plugin.json` bundling format)

A follow-up PR could add a `codex: { ... }` block to the uac config schema for first-class universal-template plumbing of these features — the existing `mergeTomlKey` mechanism handles preserving user-authored content alongside future uac-managed keys.

---

## Part 3: Validation Workflow

This is the recommended flow for the `validate-upstream` skill. It's structured so a single run can validate one tool end-to-end.

### Step 1 — Pick scope

Default: validate all supported tools. Allow narrowing by argument (`--tool claude`, `--feature hooks`, `--feature mcp`, etc.).

### Step 2 — For each tool in scope, for each feature category in Part 1:

1. Fetch the Tier 1 URL(s) listed in the tool's per-feature index.
2. Extract the relevant section (event table, frontmatter table, etc.).
3. Compare against the corresponding uac source file(s) listed in Part 1 under "Where in uac."
4. Classify each discrepancy:
   - **Added** — upstream supports something uac doesn't expose.
   - **Removed / deprecated** — uac generates something upstream no longer accepts.
   - **Renamed** — same concept, different identifier.
   - **Status change** — moved from beta → stable or stable → deprecated.
   - **Schema change** — same field, different type / shape.

### Step 3 — Sanity-check against announcements

For each discrepancy found in Step 2, search Tier 2 sources (changelog, release notes) for the corresponding announcement. This anchors the change in time and provides a citation. If no announcement can be found, downgrade the finding's confidence and recommend a manual review.

### Step 4 — Produce changeset proposal

Emit a structured report with one entry per finding. Each entry should include:

- Tool
- Feature category
- Finding type (added / removed / renamed / status / schema)
- Upstream evidence (URL + quoted excerpt)
- Tier 2 evidence (changelog entry, if any)
- uac files that need updating
- Suggested code/doc changes
- Confidence (high / medium / low)

### Step 5 — Apply with confirmation

Never auto-apply changes. Surface the changeset proposal and let a human approve before editing source files. Particularly risky changes (frontmatter field renames, hook event renames, removed features) should require explicit per-item confirmation.

---

## Part 4: Adding a New Tool

When uac gains support for a new tool (Codex, Windsurf, Zed, JetBrains AI Assistant, Amazon Q, etc.), add a new subsection to **Part 2** following the template below. The validation skill should automatically pick up new tools once they appear here.

### Template

```markdown
### 2.X <Tool Name>

#### Tier 1 — Authoritative reference docs

- Docs home: <URL>
- Reference / API docs: <URL>
- Source repository (if open): <URL>

#### Tier 2 — Announcements & change history

- Changelog: <URL>
- Release notes: <URL>
- Official blog: <URL>

#### Tier 3 — Community & adjacent resources

- <Community resource>: <URL>

#### Per-feature index

| Feature category           | URL(s) |
| -------------------------- | ------ |
| File locations & naming    |        |
| Frontmatter — instructions |        |
| Frontmatter — skills       |        |
| Frontmatter — agents       |        |
| Hooks                      |        |
| MCP                        |        |
| Tool system                |        |
| Permission modes           |        |
| Memory scopes              |        |
| Model identifiers          |        |
```

### Required at minimum

A new tool entry is considered usable by the validation skill once it has:

1. At least one Tier 1 URL (so authoritative checks are possible).
2. At least one Tier 2 URL (so changes can be dated).
3. Per-feature index entries for **every feature category the tool supports** — leave a row blank if the tool doesn't support that category, and add an explanatory note ("`—` — not supported by this tool").

### Optional but valuable

- A pinned list of known beta/preview features as of the entry's creation date, so the skill can detect graduation to stable.
- Notes on documentation quirks (e.g. "this vendor splits hooks docs across IDE-specific subpages").
- An RSS/Atom feed URL for the changelog, if one exists — makes incremental monitoring easier.

---

## Part 5: Known caveats and quality notes

When the skill runs, it should be aware of these recurring documentation quality issues observed during research:

- **Beta APIs change without changelog entries.** Cursor's hooks page explicitly warns that the API is beta and may change. Same caveat applies to some Copilot agent/hook features. If a finding involves a beta feature, lower confidence.
- **Some features are documented only inside in-product UIs**, not in published docs. Notably: Copilot's exact tool-alias inventory and Cursor's internal tool-name list. The skill should flag these as "documentation-incomplete" and recommend manual verification inside the product.
- **Vendor terminology drifts.** "Subagent," "agent," "custom agent," "cloud agent," and "background agent" all refer to overlapping-but-distinct concepts depending on the vendor and the release. Normalize against uac's universal `agents` type only when functionality matches.
- **Multiple doc surfaces per vendor.** Copilot in particular splits docs across `docs.github.com` (cloud / GitHub.com surface) and `code.visualstudio.com` (IDE surface) with significant overlap and occasional contradictions. When they disagree, prefer the IDE-specific surface for IDE behavior and the GitHub surface for cloud-agent behavior.
- **Stale examples in docs.** Code examples in vendor docs sometimes use deprecated model IDs or field names. Always cross-reference the formal reference tables, not the prose examples.

---

## Maintenance

This document itself drifts. Review it whenever:

- A new tool is added to uac.
- A vendor restructures its documentation site (URLs in Part 2 break).
- An open standard (Agent Skills, AGENTS.md, MCP) publishes a new version.
- A new feature category emerges across multiple tools (add to Part 1).

The skill that consumes this document should also report broken URLs as part of its routine output.
