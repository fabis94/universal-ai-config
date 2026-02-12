---
name: update-mcp
description: Create, update, or manage universal-ai-config MCP server templates. Handles finding existing configs, deciding whether to create or modify, and writing the template.
---

# Manage MCP Server Templates

MCP (Model Context Protocol) server configurations define external tool servers available to AI tools. They use JSON format (not markdown), similar to hooks.

## Finding Existing MCP Configs

List files in `<%= mcpTemplatePath() %>/` to discover existing MCP templates (`.json` files). Read them to understand what servers are already configured.

**Note:** Servers from multiple files are merged by server name during generation (last-wins for duplicates). You can organize servers by concern (e.g. `github.json`, `databases.json`).

## Additional Template Directories

This project may have additional template directories configured via `additionalTemplateDirs`. To find them, search the project root for **all** config files matching `universal-ai-config.*` (e.g. `universal-ai-config.config.ts`, `universal-ai-config.overrides.config.ts`, and any other variants) and read the `additionalTemplateDirs` field from each. If the user asks to update a template that doesn't exist in the main templates directory, or explicitly refers to shared/global/external templates:

1. Read all `universal-ai-config.*` config files in the project root to find `additionalTemplateDirs` paths
2. Search those directories for the relevant MCP config
3. **IMPORTANT:** Before editing any file outside the main `<%= config.templatesDir %>/` directory, ask the user for explicit confirmation — these are shared templates that may affect other projects

## Deciding What to Do

- **Create new file**: for an entirely new server or group of related servers
- **Update existing file**: modify server config, add servers to an existing file
- **Merge strategy**: since servers merge by name, you can split them across files for better organization
- **Delete**: remove an MCP config file when the server is no longer needed

## Creating a New MCP Config

1. Create a `.json` file in `<%= mcpTemplatePath() %>/` with a descriptive name (e.g. `github.json`)
2. Use the standard MCP JSON structure

### JSON Structure

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

### Server Fields

| Field     | Type                     | Description                                        |
| --------- | ------------------------ | -------------------------------------------------- |
| `type`    | `string`                 | Transport type (`"stdio"` or `"sse"`)              |
| `command` | `string`                 | Command to launch the server (for stdio transport) |
| `args`    | `string[]`               | Arguments for the command                          |
| `env`     | `Record<string, string>` | Environment variables                              |
| `url`     | `string`                 | Server URL (for SSE/HTTP transport)                |
| `headers` | `Record<string, string>` | HTTP headers (for SSE/HTTP transport)              |

A server must have either `command` (stdio) or `url` (SSE/HTTP). If neither is present after per-target override resolution, the server is dropped for that target.

### Variable Interpolation

Use `{{variableName}}` syntax to reference variables from the config file:

```json
{
  "mcpServers": {
    "api": {
      "command": "npx",
      "args": ["-y", "@my/server"],
      "env": {
        "API_HOST": "{{apiHost}}"
      }
    }
  }
}
```

Variables are defined in `universal-ai-config.config.ts`:

```typescript
export default defineConfig({
  variables: {
    apiHost: "api.example.com",
  },
});
```

**Important:** `{{varName}}` is for uac config variables. Use `${ENV_VAR}` for runtime environment variable references that should be passed through to the generated output unchanged.

### Per-Target Overrides

Any server field can have per-target values using the same override syntax as hooks:

```json
{
  "mcpServers": {
    "my-server": {
      "command": {
        "default": "npx",
        "cursor": "node"
      },
      "args": {
        "default": ["-y", "@my/server"],
        "cursor": ["./mcp-server.js"]
      },
      "type": {
        "claude": "stdio",
        "copilot": "stdio"
      }
    }
  }
}
```

If `command` (and `url`) resolve to `undefined` for a target, the entire server is dropped for that target. This lets you define target-exclusive servers.

### Copilot Inputs

For Copilot, you can include an `inputs` array for interactive secret prompts:

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${input:github-token}"
      }
    }
  },
  "inputs": [
    {
      "type": "promptString",
      "id": "github-token",
      "description": "GitHub Personal Access Token",
      "password": true
    }
  ]
}
```

The `inputs` array is only included in Copilot output — Claude and Cursor ignore it.

### Output Paths

Generated MCP files are placed at root-relative paths (not inside the target's output directory):

| Target  | Output Path        | Wrapper Key  |
| ------- | ------------------ | ------------ |
| Claude  | `.mcp.json`        | `mcpServers` |
| Copilot | `.vscode/mcp.json` | `servers`    |
| Cursor  | `.cursor/mcp.json` | `mcpServers` |

**Note:** Cursor omits the `type` field from generated output (it infers transport from the presence of `command` vs `url`).

### Example

```json
{
  "mcpServers": {
    "github": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    },
    "postgres": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres", "{{dbConnectionString}}"]
    }
  }
}
```

## After Changes

Run `uac generate` to regenerate target-specific config files and verify the output.

**Reminder:** Always edit templates in `<%= mcpTemplatePath() %>/` — never edit generated MCP files (`.mcp.json`, `.vscode/mcp.json`, `.cursor/mcp.json`) directly.
