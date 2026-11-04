---
description: Project conventions, architecture, and patterns for universal-ai-config
alwaysApply: true
---

## Overview

universal-ai-config (uac) generates target-specific AI tool configs (Claude, Copilot, Cursor) from a single set of universal templates. Templates live in `.universal-ai-config/` and get rendered per-target via `uac generate`.

## Project Structure

```
src/
├── cli.ts                         # CLI entry point (citty)
├── index.ts                       # Public API exports
├── types.ts                       # All TypeScript interfaces
├── commands/                      # CLI command implementations
│   ├── generate.ts                # Main generate command
│   ├── init.ts                    # Scaffold new projects
│   ├── clean.ts                   # Remove generated files
│   └── seed.ts                    # Seed template sets
├── core/                          # Core pipeline modules
│   ├── generate.ts                # Main orchestrator
│   ├── parser.ts                  # Frontmatter + EJS parsing
│   ├── resolve-overrides.ts       # Per-target override resolution
│   ├── writer.ts                  # File writing + cleanup
│   ├── safe-path.ts               # Path traversal protection
│   ├── exclude.ts                 # Template exclusion matching
│   ├── normalize-globs.ts         # Glob pattern normalization
│   └── resolve-json-variables.ts  # Typed variable resolution for JSON
├── config/                        # Configuration system
│   ├── loader.ts                  # c12-based config loading
│   ├── schema.ts                  # Zod schema + defineConfig
│   └── defaults.ts                # Default configuration values
├── targets/                       # Target definitions
│   ├── index.ts                   # Target registry
│   ├── define-target.ts           # TargetDefinition interface
│   ├── claude/index.ts            # Claude target
│   ├── copilot/index.ts           # Copilot target
│   └── cursor/index.ts            # Cursor target
└── seed-types/                    # Seedable template sets
    ├── shared.ts                  # Common seed utilities
    ├── meta-instructions/         # Meta-instructions about uac
    │   └── templates/             # instructions/, skills/, docs/uac/ (seed sources)
    └── examples/                  # Example templates
tests/
├── unit/                          # Isolated function tests
│   ├── parser.test.ts
│   ├── resolve-overrides.test.ts
│   ├── config.test.ts
│   ├── init.test.ts
│   ├── seed.test.ts
│   ├── exclude.test.ts
│   ├── normalize-globs.test.ts
│   ├── resolve-json-variables.test.ts
│   └── targets/                   # Per-target mapping tests
├── integration/                   # Full pipeline tests
│   ├── generate.test.ts
│   ├── complete-project.test.ts
│   ├── per-target-overrides.test.ts
│   ├── additional-dirs.test.ts
│   ├── exclude.test.ts
│   └── variables.test.ts
└── fixtures/                      # Self-contained test projects
    ├── basic-project/
    ├── complete-project/
    ├── complete-complex-project/
    ├── exclude-project/
    ├── additional-dirs-project/
    └── variables-project/
```

## Core Pipeline

The generation pipeline in `src/core/generate.ts` runs this sequence:

1. **Load Config** → merges base config + overrides + CLI flags
2. **Discover Templates** → finds `.md` files in `instructions/`, `skills/`, `agents/` and `.json` files in `hooks/`, `mcp/`
3. **For each template × target:**
   - **Parse** (`parseTemplate`) → extract YAML frontmatter, render EJS body
   - **Resolve Overrides** (`resolveOverrides`) → extract per-target values from override objects
   - **Map Frontmatter** (`mapFrontmatter`) → transform universal keys to target-specific keys
   - **Generate Output Path** → compute target-specific file location
   - **Format Output** → assemble final frontmatter + body as markdown
   - **Copy Extra Files** (skills only) → copy supporting files from skill directories (`.md` with EJS, others raw)
4. **Generate Hooks** (separate path) → merge JSON files, resolve typed variables (`resolveJsonVariables`), resolve per-target overrides at handler level, transform to target format
5. **Generate MCP** (separate path) → merge JSON files, resolve typed variables (`resolveJsonVariables`), resolve per-target overrides per server, transform to target format
6. **Return** `GeneratedFile[]` — files aren't written until the caller invokes `writeGeneratedFiles()`

### Key Modules

- **`parser.ts`** — `parseFrontmatter()` uses gray-matter, `renderEjs()` provides target/type/config variables plus output and template path helpers. `docPath()` resolves reference docs from the docs index that `generate.ts` builds over every template source's `docs/` folder (first source wins; root-relative inside the project, absolute outside)
- **`resolve-overrides.ts`** — detects per-target objects (all keys in `[claude, copilot, cursor, default]`), resolves to the target's value or `default`, returns `undefined` if no match (field dropped)
- **`writer.ts`** — writes files to disk, handles `mergeKey` for JSON merge (e.g. Claude hooks → `settings.json`), handles cleanup per target
- **`safe-path.ts`** — prevents `../` directory traversal attacks
- **`exclude.ts`** — creates glob matchers from `exclude` config (supports per-target exclusion patterns)
- **`normalize-globs.ts`** — `normalizeGlobs()` normalizes glob input (string, comma-separated string, or array) to a consistent array format
- **`resolve-json-variables.ts`** — `resolveJsonVariables()` walks parsed JSON trees resolving `{{varName}}` placeholders: exact-match (`"{{var}}"` as entire value) preserves typed values (arrays, objects, etc.); embedded match does string interpolation

## Target System

Each target in `src/targets/` implements the `TargetDefinition` interface:

```typescript
{
  name: string;
  outputDir: string;                    // e.g. ".claude"
  supportedTypes: TemplateType[];       // which types this target handles
  instructions?: { frontmatterMap, getOutputPath };
  skills?: { frontmatterMap, getOutputPath };
  agents?: { frontmatterMap, getOutputPath };
  hooks?: { transform, outputPath, mergeKey? };
  mcp?: { transform, outputPath };      // MCP server config generation
}
```

**Frontmatter mapping** uses two forms:

- **String**: simple rename (`"description" → "description"`)
- **Function**: `(value, allFrontmatter) => Record<string, unknown>` — can return multiple fields, rename, or return `{}` to drop the field

**Adding a new target** requires:

1. Create `src/targets/{name}/index.ts` implementing `TargetDefinition`
2. Register it in `src/targets/index.ts`
3. Add the target name to the `Target` union type in `src/types.ts`

## Config System

- **`config/loader.ts`** — uses c12 to load `universal-ai-config.config.ts` (base) and `universal-ai-config.overrides.ts` (local overrides, gitignored)
- **Merge strategy**: scalars replace, arrays replace entirely, objects deep-merge
- **`config/schema.ts`** — Zod v4 validation + `defineConfig()` identity helper
- **`config/defaults.ts`** — default `templatesDir`, `targets`, `types`, `outputDirs`, `variables`

## CLI Commands

All commands are in `src/commands/`:

- **`generate`** — main command
- **`init`** — scaffolds `.universal-ai-config/` dir, creates example config, adds overrides to `.gitignore`, seeds meta-instructions
- **`clean`** — removes generated config dirs, accepts `--target`
- **`seed <type>`** — seeds pre-built template sets (`meta-instructions` or `examples`)

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

- **Functions**: `generate()`, `defineConfig()`, `defineTarget()`
- **Types**: `GeneratedFile`, `GenerateOptions`, `ResolvedConfig`, `UserConfig`, `Target`, `TemplateType`, `PerTargetValue`, `UniversalFrontmatter`, `UniversalHookHandler`, `UniversalMCPServer`, `UniversalMCPInput`, `TargetDefinition`, `TemplateTypeConfig`, `HooksTypeConfig`, `MCPTypeConfig`

## Testing

- **Unit tests** (`tests/unit/`) — parser, resolve-overrides, config schema, init, seed, per-target mapping
- **Integration tests** (`tests/integration/`) — full `generate()` pipeline with fixtures
- **Fixtures** (`tests/fixtures/`) — each is a self-contained project:
  - `basic-project` — minimal templates, one of each type
  - `complete-project` — exercises all frontmatter fields
  - `complete-complex-project` — per-target overrides on all field types
- When adding features, prefer extending an existing fixture or creating a new one over modifying `basic-project`
- When making any kind of change evaluate if tests need modifying/adding. Generally speaking we want full coverage for everything.
- Run **`pnpm check`** (lint + format + knip + test) before considering work complete

## Documentation

Documentation lives in two places with different audiences. When making changes to features, CLI, templates, or frontmatter fields, update both as needed.

### `README.md` — for humans

The README is the public-facing overview for people discovering the package on npm/GitHub. It should stay concise and high-level: what uac is, how to install it, basic usage, and links to deeper docs. Avoid duplicating detailed reference material — instead link to the meta-instruction templates for thorough coverage.

### Meta-instruction templates — for AIs

The seed templates in `src/seed-types/meta-instructions/templates/` are seeded into consumer projects on `uac init` / `uac seed meta-instructions`. They are the primary source of truth for AI tools working with uac, split into three tiers by how often they're loaded:

- **`instructions/uac-usage.md`** — `alwaysApply`, so it's loaded into **every** session on every target (and concatenated into Codex's root `AGENTS.md`). Keep it a tiny cheat sheet: one line per command and per config option, plus links. Only touch it for a new command or config option.
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
