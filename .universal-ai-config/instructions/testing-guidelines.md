---
description: How to write and organize tests
globs: ["tests/**/*.ts", "**/*.test.ts", "src/commands/**", "scripts/tui.ts"]
---

## Coverage

We do little manual testing, so the automated suite must prove every change works. Cover each change at every layer it touches, not with unit tests alone:

- **Unit** — the logic and its edge cases
- **Fixture** — the full pipeline on a fixture project, asserting generated files and diagnostics
- **CLI** — the command run on a temp project (`CliProject`), plus e2e for anything rendered

Write the tests that would fail if the change regressed. A change without that coverage is not done.

## Both Modes

Instructions and skills come from templates or, with `standards`, from the project's AGENTS.md files and `.agents/skills`. A change to instructions, skills, the planner, the locator, clean, the `.gitignore` block, seeding or `skill add` needs tests in both modes:

- **Template-mode regression** — `tests/integration/template-mode-regression.test.ts` snapshots generated files, diagnostics, clean dry runs, `.gitignore` blocks and seed output over every fixture. Update it (`vitest -u`) only on purpose, after checking every changed line.
- **Decision table** — `tests/unit/plan/output-mode.test.ts` asserts `outputFor` for every `standards` value; extend it for a new target or type.
- **Standards mode** — the `standards-project` fixture (`standards.test.ts`, `standards-checks.test.ts`), seeded content per mode (`seed-standards.test.ts`, unit and CLI), and the safety sweep (`standards-safety.test.ts`): every command that writes or deletes runs against hand-written standard files that must come out unchanged. Add any new such command to the sweep.

## Test Organization

- **Unit tests** (`tests/unit/`) — test pure functions in isolation: parser, config schema validation, resolve-overrides, target frontmatter mapping, the planner (`plan/`), AGENTS.md routing/layout (`agents-md/`), clean entries (`clean/`)
- **Integration tests** (`tests/integration/`) — test the full generate pipeline end-to-end using fixtures. Commands that touch disk (`generate`, `clean`) are tested on a temp copy with `CliProject` from `tests/integration/cli-project.ts`
- **E2E tests** (`tests/e2e/`) — the built CLI (`dist/`, built once per run by `tests/e2e/build.ts`) in a real pseudo-terminal: `TerminalSession` feeds its output through a terminal emulator and asserts on the screen a user sees. Use them for anything that renders: prompts, wizard flows, help text, line wrapping. `pnpm test:e2e` runs only these

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

## Changing the CLI (prompts and output)

A mocked `interactive.js` test proves the logic, never how a prompt renders: consola's broken prompt layout once shipped because nobody looked at real terminal output. For any new or changed prompt, wizard step, help text or output line:

1. **Design the screens first.** Before coding, write a step-by-step walkthrough of every screen: exact messages, options, hints, defaults, preselection rules, and when each step appears. Agree it with the user, re-showing the whole walkthrough after every change, and put the agreed version in the plan.
2. **Build on the shared pieces.** Prompts only through the `commands/interactive.ts` wrappers over `@clack/prompts`; output through `consola`; colors from `picocolors`. One function per step, reused by every flow and by the flag-driven path (see `commands/init/steps.ts`). Gate every prompt on `canPrompt()` and give it a flag, so CI, scripts and agents never block.
3. **Test the logic with mocks.** Unit/integration tests mock `interactive.js` (see `agents-overrides.test.ts`) or test pure pieces like `setupMenu()` directly, asserting branching, preselection, hint strings and files written.
4. **Test the rendering for real.** In `tests/e2e`, start the CLI with `useProjects()` / `project.start(args, { cols, rows })`, drive it with `session.press(...)` / `type(...)`, wait with `waitFor(text)` / `waitForExit()`, and snapshot `screenOf(session)` inline at every screen of the walkthrough:
   - at 80 **and** 50 columns (long hints must wrap without breaking the layout);
   - arrow through every option — clack shows a hint only on selected or focused options;
   - moving down then back up must give an identical screen (no ghost or duplicated rows);
   - ctrl-c cancels cleanly; `fitsWidth(screen, 80)` for help text.
     Keep snapshots deterministic: relative paths, `screenOf()` replaces the uac version.
5. **Look at it yourself.** Run `pnpm tui --cols 80 --keys "down*2,space,enter" -- <uac args>` (and `--cols 50`), read every frame, and compare it with the agreed walkthrough. It builds `dist/` first and prints the screen after startup, after each key, and on exit. `--cwd <dir>` runs it in another project; use a scratch directory, never this repo. tmux works too (`tmux new-session -d -x 80 -y 30 '…'`, `send-keys`, `capture-pane -p`).
6. **Check the non-interactive path** never prompts (tests run without a terminal), and update the docs: `docs/uac/cli.md`, plus the README's Commands table and `uac-usage.md` for a new command.

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
- `standards-project` — `standards: true` with hook, MCP, agent and ignored instruction/skill templates. The project's own files (root and nested AGENTS.md, an AGENTS.override.md, `.agents/skills` with binary and executable extras, `.cursor/rules`) are written into a temp copy by `createStandardsProject()` (`tests/integration/standards-project.ts`): committed under `tests/fixtures`, tools working on uac would load them and `uac clean` here would remove them

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
- **Standards facts** — whether the target reads AGENTS.md and `.agents/skills` (`readsAgentSkills`), through `tests/unit/plan/standards.test.ts` and the decision table
- **Field stripping** — for every field that a target does not support, assert with `not.toContain()` that it does not appear in generated output

Target-agnostic logic is exempt from per-target testing: parser, config schema, resolve-overrides, glob normalization, exclude matching, and variable resolution are covered by their own unit tests.
