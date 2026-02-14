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

- **`parser.ts`** — `parseFrontmatter()` uses gray-matter, `renderEjs()` provides target/type/config variables plus output and template path helpers
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

- **`meta-instructions`** — instructions about uac + management skills (seeded on `uac init`)
- **`examples`** — example templates for each type (seeded on `uac seed examples`)
- **`shared.ts`** — common utilities: `renderTemplate()`, `getSeedTemplatesDir()`, `collectSkillTemplates()`

Seed templates are EJS-rendered with `config.templatesDir` as a variable. Skills can be seeded as flat `.md` files (become `skills/{name}/SKILL.md`) or as directories with `SKILL.md` + extra supporting files.

## Code Conventions

- **ESM only** — always use `.js` extension in relative imports (TypeScript resolves `.ts` → `.js`)
- **pnpm** — never use npm or yarn commands
- **Identity helpers** — use `defineTarget()`, `defineConfig()` for type-safe object literals
- **Zod v4** — use `z.record(z.string(), z.unknown())`, never `z.record(z.unknown())` (Zod v4 requires explicit key schema)
- **No default exports** except for target definitions and the config file
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
- Run **`pnpm check`** (lint + format + knip + test) before considering work complete

## Documentation

Documentation lives in two places with different audiences. When making changes to features, CLI, templates, or frontmatter fields, update both as needed.

### `README.md` — for humans

The README is the public-facing overview for people discovering the package on npm/GitHub. It should stay concise and high-level: what uac is, how to install it, basic usage, and links to deeper docs. Avoid duplicating detailed reference material — instead link to the meta-instruction templates for thorough coverage.

### Meta-instruction templates — for AIs

The seed templates in `src/seed-types/meta-instructions/templates/` are detailed reference docs seeded into consumer projects on `uac init`. These are the primary source of truth for AI tools working with uac:

- **`uac-template-guide.md`** — comprehensive template authoring reference: all template types, every frontmatter field, EJS templating, per-target overrides, hooks, available tools. This is the most important doc to keep current when adding or changing frontmatter fields, target behavior, or template features.
- **`uac-usage.md`** — CLI command reference and usage patterns. Update when adding commands, flags, or changing CLI behavior.
- **Management skills** (`update-instruction`, `update-skill`, `update-agent`, `update-hook`, etc.) — step-by-step guides for creating/modifying templates. Update when template conventions or file structure change.

### Keeping docs in sync

- When changing how templates work (frontmatter, templating, settings): update `uac-template-guide.md` field tables + the relevant target implementation + mention in `README.md`
- When adding a CLI command or flag or a config option: update `uac-usage.md` + `README.md` usage section
- When changing template structure or conventions: update relevant management skills
- The README should link to template docs rather than duplicate them — keep it as the "quick start" entry point. Some high level core details like available frontmatter/hook fields should still be duplicated, though.
