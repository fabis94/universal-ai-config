# MCP server reference

MCP templates live in `.universal-ai-config/mcp/*.json`. This page has every server field per target, per-target overrides, output locations, per-target caveats, and server-name opt-in filtering.

## Structure

MCP server configs define external tool servers. They use JSON format with this structure:

```json
{
  "mcpServers": {
    "server-name": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@some/mcp-server"],
      "env": {
        "API_KEY": "${API_KEY}"
      }
    }
  }
}
```

## Server Fields

| Field                       | Required | Targets               | Description                                                                                                                                                                                                               |
| --------------------------- | -------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `command`                   | Yes\*    | All                   | Command to launch the server (stdio transport)                                                                                                                                                                            |
| `args`                      | No       | All                   | Arguments for the command                                                                                                                                                                                                 |
| `type`                      | No       | Claude/Copilot/Cursor | Transport: `"stdio"`, `"http"`, `"ws"` (Claude only). `"sse"` is deprecated — use `"http"`. Cursor gets `"stdio"` when a server has `command` and no `type`. **Codex:** dropped (inferred from `command` vs `url`)        |
| `env`                       | No       | All                   | Environment variables (key → value)                                                                                                                                                                                       |
| `url`                       | Yes\*    | All                   | Server URL (HTTP/WS transport)                                                                                                                                                                                            |
| `headers`                   | No       | All                   | HTTP headers. **Codex:** written as `http_headers`                                                                                                                                                                        |
| `cwd`                       | No       | Copilot/Codex         | Working directory for a stdio server                                                                                                                                                                                      |
| `timeout`                   | No       | Claude/Copilot        | Per-tool-call timeout in **milliseconds** (whole number; Claude ignores values below 1000)                                                                                                                                |
| `alwaysLoad`                | No       | Claude                | `true`: load the server's tools at session start; `false`: keep them all behind tool search; omitted: the server decides                                                                                                  |
| `headersHelper`             | No       | Claude/Codex          | Command that prints request headers at connection time (HTTP servers). **Codex:** `http_headers_helper`                                                                                                                   |
| `oauth`                     | No       | Claude/Copilot/Codex  | OAuth config. Claude: passed as-is. Copilot: `clientId` → `oauthClientId`. Codex: `clientId`, `clientSecret`, `callbackUrl`, `callbackPort` → the `[mcp_servers.<id>.oauth]` table; other keys are dropped with a warning |
| `deferTools`                | No       | Copilot               | Load the server's tools on demand                                                                                                                                                                                         |
| `enabledTools`              | No       | Copilot/Codex         | Tool allowlist. **Copilot:** written as `tools` (default `["*"]`, every tool). **Codex:** `enabled_tools`                                                                                                                 |
| `scopes`                    | No       | Copilot/Codex         | OAuth scopes. **Copilot:** `oauthScopes`                                                                                                                                                                                  |
| `envFile`                   | No       | Cursor                | Path to environment file (stdio servers only). **Copilot:** dropped (VS Code-only). **Codex:** dropped — use `envVars` or `env`                                                                                           |
| `auth`                      | No       | Cursor/Codex          | Cursor: OAuth object `{ CLIENT_ID, CLIENT_SECRET, scopes }`. Codex: a mode string, `"oauth"` or `"chatgpt"`. Use a per-target override (`auth: { codex: "chatgpt", cursor: { … } }`)                                      |
| `envVars`                   | No       | Codex                 | Env vars to forward: names, or `{ "name": "X", "source": "local" \| "remote" }` objects                                                                                                                                   |
| `disabledTools`             | No       | Codex                 | Per-server tool denylist                                                                                                                                                                                                  |
| `bearerTokenEnvVar`         | No       | Codex                 | Env-var name holding a bearer token (HTTP transport)                                                                                                                                                                      |
| `envHttpHeaders`            | No       | Codex                 | Header name → env-var name (header value pulled from env)                                                                                                                                                                 |
| `startupTimeoutSec`         | No       | Codex                 | Startup timeout, seconds (default 10)                                                                                                                                                                                     |
| `startupTimeoutMs`          | No       | Codex                 | Startup timeout, milliseconds (alternative precision)                                                                                                                                                                     |
| `toolTimeoutSec`            | No       | Codex                 | Per-tool-call timeout, seconds (default 60)                                                                                                                                                                               |
| `enabled`                   | No       | Codex                 | Toggle individual server on/off                                                                                                                                                                                           |
| `required`                  | No       | Codex                 | Fail session startup if server unreachable                                                                                                                                                                                |
| `oauthResource`             | No       | Codex                 | RFC 8707 OAuth resource indicator                                                                                                                                                                                         |
| `environmentId`             | No       | Codex                 | Executor environment that runs the server (`experimentalEnvironment` is a deprecated alias)                                                                                                                               |
| `startupReadiness`          | No       | Codex                 | What startup waits for: `"connection"` or `"catalog"`                                                                                                                                                                     |
| `supportsParallelToolCalls` | No       | Codex                 | Every tool on the server is safe to run in parallel                                                                                                                                                                       |
| `toolInputSchemaMaxBytes`   | No       | Codex                 | Cap on a tool's input schema size                                                                                                                                                                                         |
| `omitToolsFrom`             | No       | Codex                 | Where tool definitions are left out: `"direct"`, `"deferred"` or `"code_mode"`                                                                                                                                            |
| `defaultToolsApprovalMode`  | No       | Codex                 | Approval mode for every tool: `"auto"`, `"prompt"`, `"writes"` or `"approve"`                                                                                                                                             |
| `toolSettings`              | No       | Codex                 | Per-tool settings: `{ "<tool>": { "approvalMode": "auto", "outputTokenLimit": 500 } }` → `tools.<tool>.approval_mode` / `output_token_limit`                                                                              |
| `identity`                  | No       | Codex                 | How the server proves its identity (`command` or `url` matcher object; keys are snake_cased)                                                                                                                              |

\*A server must have either `command` or `url`. If neither is present after override resolution, the server is dropped for that target.

**No VS Code `.vscode/mcp.json` fields.** uac writes the portable `.mcp.json` for Copilot, which has no `inputs`, `envFile`, `sandbox`, `sandboxEnabled` or `dev`. They are dropped with a `legacy-field` warning. A server value that uses `${input:…}` is written as is, with a warning, because Copilot sessions skip such servers. Use `${NAME}` environment variables instead.

## Environment variables

`{{varName}}` is a uac config variable, resolved at generate time. Runtime environment variables pass through unchanged, with each tool's syntax:

- Claude and Copilot (`.mcp.json`): `${NAME}`, or `${NAME:-default}`
- Cursor: `${env:NAME}` is the documented form (bare `${NAME}` also works), plus `${userHome}`, `${workspaceFolder}`, `${workspaceFolderBasename}`, `${pathSeparator}` / `${/}` — resolved in `command`, `args`, `env`, `url`, `headers` and `auth`
- Codex: use `envVars`, `bearerTokenEnvVar` and `envHttpHeaders` to pull values from the environment

When the syntax differs, give the whole field per target: `"env": { "cursor": { "API_KEY": "${env:API_KEY}" }, "default": { "API_KEY": "${API_KEY}" } }`. A per-target value nested inside a field (one `env` key) is not resolved.

## Per-Target Overrides in MCP

Server fields support per-target values (same syntax as hooks):

```json
{
  "command": {
    "default": "npx",
    "cursor": "node"
  },
  "args": {
    "default": ["-y", "@my/server"],
    "cursor": ["./mcp-server.js"]
  }
}
```

## MCP Output Paths

| Target  | Output Path          | Wrapper Key   | Format | Notes                                                                                                                                                            |
| ------- | -------------------- | ------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude  | `.mcp.json`          | `mcpServers`  | JSON   | Project root                                                                                                                                                     |
| Copilot | `.mcp.json`          | `mcpServers`  | JSON   | The same file as Claude's. With claude in the run, Copilot reads Claude's rendering and gets no file of its own (see [below](#claude-and-copilot-share-mcpjson)) |
| Cursor  | `.cursor/mcp.json`   | `mcpServers`  | JSON   | Cursor reads no other tool's MCP file                                                                                                                            |
| Codex   | `.codex/config.toml` | `mcp_servers` | TOML   | **Shared with user content** — only `[mcp_servers.*]` is uac-owned; other top-level keys are preserved across regenerates                                        |

## Claude and Copilot share `.mcp.json`

Copilot CLI, the Copilot app and VS Code's default Copilot harness read the root `.mcp.json` (and prefer it over `.github/mcp.json`). With claude and copilot in one run both would write it, so uac writes it once, rendered for Claude, and warns. Copilot then loses per-target `copilot` overrides and the fields only Copilot's rendering writes: `cwd`, `deferTools`, `tools` (from `enabledTools`), `oauthClientId` and `oauthScopes`. Usually you only need one of these targets on a machine — set `targets` in `universal-ai-config.overrides.ts` (see [config.md](config.md#shared-outputs-and-one-target-set-per-machine)).

Because Copilot may read it, Claude's rendering keeps `.mcp.json` valid for both: a `type` outside Claude's set (e.g. Copilot's `"local"`) is dropped with a warning, and `timeout` must be whole milliseconds. Copilot doesn't accept `"ws"` servers.

## Per-target caveats

- **Claude:** `.mcp.json` servers are approved automatically in `-p` (headless) runs; interactive sessions need a trusted workspace or your approval. `alwaysLoad: false` now defers all of a server's tools behind tool search.
- **Copilot:** workspace MCP servers load only in trusted folders (`--yolo` and `--allow-all` don't trust a folder). Copilot CLI requires a `tools` list; uac writes `["*"]` unless `enabledTools` is set.
- **Cursor:** project servers need approval (`agent mcp enable`, or `--approve-mcps`). MCP config loads from the git root.
- **Codex:** a server with the same name in `~/.codex/config.toml` is merged field by field into the project one, and a different transport breaks config loading. `oauth.clientSecret` is stored in plain text — don't commit it.
- **SSE:** the MCP spec deprecated the SSE transport (2026-07-28). Use `"http"`; uac warns about `"sse"` for Claude.

## Merging

Multiple `.json` files in the `mcp/` directory are merged by server name, and **the first declaration of a name wins** — a server your project declares can never be silently replaced by one from a shared template dir. See [config.md](config.md#template-precedence--shadowing).

## Server-name opt-in filtering

MCP servers can heavily affect agent performance — more servers means more tools loaded, more context, and slower decisions. When you only want a subset of the servers declared across your `mcp/*.json` files, use opt-in mode in `universal-ai-config.config.ts`:

```typescript
import { defineConfig } from "universal-ai-config";

export default defineConfig({
  mcp: {
    forceOptIn: true,
    mcpServers: ["github", "playwright"],
  },
});
```

When `forceOptIn` resolves to `true` for a target, **only** servers whose names appear in `mcpServers` are emitted — regardless of how many input files declare them. When `forceOptIn` is `false` or unset (the default), all discovered servers pass through.

Both fields accept the standard per-target shape, so you can opt-in selectively:

```typescript
mcp: {
  forceOptIn: { claude: true, default: false },
  mcpServers: {
    claude: ["github"],
    copilot: ["github", "playwright"],
    default: [],
  },
}
```

Notes:

- `mcpServers: []` with `forceOptIn: true` → no servers emitted for that target, MCP output file skipped entirely.
- Unknown names (typos, renamed servers) emit an `mcp-unknown-server` warning for each target, listing the known names; generation continues with the matched subset.
- Filtering operates on **server names** (the keys under `mcpServers` inside each `mcp/*.json`). Field-level per-target overrides on individual servers still resolve before filtering.
- Filtering is **server-level**; `exclude` is **file-level**. They're additive — you can exclude a whole file and still opt-in to specific servers from the remaining files.
- When claude and copilot share `.mcp.json`, the file follows Claude's opt-in list.
