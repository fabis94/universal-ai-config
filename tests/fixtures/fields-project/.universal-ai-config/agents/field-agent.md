---
name: field-agent
description: Exercises every 3.0 agent field
model:
  claude: claude-sonnet-5-5
  copilot: gpt-6.1-sol
  cursor: composer-2.5
  codex: gpt-6.1-sol
tools: ["Read", "Grep"]
disallowedTools: ["Write"]
effort: high
skills: ["field-skill"]
target: github-copilot
metadata:
  team: platform
modelPolicy: required
includeCustomInstructions: true
deferredToolLoading: true
strictToolsList: false
github:
  permissions:
    contents: read
readonly: true
background: true
autoCompactWindow: 200000
omitClaudeMd: true
experimental:
  cacheTtl: 1h
handoffs: [{ label: "Ship", agent: "deployer", prompt: "Ship it" }]
subAgents: ["helper"]
argumentHint: "<file>"
sandboxMode: workspace-write
mcpServers:
  docs:
    command: npx
codex:
  modelReasoningSummary: concise
  modelVerbosity: low
  personality: pragmatic
  serviceTier: flex
  skills:
    bundled:
      enabled: false
    includeInstructions: false
---

Review the change carefully.
