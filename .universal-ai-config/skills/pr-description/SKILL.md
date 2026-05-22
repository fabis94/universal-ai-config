---
name: pr-description
description: Draft a pull request description from either the current chat session or the full feature branch (committed + uncommitted). Use when the user asks to write a PR description, prep a PR, or summarize changes for review.
---

# Generate a Pull Request Description

## 1. Pick the scope

First check the current branch: `git rev-parse --abbrev-ref HEAD`. Compare against the detected base (see step 2 — note that base detection includes a stacked-branch check that may prompt the user).

- **On a feature branch** (HEAD != base): ask via AskUserQuestion (skip if the user already stated the scope):
  - **Current session only** — only changes made in this conversation.
  - **Entire feature branch** — every change on the branch vs. its base, including uncommitted edits.
- **On the base branch itself** (e.g. `main`): don't offer the branch option — there's no feature branch to diff against. Run `git status --porcelain`:
  - Uncommitted changes present → scope = those uncommitted changes only. No question needed.
  - Clean tree → abort. Tell the user there's nothing to summarize and that they should create a feature branch first. Treating prior main commits as a PR is wrong.

## 2. Gather evidence

**Always re-read the conversation** — regardless of scope. Chat usually carries the _why_ (product intent, rejected alternatives, constraints, bug repro steps, links to tickets) that the diff alone can't tell you. The diff shows what changed; the conversation shows why it matters.

**Session scope:** conversation is the primary source. Run `git status` / `git diff` only to confirm disk matches what was discussed.

**Branch scope:** combine the conversation with git. Run in parallel:

- `git status` — uncommitted
- `git diff` — unstaged
- `git diff --staged` — staged
- `git log <base>..HEAD --oneline` — commits on branch
- `git diff <base>...HEAD` — full diff vs. base (three-dot: only this branch's changes)

When chat context and git disagree on intent, prefer chat for the _why_ and git for the _what_. If the conversation only covers part of the branch (older commits predate this session), still surface those commits from `git log` — just note that their rationale is inferred from the diff/commit messages.

Detect base:

1. Default base: `git symbolic-ref refs/remotes/origin/HEAD` → strip `refs/remotes/origin/`, fall back to `main`. User-named base always wins — skip the rest.
2. Check for stacking — the current branch may be based on another feature branch, not the default base. Find candidate parent branches: list refs whose tip is a strict ancestor of HEAD but not of the default base.
   - Enumerate with `git for-each-ref --format='%(refname:short)' refs/heads refs/remotes/origin`, exclude HEAD itself and the default base (and its remote twin).
   - For each candidate, keep it only if `git merge-base --is-ancestor <ref> HEAD` succeeds AND `git merge-base --is-ancestor <ref> <default-base>` fails.
   - Prefer the candidate with the most recent tip commit (closest parent). Branches with identical tip commits (local + remote of the same branch) collapse to one candidate.
3. If a stacked-parent candidate exists, ask via AskUserQuestion which base to diff against — typical options:
   - **Stack parent (`<candidate>`)** — exclude the parent branch's commits; describe only this branch's incremental changes.
   - **Default base (`<default>`)** — include everything since the default base, parent branch work included.
     Use the user's choice as the base for all subsequent `git log`/`git diff` commands.

## 3. Draft the description

Output exactly this shape — no preamble, no trailing commentary:

```markdown
# <type>(<scope>): <subject>

## Context

<1–3 short paragraphs (or a tight bullet list) on the WHY: the user-facing problem, product requirement, bug, or constraint that prompted this PR. Written so a reviewer with no prior context can get up to speed quickly.>

## Summary

- <what changed and the user-visible effect>
- <notable design decision or constraint, if any>
- <reviewer must-know: new env var, migration, breaking change, etc.>
```

The H1 is a Conventional Commits title — usable verbatim as the PR title and squash-merge commit message:

- `<type>`: `feat`, `fix`, `chore`, `refactor`, `docs`, `perf`, `test`, `build`, `ci`, `style`. Pick the dominant change.
- `<scope>` (optional): the area touched — match what `git log --oneline` on this repo already uses (e.g. `fe3`, `fe2`, `server`, `shared`, `CI`). Omit the parentheses if no clear single scope.
- `<subject>`: lowercase, imperative, no trailing period, ≤70 chars total line length. State the user-visible outcome, not the implementation.

If the PR spans multiple scopes equally, drop the scope rather than inventing a composite. If types mix (e.g. feat + fix), pick the one that best represents the headline change.

Append a `## Test plan` section **only if the user explicitly asks for one**:

```markdown
## Test plan

- [ ] <concrete verification step, runnable or observable>
```

### Rules for the body

- **Context**: explain the _why_, not the _how_. Link issues/tickets if mentioned. Skip the section if the PR is purely mechanical (dep bump, rename) and the title already says it all.
- **Summary**: lead with user/system impact, not implementation. "Adds Revoke all CTA on tokens pages" beats "adds a Vue component and a GraphQL mutation."
- Call out server schema changes, new GQL ops, migrations, feature flags, env vars — reviewers need to know.
- Cap Summary at three bullets. If you can't compress, the PR is doing too much — flag that to the user instead of expanding the list.
- Scale length to PR size: small PRs stay tight; large PRs may need longer Context paragraphs or sub-headings under Summary. Never wall-of-text — break with blank lines and bullets.
- Match the project's voice: terse, imperative, no marketing copy, no emojis.
- **Describe the PR as a finished whole, not its authoring history.** A PR description is timeless and covers every change in it equally. Never use chronological or commit-scoped framing — no "prior commit", "earlier change", "this also lands", "previously", "an earlier observability change". A reviewer reading it later has no notion of which part came first. Present every change as part of one cohesive PR.
- **Do not hard-wrap prose.** Write each paragraph and bullet as one continuous line — GitHub-flavored markdown wraps text natively. Manual line breaks mid-sentence produce a ragged skinny column when rendered. Only use line breaks to separate paragraphs, list items, and headings (blank lines / list structure), never to cap line width.
- No "Generated with Claude Code" trailer — that belongs on commits, not PR bodies.

## 4. Deliver

Write the description to a markdown file in the OS temp dir so the user can open and copy it cleanly — chat is awkward for copying multi-line markdown.

- Path: `${TMPDIR:-/tmp}/pr-description-<slug>.md`. Overwrite if it exists.
  - On a feature branch: `<slug>` = branch name with `/` replaced by `-`.
  - On the base branch (uncommitted-only scope): branch name is meaningless, so generate a random slug — e.g. `wip-$(date +%s)` or 8 random hex chars.
- After writing, reply with one line: the absolute path, nothing else. Do not paste the description back into the chat.

Do **not** run `gh pr create` automatically — only if the user explicitly asks in the same turn.
