---
description: How to write and organize tests
globs: ["tests/**/*.ts", "**/*.test.ts"]
---

## Test Organization

- **Unit tests** (`tests/unit/`) — test pure functions in isolation: parser, config schema validation, resolve-overrides, target frontmatter mapping, the planner (`plan/`), AGENTS.md routing/layout (`agents-md/`), clean entries (`clean/`)
- **Integration tests** (`tests/integration/`) — test the full generate pipeline end-to-end using fixtures. Commands that touch disk (`generate`, `clean`) are tested on a temp copy with `CliProject` from `tests/integration/cli-project.ts`

## Writing Integration Tests

```typescript
import { generateProject } from "../../src/core/generate/index.js";
import { text } from "../test-helpers.js";

const { files, diagnostics } = await generateProject({
  root: FIXTURES_DIR,
  targets: ["claude"],
  types: ["instructions"],
  onDiagnostic: () => {}, // keep warnings out of the test output; assert on `diagnostics`
});

const rule = files.find((f) => f.path.includes("my-rule"));
expect(text(rule)).toContain("expected output");
```

- `text(file)` reads `content` whether it's a string or bytes (skill extra files other than `.md` are `Uint8Array`).
- Assert on diagnostics by `code` and `detail`, not on console output. For target unit tests, `collectingContext()` from `tests/test-helpers.ts` gives a `ctx` whose `report` collects into `diagnostics`.
- CLI prompts go through `src/commands/interactive.ts`. Tests `vi.mock` that module to choose whether a terminal is present and what the user answers (see `agents-overrides.test.ts`); without the mock, tests run with no terminal and nothing prompts.
- `targets` replaces the fixture's configured set — overlapping targets change what's generated (AGENTS.md, Claude's hooks/`.mcp.json` shared with Copilot), so test a target's own rendering with that target alone.

## Fixture Projects

Each fixture is a minimal self-contained project under `tests/fixtures/`:

- `basic-project` — minimal templates, one of each type
- `complete-project` — exercises all frontmatter fields
- `complete-complex-project` — per-target overrides on all field types
- `exhaustive-project` — every per-target field, for stripping checks
- `agents-md-project` — every glob shape AGENTS.md routing handles
- `pick-one-project` — which outputs overlapping targets generate
- `binary-extra-files-project` — byte-exact and executable skill extra files
- `hook-handler-types-project` — handler types per target
- `fields-project` — every 3.0 skill, agent, hook and MCP field, asserted per target

When adding new features, prefer extending an existing fixture or creating a new one rather than modifying `basic-project`.

## Assertions

- Check `file.path` for correct output location
- Check `text(file)` with `toContain()` for expected frontmatter keys/values
- Use `not.toContain()` to verify fields are correctly omitted for specific targets
- For hooks (JSON output), parse with `JSON.parse()` and assert on the object structure

## Per-Target Coverage Expectations

All UAC logic that is target-specific must be tested comprehensively per target. This applies to:

- **Field mappings** — every frontmatter field for every template type (instructions, skills, agents) must have a test asserting the correct output key/value
- **Output file paths** — every `outputPath` / `typeDir` must be tested for its exact output location per target, and `ownedPaths` through `tests/unit/clean/entries.test.ts`
- **Hook transforms** — all supported events (verify correct renaming/dropping), handler types, all handler field passthrough, and the target's handler structure (flat vs. nested-by-matcher)
- **MCP transforms** — all supported fields, and that unsupported fields (e.g. envFile on Codex, sandboxEnabled on Claude) are absent from output
- **Diagnostics** — every field a target drops or rewrites with a warning, asserted by `code` and `detail`
- **Cross-target reads** — a target's `reads` declarations through the planner (`tests/unit/plan/`) and `pick-one-project`
- **Field stripping** — for every field that a target does not support, assert with `not.toContain()` that it does not appear in generated output

Target-agnostic logic is exempt from per-target testing: parser, config schema, resolve-overrides, glob normalization, exclude matching, and variable resolution are covered by their own unit tests.
