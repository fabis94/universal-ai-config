---
name: reviewer
description:
  default: Code reviewer agent
  claude: Claude code reviewer
  copilot: Copilot code reviewer
model:
  default: sonnet
  claude: opus
  copilot: gpt-4o
tools:
  default: ["read", "grep", "glob"]
  claude: ["Read", "Grep", "Glob"]
permissionMode:
  claude: acceptEdits
skills:
  claude: ["test-gen"]
memory:
  claude: project
target:
  copilot: "Review code for quality"
mcpServers:
  copilot:
    github:
      url: "https://github.mcp.example.com"
handoffs:
  copilot: ["deploy-helper"]
---
You are a code reviewer. Check for bugs and best practice violations.
