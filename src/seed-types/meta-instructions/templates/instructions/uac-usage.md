---
description: How to use universal-ai-config (uac) to manage AI tool configurations
alwaysApply: true
---

# Universal AI Config (uac)

This project uses **universal-ai-config** (`uac`) to manage AI tool configurations from a single set of templates. Instead of maintaining separate config files for Claude, Copilot, and Cursor, templates in `<%%= config.templatesDir %>/` are the source of truth — run `uac generate` to produce target-specific files.

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

- `--target, -t <targets>` — comma-separated targets: `claude`, `copilot`, `cursor`
- `--type <types>` — comma-separated types: `instructions`, `skills`, `agents`, `hooks`
- `--dry-run, -d` — preview what would be generated without writing files
- `--clean` — remove existing generated files before generating

### `uac init`

Scaffold a new `.universal-ai-config/` directory with meta-instruction templates and config file.

### `uac seed <type>`

Seed pre-built template sets into the templates directory. Available types: `meta-instructions`, `examples`.

### `uac clean`

Remove all generated config directories.

- `--target, -t <targets>` — comma-separated targets to clean

## Configuration

The config file (`universal-ai-config.config.ts`) supports these options:

- `templatesDir` — templates directory (default: `.universal-ai-config`)
- `targets` — which targets to generate (default: all)
- `types` — which template types to generate (default: all)
- `variables` — custom EJS variables for templates
- `outputDirs` — override default output directories per target
- `exclude` — glob patterns to skip templates from generation (array or per-target object)

### Template Exclusion

The `exclude` option accepts glob patterns matching paths relative to `templatesDir`:

```typescript
// Same exclusions for all targets
exclude: ["agents/internal-only.md", "hooks/debug.json"]

// Different exclusions per target
exclude: {
  claude: ["agents/copilot-reviewer.md"],
  copilot: ["skills/**"],
  default: [],
}
```

## Further Reading

See `<%%= instructionPath('uac-template-guide') %>` for the full template authoring guide — template types, frontmatter fields, EJS variables, path helpers, per-target overrides, and hook event names.
