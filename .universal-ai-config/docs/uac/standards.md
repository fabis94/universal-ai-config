# Standards mode: AGENTS.md and `.agents/skills` as sources

By default uac generates every tool's instructions and skills from templates in `.universal-ai-config/` (**template mode**). That is the recommended setup: each tool gets its best native mechanism — glob-scoped rules, Copilot's `applyTo`, Cursor's agent-decided rules, per-target frontmatter and overrides.

Some teams standardise on the open formats instead: hand-written `AGENTS.md` files for instructions and `.agents/skills/<name>/` (Agent Skills) for skills. `standards` makes those the source of truth for their type. uac then never generates, cleans or gitignores them, generates copies only for tools that don't read them, and keeps managing hooks, MCP servers and agents from templates.

The cost: every tool has to rely on AGENTS.md, and each supports it differently (below).

## Config

```typescript
standards: true,           // instructions from AGENTS.md, skills from .agents/skills
standards: "instructions", // only AGENTS.md; skills stay templates
standards: "skills",       // only .agents/skills; instructions stay templates
```

- **Team setting.** Set it in `universal-ai-config.config.ts`. The per-machine overrides file can't set it (uac stops with an error): one developer's `generate` would otherwise overwrite, and their `clean` delete, the files the team commits.
- **`types` still wins.** A type left out of `types` is off entirely, sourced or not.
- **`agentsMd` is off** while instructions come from AGENTS.md: uac generates no AGENTS.md, so `enable`, `variation` and `indexDir` don't apply, and codex no longer forces AGENTS.md output.

## What each tool gets

| Tool    | AGENTS.md                                                                                                                                                                            | `.agents/skills`                                  | uac generates                             |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- | ----------------------------------------- |
| Claude  | Root at startup; nested ones when Claude reads a file in that folder (not on write or edit). **None while a non-empty `CLAUDE.md`, `.claude/CLAUDE.md` or `CLAUDE.local.md` exists** | Doesn't read it                                   | Byte-for-byte copies in `.claude/skills/` |
| Codex   | Root, plus the files on the path from the root to the launch folder (nested files below it never load); 32 KiB per folder chain                                                      | Its own folder                                    | Nothing                                   |
| Cursor  | Root and nested                                                                                                                                                                      | Reads it; a same-named `.cursor/skills` copy wins | Nothing                                   |
| Copilot | Root; nested on `view` (CLI 1.0+). VS Code's Local harness reads nested files only with an experimental setting                                                                      | Reads it; a same-named `.github/skills` copy wins | Nothing                                   |

uac doesn't build `.claude/rules` from nested AGENTS.md files: Claude loads those files itself, and loads rules and AGENTS.md side by side, so every instruction would load twice.

## What you give up

- **Scoping.** A file's folder is its scope. There are no glob patterns (`**/*.test.ts`) or agent-decided rules, and nested files load at different moments per tool.
- **Per-target rendering.** AGENTS.md files and `.agents/skills` folders are read as they are: no EJS, path helpers, per-target frontmatter or overrides. A skill uses the Agent Skills field names (`allowed-tools`, `user-invocable`, …); a tool ignores fields it doesn't know.
- **`exclude`** only affects Claude's copies (`.agents/skills/<name>/SKILL.md` or `skills/<name>/SKILL.md`); the tools that read `.agents/skills` see every skill.
- **Template sources.** Instruction or skill templates — in the templates dir or any `additionalTemplateDirs` entry, personal ones included — are ignored, with a `standard-ignored` warning.

## What uac never touches

For each type kept in a standard (AGENTS.md files for instructions, `.agents/skills` for skills):

- **generate** never writes the standard's files: an `AGENTS.md` or `AGENTS.override.md` for instructions, anything in `.agents/skills` for skills.
- **clean** never removes them, nor a tool's own folder for that type when the tool reads the standard (`.cursor/rules`, `.github/skills`, …): those may be hand-written. It removes Claude's skill copies.
- **The `.gitignore` block** leaves out the standard locations and those folders, and keeps `.claude/skills/`. Refresh it with `uac setup` after setting `standards`.
- **`AGENTS.override.md` files** are hand-written instructions too: uac neither warns about them nor offers to delete them.
- **A committed `.claude/skills` link to `.agents/skills`** already gives Claude every skill: uac copies nothing into it and cleans nothing through it (`standard-linked`, info).

A type that stays a template is generated as usual: with `standards: "instructions"`, Codex still gets `.agents/skills/` from your skill templates, and with `standards: "skills"`, uac still generates AGENTS.md.

Two commands write into the standards: `uac seed meta-instructions`, only uac's own parts (below), and `uac skill add`, which installs into `.agents/skills` while skills come from there.

## Warnings

- `standard-ignored`: instruction or skill templates that the mode ignores. Move their content into the standard, or delete them.
- `standard-shadowed`: a tool's own copy of a skill (`.cursor/skills/x`, `.github/skills/x`, usually left from template mode) wins over `.agents/skills/x`. Delete it.
- `agents-md-missing`: there is no root `AGENTS.md`.
- `claude-md-present`: a non-empty CLAUDE.md makes Claude ignore every AGENTS.md. It also fires when the CLAUDE.md only imports `@AGENTS.md`: that brings in the root file, but nested ones never load. Move its content into AGENTS.md and remove it.
- `agents-md-size`: an AGENTS.md folder chain is over Codex's 32 KiB budget, and Codex silently drops the rest.
- `skill-spec`: a `.agents/skills` skill breaks the Agent Skills spec (name, description, compatibility, metadata).

## Path helpers

Templates (agents, and instructions or skills that stay templates) can still link to sourced files:

- `skillPath('x')` — `.agents/skills/x/SKILL.md` for a tool that reads that folder, Claude's copy for Claude.
- `skillTemplatePath('x')` — the source, `.agents/skills/x/SKILL.md`.
- `instructionPath()` and `instructionTemplatePath()` — `AGENTS.md`.

## uac's own files

`uac seed meta-instructions` puts uac's meta-instructions in the standards:

- **Usage cheat sheet** → a marked block in the root `AGENTS.md` (`<!-- >>> universal-ai-config >>> -->` … `<!-- <<< universal-ai-config <<< -->`). The rest of the file is yours; the block is replaced on every seed.
- **Template guide** → a marked block in `.universal-ai-config/AGENTS.md`, which tools load when working in the templates dir.
- **Management skills** (`update-hook`, `update-mcp`, …) → `.agents/skills/<name>/`, marked with `metadata: { managed-by: universal-ai-config }`. A same-named skill without the marker is the project's own and is never overwritten.

Reseeding after changing `standards` moves them either way. Into the standards, it removes the template-mode copies from `.universal-ai-config/instructions/` and `.universal-ai-config/skills/`. Back to templates, it removes uac's blocks (and an AGENTS.md left empty) and its marked skills. `uac setup` notices when a reseed is due. `uac skill add` installs into `.agents/skills`.

## Switching from template mode

1. `uac clean --type instructions,skills`, so no generated copy is left to duplicate or outrank the standard.
2. Move the content: each instruction into `AGENTS.md` (root for always-on, `<dir>/AGENTS.md` for a folder) and each skill folder into `.agents/skills/` without EJS. `uac generate -t codex --type instructions,skills` writes exactly those files from your templates and can do most of it; take uac's own sections and skills out of the result, since step 4 adds them back. Run it with `agentsMd.variation` at `nested`, so each folder gets its own AGENTS.md. Codex's SKILL.md keeps only the spec fields (name, description, license, compatibility, metadata): add back fields like `allowed-tools`, `user-invocable` or `disable-model-invocation` by hand (the `agents/openai.yaml` sidecar it writes only reaches Codex).
3. Set `standards`, and delete the moved templates.
4. `uac seed meta-instructions`.
5. `uac setup` for the `.gitignore` block, then commit the AGENTS.md files and `.agents/skills/` (the old block ignored them).
6. `uac generate --clean`.

Switching back: move the content into templates, unset `standards`, then `uac seed meta-instructions` (it takes uac's blocks and skills out of the standards) and `uac generate --clean`.
