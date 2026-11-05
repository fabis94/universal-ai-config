# uac configuration reference

Everything the config file (`universal-ai-config.config.ts`) supports, plus how template precedence, exclusion, and local overrides work.

## Options

- `templatesDir` — templates directory (default: `.universal-ai-config`)
- `additionalTemplateDirs` — extra directories to discover templates from; supports absolute paths, relative paths, and `~` for home directory (default: `[]`). On a name conflict the **first mention wins**: `templatesDir`, then each entry in order. See [Template precedence](#template-precedence--shadowing).
- `targets` — which targets to generate (default: all). Usually set per developer in `universal-ai-config.overrides.ts` — see [Shared outputs](#shared-outputs-and-one-target-set-per-machine).
- `types` — which template types uac handles at all (default: all). A type left out is off for every command: not generated, cleaned, seeded, gitignored, or installed by `uac skill add`. To remove what uac generated before you turned a type off, run `uac clean --type <type>`; `--type` replaces `types` for one run.
- `variables` — custom variables for templates (EJS in markdown, typed `{{var}}` in JSON — see [Variables](#variables))
- `outputDirs` — override default output directories per target
- `exclude` — glob patterns to skip templates from generation (array or per-target object). Prefix a pattern with a source directory to skip just that copy — see [Template exclusion](#template-exclusion).
- `preserveOnClean` — glob patterns matching **output** paths that `uac clean` must never delete (array or per-target object). See [Preserving files from clean](#preserving-files-from-clean).
- `mcp` — server-name-level opt-in filtering for MCP (`mcp.forceOptIn` + `mcp.mcpServers`). See [mcp.md](mcp.md#server-name-opt-in-filtering).
- `agentsMd` — AGENTS.md output: `enable`, `variation`, `indexDir` and `keepOverrideFiles`. See [AGENTS.md output](#agentsmd-output).

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

## AGENTS.md output

Codex reads instructions only from `AGENTS.md` files, and Claude Code, Cursor and Copilot read them too. uac generates AGENTS.md files from your instruction templates:

- **always** when `codex` is a target in the run (Codex has no other instruction mechanism), and
- when `agentsMd.enable: true`, even without codex.

While AGENTS.md files are generated, **every target that reads them skips its own instruction output**, so nothing loads twice: no `.claude/rules/`, `.cursor/rules/`, `.github/copilot-instructions.md` or `.github/instructions/`. uac never writes `CLAUDE.md`. See [Shared outputs](#shared-outputs-and-one-target-set-per-machine) for what each target loses.

```typescript
agentsMd: {
  enable: true,               // generate AGENTS.md without codex (forced on with codex)
  variation: "nested",        // "nested" (default) | "concatenate" | "index"
  indexDir: ".agents/uac-instructions", // the index variation's folder (default)
  keepOverrideFiles: false,   // true: AGENTS.override.md files are yours, never warned about or deleted
}
```

`agentsMd` merges field by field, like `mcp`. `enable: false` while `codex` is a target is ignored with an `agents-md-forced` warning.

### Variations

The variation decides where each instruction template's content goes. Tools load nested AGENTS.md files differently, so pick the one that suits the tools you use:

| Variation          | Always-on, unscoped, or folder-less globs (`**/*.ts`) | Folder-scoped globs (`packages/web/**`)                                          |
| ------------------ | ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| `nested` (default) | root `AGENTS.md`                                      | `packages/web/AGENTS.md`                                                         |
| `concatenate`      | root `AGENTS.md`                                      | root `AGENTS.md`, with a scope note                                              |
| `index`            | root `AGENTS.md`                                      | `<indexDir>/<name>.md`, listed in a "Scoped instructions" index in the root file |

- **`nested`:** each folder gets a plain `AGENTS.md` (never `AGENTS.override.md`). Several templates for one folder are joined alphabetically. Tools pick nested files up differently: Claude when it reads a file in the folder, Cursor on read or edit, Copilot CLI 1.0+ on `view`, and Codex only when launched inside that folder.
- **`concatenate`:** everything is in the root file, which every tool loads the same way; every session pays the full context cost.
- **`index`:** the root file opens with a "Scoped instructions" list of folders and the file to read for each (`` - `packages/frontend/` → `.agents/uac-instructions/frontend.md` ``). Index lines list folders only, never globs. Folder-less glob templates are inlined in the root file. This relies on the model following the index.

A section whose file location doesn't fully say its scope gets a one-line note, e.g. "Applies to files matching `src/api/**/*.ts`." Folder routing uses the part of each glob before the first wildcard (`*`, `?`, `[…]`, `{…}`, extglobs); a glob with no wildcard routes to its parent folder. Negated globs and globs with `..` are ignored with an `agents-md-glob` warning. `instructionPath('name')` returns the file a template lands in for the variation, and `instructionPath()` returns `AGENTS.md`.

### `indexDir`

The `index` variation writes scoped instructions to `<indexDir>/<name>.md` (default `.agents/uac-instructions`). uac owns the folder: `clean` deletes it and the gitignore seed ignores it. So it must be a relative path that isn't the project root, contains no `..`, doesn't overlap a templates dir, and isn't inside a folder tools load on their own (`.claude/rules`, `.cursor/rules`, `.github/instructions`, or any skills/agents folder). uac rejects other values. Templates named `AGENTS`, `CLAUDE` (and their `.override`/`.local` forms) are inlined in the root file instead, since tools would load those file names directly.

### Warnings

- **`claude-md-present`:** Claude reads AGENTS.md only while no `CLAUDE.md`, `.claude/CLAUDE.md` or `CLAUDE.local.md` has content. If one does, Claude gets none of uac's instructions. Add `@AGENTS.md` to it (imports the root file only) or remove it.
- **`agents-md-size`:** Codex reads at most 32 KiB of AGENTS.md per folder chain (root plus each ancestor) and silently drops the rest. Use the `index` variation or raise `project_doc_max_bytes` in your Codex config.
- **`agents-override-present`:** see [Leftover `AGENTS.override.md` files](#leftover-agentsoverridemd-files).
- **`shared-divergence`:** the shared files are rendered for one target (codex when present, otherwise the first reader): its per-target overrides, `exclude` and EJS `target`. uac warns when another reader would have gotten a different set of templates, and notes (under `--verbose`) templates that render differently for it.

### Leftover `AGENTS.override.md` files

uac 2.x wrote `<dir>/AGENTS.override.md` files for Codex. uac 3 writes `AGENTS.md` instead, and Codex reads an `AGENTS.override.md` in place of the `AGENTS.md` in the same folder, so a leftover one hides uac's instructions there. Whenever `generate` or `clean` covers instructions, uac lists every `AGENTS.override.md` in the project with an `agents-override-present` warning and, in a terminal, asks whether to delete them (see [cli.md](cli.md#leftover-agentsoverridemd-files)). It never deletes one without asking: the name is also Codex's own mechanism for hand-written overrides.

Set `agentsMd.keepOverrideFiles: true` if yours are hand-written: uac then never warns about or deletes them. To keep only some, list them in `preserveOnClean`.

## Shared outputs and one target set per machine

**Generate only the tools you use on your machine.** Each developer sets `targets` in their own gitignored `universal-ai-config.overrides.ts` — `uac setup` asks and writes it — or passes `-t`; the committed config doesn't have to list every tool. Generating every target at once, and committing all of it, isn't the intended setup.

```typescript
// universal-ai-config.overrides.ts (gitignored, per developer)
import { defineConfig } from "universal-ai-config";

export default defineConfig({ targets: ["claude"] });
```

When several targets do end up in one run, some tools read each other's files, so a tool could load the same instructions twice or run the same hook twice. As a fallback, uac then **generates one copy** and warns (`served-by`). The decision uses the run's target set only — the config's `targets`, as replaced by the overrides file, `-t`, or the API `targets` option. A run with `-t copilot` generates Copilot's own files even if the project config also lists claude.

Codex reads nothing but AGENTS.md, so its instructions always are the [AGENTS.md output](#agentsmd-output). Every other read:

<!-- prettier-ignore -->
| Target | Type | Also reads | What uac does |
| --- | --- | --- | --- |
| claude | instructions | AGENTS.md | skips its own output |
| copilot | instructions | AGENTS.md | skips its own output |
| copilot | hooks | claude | skips its own output |
| copilot | mcp | claude | skips its own output (same file) |
| copilot | skills | claude | keeps both (the tool prefers its own copy) |
| copilot | agents | claude | keeps both (the tool prefers its own copy) |
| cursor | instructions | AGENTS.md | skips its own output |
| cursor | hooks | claude | keeps both; warns about hooks that would run twice |
| cursor | skills | claude | keeps both (the tool prefers its own copy) |
| cursor | agents | claude | keeps both (the tool prefers its own copy) |

What a target loses when it uses the other output instead of its own:

- **claude, instructions:** file-pattern scoping (`paths` globs); nested AGENTS.md files load only when Claude reads a file in that folder, and none load while a non-empty CLAUDE.md, .claude/CLAUDE.md or CLAUDE.local.md exists.
- **copilot, instructions:** `applyTo` patterns, `excludeAgent` and `name`; nested AGENTS.md files load only after Copilot views a file in that folder (CLI 1.0 and later).
- **copilot, hooks:** Copilot-only events (userPromptTransformed, preMcpToolCall, postResult, prePRDescription), `cwd`/`env`, and hooks in the GitHub cloud agent, which reads only .github/hooks. Copilot runs Claude-format hooks with Claude's tool names and payloads, and exit code 1 blocks the tool. Copilot also rejects the whole `.claude/settings.json` if it holds a `prompt`, `agent` or `mcp_tool` handler; uac warns when it does.
- **copilot, mcp:** Copilot-specific server values (per-target `copilot` overrides) and Copilot-only fields such as `deferTools`: the shared .mcp.json is rendered for Claude.
- **cursor, instructions:** glob-scoped and description-only (agent-decided) rules: they become always-on or folder-scoped.
- **cursor, hooks:** nothing — Cursor keeps its own `hooks.json` (with `loop_limit`) next to Claude's. Cursor skips a Claude hook only when its own file has the identical command, so uac warns (`duplicate-hook-run`) about each Claude hook Cursor would still run — one whose command differs per target, or a claude-only one. Cursor ignores Claude's file entirely unless some hook group has a `matcher`.
- **skills and agents:** nothing — Copilot and Cursor prefer their own copy of a skill or agent both targets generate.

`uac generate` prints one warning for all switch-overs, leading with the per-machine `targets` fix; `--verbose` lists what each target loses. Generated files carry `consumers` (every target that reads them) in the API result and in `--dry-run --verbose` output. After changing targets, run `uac generate --clean` so the outputs a target stopped generating are removed.

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

Reach for it whenever a path uac treats as a generated artifact is actually maintained by hand. A hand-written `AGENTS.md` is the usual case — cleaning codex removes every `AGENTS.md` in the project because they sit at uac-managed paths, not because uac verified it wrote them. (Generate also overwrites an `AGENTS.md` at a path it generates, like any other output.)

Notes:

- Cleaning a directory that contains a preserved file removes the directory's **other** contents and leaves the directory itself in place (e.g. `preserveOnClean: [".claude/skills/manual/**"]` keeps that one skill while every other generated skill goes).
- Preserved paths that actually exist are listed in the clean output, so you can see what was skipped.
- Like `exclude`, an overrides config **replaces** this array; use `mergeField` to concatenate.

## Local overrides and `mergeField`

`universal-ai-config.overrides.ts` (gitignored) is merged over the base config: scalars replace, objects deep-merge, and arrays like `targets` and `exclude` are **replaced** entirely. It's the place for per-developer settings, above all `targets` (see [Shared outputs](#shared-outputs-and-one-target-set-per-machine)). To **concatenate** instead, use the `mergeField` helper:

```typescript
// universal-ai-config.overrides.ts
import { defineConfig, mergeField } from "universal-ai-config";
import base from "./universal-ai-config.config";

export default defineConfig({
  exclude: mergeField(base.exclude, ["additional-pattern/**"]),
});
```

`mergeField` handles plain arrays, per-target objects, and mixed combinations. Plain arrays are treated as the `default` value, and target-specific keys fall back to `default` when absent.
