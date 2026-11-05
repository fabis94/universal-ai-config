---
name: create-target
description: Scaffold a new target type (e.g., Zed, Windsurf) for universal-ai-config
userInvocable: true
argumentHint: "<target-name>"
---

Create a new target implementation for universal-ai-config. A target maps universal template frontmatter and hooks to a specific AI coding assistant's configuration format.

## Phase 1 — Research & Approval

1. **Research the target's config format** — find up-to-date documentation online for how the target AI assistant expects its configuration files. Look for:
   - File locations and naming conventions (e.g., `.cursor/rules/*.mdc`, `.github/instructions/*.md`)
   - Frontmatter format for each file type
   - Hook configuration format (JSON structure, event names)
   - **MCP tool reference syntax** — how the target references MCP tools in hook matchers, agent `tools:` frontmatter, and any allow/deny lists. Find the exact string format (e.g. `mcp__server__tool`, `server/tool`, `MCP:tool`) and the wildcard convention for "all tools on a server"

   - **What it reads from other tools** — whether it also loads `AGENTS.md` (root, nested, when) and project skills from `.agents/skills/` (the Agent Skills standard's folder), other tools' folders (`.claude/skills`, `.claude/agents`, `.claude/settings.json` hooks, root `.mcp.json`), and what it does when it finds its own copy too: loads both, dedupes identical entries, or prefers its own. Docs are often vague here — follow Part 6 of the [upstream validation reference](../report-feature-changes/upstream-validation-reference.md) to check by running the tool.

   Look through docs for all supported configuration types:
   - Instructions/rules/"system prompt"
   - Skills/Commands
   - Agents
   - Hooks
   - MCP servers

2. **Present findings for approval** — before writing any code, present a structured summary of your research to the user. For each supported configuration type, include:
   - **What it maps to**: the universal template type it corresponds to (instructions, skills, agents, hooks)
   - **File location & naming**: where the target expects these files and what extensions/naming conventions it uses
   - **Frontmatter/metadata format**: the exact fields, keys, and structure the target uses (with examples from docs)
   - **Hook format** (if applicable): event names, JSON structure, how handlers are defined, which handler types it runs
   - **Cross-tool reads**: the other outputs it loads and how it reconciles duplicates (see above)
   - **Source links**: direct URLs to the official documentation pages you referenced

   Format as a clear table or grouped list so the user can review each mapping. Ask the user to approve or flag any corrections before proceeding. **Do not continue until the user explicitly approves.**

## Phase 2 — Plan

After the user approves the research findings, **enter plan mode** to design the full implementation before writing any code. The plan should cover:

3. **Review existing targets for patterns** — read through at least one existing target implementation (e.g., `src/targets/claude/index.ts`) and the shared types to understand the exact interfaces and conventions you need to follow.

4. **Draft the implementation plan** — produce a detailed, step-by-step plan that includes:
   - **Target definition**: the full `defineTarget()` structure — `name`, `label` (the product name `uac setup` shows, e.g. "Claude Code"), `outputDir`, `supportedTypes`, `reads`, and for each supported type:
     - `frontmatterMap` — every universal key and what it maps to (string rename or function transform), with reasoning
     - `outputPath` / `typeDir` / `ownedPaths` — the exact root-relative paths, including how `alwaysApply` or other flags affect routing
     - `render` / `combine` / `frontmatterStyle` if the defaults don't fit (see below)
   - **`reads`**: one `ForeignRead` per type the tool also reads from another target or AGENTS.md, with the reconcile mode and a `loses` sentence
   - **`readsAgentSkills`**: `true` when the tool loads `.agents/skills` on its own. With the AGENTS.md read, it decides standards mode (`standards` config): a tool that reads a standard gets nothing generated for that type, the others get copies
   - **Hooks** (if supported): the `events` map (universal → target names), `handlerTypes`, the `transform`, `outputPath(ctx)`, and `mergeKey` if the hook config nests inside a larger file
   - **MCP** (if supported): `transform`, `outputPath(ctx)`, `mergeKey`/`format` for shared files
   - **Registration**: `src/targets/index.ts`, the `Target` union in `src/types.ts`, and every per-target key list (see step 8)
   - **Config**: `outputDirs` default in `src/config/defaults.ts` and the schema in `src/config/schema.ts`
   - **Tests**: which fixture(s) to use or create, and what assertions to write
   - **Docs**: a row in the README's "What you get" table, and the reference docs that the "Where to document a change" table in the project conventions names (edit seed sources, then reseed)
   - **Upstream validation reference**: draft the full content of a new `2.X <Tool Name>` section for [.universal-ai-config/skills/report-feature-changes/upstream-validation-reference.md](../report-feature-changes/upstream-validation-reference.md) (following the Part 4 template in that file) **as part of the plan** — include it inline so the user can review and correct the URLs and per-feature mappings before anything is written. The draft must cover:
     - At least one **Tier 1** authoritative reference URL (docs home, full reference, source repo if open).
     - At least one **Tier 2** changelog / release-notes / blog URL so future drift can be dated.
     - Tier 3 community/adjacent resources if any are notable.
     - Per-feature index rows for **every** feature category from Part 1 that the target supports (file locations, frontmatter per template type, hooks, MCP, tool system, permission modes, memory scopes, model identifiers). Leave a row blank with a `—` note for categories the target doesn't support.
     - Any known beta/preview features or documentation quirks worth pinning in Part 5.
     - If the target has structural differences from other targets (e.g. a different config format, a many-to-one instruction model, files outside the normal output directory), include an "architectural notes" block before the section (see the Codex section for an example).
     - If any features exist that users can hand-author but uac doesn't manage, list them in a "Deferred uac coverage" subsection.

     This is mandatory — without it the `report-feature-changes` skill has no reference URLs and the target will silently drift.

   Reference the `defineTarget()` pattern (see `src/targets/define-target.ts` for every field):

   ```typescript
   import { defineTarget } from "../define-target.js";

   export default defineTarget({
     name: "<target-name>",
     label: "<Product Name>",
     outputDir: ".<target-dir>",
     supportedTypes: ["instructions", "skills", "agents", "hooks", "mcp"],
     reads: {
       // Facts only — the planner decides what to generate
       instructions: [{ from: "agentsMd", reconcile: "loads-both", loses: "<what it loses>" }],
     },
     instructions: {
       frontmatterMap: {
         description: "description",
         globs: "<target-specific-key>",
       },
       // Root-relative POSIX; use ctx.outputDir so `outputDirs` works
       outputPath: (name, fm, { outputDir }) => `${outputDir}/rules/${name}.<ext>`,
       typeDir: ({ outputDir }) => `${outputDir}/rules`,
       ownedPaths: ({ outputDir }) => [`${outputDir}/rules`],
     },
     // skills, agents — similar pattern
     hooks: {
       events: { preToolUse: "<TargetEvent>" },
       handlerTypes: ["command"],
       transform: (hooks, { report }) => ({ hooks: {} }),
       outputPath: ({ outputDir }) => `${outputDir}/hooks.json`,
     },
   });
   ```

   Key decisions to address in the plan:
   - `frontmatterMap`: maps universal keys → target keys. Use a string for direct rename, or a function `(value, fm, ctx) => Record<string, unknown>` for transforms (`ctx.report()` emits a diagnostic, e.g. a `legacy-field` warning for a field the target dropped)
   - `outputPath` / `typeDir` / `ownedPaths`: root-relative POSIX paths. Everything the type writes must sit under `ownedPaths`, because `uac clean` derives what to remove from them (and from the hooks/MCP `outputPath` + `mergeKey`) — there is no separate clean table. Put files outside `outputDir` only when the tool requires it (Codex skills live in `.agents/skills`)
   - `render`: when one template becomes several files or a non-markdown format (Codex: SKILL.md + `agents/openai.yaml`; agent `.toml`). Skill extra files are still placed next to `outputPath` for you
   - `combine`: when several templates render to the same path (Copilot's always-on instructions → one `copilot-instructions.md`). Without it, a same-path collision is an error
   - `frontmatterStyle: "line-safe"`: when the tool parses frontmatter line by line instead of as YAML (Cursor agents)
   - `instructions: "agentsMd"`: when the tool reads nothing but `AGENTS.md`. The AGENTS.md module (`src/core/agents-md/`) then produces its instructions
   - `reads`: for each type the tool also reads elsewhere — `loads-both` (it loads both copies; the target then skips its own output whenever the other is generated), `same-file` (both targets write the same path), `dedupes-identical` (it skips identical entries; uac warns about the rest), `prefers-own`. Hooks reads can add `events`, `onlyWithMatcher` and `rejectsHandlerTypes`
   - Hook `events` / `handlerTypes` / `transform`: the pipeline drops handlers of other types (with a warning) and handlers missing their required field (silently) before `transform` runs
   - Hook `mergeKey`: if the target's hook config is nested inside a larger settings file (like Claude's `settings.json` which has a `hooks` key)
   - **`mcpToolRef` update**: add a `case "<target>"` branch to `mcpToolRef()` in `src/core/parser.ts` with both the specific-tool form (e.g. `server/tool`) and the wildcard form (e.g. `server/*`). Derive these from the MCP tool reference syntax you found in Phase 1.
   - **New universal fields**: audit whether the target needs new fields in `UniversalFrontmatter`, `UniversalMCPServer`, or `UniversalHookHandler` for lossless round-trip fidelity. If so, plan additions to `src/types.ts` and to the reference docs under `src/seed-types/meta-instructions/templates/docs/uac/` (`frontmatter.md`, `hooks.md`, `mcp.md`). Common triggers: target-specific auth options, timeout knobs, per-server tool allow/denylists.
   - **Pipeline extensions**: if the target needs a non-JSON output format for hooks/MCP, use `format: "toml"` on `HooksTypeConfig`/`MCPTypeConfig`; the writer merges `mergeKey` into JSON or TOML files.

5. **Get plan approval** — present the plan to the user for review. **Do not start implementing until the plan is approved.**

## Phase 3 — Implementation

Once the plan is approved, execute it:

6. **Create the target directory** — create `src/targets/<name>/index.ts`

7. **Implement `defineTarget()`** — follow the approved plan to build the full target definition

8. **Register the target** — add to `src/targets/index.ts` and the `Target` union in `src/types.ts`, then to every per-target key list: `targetSchema` and `perTargetSchema` in `src/config/schema.ts`, `outputDirs` in `src/config/schema.ts` and `src/config/defaults.ts`, the default `targets` in `src/config/defaults.ts`, `OVERRIDE_KEYS` in `src/core/resolve-overrides.ts`, and `TARGET_KEYS` in `src/config/merge-field.ts`

9. **Add `mcpToolRef` case** — add the new `case "<target>"` branch to `mcpToolRef()` in `src/core/parser.ts`. Add corresponding test cases to `tests/unit/parser.test.ts` (specific-tool and wildcard forms for the new target).

10. **Add new universal type fields** — if the plan identified new fields for `UniversalFrontmatter`, `UniversalMCPServer`, or `UniversalHookHandler`, add them to `src/types.ts` now. Also document the new fields with their per-target support annotations in the seed reference docs (`src/seed-types/meta-instructions/templates/docs/uac/frontmatter.md`, `hooks.md`, or `mcp.md`). A new target also needs its column or row in `hooks.md` (event table), `mcp.md` (output paths), `tools.md`, `models.md`, and the per-target path examples in `instructions/uac-template-guide.md`. See the "Where to document a change" table in `<%= instructionPath('project-conventions') %>`.

11. **Add tests**:
    - `tests/unit/targets/<name>.test.ts` — every frontmatter mapping, every output path, the hooks event map and handler output, MCP fields (use `collectingContext()` from `tests/test-helpers.ts` to assert diagnostics)
    - `tests/unit/clean/entries.test.ts` — the clean entries derived from the new definition
    - `tests/unit/plan/build-plan.test.ts` and `tests/integration/pick-one.test.ts` — if the target declares `reads`, the yield / duplicate-run cases
    - `tests/unit/plan/output-mode.test.ts` and `tests/unit/plan/standards.test.ts` — the target's row in the decision table and its standards facts; `tests/integration/standards.test.ts` — what it gets from the `standards-project` fixture
    - integration tests with existing fixtures (`complete-project`, `exhaustive-project`) verifying generated paths and content

12. **Update the upstream validation reference** — copy the draft section from the approved plan into [.universal-ai-config/skills/report-feature-changes/upstream-validation-reference.md](../report-feature-changes/upstream-validation-reference.md), applying any corrections the user made during plan review. After inserting, skim Part 1 of that file and confirm every feature category your target supports has a corresponding row in the per-feature index.

13. **Run `pnpm check`** to verify everything passes
