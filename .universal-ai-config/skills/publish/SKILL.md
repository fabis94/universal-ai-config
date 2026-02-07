---
name: publish
description: Check, build, and publish the package to npm with pnpm
userInvocable: true
argumentHint: "[--dry-run]"
allowedTools:
  claude: ["Bash", "Read", "Grep", "Glob", "AskUserQuestion"]
---

# Publish

Check, build, and publish this package to npm using pnpm.

Parse `$ARGUMENTS` for:

- `--dry-run` — run all steps but use `--dry-run` for the actual publish

## Step 1: Validate Prerequisites

Run ALL checks upfront before doing any work. If any check fails, **stop immediately** and print the remediation instructions.

### 1a. NPM authentication

Check in order:

1. `npm whoami` — currently logged in
2. If that fails, check: `[ -n "$NPM_TOKEN" ] || [ -n "$NODE_AUTH_TOKEN" ]`

If **neither** is available, stop and tell the user:

> NPM authentication is required for publishing packages. Set up one of:
>
> 1. Run `npm login` for interactive npm login
> 2. Set `export NPM_TOKEN=<token>` with an npm access token
> 3. Add `//registry.npmjs.org/:_authToken=<token>` to `.npmrc`
>
> Create a token at: https://www.npmjs.com/settings/~/tokens

### 1b. Clean working directory

- Run `git status` — working directory must be clean (no uncommitted changes)
- If there are uncommitted changes, stop and ask the user whether to continue anyway or commit first

## Step 2: Check

Run the full check suite:

```
pnpm check
```

This runs lint, format check, unused exports check, and tests. If any step fails, **stop and fix the issue** before continuing. Do not proceed to build if checks fail.

## Step 3: Build

```
pnpm build
```

Verify the build succeeds without errors.

## Step 4: Confirm with User

Present the user with a summary before publishing:

- Package name and version (from `package.json`)
- Check result: passed
- Build result: passed
- Publish target: npm registry
- Dry run: yes/no

Ask the user to confirm before continuing.

## Step 5: Publish

```
pnpm publish [--dry-run] --no-git-checks
```

For scoped packages (`@scope/name`), use `--access public` if this is the first publish.

## Step 6: Summary

Print a summary:

- Package name and version published
- Registry URL (e.g. `https://www.npmjs.com/package/<name>`)
- Whether this was a dry run
