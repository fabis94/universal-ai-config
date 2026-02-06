---
name: deploy-helper
description: Assists with deployment tasks
disableAutoInvocation: true
userInvocable: /deploy
allowedTools: ["bash", "read", "write"]
model: sonnet
subagentType: task
forkContext: true
argumentHint: "<environment> [--dry-run]"
license: MIT
compatibility: ">=1.0.0"
metadata:
  category: devops
  priority: high
hooks:
  onInvoke: echo deploying
---
You are a deployment assistant. Help the user deploy their application safely.
