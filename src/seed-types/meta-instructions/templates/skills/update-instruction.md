---
name: update-instruction
<% if (standards.instructions) { -%>
description: Create, update, or manage the project's AGENTS.md instructions. Handles finding the right AGENTS.md file, deciding whether to add or change content, and writing it.
<% } else { -%>
description: Create, update, or manage universal-ai-config instruction templates. Handles finding existing instructions, deciding whether to create or modify, and writing the template.
<% } -%>
userInvocable: false
---
<% if (standards.instructions) { -%>

# Manage Instructions (AGENTS.md)

In this project, instructions are the project's own `AGENTS.md` files (`standards` in the uac config), not uac templates. Every tool reads them directly, so there is nothing to generate after a change.

## Finding the Right File

### 1. List the AGENTS.md files

Find every `AGENTS.md` in the project, skipping dependency and build folders and skill folders. The root `AGENTS.md` applies everywhere; `<dir>/AGENTS.md` applies to work in that folder.

### 2. Match the user's intent to existing content

- **Exact match**: a section about the same subject exists → update it
- **Partial overlap**: the topic fits a broader section → add to it rather than starting a new one
- **Folder-specific**: the topic only applies to one part of the project → that folder's `AGENTS.md`

### 3. Choose a file for new content

1. **Search the codebase** for where the topic applies.
2. **Universal** → the root `AGENTS.md`. **One area** → `<folder>/AGENTS.md` (create it if needed).
3. AGENTS.md scopes by folder only. A rule for a file pattern (`**/*.test.ts`) goes in the folder holding those files, or in the root file with a sentence saying which files it's for.

## Writing

- Plain markdown: no frontmatter, no EJS.
- Never edit between `<!-- >>> universal-ai-config >>> -->` and `<!-- <<< universal-ai-config <<< -->`: `uac seed meta-instructions` rewrites that block.
- Keep the root file short. It loads into every session on every tool, and Codex reads at most 32 KiB per folder chain. Put long reference material in a doc under `<%%= config.templatesDir %>/docs/` and link it by path.
- Don't add a `CLAUDE.md`: Claude ignores every AGENTS.md while one has content.

How each tool loads nested files: `<%%= docPath('uac/standards') %>`
<% } else { -%>

# Manage Instruction Templates

Instructions are persistent context and rules that apply to AI conversations, scoped by file patterns or always-on.

## Finding the Right Instruction

### 1. Search existing instructions

List files in `<%%= instructionTemplatePath() %>/` and read their frontmatter (`description`, `globs`) to understand what each covers and its scope.

### 2. Match the user's intent to existing files

Look for instructions that already cover the same topic or a closely related topic. Consider:

- **Exact match**: an instruction about the same subject exists → update it
- **Partial overlap**: the topic fits within the scope of a broader instruction → add to it rather than creating a separate file
- **Multiple candidates**: several instructions touch on the topic → pick the one whose `globs` and purpose align best with the user's intent

### 3. Determine scope for new instructions

If no existing instruction fits, investigate the project to decide where the instruction belongs:

1. **Search the codebase** for how the topic is used — find which files and directories are relevant
2. **Cross-reference with the user's wording** — the instruction may apply broadly (e.g. "always validate env vars") or narrowly (e.g. "feature flags in API routes should use env vars")
3. **Choose the right scoping**:
   - If the rule is universal across the project → use `alwaysApply: true`
   - If it applies to a specific area → use `globs` matching only the relevant files/directories
   - If the topic appears in many places but the instruction only makes sense for a subset, scope to that subset

**Example:** The user says "feature flags should be loaded from env vars." Feature flags might appear in 10 places across the codebase, but if only the API layer loads them from config, the right scope is `globs: ["src/api/**"]` rather than `alwaysApply: true`.

## Deciding What to Do

- **Create new**: when the topic is distinct from all existing instructions
- **Update existing**: when an instruction already covers the topic but needs changes — modify its content or frontmatter
- **Add per-target override**: when a frontmatter field needs different values per target, use the override object syntax:
  ```yaml
  description:
    claude: Claude-specific description
    copilot: Copilot-specific description
    default: Default description
  ```
- **Delete**: when an instruction is obsolete or fully superseded by another; then run `uac generate --clean` so its output goes too

## Creating a New Instruction

1. Create a `.md` file in `<%%= instructionTemplatePath() %>/` with a descriptive name (e.g. `error-handling.md`)
2. Add YAML frontmatter with at minimum a `description`
3. Write the instruction body

### Frontmatter Fields

Key fields: `description`, `globs`, `alwaysApply`, `excludeAgent`. Every field with its per-target support: `<%%= docPath('uac/frontmatter') %>`.

### When to use `alwaysApply` vs `globs`

- Use `alwaysApply: true` for project-wide conventions that should always be active
- Use `globs` to scope instructions to specific file types or directories (e.g. `["src/api/**"]` for API-specific rules)
- If neither is set, the instruction lands in the root `AGENTS.md` (loaded in every session) whenever AGENTS.md is generated; otherwise Cursor applies it only when its agent finds the `description` relevant. Set one of them.

### Keep always-on instructions short

`alwaysApply` instructions load into every session on every target. When an instruction needs long reference material (full tables, API details, edge cases), put that material in a reference doc under `<%%= config.templatesDir %>/docs/` and link it with `<%%%= docPath('name') %>`, so agents read it only when they need it. See **Reference Docs** in `<%%= <%= guidePathHelper %>('uac-template-guide') %%>`.

### AGENTS.md routing

When `codex` is a target or `agentsMd.enable` is set, instructions are written to AGENTS.md files, and Claude, Cursor and Copilot read those instead of their own instruction files. AGENTS.md can only scope by folder, so prefer folder-scoped `globs` (`packages/frontend/**`) over file patterns (`**/*.ts`). **Editing `globs` can move the output file**, so run `uac generate --clean` after any glob change. Where each instruction lands per variation, and what each target loses: `<%%= docPath('uac/config') %>`.

### Example

```markdown
---
description: TypeScript coding conventions
globs: ["**/*.ts", "**/*.tsx"]
---

Follow these TypeScript conventions:

- Use strict mode
- Prefer interfaces over type aliases for object shapes
- Use explicit return types on exported functions
```
<% } -%>
