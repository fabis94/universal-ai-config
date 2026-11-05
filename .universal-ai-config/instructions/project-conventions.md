---
description: Project conventions, architecture, and patterns for universal-ai-config
alwaysApply: true
---

## Overview

universal-ai-config (uac) generates target-specific AI tool configs (Claude, Copilot, Cursor, Codex) from a single set of universal templates. Templates live in `.universal-ai-config/` and get rendered per-target via `uac generate`.

## Code Quality

Write every change as clean, maintainable, DRY and SOLID code. Prioritize organization, clarity and architecture over quick fixes, even when that takes longer:

- Fix a problem where it belongs. If a change doesn't fit the current structure, refactor the structure instead of patching around it.
- Give each module and function one responsibility; extract shared logic instead of duplicating it.
- If the clean approach takes significantly longer, raise it with the user (the cost and the quicker alternative) before proceeding.

## Project Structure

```
src/
├── cli.ts                         # CLI entry point (citty)
├── index.ts                       # Public API exports
├── types.ts                       # All TypeScript interfaces
├── version.ts                     # UAC_VERSION (from package.json) + compareVersions
├── commands/                      # CLI commands: generate, init/ (+ setup alias), clean, seed, skill/
│   ├── init/                      # The setup wizard: state (checks, once), steps (one fn per
│   │                              #   step), wizard (first-time flow + menu), index (flags)
│   ├── report.ts                  # CLI summary + grouped diagnostics output
│   ├── run-generate.ts            # Shared by `generate` and setup's generate step
│   ├── run-clean.ts               # Shared by `clean` and `generate --clean`
│   ├── setup-hints.ts             # "run uac setup" lines: old seed stamp, stale .gitignore block
│   ├── interactive.ts             # The only module importing @clack/prompts: the prompt seam
│   └── agents-overrides.ts        # Asks to delete leftover AGENTS.override.md files
├── core/
│   ├── generate/                  # The pipeline: index (generateProject/generate), discover,
│   │   │                          #   select, read-cache, templates, agents-md, hooks, mcp,
│   │   │                          #   frontmatter (incl. line-safe), skill-spec, collisions
│   │   └── standards/             # Types read from a standard: Claude's skill copies, AGENTS.md checks
│   ├── plan/
│   │   ├── standards.ts           # Facts about the standards; the only reader of `config.standards`
│   │   ├── build-plan.ts          # How each target gets each type in a run (`outputFor`)
│   │   └── locate.ts              # The only place output paths are computed
│   ├── agents-md/                 # AGENTS.md routing, nested/concatenate/index layouts, render,
│   │                              #   checks (CLAUDE.md, Codex 32 KiB) for generated and hand-written files
│   ├── clean/                     # Clean entries from ownedPaths, legacy entries, AGENTS.md scan,
│   │                              #   leftover AGENTS.override.md files (find/remove, never automatic)
│   ├── diagnostics.ts             # Typed Diagnostic + DiagnosticSink
│   ├── writer.ts                  # Writes files (bytes, mode, mergeKey) → WriteReport
│   ├── parser.ts                  # Frontmatter + EJS, path helpers
│   ├── shell.ts                   # shellQuote / flattenCommand
│   └── …                          # resolve-overrides, exclude, normalize-globs, safe-path, scan-files, …
├── config/                        # loader (c12), schema (Zod), defaults, validate, merge-field,
│                                  #   config-files (find/render/write config + overrides files)
├── targets/                       # define-target.ts + claude/, copilot/, cursor/, codex/
└── seed-types/                    # Seedable template sets
    ├── shared.ts                  # Common seed utilities
    ├── meta-instructions/         # Meta-instructions about uac; placement (where each file goes per
    │   │                          #   mode), destinations (read/write files and AGENTS.md blocks),
    │   │                          #   state.ts: version stamp + drift
    │   └── templates/             # instructions/, skills/, docs/uac/ (seed sources)
    ├── gitignore/                 # .gitignore block (follows `types` + agentsMd.indexDir), its state
    └── examples/                  # Example templates
tests/
├── test-helpers.ts                # expectYamlField, text(file), collectingContext()
├── unit/                          # Pure functions: parser, config, plan/, agents-md/, clean/, targets/, …
├── integration/                   # Full pipeline with fixtures; cli-project.ts drives CLI commands
├── e2e/                           # The built CLI in a real pseudo-terminal (terminal.ts), screens
│                                  #   as inline snapshots
└── fixtures/                      # Self-contained test projects
scripts/
└── tui.ts                         # `pnpm tui`: drive the CLI with keys, print every screen
```

## Core Pipeline

`generateProject()` in `src/core/generate/index.ts` runs this sequence (`generate()` returns just its files):

1. **Load config** → base + overrides file + inline overrides + CLI `targets`/`types`, then validate (`config/validate.ts`)
2. **Plan** (`buildPlan`) → from the run's targets, each target's `reads` and `standards`: `outputFor(target, type)` says how each target gets each type (`own`, `agentsMd`, `served`, `native`, `copy`, `off`); plus whether AGENTS.md is generated and for whom, `servedBy`, and the duplicate hook-run checks
3. **Discover + select** → candidates from every template source; templates of a type read from a standard are set aside (`standard-ignored`); the per-target winner after `exclude` (losers reported as `shadowed`)
4. **Templates** (`templates.ts`) → for each winner × target whose mode is `own`: parse + EJS, resolve overrides, `mapFrontmatter`, then the type's `render` or the default markdown render at `outputPath`; skill extra files copied as bytes next to it (`.md` ones EJS-rendered); same-path renders joined by `combine`
5. **AGENTS.md** (`generate/agents-md.ts`) → instructions rendered for the plan's view target, laid out by `core/agents-md`; CLAUDE.md, 32 KiB and divergence checks
6. **Standards** (`generate/standards/`) → types read from a standard: byte-for-byte skill copies for `copy` targets (Claude), checks on the project's AGENTS.md files
7. **Hooks / MCP** → merge JSON files, resolve variables and overrides, filter handler types, transform; cross-target checks (Cursor duplicate runs, Copilot rejecting Claude's file)
8. **Return** `{ files, diagnostics, plan }` after the collision check and the guard against writing into a standard — nothing is written until `writeGeneratedFiles()`

### Key Modules

- **`parser.ts`** — `parseFrontmatter()`, `renderEjs()` with target/type/config/`consumers` variables plus output and template path helpers. Output helpers go through the locator, so they honour `outputDirs` and AGENTS.md routing. `docPath()` resolves reference docs from the index built over every source's `docs/` folder
- **`plan/standards.ts`** — `sourcedTypes`, `readsStandard`, `ownedByUac` (what clean removes and `.gitignore` ignores: a fact about the config, not a run), `writesIntoStandard`, `resolvesIntoAgentSkills` (symlinks), `skillSourceDir`, `standardView`
- **`plan/locate.ts`** — `createLocator(config, plan?)`: template, type-dir, hooks and MCP paths, root-relative POSIX; works from facts, so it agrees with or without a plan
- **`diagnostics.ts`** — every warning goes through `sink.report({ code, message, detail, … })`; never `consola.warn` in core or targets. Targets get `ctx.report` in transforms, renderers and frontmatter mappers
- **`resolve-overrides.ts`** — detects per-target objects (all keys in `[claude, copilot, cursor, codex, default]`), resolves to the target's value or `default`, returns `undefined` if no match (field dropped)
- **`writer.ts`** — writes `string | Uint8Array` content, applies `mode`, merges `mergeKey` into JSON/TOML files, skips identical files
- **`clean/`** — removes what targets own (`ownedPaths`, hooks/MCP paths and merge keys) where `ownedByUac`, legacy outputs, and every AGENTS.md when an owner is cleaned (`agentsMdOwners`, none while instructions are sourced)
- **`exclude.ts`** / **`preserve-on-clean.ts`** — glob matchers on template inputs / output paths (per-target aware)
- **`normalize-globs.ts`** — `normalizeGlobs()` splits comma-separated globs (commas inside `{…}` stay) into an array
- **`resolve-json-variables.ts`** — `{{varName}}` placeholders in hooks/MCP JSON: exact match keeps the typed value, embedded match interpolates

## Target System

Each target in `src/targets/` implements `TargetDefinition` (`src/targets/define-target.ts`):

```typescript
{
  name: Target;
  label: string;                        // product name shown to people, e.g. "Claude Code"
  outputDir: string;                    // e.g. ".claude"
  supportedTypes: TemplateType[];
  reads?: { [type]: ForeignRead[] };    // facts: other outputs the tool also loads
  readsAgentSkills?: true;              // fact: loads .agents/skills on its own
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
- **Standards facts** — whether a tool reads AGENTS.md (`reads.instructions` from `agentsMd`, or `instructions: "agentsMd"`) and `.agents/skills` (`readsAgentSkills`) decide standards mode: a reader gets nothing generated (`native`), the others get copies (`copy`).
- **Frontmatter mapping** — a string renames; a function `(value, allFrontmatter, ctx) => Record<string, unknown>` can return several fields, `{}` to drop, and `ctx.report()` a diagnostic.

**Adding a new target** requires:

1. Create `src/targets/{name}/index.ts` implementing `TargetDefinition`
2. Register it in `src/targets/index.ts`
3. Add the name to the `Target` union in `src/types.ts` and every per-target key list (config schema, `OVERRIDE_KEYS`, `mergeField`'s `TARGET_KEYS`, default `targets` and `outputDirs`)

## Config System

- **`config/loader.ts`** — uses c12 to load `universal-ai-config.config.ts` (base) and `universal-ai-config.overrides.ts` (local overrides, gitignored; `universal-ai-config.overrides.config.ts` is read when it is the only one), then validates the merged result. Every load reads the file as it is on disk now (`importFresh`), since setup writes the overrides file and generates in one process
- **Merge strategy**: scalars replace, arrays replace entirely, objects deep-merge (`mcp` and `agentsMd` field by field). `standards` is a team setting: the overrides file can't set it (load error)
- **`config/schema.ts`** — Zod v4 validation + `defineConfig()` identity helper
- **`config/defaults.ts`** — default `templatesDir`, `targets`, `types`, `outputDirs`, `variables`, `agentsMd`
- **`config/validate.ts`** — checks that need the merged config (e.g. `agentsMd.indexDir` placement)
- **`types`** — a type left out is off for **every** command: discovery, generation, clean (`runClean` passes `config.types`; `--type` replaces it, like `-t`), seeds, the `.gitignore` block, `skill add`

## CLI Commands

All commands are in `src/commands/`. Changing a prompt or CLI output follows the workflow in the testing guidelines ("Changing the CLI").

- **`generate`** — main command; `-t` replaces the configured target set. Output and grouped diagnostics come from `report.ts`
- **`init`** (alias **`setup`**) — a wizard in a terminal: first-time setup (config, meta-instructions, gitignore block) or a menu for an existing project; asks this machine's coding agents and writes the overrides file. Flags instead of prompts otherwise
- **`clean`** — removes generated output; `-t` names the set being cleaned
- **`seed <type>`** — seeds pre-built template sets (`meta-instructions`, `examples`, `gitignore`)
- **`skill add`** — copies skills from a GitHub repo or local path into the templates dir (`.agents/skills` while skills are sourced)

## Seed System

`src/seed-types/` contains seedable template sets:

- **`meta-instructions`** — instructions about uac + management skills + reference docs in `docs/uac/` (seeded on `uac init`)
- **`examples`** — example templates for each type (seeded on `uac seed examples`)
- **`shared.ts`** — common utilities: `renderTemplate()`, `getSeedTemplatesDir()`, `collectSkillTemplates()`, `collectDocTemplates()`

Seed templates are EJS-rendered with `templatesDir`, `standards` (`{ instructions, skills }`) and `guidePathHelper` as variables. `meta-instructions/placement.ts` decides where each file goes: the templates dir, or — for a type read from a standard — a marked block in an AGENTS.md (`uac-usage`, the template guide) or `.agents/skills/<name>/` with `metadata.managed-by` (management skills), rendered fully at seed time for `standardView`. Reseeding moves uac's own files when `standards` changed, either way. Skills can be seeded as flat `.md` files (become `skills/{name}/SKILL.md`) or as directories with `SKILL.md` + extra supporting files. Files under `docs/` are copied to `<templatesDir>/docs/` — they are never generated, so the seed render is their only EJS pass (see [EJS escaping in seed templates](#ejs-escaping-in-seed-templates)).

## Two Modes

Instructions and skills come from uac templates (**template mode**, the default and the recommended setup) or, with `standards`, from the project's own AGENTS.md files and `.agents/skills` (**standards mode**). Keep the split clean:

- **One decision point.** `plan/standards.ts` holds the facts and `plan/build-plan.ts` the per-run decision (`outputFor`). Nothing else reads `config.standards`; modules ask the plan, the locator or the `plan/standards.ts` helpers.
- **Decide both modes.** Any change to instructions, skills, the locator, clean, the `.gitignore` block, seeding or `skill add` decides — and tests — its behaviour in both modes.
- **Never touch the standards.** No command writes or deletes AGENTS.md files, `.agents/skills`, or the folders of tools that read them, except the seed (its marked block and marked skills). The `standards-safety` tests sweep every command.
- **Template mode stays byte-identical** unless a change means it to: `template-mode-regression` snapshots files, diagnostics, clean results, `.gitignore` blocks and seed output.

## Code Conventions

- **ESM only** — always use `.js` extension in relative imports (TypeScript resolves `.ts` → `.js`)
- **pnpm** — never use npm or yarn commands
- **Identity helpers** — use `defineTarget()`, `defineConfig()` for type-safe object literals
- **Zod v4** — use `z.record(z.string(), z.unknown())`, never `z.record(z.unknown())` (Zod v4 requires explicit key schema)
- **No default exports** except for target definitions and the config file
- **CLI libraries** — the ones the `skill` commands use, everywhere: `@clack/prompts` for prompts, `consola` for output, `picocolors` for colors. Every prompt (confirm, select, multiselect, note, intro/outro) goes through the wrappers in `commands/interactive.ts` (`askYesNo`/`confirmAction`, `selectOne`, `selectMany`, `showNote`, `startFlow`/`endFlow`); no other module imports clack, so tests mock one module. Gate every prompt on `canPrompt()` (no prompt without a terminal: CI, scripts, agents) and give it a flag equivalent. Never `consola.prompt`: consola bundles a stale, frozen fork of pre-1.0 clack that mis-renders wrapped/multiline options (ghost rows, duplicates).
- **TypeScript strict mode** — `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`
- **Build** — tsdown (configured in `tsdown.config.ts`), outputs `dist/cli.mjs` + `dist/index.mjs`

## Public API

`src/index.ts` is the list of exports. Every exported function, option and type carries a TSDoc comment, and those comments are the API reference: the README shows one example and points there. Adding or changing an export means writing or updating its comment.

## Testing

- **Unit tests** (`tests/unit/`) — parser, config, diagnostics, writer, shell, planner (`plan/`), AGENTS.md (`agents-md/`), clean entries (`clean/`), per-target mapping (`targets/`)
- **Integration tests** (`tests/integration/`) — full `generateProject()` pipeline with fixtures; CLI-level tests (generate/clean on a temp copy) use `CliProject` from `cli-project.ts`
- **E2E tests** (`tests/e2e/`, vitest project `e2e`) — the built CLI in a real pseudo-terminal, asserting on the screen a user sees; `pnpm test:e2e` runs only these
- **Fixtures** (`tests/fixtures/`) — each is a self-contained project:
  - `basic-project` — minimal templates, one of each type
  - `complete-project` — exercises all frontmatter fields
  - `complete-complex-project` — per-target overrides on all field types
  - `agents-md-project` — every glob shape AGENTS.md routing handles
  - `pick-one-project` — which outputs overlapping targets generate
- When adding features, prefer extending an existing fixture or creating a new one over modifying `basic-project`
- Cover every change with automated tests at each layer it touches: unit, fixture (integration) and CLI (`CliProject`, e2e), not unit tests alone. We rarely test manually, so the suite is what proves a change works.
- Run **`pnpm check`** (lint + knip + test + tsc) before considering work complete
- Work is complete only when its docs are too: update what [Where to document a change](#where-to-document-a-change) names in the same change (seed sources, then `pnpm uac seed meta-instructions`). `tests/unit/docs-coverage.test.ts` fails when a frontmatter field, hook event, config option, CLI flag, EJS helper or diagnostic code isn't named in its doc, but no test can tell a stale description from a correct one

## Documentation

Documentation lives in two places with different audiences, and every fact has one home: the README summarizes and links, the reference docs hold the detail. When making changes to features, CLI, templates, or frontmatter fields, update the home the table below names.

### `README.md` — for humans

The README is the public-facing overview for people discovering the package on npm/GitHub: the pitch, the two modes, install, quick start, one short section per concept, a Configuration section (one line per option, excludes, overrides and `mergeField`), the commands table, the docs index, one API example and contributing links. It names and summarizes; apart from the options table it never lists fields, flags, per-target behavior or API signatures — it links the doc that has them. Links point at this repo's rendered copies in `.universal-ai-config/docs/uac/` (the seed sources show raw EJS).

Tests keep it honest: `tests/unit/readme.test.ts` fails on a broken link or anchor in the README or a reference doc, on a doc missing from the README's Documentation table, and on a config option missing from its Configuration table; `tests/unit/seed.test.ts` fails when a seeded copy in `.universal-ai-config/` differs from its seed source.

### Meta-instruction templates — for AIs

The seed templates in `src/seed-types/meta-instructions/templates/` are seeded into consumer projects on `uac init` / `uac seed meta-instructions`. They are the primary source of truth for AI tools working with uac, split into three tiers by how often they're loaded:

- **`instructions/uac-usage.md`** — `alwaysApply`, so it's loaded into **every** session on every target (and into the root `AGENTS.md` whenever AGENTS.md is generated). Keep it a tiny cheat sheet: one line per command and per config option, plus links. Only touch it for a new command or config option.
- **`instructions/uac-template-guide.md`** — loaded when files in the templates dir are touched. The authoring core: template types, the decision guide, rules every template follows (always use path helpers), and a short summary of each topic — EJS, per-target overrides, frontmatter, hooks, MCP — with a `docPath()` link to the full reference.
- **`docs/uac/*.md`** — full reference, never loaded automatically; agents read a file only when a link sends them there. Seeded to `<templatesDir>/docs/uac/` and linked with `docPath('uac/<name>')`. They are the human reference too: the README links this repo's seeded copies.
- **Management skills** (`update-instruction`, `update-skill`, `update-agent`, `update-hook`, `update-mcp`, `update-ai-config`, `import-existing-ai-config`, `ai-config-compress`) — step-by-step workflows. They link to `docs/uac/*` instead of copying tables. Update them when template conventions or file structure change.

### Where to document a change

| Change                                            | Update                                                                                                                                                                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Skill or agent frontmatter field                  | `docs/uac/frontmatter.md` (+ the guide's "most-used fields" line if it's a core field)                                                                                                                             |
| Instruction frontmatter field                     | `docs/uac/frontmatter.md` (+ the guide's Instructions fields line if it's a core field)                                                                                                                            |
| Hook event, handler field, matcher behavior       | `docs/uac/hooks.md`                                                                                                                                                                                                |
| MCP server field, output path, opt-in filtering   | `docs/uac/mcp.md`                                                                                                                                                                                                  |
| CLI command or flag                               | `docs/uac/cli.md` (+ a one-liner in `uac-usage.md` for a new command or common flag)                                                                                                                               |
| Config option, precedence/exclude/clean semantics | `docs/uac/config.md` (+ a one-liner in `uac-usage.md` and a row in the README's Configuration table for a new option)                                                                                              |
| Codex output paths, caveats, untranslated values  | `docs/uac/codex.md`                                                                                                                                                                                                |
| Tool names per target                             | `docs/uac/tools.md`                                                                                                                                                                                                |
| Model IDs per target                              | `docs/uac/models.md`                                                                                                                                                                                               |
| EJS variable or path helper                       | `docs/uac/templates.md` (+ its name in the guide's EJS Templating section)                                                                                                                                         |
| A new doc file                                    | link it with `docPath()` from `uac-usage.md` or the guide and from any skill that needs it; add it to `UAC_DOCS` in `tests/unit/seed.test.ts` and a row to the README's Documentation table (tests fail otherwise) |
| Standards-mode behaviour (`standards`)            | `docs/uac/standards.md` (+ a mode branch in the affected instruction or skill)                                                                                                                                     |
| Diagnostic code                                   | name it, in backticks, in the doc that explains the behavior behind it                                                                                                                                             |
| Public API export, option or type                 | its TSDoc comment, which is the API reference (the README shows one example only)                                                                                                                                  |
| New command, mode, target or core concept         | the docs above, plus the matching README section or table row (Commands, What you get, the modes table)                                                                                                            |

All of these live under `src/seed-types/meta-instructions/templates/`. A seed test fails if any `docPath('…')` used in a seeded instruction or skill has no matching file in `docs/`.

### EJS escaping in seed templates

Seed sources are rendered at **seed time** (only `templatesDir` is defined then). Instructions and skills are rendered **again** by `uac generate`; docs are not. So the same intent needs a different escape level:

| Intent                                                              | `instructions/` and `skills/` (2 passes) | `docs/` (1 pass)                                                           |
| ------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------- |
| Templates dir path                                                  | `<%%%= config.templatesDir %>`           | `<%%= templatesDir %>`                                                     |
| EJS shown literally as an example                                   | `<%%%%= target %>`                       | `<%%%= target %>` inside a fenced block (a seed test rejects EJS in prose) |
| Generate-time helper (`docPath`, `instructionPath`, `skillPath`, …) | `<%%%= docPath('uac/hooks') %>`          | not available — use a relative link like `[hooks](hooks.md)`               |

When moving text between a doc and an instruction or skill, re-escape it — don't copy it verbatim. Frontmatter is rendered only at seed time, which is why `globs` uses the single-escaped `<%%= templatesDir %>`.

**Mode branches.** Where standards mode changes a location or wording, branch at seed time on lines of their own: `<%% if (standards.skills) { -%%>` … `<%% } else { -%%>` … `<%% } -%%>`. Keep the template-mode text byte-identical (the regression snapshot checks it), and prefer one branch around a whole section over many inline ones. Link the template guide from skills through `guidePathHelper` (a skill in `.agents/skills` links the guide's source, not one tool's copy). Standard-bound files get a second render at seed time, so no generate-time tag may survive in them; `tests/unit/seed-standards.test.ts` checks that. Prettier mangles these control lines, so `instructions/` and `skills/` seed sources are in `.prettierignore` — format them by hand.

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

Then run `pnpm uac generate` to refresh the target outputs (`.claude/`, `.github/`, etc.). Editing the seeded file directly will be overwritten the next time the seed runs, and `tests/unit/seed.test.ts` fails until the seeded copies match their sources, so reseed in the same change.

Repo-only templates (`create-target`, `pr-description`, `release`, `report-feature-changes`, `project-conventions`, `testing-guidelines`) are not seeded — edit them in `.universal-ai-config/` directly.

### Keeping docs in sync

- When changing how templates work (frontmatter, templating, settings): update the file from the table above + the relevant target implementation
- When adding a CLI command or flag or a config option: update `docs/uac/cli.md` or `docs/uac/config.md`, the one-liner in `uac-usage.md` if it's new, and the README's Commands table for a new command
- When changing template structure or conventions: update relevant management skills
- Never copy reference material into the README: summarize it in a sentence and link the doc (see [`README.md` — for humans](#readmemd--for-humans)).

### Keep meta-instructions short

Everything we seed costs tokens in every consumer project. `uac-usage.md` is loaded into **every** session on every target, and `uac-template-guide.md` whenever someone touches their templates. So when documenting a feature, put it in a doc by default and earn every line in an instruction:

- **Instructions** (`uac-usage.md`, `uac-template-guide.md`): add only what an agent needs in most sessions — a one-line summary and a `docPath('uac/…')` link. Put full tables, flag lists, edge cases, examples, and per-target detail in `docs/uac/` (an existing file, or a new one if no topic fits). The size test in `tests/unit/seed.test.ts` fails if `uac-usage.md` grows past its budget — trim or move content rather than raising it.
- **Skills** are loaded only when invoked, so they can afford more, but the same rule applies. Keep `SKILL.md` to the workflow steps. Move bulky reference material into a **sidecar file in the skill's own folder** (turn a flat `skills/<name>.md` seed into `skills/<name>/SKILL.md` + extras, like `ai-config-compress/references/`), linked by relative path. Use `docs/uac/` instead when the material is shared with the guide or other skills, as `update-mcp` and `update-hook` do.
- **Never copy** a table or field list between an instruction, a skill, and a doc. Link to the single copy — duplicates drift (the old `update-mcp` output-path table went stale this way).
