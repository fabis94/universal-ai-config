---
name: report-feature-changes
description: Validate uac's assumptions about supported AI tools (Claude Code, Copilot, Cursor, etc.) against current upstream documentation and produce a written report of drift — renamed fields, new events, deprecated features, schema changes — so the user can plan follow-up changes. Does not modify source code.
userInvocable: true
argumentHint: "[--tool <name>] [--feature <category>]"
allowedTools:
  claude:
    ["Read", "Grep", "Glob", "Bash", "WebFetch", "WebSearch", "Write", "AskUserQuestion", "Agent"]
---

# Report Feature Changes

Compare uac's implementation against the latest upstream documentation for each supported AI tool. Produce a structured report of out-of-date assumptions so the user can decide what to change.

**This skill does not modify uac source files.** It only produces a report. Any code/doc changes are a follow-up step.

## Inputs

Parse `$ARGUMENTS`:

- `--tool <name>` — restrict to one tool (`claude`, `copilot`, `cursor`, `codex`). Defaults to all supported tools.
- `--feature <category>` — restrict to one Part 1 feature category from the reference (e.g. `hooks`, `mcp`, `frontmatter`, `tools`). Defaults to all categories.

If no arguments are provided, ask the user with AskUserQuestion whether they want to validate everything (slow, thorough) or scope down to a single tool/feature first.

## Step 1: Load the Validation Reference

Read [upstream-validation-reference.md](upstream-validation-reference.md) — the companion file in this skill directory. It defines:

- **Part 1** — the feature categories to validate (file locations, frontmatter, hooks, tools, MCP, permissions, models, cross-tool discovery, etc.) and where each is implemented in uac (`src/targets/<tool>/index.ts`, etc.).
- **Part 2** — per-tool documentation URLs grouped by tier. **Tier 1 is authoritative** (vendor reference docs). Tier 2 is for dating changes (changelogs). Tier 3 is community/supporting evidence only.
- **Part 5** — known documentation quality caveats (beta-API churn, in-product-only docs, vendor terminology drift, multiple doc surfaces).
- **Part 6** — how to investigate a tool's internals (isolated install, headless runs, where to see what was loaded, how to read its shipped code) when the docs don't settle a question.

Treat this reference as the source of truth for _what to check and where to look_. Do not invent new URLs — if a needed doc page is missing from the reference, note it as a gap in the final report.

## Step 2: Snapshot uac's Current Assumptions

Before fetching any docs, read uac's current implementation for each tool in scope so you have a concrete baseline to compare against. For each tool:

- `src/targets/<tool>/index.ts` — `outputDir`, `supportedTypes`, `reads` (what the tool also loads from other targets and AGENTS.md), and per template type `frontmatterMap`, `outputPath`/`ownedPaths` and any `render`; the hooks block (`events`, `handlerTypes`, `transform`) and the MCP `transform`.
- `src/types.ts` — `UniversalFrontmatter`, `UniversalHookHandler`, `UniversalMCPServer`, `UniversalMCPInput`, `TemplateType` union.
- `src/seed-types/meta-instructions/templates/docs/uac/*.md` — the full reference docs: `frontmatter.md` (skill/agent fields), `hooks.md` (event mapping + handler fields), `mcp.md` (server fields), `tools.md`, `models.md`, `codex.md`, `cli.md`, `config.md`. Plus the core summaries in `src/seed-types/meta-instructions/templates/instructions/uac-template-guide.md`. Drift in any of these is a finding too.
- `src/core/plan/build-plan.ts` — how `reads` decide which outputs are generated; `src/core/agents-md/` — AGENTS.md routing and layouts; `src/core/clean/` — what clean removes (derived from `ownedPaths`, plus `legacy.ts`).

Note specific identifiers (event names, frontmatter field names, tool names, output paths) so the comparison in Step 3 can be exact, not vague.

## Step 3: Fetch and Compare

For each (tool × feature category) pair in scope:

1. Fetch the Tier 1 URL(s) from Part 2's per-feature index using WebFetch. Prefer the most specific page first; fall back to the docs home only if the specific page 404s.
2. Extract the authoritative section — usually a reference table (event list, frontmatter fields, tool names, MCP server fields).
3. Compare against the uac snapshot from Step 2. Classify each discrepancy:
   - **Added** — upstream supports something uac doesn't expose.
   - **Removed / deprecated** — uac generates something upstream no longer accepts.
   - **Renamed** — same concept, different identifier.
   - **Status change** — moved from beta → stable or stable → deprecated.
   - **Schema change** — same field, different type / shape.
4. For each discrepancy, search Tier 2 (changelog / release notes) for a corresponding announcement. If found, capture the date and a quoted excerpt. If not found, lower the finding's confidence.
5. Apply the Part 5 caveats:
   - Beta features → lower confidence, flag explicitly.
   - In-product-only features → mark as "documentation-incomplete, manual verification required."
   - Conflicting vendor surfaces (e.g. Copilot's `docs.github.com` vs `code.visualstudio.com`) → note the conflict and pick the surface that matches the behavior being checked.

If WebFetch fails for a URL (network error, 404, rate limit), record the URL as unreachable in the report rather than silently skipping the category.

### When the docs don't settle it

Some questions are about runtime behavior: which files get discovered, what triggers loading, precedence, dedupe, size limits. If the docs are vague on one of these, contradict each other, or contradict the changelog, and a finding depends on the answer, investigate the tool directly following Part 6 of the reference.

- **Subagents:** spawn one subagent per tool in parallel, each in its own scratch folder outside the repo.
- **Agent prompts:** pass each agent the Part 6 method and its tool's cheat sheet. Tell it to return findings as text, and save them yourself.
- **Before reporting:** fold the results into the matching findings, labelling each with its evidence type (harness logs, code, model answer). List anything the agents installed or created outside their scratch folders in the report so the user can clean it up.

Ask the user before starting, because it installs tools and spends model usage on their accounts.

## Step 4: Write the Report

Write the report to the OS temp directory at `/tmp/upstream-validation-report-YYYY-MM-DD.md` (use today's date). Do **not** write the report anywhere inside the repo (especially `.universal-ai-config/`, `.claude/`, `.github/`, `.cursor/`, or a repo-local `tmp/`) — it is not a template and must not be picked up by `uac generate` or committed accidentally.

Use this structure:

```markdown
# Upstream Validation Report — YYYY-MM-DD

**Scope:** <tools and feature categories validated>
**Reference doc:** .universal-ai-config/skills/report-feature-changes/upstream-validation-reference.md

## Summary

- N findings (X high confidence, Y medium, Z low)
- N unreachable URLs
- N documentation-incomplete categories

## Findings

### <Tool> — <Feature category>

#### <Finding 1 title>

- **Type:** added | removed | renamed | status change | schema change
- **Confidence:** high | medium | low
- **Upstream evidence:** <URL> — "<quoted excerpt>"
- **Tier 2 evidence:** <changelog URL + date, or "no announcement found">
- **uac files affected:**
  - `src/targets/<tool>/index.ts:<line range>` — <what's there now>
  - `src/seed-types/meta-instructions/templates/docs/uac/<file>.md` (or `src/seed-types/meta-instructions/templates/instructions/uac-template-guide.md`) — <which table>
- **Suggested change:** <one or two sentences>
- **Caveats:** <beta status, conflicting surfaces, in-product-only, etc.>

#### <Finding 2 title>

...

## Unreachable URLs

- <URL> — <error>

## Documentation Gaps

Categories where Tier 1 docs don't expose the answer (manual in-product verification needed):

- <Tool> — <category> — <what's missing>

## Reference Doc Maintenance

If Part 2 URLs in the reference doc were broken or restructured, list them here so they can be updated:

- <URL> — <how it failed>
```

Order findings by confidence (high first) within each tool/category section, so the most actionable items are at the top.

## Step 5: Hand Off to the User

After writing the report, output a short summary in chat:

- Path to the report.
- Headline counts (findings by confidence, unreachable URLs, doc gaps).
- A one-line recommendation for what to tackle first — typically the highest-confidence "renamed" or "removed" findings, since those mean uac is currently generating invalid config.

**Do not start editing uac source files** based on the report. The user reviews the report and decides what to plan; further changes are a separate task.
