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

   Look through docs for all supported configuration types:
   - Instructions/rules/"system prompt"
   - Skills/Commands
   - Agents
   - Hooks

2. **Present findings for approval** — before writing any code, present a structured summary of your research to the user. For each supported configuration type, include:
   - **What it maps to**: the universal template type it corresponds to (instructions, skills, agents, hooks)
   - **File location & naming**: where the target expects these files and what extensions/naming conventions it uses
   - **Frontmatter/metadata format**: the exact fields, keys, and structure the target uses (with examples from docs)
   - **Hook format** (if applicable): event names, JSON structure, how handlers are defined
   - **Source links**: direct URLs to the official documentation pages you referenced

   Format as a clear table or grouped list so the user can review each mapping. Ask the user to approve or flag any corrections before proceeding. **Do not continue until the user explicitly approves.**

## Phase 2 — Plan

After the user approves the research findings, **enter plan mode** to design the full implementation before writing any code. The plan should cover:

3. **Review existing targets for patterns** — read through at least one existing target implementation (e.g., `src/targets/claude/index.ts`) and the shared types to understand the exact interfaces and conventions you need to follow.

4. **Draft the implementation plan** — produce a detailed, step-by-step plan that includes:
   - **Target definition**: the full `defineTarget()` structure — `name`, `outputDir`, `supportedTypes`, and for each supported type:
     - `frontmatterMap` — every universal key and what it maps to (string rename or function transform), with reasoning
     - `getOutputPath` — the exact path logic, including how `alwaysApply` or other flags affect routing
   - **Hooks** (if supported): `transform` function logic mapping universal event names → target events, `outputPath`, and `mergeKey` if the hook config nests inside a larger file
   - **Registration**: changes needed in `src/targets/index.ts` and the `Target` type in `src/types.ts`
   - **Config schema**: any changes needed in `src/config/schema.ts` or `src/config/defaults.ts`
   - **Tests**: which fixture(s) to use or create, and what assertions to write
   - **Docs**: any updates needed to README, meta-instruction templates, or seed files
   - **Upstream validation reference**: draft the full content of a new `2.X <Tool Name>` section for [.universal-ai-config/skills/report-feature-changes/upstream-validation-reference.md](../report-feature-changes/upstream-validation-reference.md) (following the Part 4 template in that file) **as part of the plan** — include it inline so the user can review and correct the URLs and per-feature mappings before anything is written. The draft must cover:
     - At least one **Tier 1** authoritative reference URL (docs home, full reference, source repo if open).
     - At least one **Tier 2** changelog / release-notes / blog URL so future drift can be dated.
     - Tier 3 community/adjacent resources if any are notable.
     - Per-feature index rows for **every** feature category from Part 1 that the target supports (file locations, frontmatter per template type, hooks, MCP, tool system, permission modes, memory scopes, model identifiers). Leave a row blank with a `—` note for categories the target doesn't support.
     - Any known beta/preview features or documentation quirks worth pinning in Part 5.
     - If the target has structural differences from other targets (e.g. a different config format, a many-to-one instruction model, files outside the normal output directory), include an "architectural notes" block before the section (see the Codex section for an example).
     - If any features exist that users can hand-author but uac doesn't manage, list them in a "Deferred uac coverage" subsection.

     This is mandatory — without it the `report-feature-changes` skill has no reference URLs and the target will silently drift.

   Reference the `defineTarget()` pattern:

   ```typescript
   import { defineTarget } from "../define-target.js";
   import type { UniversalFrontmatter, UniversalHookHandler } from "../../types.js";

   export default defineTarget({
     name: "<target-name>",
     outputDir: ".<target-dir>",
     supportedTypes: ["instructions", "skills", "agents", "hooks"],
     instructions: {
       frontmatterMap: {
         description: "description",
         globs: "<target-specific-key>",
         alwaysApply: "<target-specific-key>",
       },
       getOutputPath: (name, fm) => `rules/${name}.<ext>`,
     },
     // skills, agents — similar pattern
     // hooks — implement transform function
   });
   ```

   Key decisions to address in the plan:
   - `frontmatterMap`: maps universal keys → target keys. Use a string for direct rename, or a function `(value, fm) => Record<string, unknown>` for transforms
   - `getOutputPath`: determines output file path from template name and frontmatter
   - `consolidate`: if the target maps multiple templates of a type into one or more output files (e.g., many instructions → one `AGENTS.md`), use the `consolidate` function on `TemplateTypeConfig` instead of `getOutputPath`. Consolidate-based types can also emit files at root-relative paths outside `outputDir`. See the Codex target for a reference implementation.
   - Hook `transform`: converts universal event names and handler format to target format
   - Hook `mergeKey`: if the target's hook config is nested inside a larger settings file (like Claude's `settings.json` which has a `hooks` key)
   - **`mcpToolRef` update**: add a `case "<target>"` branch to `mcpToolRef()` in `src/core/parser.ts` with both the specific-tool form (e.g. `server/tool`) and the wildcard form (e.g. `server/*`). Derive these from the MCP tool reference syntax you found in Phase 1.
   - **New universal fields**: audit whether the target needs new fields in `UniversalFrontmatter`, `UniversalMCPServer`, or `UniversalHookHandler` for lossless round-trip fidelity. If so, plan additions to `src/types.ts` and the meta-instruction `uac-template-guide.md` field tables. Common triggers: target-specific auth options, timeout knobs, per-server tool allow/denylists, agent sandbox modes.
   - **Pipeline extensions**: if the target needs a non-JSON output format (e.g., TOML for hooks/MCP) or a new writer primitive for merging into a shared user-managed file, plan those explicitly. Examples: `format: "toml"` on `HooksTypeConfig`/`MCPTypeConfig`, a `mergeTomlKey` writer primitive analogous to the existing `mergeJsonKey`.

5. **Get plan approval** — present the plan to the user for review. **Do not start implementing until the plan is approved.**

## Phase 3 — Implementation

Once the plan is approved, execute it:

6. **Create the target directory** — create `src/targets/<name>/index.ts`

7. **Implement `defineTarget()`** — follow the approved plan to build the full target definition

8. **Register the target** — add to `src/targets/index.ts` and the `Target` type in `src/types.ts`

9. **Add `mcpToolRef` case** — add the new `case "<target>"` branch to `mcpToolRef()` in `src/core/parser.ts`. Add corresponding test cases to `tests/unit/parser.test.ts` (specific-tool and wildcard forms for the new target).

10. **Add new universal type fields** — if the plan identified new fields for `UniversalFrontmatter`, `UniversalMCPServer`, or `UniversalHookHandler`, add them to `src/types.ts` now. Also update the `uac-template-guide.md` field tables to document the new fields with their per-target support annotations.

11. **Add tests** — create integration tests using existing fixtures that generate for the new target, verifying output paths and content

12. **Update the upstream validation reference** — copy the draft section from the approved plan into [.universal-ai-config/skills/report-feature-changes/upstream-validation-reference.md](../report-feature-changes/upstream-validation-reference.md), applying any corrections the user made during plan review. After inserting, skim Part 1 of that file and confirm every feature category your target supports has a corresponding row in the per-feature index.

13. **Run `pnpm check`** to verify everything passes
