---
name: update-instruction
description: Create, update, or manage universal-ai-config instruction templates. Handles finding existing instructions, deciding whether to create or modify, and writing the template.
---

# Manage Instruction Templates

Instructions are persistent context and rules that apply to AI conversations, scoped by file patterns or always-on.

## Finding Existing Instructions

List files in `<%= templatesDir %>/instructions/` to discover existing instruction templates. Read their frontmatter to understand what each covers and its scope.

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
- **Delete**: when an instruction is obsolete or fully superseded by another

## Creating a New Instruction

1. Create a `.md` file in `<%= templatesDir %>/instructions/` with a descriptive name (e.g. `error-handling.md`)
2. Add YAML frontmatter with at minimum a `description`
3. Write the instruction body

### Frontmatter Fields

See the **Instructions** section in `<%%= instructionPath('uac-template-guide') %>` for the complete field reference. Key fields: `description`, `globs`, `alwaysApply`, `excludeAgent`.

### When to use `alwaysApply` vs `globs`

- Use `alwaysApply: true` for project-wide conventions that should always be active
- Use `globs` to scope instructions to specific file types or directories (e.g. `["src/api/**"]` for API-specific rules)
- If neither is set, the instruction may still be applied by some targets based on relevance

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

## After Changes

Run `uac generate` to regenerate target-specific config files and verify the output.
