---
description: Project conventions, architecture, and patterns for universal-ai-config
alwaysApply: true
---

## Overview

universal-ai-config (uac) generates target-specific AI tool configs (Claude, Copilot, Cursor, Codex) from a single set of universal templates. Templates live in `.universal-ai-config/` and get rendered per-target via `uac generate`.

## Project Structure

```
src/
├── cli.ts                         # CLI entry point (citty)
├── index.ts                       # Public API exports
├── types.ts                       # All TypeScript interfaces
├── commands/                      # CLI commands: generate, init, clean, seed, skill/
│   ├── report.ts                  # CLI summary + grouped diagnostics output
│   └── run-clean.ts               # Shared by `clean` and `generate --clean`
├── core/
│   ├── generate/                  # The pipeline: index (generateProject/generate), discover,
│   │                              #   select, read-cache, templates, agents-md, hooks, mcp,
│   │                              #   frontmatter (incl. line-safe), skill-spec, collisions
│   ├── plan/
│   │   ├── build-plan.ts          # Which outputs a run generates (from targets' `reads`)
│   │   └── locate.ts              # The only place output paths are computed
│   ├── agents-md/                 # AGENTS.md routing, nested/concatenate/index layouts, render
│   ├── clean/                     # Clean entries from ownedPaths, legacy entries, AGENTS.md scan
│   ├── diagnostics.ts             # Typed Diagnostic + DiagnosticSink
│   ├── writer.ts                  # Writes files (bytes, mode, mergeKey) → WriteReport
│   ├── parser.ts                  # Frontmatter + EJS, path helpers
│   ├── shell.ts                   # shellQuote / flattenCommand
│   └── …                          # resolve-overrides, exclude, normalize-globs, safe-path, scan-files, …
├── config/                        # loader (c12), schema (Zod), defaults, validate, merge-field
├── targets/                       # define-target.ts + claude/, copilot/, cursor/, codex/
└── seed-types/                    # Seedable template sets
    ├── shared.ts                  # Common seed utilities
    ├── meta-instructions/         # Meta-instructions about uac
    │   └── templates/             # instructions/, skills/, docs/uac/ (seed sources)
    ├── gitignore/                 # .gitignore block (reads agentsMd.indexDir)
    └── examples/                  # Example templates
tests/
├── test-helpers.ts                # expectYamlField, text(file), collectingContext()
├── unit/                          # Pure functions: parser, config, plan/, agents-md/, clean/, targets/, …
├── integration/                   # Full pipeline with fixtures; cli-project.ts drives CLI commands
└── fixtures/                      # Self-contained test projects
```

## Core Pipeline

`generateProject()` in `src/core/generate/index.ts` runs this sequence (`generate()` returns just its files):

1. **Load config** → base + overrides file + inline overrides + CLI `targets`/`types`, then validate (`config/validate.ts`)
2. **Plan** (`buildPlan`) → from the run's targets and each target's `reads`: whether AGENTS.md is generated (codex in the run, or `agentsMd.enable`) and for whom, which targets skip a type because another output serves them (`servedBy`), and the duplicate hook-run checks
3. **Discover + select** → candidates from every template source; the per-target winner after `exclude` (losers reported as `shadowed`)
4. **Templates** (`templates.ts`) → for each winner × target not served elsewhere: parse + EJS, resolve overrides, `mapFrontmatter`, then the type's `render` or the default markdown render at `outputPath`; skill extra files copied as bytes next to it (`.md` ones EJS-rendered); same-path renders joined by `combine`
5. **AGENTS.md** (`generate/agents-md.ts`) → instructions rendered for the plan's view target, laid out by `core/agents-md`; CLAUDE.md, 32 KiB and divergence checks
6. **Hooks / MCP** → merge JSON files, resolve variables and overrides, filter handler types, transform; cross-target checks (Cursor duplicate runs, Copilot rejecting Claude's file)
7. **Return** `{ files, diagnostics, plan }` after the collision check — nothing is written until `writeGeneratedFiles()`

### Key Modules

- **`parser.ts`** — `parseFrontmatter()`, `renderEjs()` with target/type/config/`consumers` variables plus output and template path helpers. Output helpers go through the locator, so they honour `outputDirs` and AGENTS.md routing. `docPath()` resolves reference docs from the index built over every source's `docs/` folder
- **`plan/locate.ts`** — `createLocator(config, plan?)`: template, type-dir, hooks and MCP paths, root-relative POSIX
- **`diagnostics.ts`** — every warning goes through `sink.report({ code, message, detail, … })`; never `consola.warn` in core or targets. Targets get `ctx.report` in transforms, renderers and frontmatter mappers
- **`resolve-overrides.ts`** — detects per-target objects (all keys in `[claude, copilot, cursor, codex, default]`), resolves to the target's value or `default`, returns `undefined` if no match (field dropped)
- **`writer.ts`** — writes `string | Uint8Array` content, applies `mode`, merges `mergeKey` into JSON/TOML files, skips identical files
- **`clean/`** — removes what targets own (`ownedPaths`, hooks/MCP paths and merge keys), legacy outputs, and every AGENTS.md when an owner is cleaned
- **`exclude.ts`** / **`preserve-on-clean.ts`** — glob matchers on template inputs / output paths (per-target aware)
- **`normalize-globs.ts`** — `normalizeGlobs()` splits comma-separated globs (commas inside `{…}` stay) into an array
- **`resolve-json-variables.ts`** — `{{varName}}` placeholders in hooks/MCP JSON: exact match keeps the typed value, embedded match interpolates

## Target System

Each target in `src/targets/` implements `TargetDefinition` (`src/targets/define-target.ts`):

```typescript
{
  name: Target;
  outputDir: string;                    // e.g. ".claude"
  supportedTypes: TemplateType[];
  reads?: { [type]: ForeignRead[] };    // facts: other outputs the tool also loads
  instructions?: TemplateTypeConfig | "agentsMd";  // "agentsMd": reads only AGENTS.md (Codex)
  skills?: TemplateTypeConfig;
  agents?: TemplateTypeConfig;
  hooks?: { events, handlerTypes, transform, outputPath(ctx), mergeKey?, format? };
  mcp?: { transform, outputPath(ctx), mergeKey?, format? };
}
// TemplateTypeConfig: frontmatterMap, frontmatterStyle?, outputPath(name, fm, ctx),
//   typeDir(ctx), ownedPaths(ctx), render?(input, ctx), combine?(entries, ctx)
```

- **Paths** are root-relative POSIX and use `ctx.outputDir`; `ownedPaths` is what `uac clean` removes — there is no separate clean table.
- **`reads`** are facts (`from`, `reconcile`: `loads-both` | `same-file` | `dedupes-identical` | `prefers-own`, `loses`); the policy lives only in `plan/build-plan.ts`.
- **Frontmatter mapping** — a string renames; a function `(value, allFrontmatter, ctx) => Record<string, unknown>` can return several fields, `{}` to drop, and `ctx.report()` a diagnostic.

**Adding a new target** requires:

1. Create `src/targets/{name}/index.ts` implementing `TargetDefinition`
2. Register it in `src/targets/index.ts`
3. Add the name to the `Target` union in `src/types.ts` and every per-target key list (config schema, `OVERRIDE_KEYS`, `mergeField`'s `TARGET_KEYS`, default `outputDirs`)

## Config System

- **`config/loader.ts`** — uses c12 to load `universal-ai-config.config.ts` (base) and `universal-ai-config.overrides.ts` (local overrides, gitignored; `universal-ai-config.overrides.config.ts` is read when it is the only one), then validates the merged result
- **Merge strategy**: scalars replace, arrays replace entirely, objects deep-merge (`mcp` and `agentsMd` field by field)
- **`config/schema.ts`** — Zod v4 validation + `defineConfig()` identity helper
- **`config/defaults.ts`** — default `templatesDir`, `targets`, `types`, `outputDirs`, `variables`, `agentsMd`
- **`config/validate.ts`** — checks that need the merged config (e.g. `agentsMd.indexDir` placement)

## CLI Commands

All commands are in `src/commands/`:

- **`generate`** — main command; `-t` replaces the configured target set. Output and grouped diagnostics come from `report.ts`
- **`init`** — scaffolds `.universal-ai-config/` dir, creates example config, adds the gitignore block, seeds meta-instructions
- **`clean`** — removes generated output; `-t` names the set being cleaned
- **`seed <type>`** — seeds pre-built template sets (`meta-instructions`, `examples`, `gitignore`)
- **`skill add`** — copies skills from a GitHub repo or local path into the templates dir

## Seed System

`src/seed-types/` contains seedable template sets:

- **`meta-instructions`** — instructions about uac + management skills + reference docs in `docs/uac/` (seeded on `uac init`)
- **`examples`** — example templates for each type (seeded on `uac seed examples`)
- **`shared.ts`** — common utilities: `renderTemplate()`, `getSeedTemplatesDir()`, `collectSkillTemplates()`, `collectDocTemplates()`

Seed templates are EJS-rendered with `config.templatesDir` as a variable. Skills can be seeded as flat `.md` files (become `skills/{name}/SKILL.md`) or as directories with `SKILL.md` + extra supporting files. Files under `docs/` are copied to `<templatesDir>/docs/` — they are never generated, so the seed render is their only EJS pass (see [EJS escaping in seed templates](#ejs-escaping-in-seed-templates)).

## Code Conventions

- **ESM only** — always use `.js` extension in relative imports (TypeScript resolves `.ts` → `.js`)
- **pnpm** — never use npm or yarn commands
- **Identity helpers** — use `defineTarget()`, `defineConfig()` for type-safe object literals
- **Zod v4** — use `z.record(z.string(), z.unknown())`, never `z.record(z.unknown())` (Zod v4 requires explicit key schema)
- **No default exports** except for target definitions and the config file
- **Interactive prompts** — use `@clack/prompts` (`multiselect`/`confirm`/`select` + `isCancel`); never `consola.prompt`. consola bundles a stale, frozen fork of pre-1.0 clack that mis-renders wrapped/multiline options (ghost rows, duplicates). consola is for logging only.
- **TypeScript strict mode** — `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`
- **Build** — tsdown (configured in `tsdown.config.ts`), outputs `dist/cli.mjs` + `dist/index.mjs`

## Public API

Exported from `src/index.ts`:

- **Functions**: `generateProject()`, `generate()`, `writeGeneratedFiles()`, `cleanTargetFiles()`, `loadProjectConfig()`, `defineConfig()`, `defineTarget()`, `mergeField()`, plus the `skill add` helpers
- **Types**: config (`UserConfig`, `ResolvedConfig`, `AgentsMdConfig`, …), templates (`UniversalFrontmatter`, `UniversalHookHandler`, `UniversalMCPServer`, …), results (`GeneratedFile`, `GenerateResult`, `OutputPlan`, `Diagnostic`, `WriteReport`, `CleanOptions`), and the target model (`TargetDefinition`, `TemplateTypeConfig`, `HooksTypeConfig`, `MCPTypeConfig`, `ForeignRead`, …)

## Testing

- **Unit tests** (`tests/unit/`) — parser, config, diagnostics, writer, shell, planner (`plan/`), AGENTS.md (`agents-md/`), clean entries (`clean/`), per-target mapping (`targets/`)
- **Integration tests** (`tests/integration/`) — full `generateProject()` pipeline with fixtures; CLI-level tests (generate/clean on a temp copy) use `CliProject` from `cli-project.ts`
- **Fixtures** (`tests/fixtures/`) — each is a self-contained project:
  - `basic-project` — minimal templates, one of each type
  - `complete-project` — exercises all frontmatter fields
  - `complete-complex-project` — per-target overrides on all field types
  - `agents-md-project` — every glob shape AGENTS.md routing handles
  - `pick-one-project` — which outputs overlapping targets generate
- When adding features, prefer extending an existing fixture or creating a new one over modifying `basic-project`
- When making any kind of change evaluate if tests need modifying/adding. Generally speaking we want full coverage for everything.
- Run **`pnpm check`** (lint + format + knip + test) before considering work complete

## Documentation

Documentation lives in two places with different audiences. When making changes to features, CLI, templates, or frontmatter fields, update both as needed.

### `README.md` — for humans

The README is the public-facing overview for people discovering the package on npm/GitHub. It should stay concise and high-level: what uac is, how to install it, basic usage, and links to deeper docs. Avoid duplicating detailed reference material — instead link to the meta-instruction templates for thorough coverage.

### Meta-instruction templates — for AIs

The seed templates in `src/seed-types/meta-instructions/templates/` are seeded into consumer projects on `uac init` / `uac seed meta-instructions`. They are the primary source of truth for AI tools working with uac, split into three tiers by how often they're loaded:

- **`instructions/uac-usage.md`** — `alwaysApply`, so it's loaded into **every** session on every target (and into the root `AGENTS.md` whenever AGENTS.md is generated). Keep it a tiny cheat sheet: one line per command and per config option, plus links. Only touch it for a new command or config option.
- **`instructions/uac-template-guide.md`** — loaded when files in the templates dir are touched. The authoring core: template types, EJS + path helpers, per-target overrides, the instruction field table, and a short summary of each topic with a `docPath()` link to the full reference.
- **`docs/uac/*.md`** — full reference, never loaded automatically; agents read a file only when a link sends them there. Seeded to `<templatesDir>/docs/uac/` and linked with `docPath('uac/<name>')`.
- **Management skills** (`update-instruction`, `update-skill`, `update-agent`, `update-hook`, `update-mcp`, `update-ai-config`, `import-existing-ai-config`, `ai-config-compress`) — step-by-step workflows. They link to `docs/uac/*` instead of copying tables. Update them when template conventions or file structure change.

### Where to document a change

| Change                                            | Update                                                                                      |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Skill or agent frontmatter field                  | `docs/uac/frontmatter.md` (+ the guide's "most-used fields" line if it's a core field)      |
| Instruction frontmatter field                     | the Instructions table in `uac-template-guide.md`                                           |
| Hook event, handler field, matcher behavior       | `docs/uac/hooks.md`                                                                         |
| MCP server field, output path, opt-in filtering   | `docs/uac/mcp.md`                                                                           |
| CLI command or flag                               | `docs/uac/cli.md` (+ a one-liner in `uac-usage.md` for a new command or common flag)        |
| Config option, precedence/exclude/clean semantics | `docs/uac/config.md` (+ a one-liner in `uac-usage.md` for a new option)                     |
| Codex output paths, caveats, untranslated values  | `docs/uac/codex.md`                                                                         |
| Tool names per target                             | `docs/uac/tools.md`                                                                         |
| Model IDs per target                              | `docs/uac/models.md`                                                                        |
| EJS variable or path helper                       | the EJS Templating section of `uac-template-guide.md`                                       |
| A new doc file                                    | link it with `docPath()` from `uac-usage.md` or the guide, and from any skill that needs it |

All of these live under `src/seed-types/meta-instructions/templates/`. A seed test fails if any `docPath('…')` used in a seeded instruction or skill has no matching file in `docs/`.

### EJS escaping in seed templates

Seed sources are rendered at **seed time** (only `templatesDir` is defined then). Instructions and skills are rendered **again** by `uac generate`; docs are not. So the same intent needs a different escape level:

| Intent                                                              | `instructions/` and `skills/` (2 passes) | `docs/` (1 pass)                                             |
| ------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------ |
| Templates dir path                                                  | `<%%%= config.templatesDir %>`           | `<%%= templatesDir %>`                                       |
| EJS shown literally as an example                                   | `<%%%%= target %>`                       | `<%%%= target %>`                                            |
| Generate-time helper (`docPath`, `instructionPath`, `skillPath`, …) | `<%%%= docPath('uac/hooks') %>`          | not available — use a relative link like `[hooks](hooks.md)` |

When moving text between a doc and an instruction or skill, re-escape it — don't copy it verbatim. Frontmatter is rendered only at seed time, which is why `globs` uses the single-escaped `<%%= templatesDir %>`.

### Never edit seeded outputs directly

This repo dogfoods its own seed templates: `pnpm uac init` was used during setup to populate `.universal-ai-config/` from the seeds in `src/seed-types/meta-instructions/templates/`. The following files in `.universal-ai-config/` are **derived artifacts** — they originate from the seed and must never be hand-edited:

- `instructions/uac-template-guide.md`
- `instructions/uac-usage.md`
- `docs/uac/` (every file)
- `skills/update-instruction/`, `skills/update-skill/`, `skills/update-agent/`, `skills/update-hook/`, `skills/update-mcp/`, `skills/update-ai-config/`, `skills/import-existing-ai-config/`, `skills/ai-config-compress/`

To change any of these, edit the corresponding source under `src/seed-types/meta-instructions/templates/` and regenerate with:

```
pnpm uac seed meta-instructions
```

Then run `pnpm uac generate` to refresh the target outputs (`.claude/`, `.github/`, etc.). Editing the seeded file directly will be overwritten the next time the seed runs.

Repo-only templates (`create-target`, `pr-description`, `release`, `report-feature-changes`, `project-conventions`, `testing-guidelines`) are not seeded — edit them in `.universal-ai-config/` directly.

### Keeping docs in sync

- When changing how templates work (frontmatter, templating, settings): update the file from the table above + the relevant target implementation + mention in `README.md`
- When adding a CLI command or flag or a config option: update `docs/uac/cli.md` or `docs/uac/config.md`, the one-liner in `uac-usage.md` if it's new, and the `README.md` usage section
- When changing template structure or conventions: update relevant management skills
- The README should link to the reference docs rather than duplicate them — keep it as the "quick start" entry point. Some high level core details like available frontmatter/hook fields should still be duplicated, though.

### Keep meta-instructions short

Everything we seed costs tokens in every consumer project. `uac-usage.md` is loaded into **every** session on every target, and `uac-template-guide.md` whenever someone touches their templates. So when documenting a feature, put it in a doc by default and earn every line in an instruction:

- **Instructions** (`uac-usage.md`, `uac-template-guide.md`): add only what an agent needs in most sessions — a one-line summary and a `docPath('uac/…')` link. Put full tables, flag lists, edge cases, examples, and per-target detail in `docs/uac/` (an existing file, or a new one if no topic fits). The size test in `tests/unit/seed.test.ts` fails if `uac-usage.md` grows past its budget — trim or move content rather than raising it.
- **Skills** are loaded only when invoked, so they can afford more, but the same rule applies. Keep `SKILL.md` to the workflow steps. Move bulky reference material into a **sidecar file in the skill's own folder** (turn a flat `skills/<name>.md` seed into `skills/<name>/SKILL.md` + extras, like `ai-config-compress/references/`), linked by relative path. Use `docs/uac/` instead when the material is shared with the guide or other skills, as `update-mcp` and `update-hook` do.
- **Never copy** a table or field list between an instruction, a skill, and a doc. Link to the single copy — duplicates drift (the old `update-mcp` output-path table went stale this way).
