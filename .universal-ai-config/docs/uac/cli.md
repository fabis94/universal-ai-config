# uac CLI reference

Full flags and behavior for every `uac` command. Invoke it through the project's package manager (`pnpm uac`, `npx uac`, `yarn uac`, `bun uac`), or `npx universal-ai-config` when uac is not a local dependency.

## Project root resolution

When run without `--root`, uac searches **upward** from the current directory for the project root — the nearest ancestor containing a `universal-ai-config.config.*` file or a `.universal-ai-config/` folder. This means you can run `uac generate` (and the other commands) from inside a package subdirectory of a monorepo and it will still find the root. When a root is found above the current directory, uac prints an info line naming the directory it's using. If no root is found anywhere up the tree, it falls back to the current directory.

- `--root, -r <path>` always wins and disables the upward search — uac uses exactly the path you give.
- `uac init` / `uac setup` is the exception: it works in the current directory (or `--root`). In a terminal, run from a subfolder of an existing project, it asks whether to set up that project or create a new one here.

## `uac generate`

Generate target-specific config files from templates.

- `--target, -t <targets>` — comma-separated targets: `claude`, `copilot`, `cursor`, `codex`. **Replaces** the configured target set for this run; outputs shared between targets are decided from this set alone (see [config.md](config.md#shared-outputs-and-one-target-set-per-machine)).
- `--type <types>` — comma-separated types: `instructions`, `skills`, `agents`, `hooks`, `mcp`, or `all` for every type. **Replaces** the configured `types` for this run
- `--dry-run, -d` — preview what would be generated without writing files
- `--verbose, -v` — per-file output instead of the summary, plus the detail behind grouped diagnostics: each shadowed template candidate (see [config.md](config.md#template-precedence--shadowing)), what each target loses to a shared output, and instructions that render differently for a reader of the shared AGENTS.md
- `--config, -c <path>` — config file path
- `--root, -r <path>` — project root (see [Project root resolution](#project-root-resolution))
- `--clean` — remove existing generated files before generating. Scoped by the run's types — your config's `types`, or `--type`, which replaces it: combined with `--type skills` it only cleans skills artifacts, and a type left out of `types` is never cleaned. Combined with `--dry-run` it previews the removals instead of performing them. With no `--target` it cleans **every** target, not just the ones in your config — see [`uac clean`](#uac-clean).

Use `--clean` after renaming or deleting a template, changing an instruction's `globs` (which can move its AGENTS.md section to another folder), switching `targets`, or changing `agentsMd.variation` — plain `generate` only writes, it never removes stale outputs. The one exception is leftover `AGENTS.override.md` files, which `generate` offers to delete (see [below](#leftover-agentsoverridemd-files)).

### Output

The summary has one line per target, plus one line per group of targets sharing files (e.g. `shared by claude, codex — 3 instructions` for AGENTS.md). Diagnostics are grouped:

- **Switch-overs** come first, as one warning: several targets in the run read the same files, so usually you only need one of them on a machine — set `targets` in `universal-ai-config.overrides.ts`. Below it, one line per shared output; `--verbose` adds what each target loses. Targets switched to AGENTS.md by `agentsMd.enable: true`, rather than by codex, get a warning of their own in the same form.
- **Other warnings** (unsupported fields, legacy fields, skill spec problems, AGENTS.md size, a non-empty `CLAUDE.md`, hooks Cursor would run twice, …) print one per line, prefixed with the target.
- **Info** (shadowed templates, instructions that render differently for an AGENTS.md reader) is counted, and listed with `--verbose`. Other info, such as `standard-linked`, shows only with `--verbose`.

Files whose content is already identical on disk are left untouched and counted as unchanged.

After the diagnostics, generate prints a line saying to run `uac setup` when the project's meta-instructions were seeded by an older uac or sit where `standards` no longer puts them, or the uac block in `.gitignore` no longer matches your config. It also says when a newer uac than yours seeded the project. It never prompts for these.

## `uac init` (alias `uac setup`)

Set up uac for a project, or for this machine in a project that already uses it. In a terminal it's a short wizard; in CI, scripts or a coding agent's shell it runs without prompts.

**First time** (no `.universal-ai-config/` yet). Without asking, it creates `universal-ai-config.config.ts` listing every target (unless a config file exists), seeds the meta-instructions and writes the `.gitignore` block. Then it asks which coding agents you use on this machine (saved to the gitignored `universal-ai-config.overrides.ts`), whether to add example templates, and whether to generate now.

**Existing project**. One menu, each item preselected when running it would change something:

- **Pick the coding agents you use on this machine** — preselected when the overrides file sets no `targets`. Pick one if you can: coding agents read each other's files, so several at once load duplicate or conflicting instructions.
- **Update uac's meta-instructions** — preselected when an older uac seeded them (it records its version in `.universal-ai-config/.uac-version`), or, without that record, when some differ from this version's. Also when `standards` changed since the last seed, so uac's files have to move. Overwrites edits to them.
- **Update the uac block in `.gitignore`** — preselected when it's missing or no longer matches your config (after changing `types`, `standards` or `agentsMd.indexDir`, or a uac upgrade).
- **Add example templates**.

Then it offers to generate — or to clean and generate when your coding agents changed, removing the output of the ones you dropped. Saving coding agents rewrites the overrides file with only `targets`; setup asks first if the file sets anything else.

Flags — passing any of them, or `--yes`, means no prompts:

- `--target, -t <targets>` — save this machine's coding agents to the overrides file
- `--examples` — add example templates
- `--reseed` — re-seed the meta-instructions (overwrites edits to them)
- `--force` — replace an existing overrides file
- `--yes, -y` — no prompts; flags and defaults only
- `--root, -r <path>` — where to set up (see [Project root resolution](#project-root-resolution))

Without prompts, a first-time run creates the config, the meta-instructions and the `.gitignore` block; on an existing project it refreshes the `.gitignore` block and does what the flags ask. It never generates.

The files it writes use a type-only import (`import type { UserConfig } from "universal-ai-config"` with `satisfies UserConfig`), so they load even where uac runs through `npx` without being installed.

## `uac seed <type>`

Seed pre-built template sets into the templates directory, skipping templates of types left out of `types`. Available types:

- `meta-instructions` — the uac instructions, management skills, and these reference docs (`docs/uac/`). Re-running it overwrites them with the current version and records that version in `.universal-ai-config/.uac-version`.
- `examples` — example templates for each type
- `gitignore` — gitignore entries for the outputs of the types in `types`, including every `AGENTS.md` and the configured `agentsMd.indexDir`. Re-run it after changing `types`, `standards` or `indexDir` (`uac generate` tells you when it's out of date).

The only flag is `--root, -r <path>`, the project root (see [Project root resolution](#project-root-resolution)).

## `uac clean`

Remove generated files.

- `--target, -t <targets>` — comma-separated targets to clean (default: every registered target)
- `--type <types>` — comma-separated types to clean: `instructions`, `skills`, `agents`, `hooks`, `mcp`, or `all` for every type (default: your config's `types`; `--type` replaces it)
- `--config, -c <path>` — config file path
- `--root, -r <path>` — project root (see [Project root resolution](#project-root-resolution))
- `--dry-run, -d` — print what would be removed without deleting

With no `--target`, clean removes artifacts for **every registered target**, not only those in your config's `targets`. That's deliberate: dropping a target from `targets` would otherwise strand its output on disk, where the tool keeps reading it. Narrow with `--target` when you want less.

Types work the other way: clean only touches the types in your config's `types`. A type you've turned off is never cleaned, since its files may be hand-written. To remove what uac generated before you turned a type off, name it: `uac clean --type skills` (or `--type all`).

`--target` is the set being cleaned, like `-t` in generate: everything those targets would generate goes, **including files they share** — `clean -t copilot` removes the root `.mcp.json` even though Claude writes it too (the next `generate` restores it). Files that hold user settings lose only uac's key: `hooks` in `.claude/settings.json`, `mcp_servers` in `.codex/config.toml`. Copilot's entry is `.github/hooks/hooks.json` only, so hook scripts in `.github/hooks/` survive. Clean also removes outputs older uac versions wrote, such as Copilot's `.vscode/mcp.json`.

Clean loads your config so `outputDirs`, `preserveOnClean`, `templatesDir`, `types`, `agentsMd` and `standards` are honored. Files matching `preserveOnClean` are never deleted (see [config.md](config.md#preserving-files-from-clean)).

With `standards`, a type kept in an open standard is cleaned only where uac copies it: Claude's skill folder. Clean never removes the AGENTS.md files, `.agents/skills`, or the instruction and skill folders of tools that read them (`.cursor/rules`, `.github/skills`, …), which may be hand-written. See [standards.md](standards.md).

### AGENTS.md files

Cleaning `codex` — or, with `agentsMd.enable: true`, any target that reads AGENTS.md (claude, cursor, copilot) — removes the AGENTS.md output (never while instructions come from AGENTS.md, `standards`):

- every `AGENTS.md` in the project, root and nested, found by **scanning the project tree** (their folders come from template `globs`, so they move when templates change; a scan also finds orphans from a deleted template or an edited `globs`);
- the configured `agentsMd.indexDir`.

The scan skips `node_modules`, `.git` and build output, and the input folders of your template dirs (`instructions/`, `skills/`, `docs/`, …), where a skill may ship an `AGENTS.md` as an extra file. It does not skip a templates dir itself: an instruction scoped to `.universal-ai-config/**` writes `.universal-ai-config/AGENTS.md`. Keep a hand-written `AGENTS.md` with `preserveOnClean`.

### Leftover `AGENTS.override.md` files

uac 2.x wrote `<dir>/AGENTS.override.md` files for Codex, and Codex reads one in place of the `AGENTS.md` in the same folder. Clean never removes them on its own, because the name is also Codex's mechanism for hand-written overrides. Instead, `uac generate` and `uac clean` list every one they find whenever the run covers instructions (any target), and in a terminal ask whether to delete them:

- `generate` asks after writing its files; `generate --clean` asks once.
- Nothing is asked or deleted in a dry run, or without a terminal (CI, scripts, a coding agent's shell). Delete the listed files yourself there.
- The scan skips the same folders as the AGENTS.md scan, and paths in `preserveOnClean`.
- `agentsMd.keepOverrideFiles: true` turns the warning and the question off (see [config.md](config.md#leftover-agentsoverridemd-files)).

## `uac skill add <source>`

Download skill(s) from a GitHub repo or local path and write them into `.universal-ai-config/skills/<name>/` as new skill templates. Each downloaded skill becomes a normal uac skill template — run `uac generate` afterwards to produce the per-target outputs. While skills come from `.agents/skills` (`standards`), they go to `.agents/skills/<name>/` instead, and when a source has several copies of a skill the plain Agent Skills folder wins over a uac template (which has EJS); uac warns if it has to take a template. Skills are always **copied** into the current project (no global installs or symlinks). Re-adding an existing skill **overrides** it (a clean update — stale files are removed).

The `source` accepts:

- GitHub shorthand: `owner/repo`, `owner/repo/subpath`, `owner/repo@skill-name`
- `github:owner/repo` prefix
- github.com URLs: `https://github.com/owner/repo[/tree/<ref>[/<subpath>]]`
- a `#ref` / `#ref@skill` fragment on any git form (selects a branch or tag)
- a local filesystem path: `./dir`, `../dir`, `/abs/path`

Flags:

- `--skill, -s <names>` — comma-separated skill names to install
- `--all` — install every discovered skill
- `--list, -l` — list discovered skills without installing
- `--yes, -y` — no prompts: skips the confirmation and, with several skills and no `--skill`, installs all of them
- `--ref <ref>` — branch or tag to fetch (alternative to a `#ref` fragment)
- `--root, -r <path>` — project root (default: nearest uac root, searching up from cwd; see [Project root resolution](#project-root-resolution))

With no `--skill`/`--all`/`--list` and multiple skills found, an interactive multiselect lets you pick which to install. Without a terminal (or with `--yes`), every discovered skill is installed. Examples:

```bash
uac skill add vercel-labs/agent-skills --list          # list available skills
uac skill add vercel-labs/agent-skills                 # pick interactively
uac skill add vercel-labs/agent-skills -s vercel-optimize -y
uac skill add owner/repo@my-skill                      # install a single named skill
uac skill add ./local/skills-repo --all                # copy every skill from a local repo
```
