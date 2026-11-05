---
description: How to use universal-ai-config (uac) to manage AI tool configurations
alwaysApply: true
---

# Universal AI Config (uac)

This project uses **universal-ai-config** (`uac`) to manage AI tool configurations for Claude, Copilot, Cursor, and Codex from a single set of templates. Templates in `<%= config.templatesDir %>/` are the source of truth.

**Do not edit generated config files directly** — changes will be overwritten. Edit the source templates in `<%= config.templatesDir %>/`, then run `uac generate`.

## Invoking uac

Run it through the project's package manager: `pnpm uac <command>`, `npx uac <command>`, `yarn uac <command>`, or `bun uac <command>`. If uac is not a local dependency (e.g. non-JS projects): `npx universal-ai-config <command>`.

It works from any subdirectory — uac searches upward for the project root. `--root <path>` overrides that.

## Commands

- `uac generate` — render templates into target configs. `-t claude,codex` replaces the configured targets, `--type skills` limits types (`--type all` for every type), `-d` previews, `-v` shows per-file output and warning details. Add `--clean` after renaming or deleting a template, changing `globs`, `targets` or `agentsMd.variation`, so stale outputs get removed.
- `uac clean` — remove generated files (every target unless `-t` is given; only the types in `types` unless `--type` is given).
- `uac seed <meta-instructions|examples|gitignore>` — add pre-built template sets.
- `uac skill add <source>` — copy skills from a GitHub repo or local path into the templates (`--list`, `-s <names>`, `--all`).
- `uac init` (alias `uac setup`) — set up the project or this machine's targets; a wizard in a terminal, flags (`-t`, `--examples`, `--reseed`, `--yes`) otherwise.

## Config (`universal-ai-config.config.ts`)

- `templatesDir` / `additionalTemplateDirs` — where templates come from; on a name conflict the first directory wins.
- `targets` — what to generate. Set it per developer in the overrides file (`uac setup` writes it): tools read each other's files, so generating several on one machine makes uac keep one copy and warn.
- `types` — template types uac handles at all; a type left out is never generated, cleaned, seeded or gitignored.
- `variables` — values for EJS (markdown) and `{{var}}` (JSON) templates.
- `outputDirs` — per-target output directory overrides.
- `exclude` — skip templates by input path (per-target allowed).
- `preserveOnClean` — output paths `uac clean` must never delete.
- `mcp` — opt-in filtering of MCP servers by name.
- `agentsMd` — AGENTS.md output (`enable`, `variation`, `indexDir`, `keepOverrideFiles`); always on with codex, and then Claude/Cursor/Copilot use it instead of their own instruction files.
- `standards` — keep instructions (`AGENTS.md`) and/or skills (`.agents/skills`) as hand-written sources instead of templates; template mode is recommended: `<%= docPath('uac/standards') %>`

`universal-ai-config.overrides.ts` (gitignored) is merged over the config for local settings. Arrays there replace the base value; use `mergeField` to concatenate.

## Details — read only when needed

- Creating or editing templates (types, frontmatter, EJS, path helpers, hooks, MCP): `<%= instructionPath('uac-template-guide') %>`
- Every CLI flag, root resolution, clean behavior, `skill add` sources: `<%= docPath('uac/cli') %>`
- Config options in depth, AGENTS.md variations, shared outputs and per-machine `targets`, exclusion, precedence/shadowing, `preserveOnClean`, `mergeField`, variables: `<%= docPath('uac/config') %>`
- Full skill and agent frontmatter fields: `<%= docPath('uac/frontmatter') %>`
- Hook handler fields, event names per target, matchers: `<%= docPath('uac/hooks') %>`
- MCP server fields per target, output paths, opt-in filtering: `<%= docPath('uac/mcp') %>`
- Tool names per target: `<%= docPath('uac/tools') %>`
- Model IDs per target: `<%= docPath('uac/models') %>`
- Codex output locations, caveats, untranslatable values: `<%= docPath('uac/codex') %>`
