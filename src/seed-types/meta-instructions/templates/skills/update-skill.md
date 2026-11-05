---
name: update-skill
<% if (standards.skills) { -%>
description: Create, update, or manage the project's skills in .agents/skills. Handles finding existing skills, deciding whether to create or modify, and writing the skill.
<% } else { -%>
description: Create, update, or manage universal-ai-config skill templates. Handles finding existing skills, deciding whether to create or modify, and writing the template.
<% } -%>
userInvocable: false
---
<% if (standards.skills) { -%>

# Manage Skills (.agents/skills)

In this project, skills are the project's own `.agents/skills/<name>/` folders (`standards` in the uac config), in the Agent Skills format. Codex, Cursor and Copilot read them as they are; `uac generate` copies them to Claude's skills folder.

## Finding Existing Skills

List directories in `.agents/skills/`. Each is a skill with a `SKILL.md`; read its frontmatter to see what it does. A skill whose `metadata` has `managed-by: universal-ai-config` is uac's own: don't edit it, since `uac seed meta-instructions` overwrites it.

## Deciding What to Do

- **Create new**: when the task/workflow is distinct from existing skills
- **Update existing**: when a skill covers similar ground but needs changes — modify its `SKILL.md` or supporting files
- **Delete**: remove the entire skill directory when a skill is obsolete

## Creating a New Skill

1. Create `.agents/skills/{skill-name}/`: lowercase letters, digits and hyphens, at most 64 characters.
2. Create `SKILL.md` inside it with frontmatter and instructions.
3. Optionally add supporting files (references, scripts, assets) in the same folder, and reference them from `SKILL.md`.

### Frontmatter Fields

Use the Agent Skills fields as the tools read them: `name` (matches the folder), `description` (required, at most 1024 characters: what it does and when to use it), `license`, `compatibility`, `metadata` (string values), `allowed-tools`. Tool-specific fields such as `disable-model-invocation`, `user-invocable` or `argument-hint` work where a tool knows them and are ignored elsewhere. No EJS and no per-target overrides: every tool reads the same file. uac warns when a skill breaks the Agent Skills spec.

### Example

```markdown
---
name: create-component
description: Scaffold a new React component with tests and styles. Use when asked to add a component.
argument-hint: "[component-name]"
---

Create a new React component named $ARGUMENTS:

1. Create the component file in src/components/
2. Add unit tests
3. Add a Storybook story
4. Export from the components index
```

## After Changes

Run `uac generate` so Claude gets the updated copy, or `uac generate --clean` after deleting or renaming a skill, so Claude's old copy goes. Details: `<%%= docPath('uac/standards') %>`
<% } else { -%>

# Manage Skill Templates

Skills are reusable actions or workflows invocable as slash commands or auto-triggered by the AI.

## Finding Existing Skills

List directories in `<%%= skillTemplatePath() %>/` to discover existing skills. Each skill is a directory containing a `SKILL.md` file. Read the `SKILL.md` frontmatter to understand what each skill does.

## Deciding What to Do

- **Create new**: when the task/workflow is distinct from existing skills
- **Update existing**: when a skill covers similar ground but needs changes — modify its `SKILL.md` or supporting files
- **Delete**: remove the entire skill directory when a skill is obsolete, then run `uac generate --clean` so its output goes too

## Creating a New Skill

1. Create a directory: `<%%= skillTemplatePath() %>/{skill-name}/`
2. Create `SKILL.md` inside it with frontmatter and instructions
3. Optionally add supporting files (templates, scripts, examples) in the same directory

### Frontmatter Fields

Key fields: `name` (must match the folder name: lowercase letters, digits and hyphens, at most 64 characters), `description` (required), `disableAutoInvocation`, `userInvocable`, `allowedTools`, `skillPaths`, `model`, `hooks`, `metadata` (string values only), `codex`. uac warns when a skill breaks these Agent Skills spec rules. Every field with its per-target support: `<%%= docPath('uac/frontmatter') %>`. Per-target override syntax: `<%%= docPath('uac/templates') %>`.

### Codex-specific UI metadata

For Codex-only UI metadata (display name, icons, brand color, invocation policy, MCP tool dependencies), use the nested `codex.*` frontmatter object. uac emits a sidecar `agents/openai.yaml` next to `SKILL.md` automatically when any `codex.*` field — or `disableAutoInvocation` — is set. The full `codex.*` key list is in `<%%= docPath('uac/frontmatter') %>`.

### Supporting Files

Skills can include additional files in their directory. These are automatically copied to generated output during `uac generate`. `.md` extra files are rendered through EJS (with access to `target`, `config`, path helpers), while non-`.md` files are copied byte for byte, executable bit included.

```
my-skill/
├── SKILL.md          # Main instructions (required)
├── template.md       # Template for the AI to fill in (EJS rendered)
├── examples/
│   └── sample.md     # Example output (EJS rendered)
└── scripts/
    └── helper.sh     # Script the AI can execute (copied raw)
```

Reference supporting files from `SKILL.md` so the AI knows they exist.

### Example

```markdown
---
name: create-component
description: Scaffold a new React component with tests and styles
argumentHint: "[component-name]"
---

Create a new React component named $ARGUMENTS:

1. Create the component file in src/components/
2. Add unit tests
3. Add a Storybook story
4. Export from the components index
```
<% } -%>
