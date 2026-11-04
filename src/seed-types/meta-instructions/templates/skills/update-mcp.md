---
name: update-mcp
description: Create, update, or manage universal-ai-config MCP server templates. Handles finding existing configs, deciding whether to create or modify, and writing the template.
userInvocable: false
---

# Manage MCP Server Templates

MCP (Model Context Protocol) server configurations define external tool servers available to AI tools. They use JSON format (not markdown), similar to hooks.

## Finding Existing MCP Configs

List files in `<%%= mcpTemplatePath() %>/` to discover existing MCP templates (`.json` files). Read them to understand what servers are already configured.

**Note:** Servers from multiple files are merged by server name during generation, and the **first declaration of a name wins** (`templatesDir` before `additionalTemplateDirs`, in order). You can organize servers by concern (e.g. `github.json`, `databases.json`).

## Deciding What to Do

- **Create new file**: for an entirely new server or group of related servers
- **Update existing file**: modify server config, add servers to an existing file
- **Merge strategy**: since servers merge by name, you can split them across files for better organization
- **Delete**: remove an MCP config file when the server is no longer needed

## Creating a New MCP Config

1. Create a `.json` file in `<%%= mcpTemplatePath() %>/` with a descriptive name (e.g. `github.json`)
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

Core fields: `command` + `args` (stdio) or `url` + `headers` (HTTP), plus `type` and `env`. A server must have `command` or `url`. If neither is left after per-target override resolution, the server is dropped for that target, which is how you define target-exclusive servers.

Before using any other field, check `<%%= docPath('uac/mcp') %>`. It lists every server field with the targets that use it (including Codex's auth fields and `enabledTools`/`disabledTools`), per-target override examples, the output path for each target (Claude and Copilot share the root `.mcp.json`), and server-name opt-in filtering. VS Code's `inputs` prompts and `${input:…}` aren't supported.

### Variables and Secrets

- `{{variableName}}` pulls a value from `variables` in the config. `"{{var}}"` as the whole value keeps its type, e.g. an `args` array. Worked example: `<%%= docPath('uac/config') %>`.
- `${ENV_VAR}` passes through unchanged — use it for secrets resolved at runtime. Cursor documents `${env:ENV_VAR}`; the MCP doc shows a per-target value for that.
- Put machine-specific variable values in `universal-ai-config.overrides.ts` (gitignored).

### Example

```json
{
  "mcpServers": {
    "github": {
      "type": "http",
      "url": "https://api.githubcopilot.com/mcp/",
      "headers": {
        "Authorization": "Bearer ${GITHUB_TOKEN}"
      }
    },
    "playwright": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"]
    },
    "internal-db": {
      "type": "stdio",
      "command": "node",
      "args": ["./tools/db-mcp.js", "{{dbConnectionString}}"]
    }
  }
}
```
