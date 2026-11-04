# uac configuration reference

Everything the config file (`universal-ai-config.config.ts`) supports, plus how template precedence, exclusion, and local overrides work.

## Options

- `templatesDir` — templates directory (default: `.universal-ai-config`)
- `additionalTemplateDirs` — extra directories to discover templates from; supports absolute paths, relative paths, and `~` for home directory (default: `[]`). On a name conflict the **first mention wins**: `templatesDir`, then each entry in order. See [Template precedence](#template-precedence--shadowing).
- `targets` — which targets to generate (default: all)
- `types` — which template types to generate (default: all)
- `variables` — custom variables for templates (EJS in markdown, typed `{{var}}` in JSON — see [Variables](#variables))
- `outputDirs` — override default output directories per target
- `exclude` — glob patterns to skip templates from generation (array or per-target object). Prefix a pattern with a source directory to skip just that copy — see [Template exclusion](#template-exclusion).
- `preserveOnClean` — glob patterns matching **output** paths that `uac clean` must never delete (array or per-target object). See [Preserving files from clean](#preserving-files-from-clean).
- `mcp` — server-name-level opt-in filtering for MCP (`mcp.forceOptIn` + `mcp.mcpServers`). See [mcp.md](mcp.md#server-name-opt-in-filtering).

Any option that takes a per-target object uses the shape `{ claude, copilot, cursor, codex, default }`; a target without its own key falls back to `default`.

## Variables

Config `variables` are available to every template:

- **Markdown templates** (instructions, skills, agents) — as EJS variables in the body.
- **JSON templates** (hooks, MCP) — as `{{variableName}}` placeholders with **typed resolution**:
  - **Exact match** — when the entire JSON value is `"{{varName}}"`, it resolves to the raw typed value (array, object, number, boolean), not just a string
  - **Embedded match** — when `{{varName}}` appears within other text (e.g. `"prefix-{{varName}}-suffix"`), it does string interpolation

```json
{
  "args": "{{playwrightArgs}}",
  "env": {
    "API_HOST": "{{apiHost}}",
    "FULL_URL": "https://{{apiHost}}:{{port}}/api"
  }
}
```

With config variables `{ playwrightArgs: ["-y", "@playwright/mcp@latest"], apiHost: "example.com", port: 3000 }`, this resolves to:

```json
{
  "args": ["-y", "@playwright/mcp@latest"],
  "env": {
    "API_HOST": "example.com",
    "FULL_URL": "https://example.com:3000/api"
  }
}
```

Unmatched `{{placeholders}}` are left as-is. Use `universal-ai-config.overrides.ts` (gitignored) to set environment-specific variable values.

**Important:** `{{varName}}` is for uac config variables. Use `${ENV_VAR}` for runtime environment variable references that should pass through to generated output unchanged.

## Template exclusion

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

For instructions/skills/agents one input file maps to one output, so exclusion is 1:1. For **hooks** and **MCP**, multiple input JSON files merge into a single output: excluding `hooks/debug.json` or `mcp/internal.json` drops every handler/server that file declared. The `exclude` option does not target individual hook handlers or named MCP servers — only the whole input file containing it. For MCP server-name-level filtering, see [mcp.md](mcp.md#server-name-opt-in-filtering).

Patterns can also be **source-qualified** — prefixed with the directory the template came from — which is how you pick a different copy when several directories declare the same name (see [Choosing a different source](#choosing-a-different-source)).

## Template precedence & shadowing

Templates are discovered from `.universal-ai-config/` first, then from each `additionalTemplateDirs` entry in the order they're configured. When two directories declare the same thing, **the first one in that chain wins** and the rest are _shadowed_ — every type, no exceptions.

What counts as "the same thing" depends on the type:

| Type                  | Identity                                            | What the loser loses                 |
| --------------------- | --------------------------------------------------- | ------------------------------------ |
| instructions / agents | filename without `.md`                              | the whole file                       |
| skills                | folder name                                         | the whole folder, extra files too    |
| hooks                 | JSON basename, then each identical resolved handler | that file / that handler             |
| mcp                   | JSON basename, then server name, then input `id`    | that file / that server / that input |
| docs                  | path under `docs/`                                  | that file                            |

Two things this does _not_ do:

- **Skill folders are replaced, never merged.** If the winning `skills/review/` has no `reference.md`, a shadowed copy's `reference.md` is not pulled in.
- **Differently-named hooks/mcp files still merge.** Shadowing only resolves files with the _same_ basename; that's what makes it possible to split servers across `mcp/github.json` and `mcp/local.json`. The sub-file identities (handler, server name, input id) are what make that merge first-wins too.

A skill folder without a `SKILL.md` doesn't claim its name, so a lower-precedence directory with a real skill still wins it.

Within a single directory — two `mcp/*.json` files declaring the same server name, say — files are read in alphabetical order, so which one wins never depends on the filesystem.

### Choosing a different source

`exclude` patterns can address one specific copy by prefixing the template path with its source directory, which promotes the next candidate:

```typescript
additionalTemplateDirs: ["~/.universal-ai-config"],
exclude: {
  // Use the shared review skill instead of this project's copy, for Claude only
  claude: [".universal-ai-config/skills/review/SKILL.md"],
  default: [],
}
```

An **unqualified** pattern (`skills/review/SKILL.md`) still drops the template from _every_ source. Any spelling of the directory works — as written in config, absolute, or `~`-relative — so `~/.universal-ai-config/...` and `/home/you/.universal-ai-config/...` address the same candidate.

Because `exclude` is per-target, so is shadowing: one target can use the shared copy while another uses the local one.

### Seeing what was shadowed

`uac generate` prints a one-line count, and `uac generate --verbose` lists what lost:

```
✔ claude — 4 instructions, 15 skills, 1 hook (1 input)
ℹ 2 shadowed by higher-precedence sources (--verbose to list)
```

```
ℹ 2 shadowed by higher-precedence sources:
  ↳ instructions/dup.md: shared-templates shadowed by .universal-ai-config
  ↳ mcp server "github": shared-templates/mcp/shared.json shadowed by .universal-ai-config/mcp/main.json
```

A candidate you excluded is not listed — you asked for that. Only precedence losers are reported.

## Preserving files from clean

`preserveOnClean` is the mirror image of `exclude`: patterns match **output** paths relative to the project root, not template input paths. Anything matching is left alone by `uac clean` and `uac generate --clean`.

```typescript
// Keep a hand-authored, committed AGENTS.md that uac would otherwise delete
preserveOnClean: ["AGENTS.md"]

// Per-target form
preserveOnClean: {
  codex: ["AGENTS.md"],
  claude: [".claude/skills/manual/**"],
  default: [],
}
```

Reach for it whenever a path uac treats as a generated artifact is actually maintained by hand. Root `AGENTS.md` and `<dir>/AGENTS.override.md` are the usual cases — clean removes them because they exist at a uac-managed path, not because uac verified it wrote them.

Notes:

- Cleaning a directory that contains a preserved file removes the directory's **other** contents and leaves the directory itself in place (e.g. `preserveOnClean: [".claude/skills/manual/**"]` keeps that one skill while every other generated skill goes).
- Preserved paths that actually exist are listed in the clean output, so you can see what was skipped.
- Like `exclude`, an overrides config **replaces** this array; use `mergeField` to concatenate.

## Local overrides and `mergeField`

`universal-ai-config.overrides.ts` (gitignored) is merged over the base config: scalars replace, objects deep-merge, and arrays like `exclude` are **replaced** entirely. To **concatenate** instead, use the `mergeField` helper:

```typescript
// universal-ai-config.overrides.ts
import { defineConfig, mergeField } from "universal-ai-config";
import base from "./universal-ai-config.config";

export default defineConfig({
  exclude: mergeField(base.exclude, ["additional-pattern/**"]),
});
```

`mergeField` handles plain arrays, per-target objects, and mixed combinations. Plain arrays are treated as the `default` value, and target-specific keys fall back to `default` when absent.
