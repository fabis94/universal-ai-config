# Codex reference

Codex is structurally different from Claude, Copilot, and Cursor. This page covers where Codex output lands, how each template type maps, and the values uac can't translate for it.

## Output paths

Unlike the other three targets, Codex emits files in **multiple locations** outside its `outputDir`. This is intentional — Codex auto-discovers these standard locations:

- **`AGENTS.md` at project root** — concatenation of all `alwaysApply: true` instructions (plus templates with leading-wildcard or no globs)
- **`<dir>/AGENTS.override.md`** — per-directory instruction files derived from `globs` prefixes. Editing a template's `globs` **moves** this file; `uac clean` finds the old location by scanning for the basename, so run `uac generate --clean` after a glob change rather than plain `uac generate`
- **`.agents/skills/<name>/SKILL.md`** — root-relative, per Codex's auto-discovery convention; sidecar `agents/openai.yaml` emitted next to SKILL.md when relevant
- **`.codex/agents/<name>.toml`** — standalone agent files (auto-discovered by Codex)
- **`.codex/hooks.json`** — JSON hooks file
- **`.codex/config.toml`** — only the `[mcp_servers.*]` table is uac-owned; users can hand-author other top-level keys (profiles, providers, permissions, personality, etc.) and uac preserves them

All of these are gitignored by `uac seed gitignore` so each developer regenerates locally. If you deliberately commit a hand-authored file at one of these paths, add it to `preserveOnClean` — otherwise clean removes it.

## Caveats

Codex is structurally different enough from the other three targets that a few rules deserve a callout:

1. **Instructions consolidate** — Codex doesn't have per-rule frontmatter on its `AGENTS.md` files. uac concatenates all `alwaysApply: true` instructions (plus templates with no `globs` and templates with leading-wildcard `globs` like `**/*.ts`) into a single root `AGENTS.md`. Templates with resolvable-directory `globs` (e.g. `packages/frontend/**`) emit to `<dir>/AGENTS.override.md`. Multiple templates → same dir get concatenated alpha-sorted. To redirect a template away from root for Codex specifically, use a per-target glob override: `globs: { codex: ["src/specific/**"], default: [...] }`. Because the output location is derived from `globs`, **editing a glob prefix moves the file** — the old `<dir>/AGENTS.override.md` is orphaned and Codex keeps reading it. `uac clean` finds orphans by scanning the project tree for that basename (skipping `node_modules`, `.git`, build output, and `templatesDir`), so run `uac generate --clean` after a glob change.
2. **Agents are standalone TOML** — Codex emits each agent template as `.codex/agents/<name>.toml`. The body becomes `developer_instructions` (a TOML string), and frontmatter fields map to TOML keys. Codex auto-discovers these files; no `[agents.*]` registration in `config.toml` is needed.
3. **Skills at the open-standard location** — Codex auto-discovers skills at `.agents/skills/<name>/SKILL.md` (root-relative, not `.codex/skills/`). uac emits there to leverage that. Rich Codex-specific metadata (UI, invocation policy, tool deps) lives in a sidecar `agents/openai.yaml` file emitted next to SKILL.md when `disableAutoInvocation` or any `codex.*` field is set (see [frontmatter.md](frontmatter.md#codex-skill-metadata-codex)).
4. **`.codex/config.toml` is shared with user content** — uac only writes the `[mcp_servers.*]` table. Users can hand-author `[profiles.*]`, `[model_providers.*]`, `[permissions.*]`, `personality`, `[memories]`, `[tui]`, OTel config, etc. directly in `.codex/config.toml` and uac preserves those sections across regenerates. `uac clean --target codex` only removes the `mcp_servers` key, leaving the rest intact. Every other Codex output — `AGENTS.md`, `<dir>/AGENTS.override.md`, `.agents/skills/`, `.codex/agents/`, `.codex/hooks.json` — is removed **whole**, on the assumption uac wrote it. If you commit a hand-authored file at one of those paths, list it under `preserveOnClean` in your config.
5. **Hooks: only `command` handlers** — Codex hooks support `type: "command"` only. `http`, `mcp_tool`, `prompt`, `agent` handler types are dropped with a warning when emitting for Codex. Codex hook events are a strict PascalCase subset of Claude's (see the event table in [hooks.md](hooks.md#universal-event-names)). Codex `command` is a single shell string — universal `args` arrays are flattened with shell escaping.

## Cross-target value gotchas

Some universal fields have values that look the same across targets but carry target-specific vocabulary. uac does **not** auto-translate these values — it warns and passes through (or drops) so users can fix via per-target overrides. The three concrete cases:

| Field            | Claude vocabulary                            | Codex vocabulary                                          | uac behaviour for Codex                                                                                                                     |
| ---------------- | -------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `model` (agents) | `claude-sonnet-4-6`, `claude-opus-4-7`, etc. | `gpt-5.4`, `gpt-5.3-Codex`, `gpt-4.1`, etc.               | Pass through unchanged. Warns when value starts with `claude-`. Fix with: `model: { claude: "claude-...", codex: "gpt-5.4", default: ... }` |
| `permissionMode` | `acceptEdits`, `bypassPermissions`, `plan`   | (different concept — Codex uses `sandboxMode`)            | Dropped with warning. Fix with per-target override using `sandboxMode: { codex: "workspace-write" }` for Codex                              |
| `tools` (agents) | flat list of tool names and MCP wildcards    | (no agent-level restriction — use per-MCP `enabledTools`) | Dropped with warning. Configure tool restriction at the MCP server level via `enabledTools` / `disabledTools`                               |

The `effort` field auto-maps cleanly: Claude's `low`/`medium`/`high`/`xhigh` values are valid Codex `model_reasoning_effort` values. Claude's `max` doesn't have a Codex equivalent and is dropped with a warning for Codex.

The `disableAutoInvocation` field on skills auto-maps cleanly too: Codex emits `policy.allow_implicit_invocation: !disableAutoInvocation` in the `agents/openai.yaml` sidecar.
