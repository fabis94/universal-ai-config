---
description: How to use universal-ai-config (uac) to manage AI tool configurations
alwaysApply: true
---

# Universal AI Config (uac)

This project uses **universal-ai-config** (`uac`) to manage AI tool configurations from a single set of templates. Instead of maintaining separate config files for Claude, Copilot, and Cursor, templates in `<%%= config.templatesDir %>/` are the source of truth — run `uac generate` to produce target-specific files.

**Do not edit generated config files directly** — changes will be overwritten. Always edit the source templates in `<%%= config.templatesDir %>/`.

## Invoking uac

Use the project's local package manager to run `uac`:

- **pnpm**: `pnpm run uac <command>`
- **npm**: `npm run uac <command>`
- **yarn**: `yarn run uac <command>`
- **bun**: `bun run uac <command>`

If `uac` is not a local dependency (e.g. non-JS projects): `npx universal-ai-config <command>`

## CLI Commands

### `uac generate`

Generate target-specific config files from templates.

- `--target, -t <targets>` — comma-separated targets: `claude`, `copilot`, `cursor`
- `--type <types>` — comma-separated types: `instructions`, `skills`, `agents`, `hooks`
- `--dry-run, -d` — preview what would be generated without writing files
- `--clean` — remove existing generated files before generating

### `uac init`

Scaffold a new `.universal-ai-config/` directory with example templates and config file.

### `uac seed <type>`

Seed pre-built template sets into the templates directory. Available types: `meta-instructions`.

### `uac clean`

Remove all generated config directories.

- `--target, -t <targets>` — comma-separated targets to clean

## Further Reading

See `<%%= instructionPath('uac-template-guide') %>` for the full template authoring guide — template types, frontmatter fields, EJS variables, path helpers, per-target overrides, and hook event names.
