---
description: Project conventions and patterns for universal-ai-config
alwaysApply: true
---

## Project Structure

- `src/targets/` — each target (claude, copilot, cursor) is a directory with an `index.ts` implementing `TargetDefinition`
- `src/core/generate.ts` — main orchestrator: discover templates → parse frontmatter → resolve overrides → map → render
- `src/core/parser.ts` — parses markdown templates (gray-matter frontmatter + EJS body)
- `src/core/resolve-overrides.ts` — resolves per-target field overrides before mapping
- `src/config/loader.ts` — c12 config loading (arrays replace, objects deep-merge)
- Tests: `tests/unit/` for isolated logic, `tests/integration/` for full pipeline with fixtures

## Code Conventions

- **ESM only** — always use `.js` extension in relative imports (TypeScript resolves `.ts` → `.js`)
- **pnpm** — never use npm or yarn commands
- **Identity helpers** — use `defineTarget()`, `defineConfig()` for type-safe object literals
- **Zod v4** — use `z.record(z.string(), z.unknown())`, never `z.record(z.unknown())` (Zod v4 requires explicit key schema)
- **No default exports** except for target definitions and the config file

## Testing Patterns

- Integration tests call `generate({ root, targets, types })` and assert on the returned `GeneratedFile[]`
- Each fixture is a self-contained project under `tests/fixtures/` with its own `.universal-ai-config/` directory
- Unit tests for pure functions (parser, resolve-overrides, config schema)
- Run `pnpm check` (lint + format + knip + test) before considering work complete
