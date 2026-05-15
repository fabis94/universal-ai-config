---
description: How to use universal-ai-config (uac) to manage AI tool configurations
alwaysApply: true
---

# Universal AI Config (uac)

This project uses **universal-ai-config** (`uac`) to manage AI tool configurations from a single set of templates. Instead of maintaining separate config files for Claude, Copilot, Cursor, and Codex, templates in `<%%= config.templatesDir %>/` are the source of truth — run `uac generate` to produce target-specific files.

**Do not edit generated config files directly** — changes will be overwritten. Always edit the source templates in `<%%= config.templatesDir %>/`.

## Invoking uac

First, you must figure out what the project's local package manager is. Other instructions may specify this, or you can infer it some other way. Then, use the project's local package manager to run `uac`.

Examples for different package managers:

- **pnpm**: `pnpm uac <command>`
- **npm**: `npm uac <command>`
- **yarn**: `yarn uac <command>`
- **bun**: `bun uac <command>`

If `uac` is not a local dependency (e.g. non-JS projects): `npx universal-ai-config <command>`

## CLI Commands

### `uac generate`

Generate target-specific config files from templates.

- `--target, -t <targets>` — comma-separated targets: `claude`, `copilot`, `cursor`, `codex`
- `--type <types>` — comma-separated types: `instructions`, `skills`, `agents`, `hooks`, `mcp`
- `--dry-run, -d` — preview what would be generated without writing files
- `--clean` — remove existing generated files before generating

### `uac init`

Scaffold a new `.universal-ai-config/` directory with meta-instruction templates and config file.

### `uac seed <type>`

Seed pre-built template sets into the templates directory. Available types: `meta-instructions`, `examples`, `gitignore`.

### `uac clean`

Remove all generated config directories.

- `--target, -t <targets>` — comma-separated targets to clean

## Configuration

The config file (`universal-ai-config.config.ts`) supports these options:

- `templatesDir` — templates directory (default: `.universal-ai-config`)
- `additionalTemplateDirs` — extra directories to discover templates from; supports absolute paths, relative paths, and `~` for home directory (default: `[]`). Main `templatesDir` takes priority on name conflicts.
- `targets` — which targets to generate (default: all)
- `types` — which template types to generate (default: all)
- `variables` — custom variables for templates (EJS in markdown, typed `{{var}}` in JSON — exact-match placeholders resolve to raw values like arrays/objects)
- `outputDirs` — override default output directories per target
- `exclude` — glob patterns to skip templates from generation (array or per-target object)
- `mcp` — server-name-level opt-in filtering for MCP. `mcp.forceOptIn` toggles allow-list mode per target; `mcp.mcpServers` lists which server names are emitted when opt-in is active. See [MCP opt-in filtering](#mcp-opt-in-filtering) below.

### Template Exclusion

The `exclude` option accepts glob patterns matching **input template paths** relative to `templatesDir` (not output paths):

```typescript
// Same exclusions for all targets
exclude: ["agents/internal-only.md", "hooks/debug.json", "mcp/internal.json"]

// Different exclusions per target
exclude: {
  claude: ["agents/copilot-reviewer.md"],
  copilot: ["skills/**"],
  default: [],
}
```

For instructions/skills/agents one input file maps to one output, so exclusion is 1:1. For **hooks** and **MCP**, multiple input JSON files merge into a single output: excluding `hooks/debug.json` or `mcp/internal.json` drops every handler/server that file declared. The `exclude` option does not target individual hook handlers or named MCP servers — only the whole input file containing it. For MCP specifically, see `mcp.forceOptIn` / `mcp.mcpServers` below for server-name-level filtering.

### MCP Opt-In Filtering

MCP servers can heavily affect agent performance — more servers means more tools loaded, more context, and slower decisions. When you only want a subset of the servers declared across your `mcp/*.json` files, use opt-in mode:

```typescript
mcp: {
  forceOptIn: true,
  mcpServers: ["github", "playwright"],
}
```

When `forceOptIn` resolves to `true` for a target, **only** servers whose names appear in `mcpServers` are emitted — regardless of how many input files declare them. When `forceOptIn` is `false` or unset (the default), all discovered servers pass through, matching the original behavior.

Both fields accept the standard per-target shape, so you can opt-in selectively:

```typescript
mcp: {
  forceOptIn: { claude: true, default: false },
  mcpServers: {
    claude: ["github"],
    copilot: ["github", "playwright"],
    default: [],
  },
}
```

Notes:

- `mcpServers: []` with `forceOptIn: true` → no servers emitted for that target, MCP output file skipped entirely.
- Unknown names (typos, renamed servers) emit a `[uac]` warning listing the known names; generation continues with the matched subset.
- Filtering operates on **server names** (the keys under `mcpServers` inside each `mcp/*.json`). Field-level per-target overrides on individual servers still resolve before filtering.
- Copilot `inputs` (interactive prompts) are not filtered — they're declarative and not tied to specific server names.

## Merging Config Fields

When using an overrides config, array fields like `exclude` are **replaced** entirely by default. To **concatenate** instead, use the `mergeField` helper:

```typescript
// universal-ai-config.overrides.ts
import { defineConfig, mergeField } from "universal-ai-config";
import base from "./universal-ai-config.config";

export default defineConfig({
  exclude: mergeField(base.exclude, ["additional-pattern/**"]),
});
```

`mergeField` handles plain arrays, per-target objects, and mixed combinations. Plain arrays are treated as the `default` value, and target-specific keys fall back to `default` when absent.

## Codex output paths

Unlike the other three targets, Codex emits files in **multiple locations** outside its `outputDir`. This is intentional — Codex auto-discovers these standard locations:

- **`AGENTS.md` at project root** — concatenation of all `alwaysApply: true` instructions (plus templates with leading-wildcard or no globs)
- **`<dir>/AGENTS.override.md`** — per-directory instruction files derived from `globs` prefixes
- **`.agents/skills/<name>/SKILL.md`** — root-relative, per Codex's auto-discovery convention; sidecar `agents/openai.yaml` emitted next to SKILL.md when relevant
- **`.codex/agents/<name>.toml`** — standalone agent files (auto-discovered by Codex)
- **`.codex/hooks.json`** — JSON hooks file
- **`.codex/config.toml`** — only the `[mcp_servers.*]` table is uac-owned; users can hand-author other top-level keys (profiles, providers, permissions, personality, etc.) and uac preserves them

All of these are gitignored by `uac seed gitignore` so each developer regenerates locally.

## Further Reading

See `<%%= instructionPath('uac-template-guide') %>` for the full template authoring guide — template types, frontmatter fields, EJS variables, path helpers, per-target overrides, hook event names, and Codex caveats.
