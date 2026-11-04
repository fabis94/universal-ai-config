# Codex reference

Codex is structurally different from Claude, Copilot, and Cursor. This page covers where Codex output lands, how each template type maps, the runtime behavior that affects it, and the values uac can't translate for it.

## Output paths

Codex writes to several locations, most of them outside its `outputDir`, because these are the paths Codex discovers on its own:

- **`AGENTS.md` files** — Codex reads only AGENTS.md for instructions, so with `codex` as a target uac always generates the AGENTS.md output (`agentsMd.enable: false` is ignored with a warning). Where each instruction lands depends on `agentsMd.variation` — see [config.md](config.md):
  - `nested` (default): root `AGENTS.md` for always-on, folder-less and unscoped templates; `<dir>/AGENTS.md` for folder-scoped `globs` (`packages/web/**` → `packages/web/AGENTS.md`)
  - `concatenate`: everything in the root `AGENTS.md`, with a one-line scope note per scoped section
  - `index`: the root `AGENTS.md` lists folder-scoped templates, written to `<indexDir>/<name>.md` (default `.agents/uac-instructions/`)
- **`.agents/skills/<name>/SKILL.md`** — the open Agent Skills location; an `agents/openai.yaml` sidecar sits next to SKILL.md when needed
- **`.codex/agents/<name>.toml`** — standalone agent role files
- **`.codex/hooks.json`** — hooks
- **`.codex/config.toml`** — only the `mcp_servers` table is uac's; every other key in the file is yours and is preserved

uac 2.x wrote `<dir>/AGENTS.override.md` files instead of nested `AGENTS.md`. Run `uac generate --clean` once after upgrading: clean removes every legacy override file (Codex would read one instead of the new `AGENTS.md` in the same folder).

All of these are gitignored by `uac seed gitignore` (every `AGENTS.md`, nested ones included), so each developer regenerates locally. Clean removes uac's Codex output whole — every `AGENTS.md` in the project, the index dir, `.agents/skills/`, `.codex/agents/`, `.codex/hooks.json` — except the `mcp_servers` key of `.codex/config.toml`. If you deliberately commit a file at one of these paths, add it to `preserveOnClean`.

## Runtime caveats

**Instructions**

- **Launch folder:** Codex loads AGENTS.md files only along the path from the project root to the folder it was launched in (`cd` or `--cd`), once per session. Launched from the repo root, it reads the root `AGENTS.md` only — never `<dir>/AGENTS.md`, even while editing files in `<dir>`. Use `agentsMd.variation: "index"` (the root file points the agent at scoped files) or `"concatenate"` if Codex usually runs from the root.
- **32 KiB budget:** Codex reads at most 32 KiB of AGENTS.md per folder chain — one combined budget, root first — and silently cuts the rest mid-word (later files in the chain are dropped). uac warns when a chain it generates goes over. Fix with the `index` variation, or raise `project_doc_max_bytes` in your Codex config.
- **One file per folder:** an `AGENTS.override.md` in a folder hides that folder's `AGENTS.md`.
- **Untrusted projects** load no project AGENTS.md at all, not even the root one — and no project hooks, MCP servers or agents.
- Edits to AGENTS.md during a session aren't picked up until the session restarts.

**Agents**

- Codex discovers `.codex/agents/*.toml` on its own; no `[agents.*]` registration is needed. The body becomes `developer_instructions`.
- A role file with an unknown key, a blank `description` or a blank body is dropped by Codex (startup warning). uac leaves out the fields Codex can't take and skips agents with no description or body, with a warning.
- Agents inherit the parent session's sandbox, approvals and MCP servers; an agent file can't change them.

**Skills**

- Codex reads only `name` and `description` from SKILL.md; behavior settings (UI metadata, invocation policy, tool dependencies) live in the `agents/openai.yaml` sidecar, emitted when `disableAutoInvocation` or any `codex.*` skill field is set (see [frontmatter.md](frontmatter.md#codex-skill-metadata-codex)).
- A skill name present in two roots Codex reads (e.g. a personal `~/.agents/skills/<name>`) stops `$name` from working.

**Hooks**

- **Trust:** Codex trusts each hook by a hash of the hook and its position in the file. New or changed hooks are skipped until re-trusted in `/hooks` — so a `uac generate` that changes a handler disables it until then. uac keeps handler order exactly as in your templates so regenerating doesn't invalidate unchanged hooks.
- **Feature flag:** `features.codex_hooks` was renamed to `features.hooks` (the old key is a deprecated alias).
- **Relative commands:** hooks run in the session's working folder, so `./scripts/x.sh` breaks when Codex is launched from a subfolder. Use paths that work from anywhere (e.g. `$(git rev-parse --show-toplevel)/scripts/x.sh`).
- A hand-authored inline `[hooks]` table in `.codex/config.toml` is merged with uac's `hooks.json`, with a startup warning.
- Handler types: `command` and `mcp_tool` run; `http`, `prompt` and `agent` are dropped with a warning. `command` is a single shell string, so universal `args` are folded in with shell quoting. Events are in [hooks.md](hooks.md#universal-event-names).

**MCP**

- A server with the same name in `~/.codex/config.toml` is **merged field by field** into the project one. If the two use different transports (`url` vs `command`), Codex fails to load its config entirely.
- Project MCP servers only load in trusted projects.

## Profiles

Codex no longer reads `[profiles.*]` tables from `config.toml` (since 0.134.0). Profiles are separate files: `$CODEX_HOME/<name>.config.toml` with top-level keys, selected with `codex --profile <name>`. uac doesn't generate profiles.

## Cross-target value gotchas

Some universal fields have values that look the same across targets but carry target-specific vocabulary. uac does **not** translate these values — it warns and passes through (or drops) so you can fix them with per-target overrides:

| Field            | Claude vocabulary                                                        | Codex                                                                        | uac behaviour for Codex                                                                                                             |
| ---------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `model` (agents) | `claude-sonnet-5-5`, `opus`, etc.                                        | `gpt-6.1-sol`, `gpt-6-luna`, etc. — see [models.md](models.md)               | Passed through. Warns when the value starts with `claude-`. Fix with `model: { claude: "claude-sonnet-5-5", codex: "gpt-6.1-sol" }` |
| `permissionMode` | `default`, `acceptEdits`, `auto`, `dontAsk`, `bypassPermissions`, `plan` | No per-agent equivalent — agents inherit the session's sandbox and approvals | Dropped with a warning. Set `sandbox_mode` / `default_permissions` in `.codex/config.toml` instead                                  |
| `tools` (agents) | Tool names and MCP wildcards                                             | No agent-level restriction                                                   | Dropped with a warning. Restrict tools per MCP server with `enabledTools` / `disabledTools`                                         |

These map cleanly:

- `effort` → `model_reasoning_effort`: every Claude value (`low`, `medium`, `high`, `xhigh`, `max`) is a Codex value; Codex also takes `ultra`. Support varies by model.
- `disableAutoInvocation` (skills) → `policy.allow_implicit_invocation: false` in `agents/openai.yaml`.
- `version` / `author` (skills) → `metadata.version` / `metadata.author` in SKILL.md.
