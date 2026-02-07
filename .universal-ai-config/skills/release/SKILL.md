---
name: release
description: Create a new git release with changelog generation and GitHub release
userInvocable: true
argumentHint: "<version> [--draft] [--prerelease]"
allowedTools:
  claude: ["Bash", "Read", "Grep", "Glob", "Write", "WebSearch", "AskUserQuestion"]
---

# Release

Create a new versioned release. This includes generating a changelog, creating a git tag, and publishing a GitHub release.

Parse `$ARGUMENTS` for:

- `<version>` — semver version (e.g. `1.2.0`, `2.0.0-beta.1`)
- `--draft` — create the GitHub release as a draft
- `--prerelease` — mark the GitHub release as a prerelease

## Step 1: Validate Prerequisites

Run ALL checks upfront before doing any release work. If any check fails, **stop immediately** and print the remediation instructions.

### 1a. Git state

- Run `git status` — working directory must be clean (no uncommitted changes)
- Verify the current branch is the main/default branch (`git symbolic-ref refs/remotes/origin/HEAD` or check for `main`/`master`)
- Run `git pull` to ensure the branch is up to date

### 1b. GitHub authentication

Check in order:

1. `which gh && gh auth status` — gh CLI installed and authenticated
2. If gh is unavailable or not authed, check: `[ -n "$GITHUB_TOKEN" ] || [ -n "$GH_TOKEN" ]`

If **neither** is available, stop and tell the user:

> GitHub authentication is required for creating releases. Set up one of:
>
> 1. Run `gh auth login` for interactive GitHub CLI login
> 2. Set `export GITHUB_TOKEN=<token>` with a personal access token that has `repo` scope
>
> Create a token at: https://github.com/settings/tokens/new?scopes=repo

### 1c. Git remote

- Run `git remote get-url origin` — must have a remote configured

## Step 2: Determine Version

If a version was provided in `$ARGUMENTS`, validate it's valid semver.

If **no version** was provided:

1. Read the current version from `package.json` (if it exists) or the latest git tag (`git describe --tags --abbrev=0`)
2. Present the user with options for the next version (patch, minor, major) using AskUserQuestion
3. Use the selected version

Ensure the version doesn't already exist as a tag (`git tag -l "v<version>"`).

## Step 3: Generate Changelog

Generate a changelog from commits since the last tag:

```
git log <last-tag>..HEAD --pretty=format:"%s (%h)" --no-merges
```

If there is no previous tag, use all commits.

Group commits by conventional commit type prefix:

- **Breaking Changes** — commits with `!` suffix or `BREAKING CHANGE` in body
- **Features** — `feat:` commits
- **Bug Fixes** — `fix:` commits
- **Other** — everything else (chore, docs, refactor, style, test, ci, perf, build)

Format as markdown:

```markdown
## What's Changed

### Breaking Changes

- description (hash)

### Features

- description (hash)

### Bug Fixes

- description (hash)

### Other

- description (hash)
```

Omit empty sections.

## Step 4: Confirm with User

Present the user with a summary before proceeding:

- Version: `v<version>`
- Changelog (the generated markdown)
- Actions that will be performed:
  - Update `package.json` version (if applicable)
  - Create git tag `v<version>`
  - Push tag to origin
  - Create GitHub release (draft/prerelease if flagged)

Ask the user to confirm before continuing.

## Step 5: Execute Release

Perform these steps in order:

### 5a. Update version files

If `package.json` exists, update the `version` field to the new version (use `npm version <version> --no-git-tag-version`).

Commit the version bump:

```
git add package.json
git commit -m "chore: release v<version>"
```

### 5b. Create and push git tag

```
git tag -a "v<version>" -m "Release v<version>"
git push origin HEAD
git push origin "v<version>"
```

### 5c. Create GitHub release

If `gh` CLI is available and authed:

```
gh release create "v<version>" --title "v<version>" --notes "<changelog>" [--draft] [--prerelease]
```

Otherwise, use curl:

```
curl -X POST "https://api.github.com/repos/{owner}/{repo}/releases" \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tag_name":"v<version>","name":"v<version>","body":"<changelog>","draft":<bool>,"prerelease":<bool>}'
```

Parse `{owner}/{repo}` from `git remote get-url origin`.

## Step 6: Summary

Print a summary of everything that was done:

- Git tag created
- GitHub release URL
