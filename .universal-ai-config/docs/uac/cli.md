# uac CLI reference

Full flags and behavior for every `uac` command. Invoke it through the project's package manager (`pnpm uac`, `npx uac`, `yarn uac`, `bun uac`), or `npx universal-ai-config` when uac is not a local dependency.

## Project root resolution

When run without `--root`, uac searches **upward** from the current directory for the project root — the nearest ancestor containing a `universal-ai-config.config.*` file or a `.universal-ai-config/` folder. This means you can run `uac generate` (and the other commands) from inside a package subdirectory of a monorepo and it will still find the root. When a root is found above the current directory, uac prints an info line naming the directory it's using. If no root is found anywhere up the tree, it falls back to the current directory.

- `--root, -r <path>` always wins and disables the upward search — uac uses exactly the path you give.
- `uac init` is the exception: it never walks up and always scaffolds into the current directory (or `--root`), since its job is to create a new project rather than find an existing one.

## `uac generate`

Generate target-specific config files from templates.

- `--target, -t <targets>` — comma-separated targets: `claude`, `copilot`, `cursor`, `codex`. **Replaces** the configured target set for this run; outputs shared between targets are decided from this set alone (see [config.md](config.md#shared-outputs-and-one-target-set-per-machine)).
- `--type <types>` — comma-separated types: `instructions`, `skills`, `agents`, `hooks`, `mcp`
- `--dry-run, -d` — preview what would be generated without writing files
- `--verbose, -v` — per-file output instead of the summary, plus the detail behind grouped diagnostics: each shadowed template candidate (see [config.md](config.md#template-precedence--shadowing)), what each target loses to a shared output, and instructions that render differently for a reader of the shared AGENTS.md
- `--config, -c <path>` — config file path
- `--root, -r <path>` — project root (see [Project root resolution](#project-root-resolution))
- `--clean` — remove existing generated files before generating. Scoped by `--type`: `--clean` alone removes everything, but combined with `--type skills` it only cleans skills artifacts, leaving other types in place. Combined with `--dry-run` it previews the removals instead of performing them. With no `--target` it cleans **every** target, not just the ones in your config — see [`uac clean`](#uac-clean).

Use `--clean` after renaming or deleting a template, changing an instruction's `globs` (which can move its AGENTS.md section to another folder), switching `targets`, or changing `agentsMd.variation` — plain `generate` only writes, it never removes stale outputs.

### Output

The summary has one line per target, plus one line per group of targets sharing files (e.g. `shared by claude, codex — 3 instructions` for AGENTS.md). Diagnostics are grouped:

- **Switch-overs** come first, as one warning: several targets in the run read the same files, so usually you only need one of them on a machine — set `targets` in `universal-ai-config.overrides.ts`. Below it, one line per shared output; `--verbose` adds what each target loses.
- **Other warnings** (unsupported fields, legacy fields, skill spec problems, AGENTS.md size, a non-empty `CLAUDE.md`, hooks Cursor would run twice, …) print one per line, prefixed with the target.
- **Info** (shadowed templates, instructions that render differently for an AGENTS.md reader) is counted, and listed with `--verbose`.

Files whose content is already identical on disk are left untouched and counted as unchanged.

## `uac init`

Scaffold a new `.universal-ai-config/` directory with meta-instruction templates, these reference docs, and a config file.

## `uac seed <type>`

Seed pre-built template sets into the templates directory. Available types:

- `meta-instructions` — the uac instructions, management skills, and these reference docs (`docs/uac/`). Re-running it overwrites them with the current version.
- `examples` — example templates for each type
- `gitignore` — gitignore entries for generated outputs, including every `AGENTS.md` and the configured `agentsMd.indexDir`. Re-run it after changing `indexDir`.

## `uac clean`

Remove generated files.

- `--target, -t <targets>` — comma-separated targets to clean (default: every registered target)
- `--type <types>` — comma-separated types to clean: `instructions`, `skills`, `agents`, `hooks`, `mcp` (default: all types)
- `--config, -c <path>` — config file path
- `--dry-run, -d` — print what would be removed without deleting

With no `--target`, clean removes artifacts for **every registered target**, not only those in your config's `targets`. That's deliberate: dropping a target from `targets` would otherwise strand its output on disk, where the tool keeps reading it. Narrow with `--target` when you want less.

`--target` is the set being cleaned, like `-t` in generate: everything those targets would generate goes, **including files they share** — `clean -t copilot` removes the root `.mcp.json` even though Claude writes it too (the next `generate` restores it). Files that hold user settings lose only uac's key: `hooks` in `.claude/settings.json`, `mcp_servers` in `.codex/config.toml`. Copilot's entry is `.github/hooks/hooks.json` only, so hook scripts in `.github/hooks/` survive. Clean also removes outputs older uac versions wrote, such as Copilot's `.vscode/mcp.json`.

Clean loads your config so `outputDirs`, `preserveOnClean`, `templatesDir` and `agentsMd` are honored. Files matching `preserveOnClean` are never deleted (see [config.md](config.md#preserving-files-from-clean)).

### AGENTS.md files

Cleaning `codex` — or, with `agentsMd.enable: true`, any target that reads AGENTS.md (claude, cursor, copilot) — removes the AGENTS.md output:

- every `AGENTS.md` in the project, root and nested, found by **scanning the project tree** (their folders come from template `globs`, so they move when templates change; a scan also finds orphans from a deleted template or an edited `globs`);
- the configured `agentsMd.indexDir`;
- legacy `AGENTS.override.md` files written by uac 2.x (Codex never loads them in a root launch, and they hide a same-folder `AGENTS.md`).

The scan skips `node_modules`, `.git` and build output, and the input folders of your template dirs (`instructions/`, `skills/`, `docs/`, …), where a skill may ship an `AGENTS.md` as an extra file. It does not skip a templates dir itself: an instruction scoped to `.universal-ai-config/**` writes `.universal-ai-config/AGENTS.md`. Keep a hand-written `AGENTS.md` with `preserveOnClean`.

## `uac skill add <source>`

Download skill(s) from a GitHub repo or local path and write them into `.universal-ai-config/skills/<name>/` as new skill templates. Each downloaded skill becomes a normal uac skill template — run `uac generate` afterwards to produce the per-target outputs. Skills are always **copied** into the current project (no global installs or symlinks). Re-adding an existing skill **overrides** it (a clean update — stale files are removed).

The `source` accepts:

- GitHub shorthand: `owner/repo`, `owner/repo/subpath`, `owner/repo@skill-name`
- `github:owner/repo` prefix
- github.com URLs: `https://github.com/owner/repo[/tree/<ref>[/<subpath>]]`
- a `#ref` / `#ref@skill` fragment on any git form (selects a branch/tag/commit)
- a local filesystem path: `./dir`, `../dir`, `/abs/path`

Flags:

- `--skill, -s <names>` — comma-separated skill names to install (otherwise you'll be prompted to select)
- `--all` — install every discovered skill
- `--list, -l` — list discovered skills without installing
- `--yes, -y` — skip confirmation prompts
- `--ref <ref>` — branch, tag, or commit to fetch (alternative to a `#ref` fragment)
- `--root, -r <path>` — project root (default: nearest uac root, searching up from cwd; see [Project root resolution](#project-root-resolution))

With no `--skill`/`--all`/`--list` and multiple skills found, an interactive multiselect wizard lets you pick which to install. Examples:

```bash
uac skill add vercel-labs/agent-skills --list          # list available skills
uac skill add vercel-labs/agent-skills                 # pick interactively
uac skill add vercel-labs/agent-skills -s vercel-optimize -y
uac skill add owner/repo@my-skill                      # install a single named skill
uac skill add ./local/skills-repo --all                # copy every skill from a local repo
```
