---
name: publish
description: Check, build, and publish the package to npm with pnpm
userInvocable: true
argumentHint: "[--dry-run]"
allowedTools:
  claude: ["Bash", "Read", "Grep", "Glob", "AskUserQuestion", "Monitor"]
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

Use `--auth-type=web` so npm accepts browser-based 2FA approval (works with passkeys, WebAuthn, and TOTP without prompting for a one-time code in the terminal). The publish process prints an auth URL and **blocks until the user approves it in their browser**, so we must run it in the background, intercept the URL, and surface it to the user while the process is still alive.

### 5a. Start the publish in the background

```
pnpm publish [--dry-run] --no-git-checks --auth-type=web
```

Run via the `Bash` tool with `run_in_background: true`. Capture the returned shell ID.

For scoped packages (`@scope/name`), also pass `--access public` if this is the first publish.

If `--dry-run` is set, you can skip the auth-URL interception (no auth is performed) — just wait for the process to finish and report the output.

### 5b. Intercept the auth URL

npm prints a line like:

```
npm notice Open URL in your browser to authenticate: https://www.npmjs.com/login?next=/login/cli/...
```

Use the `Monitor` tool against the background shell with a regex like `https?://[^\s]+` (or more specifically `https://www\.npmjs\.com/login\S*`) to capture the first URL emitted on stdout/stderr.

### 5c. Send the URL to the user immediately

As soon as the URL is captured, output it to the user in a plain text message asking them to approve in the browser. Do **NOT** wait for the publish process to finish first — it cannot finish until the user clicks the link. Example message:

> npm needs you to approve this publish via browser 2FA. Open this URL and approve with your passkey:
>
> `<url>`

### 5d. Wait for the publish to complete

After surfacing the URL, wait for the background shell to exit (the harness will notify on completion). Then verify the exit code — non-zero means the publish failed and the failure output should be reported back to the user.

## Step 6: Summary

Print a summary:

- Package name and version published
- Registry URL (e.g. `https://www.npmjs.com/package/<name>`)
- Whether this was a dry run
