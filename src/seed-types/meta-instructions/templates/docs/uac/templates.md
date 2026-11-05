# Template reference: EJS, path helpers and per-target values

Instruction, skill and agent templates in `<%= templatesDir %>/` are rendered once per target. This page has everything in scope while they render, what each path helper returns per target, how per-target values work, and how reference docs are linked. Frontmatter fields are in [frontmatter.md](frontmatter.md).

## EJS

A template's body is rendered with [EJS](https://ejs.co/) for each target, so it can print values and include text for some targets only:

```markdown
---
description: TypeScript conventions
globs: ["src/**/*.ts"]
---

Follow the style rules in <%%= instructionPath('coding-style') %>.
<%% if (target === 'claude') { -%%>
Run `pnpm tsc` with the Bash tool before finishing.
<%% } -%%>
```

Only the body is rendered: frontmatter takes [per-target values](#per-target-values) instead. A skill's extra `.md` files are rendered like its `SKILL.md`, and its other files are copied as they are. Hooks and MCP templates are JSON and use `{{variable}}` placeholders ([config.md](config.md#variables)).

| Variable       | Value                                                                                                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `target`       | The target being generated: `claude`, `copilot`, `cursor` or `codex`                                                                                                   |
| `type`         | The template type: `instructions`, `skills` or `agents`                                                                                                                |
| `consumers`    | Every target that reads this output: `[target]`, or several for a shared file such as AGENTS.md, which is rendered once with `target` set to codex or the first reader |
| `config`       | The resolved config, e.g. `config.templatesDir`                                                                                                                        |
| your variables | Each key of the config's `variables`, by name                                                                                                                          |

## Output path helpers

They return where a template lands for the target being generated, following `outputDirs` and the AGENTS.md layout. Omit the name to get the directory. Use them whenever a template points at another one; never hardcode a target's path.

| Helper                      | Returns                                                               |
| --------------------------- | --------------------------------------------------------------------- |
| `instructionPath(name?)`    | An instruction's output file, or the instructions directory           |
| `skillPath(name?)`          | A skill's `SKILL.md`, or the skills directory                         |
| `skillDirPath(name, file?)` | A skill's folder, or a file inside it (references, scripts, examples) |
| `agentPath(name?)`          | An agent's output file, or the agents directory                       |
| `docPath(name?)`            | A [reference doc](#reference-docs), or the docs directory             |

What they return per target:

| Call                                     | Claude                               | Copilot                                             | Cursor                               | Codex                                |
| ---------------------------------------- | ------------------------------------ | --------------------------------------------------- | ------------------------------------ | ------------------------------------ |
| `instructionPath('coding-style')`        | `.claude/rules/coding-style.md`      | `.github/instructions/coding-style.instructions.md` | `.cursor/rules/coding-style.mdc`     | the AGENTS.md file it lands in       |
| `instructionPath()`                      | `.claude/rules`                      | `.github/instructions`                              | `.cursor/rules`                      | `AGENTS.md`                          |
| `skillPath('deploy')`                    | `.claude/skills/deploy/SKILL.md`     | `.github/skills/deploy/SKILL.md`                    | `.cursor/skills/deploy/SKILL.md`     | `.agents/skills/deploy/SKILL.md`     |
| `skillDirPath('deploy', 'reference.md')` | `.claude/skills/deploy/reference.md` | `.github/skills/deploy/reference.md`                | `.cursor/skills/deploy/reference.md` | `.agents/skills/deploy/reference.md` |
| `agentPath('reviewer')`                  | `.claude/agents/reviewer.md`         | `.github/agents/reviewer.agent.md`                  | `.cursor/agents/reviewer.md`         | `.codex/agents/reviewer.toml`        |

- Copilot puts every `alwaysApply` instruction in `.github/copilot-instructions.md`, so `instructionPath('name')` returns that file for one.
- While AGENTS.md is generated (codex is a target, or `agentsMd.enable` is set), every target that reads it gets the AGENTS.md paths: `instructionPath()` returns `AGENTS.md`, and `instructionPath('name')` returns the file the instruction lands in. That's root `AGENTS.md`, `<dir>/AGENTS.md` (`nested`) or `<indexDir>/<name>.md` (`index`), depending on its `globs` and the variation ([config.md](config.md#agentsmd-output)).
- With `standards`, the helpers point at the project's own files ([standards.md](standards.md#path-helpers)).

## Template path helpers

They return a template's source path, the same for every target. Omit the name to get the directory.

| Helper                           | Returns                                      |
| -------------------------------- | -------------------------------------------- |
| `instructionTemplatePath(name?)` | `<%= templatesDir %>/instructions/<name>.md` |
| `skillTemplatePath(name?)`       | `<%= templatesDir %>/skills/<name>/SKILL.md` |
| `agentTemplatePath(name?)`       | `<%= templatesDir %>/agents/<name>.md`       |
| `hookTemplatePath(name?)`        | `<%= templatesDir %>/hooks/<name>.json`      |
| `mcpTemplatePath(name?)`         | `<%= templatesDir %>/mcp/<name>.json`        |

## MCP tool references

`mcpToolRef(server, tool?)` returns the target's name for one MCP tool, or for every tool on a server when `tool` is omitted. Use it in a template body instead of a target condition:

| Target  | `mcpToolRef('github', 'list_issues')` | `mcpToolRef('github')`                         |
| ------- | ------------------------------------- | ---------------------------------------------- |
| Claude  | `mcp__github__list_issues`            | `mcp__github__*`                               |
| Codex   | `mcp__github__list_issues`            | `mcp__github__.*` (a regex, for hook matchers) |
| Copilot | `github/list_issues`                  | `github/*`                                     |
| Cursor  | `MCP:list_issues`                     | `MCP:.*` (Cursor doesn't name the server)      |

## Reference docs

Files under `docs/` in the templates dir, or in any `additionalTemplateDirs` entry, are reference docs. uac never generates them, and no tool loads them on its own. Link one with `docPath()` and agents read it only when they need it, which keeps always-on instructions short:

```markdown
---
description: API conventions
alwaysApply: true
---

Return errors as `{ code, message }`. Full error code table: <%%= docPath('api-errors') %>
```

- `docPath('api-errors')` returns `<%= templatesDir %>/docs/api-errors.md`. Nested names such as `docPath('api/errors')` work too.
- The path is relative to the project root, or absolute when the doc lives in a template directory outside the project (e.g. `~/.universal-ai-config/docs/`).
- The first template directory that has the doc wins, like templates. A name with no matching doc prints a `missing-doc` warning during `uac generate`.
- Docs are read as they are: EJS and path helpers inside them are not rendered. Link sibling docs with relative links (`[errors](errors.md)`).
- uac's own docs live in `docs/uac/` and are refreshed by `uac seed meta-instructions`; don't edit them.

## Per-target values

Any frontmatter field, hook handler field or MCP server field can take one value per target. A value counts as per-target when it is an object whose keys are all target names (`claude`, `copilot`, `cursor`, `codex`) or `default`. Each target gets its own key's value, or else `default`; with neither, the field is dropped for that target. An object with any other key (e.g. `metadata: { category: "devops" }`) passes through unchanged, and plain values apply to every target.

```yaml
---
name: code-reviewer
description: Reviews the current diff for bugs.
model:
  claude: opus
  copilot: claude-sonnet-5.5
  cursor: composer-2.5
  codex: gpt-6.1-sol
tools:
  claude: ["Read", "Grep", "Glob"]
  copilot: ["read", "search"]
permissionMode:
  claude: acceptEdits
---
```

Claude gets all three fields and Copilot gets `model` and `tools`. Cursor gets `model` only, since its agents take no `tools` or `permissionMode`. Codex gets `model`, and uac drops `tools` and `permissionMode` with a warning, since Codex agents inherit the session's tools and sandbox.

- Hook handlers and MCP servers use the same syntax: [hooks.md](hooks.md#per-target-overrides-in-hooks), [mcp.md](mcp.md#per-target-overrides-in-mcp).
- Tool names differ per target: [tools.md](tools.md#per-target-tool-overrides). So do model IDs: [models.md](models.md).
