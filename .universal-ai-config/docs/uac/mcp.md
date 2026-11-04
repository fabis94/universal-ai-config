# MCP server reference

MCP templates live in `.universal-ai-config/mcp/*.json`. This page has every server field per target, per-target overrides, Copilot inputs, output locations, and server-name opt-in filtering.

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

| Field                     | Required | Targets               | Description                                                                                                                                           |
| ------------------------- | -------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `command`                 | Yes\*    | All                   | Command to launch the server (stdio transport)                                                                                                        |
| `args`                    | No       | All                   | Arguments for the command                                                                                                                             |
| `type`                    | No       | Claude/Copilot/Cursor | Transport type: `"stdio"`, `"http"`, `"ws"` (deprecated: `"sse"` — use `"http"`). **Codex: dropped** — transport is inferred from `command` vs `url`. |
| `env`                     | No       | All                   | Environment variables (key → value)                                                                                                                   |
| `url`                     | Yes\*    | All                   | Server URL (HTTP/WS transport)                                                                                                                        |
| `headers`                 | No       | All                   | HTTP headers. **Codex:** renames to `http_headers` in the emitted TOML.                                                                               |
| `alwaysLoad`              | No       | Claude                | If true, all tools from this server load at session start regardless of ToolSearch                                                                    |
| `headersHelper`           | No       | Claude                | Script to generate request headers at connection time (HTTP servers)                                                                                  |
| `oauth`                   | No       | Claude                | OAuth config object. **Codex: dropped with warning** — use `bearerTokenEnvVar` + `oauthResource` + `scopes`.                                          |
| `sandboxEnabled`          | No       | Copilot               | Enable process sandboxing (macOS/Linux only)                                                                                                          |
| `sandbox`                 | No       | Copilot               | Sandbox policy: `{ filesystem.allowWrite, filesystem.denyRead, network.allowedDomains, … }`                                                           |
| `dev`                     | No       | Copilot               | Development mode: `{ watch?: string; debug?: boolean }`                                                                                               |
| `envFile`                 | No       | Copilot/Cursor        | Path to environment file (stdio servers only). **Codex: dropped with warning** — use `envVars` or `env`.                                              |
| `auth`                    | No       | Cursor                | OAuth config: `{ CLIENT_ID, CLIENT_SECRET, scopes }`. **Codex: dropped with warning** — use `bearerTokenEnvVar`.                                      |
| `cwd`                     | No       | Codex                 | Working directory for stdio child process                                                                                                             |
| `envVars`                 | No       | Codex                 | Env-var-name allowlist for forwarding (distinct from `env` value-setter)                                                                              |
| `enabledTools`            | No       | Codex                 | Per-server tool allowlist (canonical Codex name)                                                                                                      |
| `disabledTools`           | No       | Codex                 | Per-server tool denylist (Codex-only)                                                                                                                 |
| `bearerTokenEnvVar`       | No       | Codex                 | Env-var name holding bearer token for HTTP transport                                                                                                  |
| `envHttpHeaders`          | No       | Codex                 | Header name → env-var name (header value pulled from env)                                                                                             |
| `startupTimeoutSec`       | No       | Codex                 | Startup timeout, seconds (default 10)                                                                                                                 |
| `startupTimeoutMs`        | No       | Codex                 | Startup timeout, milliseconds (alternative precision)                                                                                                 |
| `toolTimeoutSec`          | No       | Codex                 | Per-tool-call timeout, seconds (default 60)                                                                                                           |
| `enabled`                 | No       | Codex                 | Toggle individual server on/off                                                                                                                       |
| `required`                | No       | Codex                 | Fail session startup if server unreachable                                                                                                            |
| `oauthResource`           | No       | Codex                 | RFC 8707 OAuth resource indicator                                                                                                                     |
| `scopes`                  | No       | Codex                 | OAuth scopes to request                                                                                                                               |
| `experimentalEnvironment` | No       | Codex (E)             | `"local"` or `"remote"` — remote-executor flag (experimental)                                                                                         |

\*A server must have either `command` or `url`. If neither is present after override resolution, the server is dropped for that target.

**Cursor MCP variable interpolation:** In addition to `{{varName}}` uac config variables, Cursor supports runtime variable substitution in MCP config values: `${env:NAME}` (env var), `${userHome}`, `${workspaceFolder}`, `${workspaceFolderBasename}`, `${pathSeparator}`.

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

## Copilot Inputs

An optional `inputs` array provides interactive secret prompts for Copilot:

```json
{
  "mcpServers": { ... },
  "inputs": [
    {
      "type": "promptString",
      "id": "github-token",
      "description": "GitHub PAT",
      "password": true
    }
  ]
}
```

The `inputs` array is only included in Copilot output — other targets ignore it.

## MCP Output Paths

| Target  | Output Path          | Wrapper Key   | Format | Notes                                                                                                                                                          |
| ------- | -------------------- | ------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude  | `.mcp.json`          | `mcpServers`  | JSON   | Project root                                                                                                                                                   |
| Copilot | `.vscode/mcp.json`   | `servers`     | JSON   | Includes `inputs` if provided                                                                                                                                  |
| Cursor  | `.cursor/mcp.json`   | `mcpServers`  | JSON   | Emits `type` when provided                                                                                                                                     |
| Codex   | `.codex/config.toml` | `mcp_servers` | TOML   | **Shared with user content** — only `[mcp_servers.*]` is uac-owned; other top-level keys (e.g. `[profiles.*]`, `personality`) are preserved across regenerates |

## Merging

Multiple `.json` files in the `mcp/` directory are merged by server name, and **the first declaration of a name wins** — a server your project declares can never be silently replaced by one from a shared template dir. `inputs` are merged the same way, keyed by `id`. See [config.md](config.md#template-precedence--shadowing).

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
- Unknown names (typos, renamed servers) emit a `[uac]` warning listing the known names; generation continues with the matched subset.
- Filtering operates on **server names** (the keys under `mcpServers` inside each `mcp/*.json`). Field-level per-target overrides on individual servers still resolve before filtering.
- Filtering is **server-level**; `exclude` is **file-level**. They're additive — you can exclude a whole file and still opt-in to specific servers from the remaining files.
- Copilot `inputs` (interactive prompts) are not filtered — they're declarative and not tied to specific server names.
