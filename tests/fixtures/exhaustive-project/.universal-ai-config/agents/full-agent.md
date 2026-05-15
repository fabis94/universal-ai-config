---
name: full-agent
description: Exercises all agent fields
model: claude-opus-4-7
tools: ["Read", "Bash"]
disallowedTools: ["WebSearch"]
permissionMode: acceptEdits
skills: ["full-skill"]
memory: project
maxTurns: 10
background: true
effort: high
isolation: worktree
color: blue
initialPrompt: Start with a status report
target: Manages everything
mcpServers:
  github:
    url: "https://github.mcp.example.com"
handoffs: ["other-agent"]
---

Full-featured agent body.
