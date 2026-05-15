---
name: full-skill
description: Exercises all skill fields
disableAutoInvocation: true
userInvocable: true
allowedTools: ["Bash", "Read"]
model: claude-sonnet-4-6
subagentType: general-purpose
forkContext: true
argumentHint: "<target>"
whenToUse: When deploying to production or staging
arguments: env version
effort: high
skillPaths: ["**/*.yml", "**/*.yaml"]
skillShell: bash
license: MIT
compatibility: ">=1.0.0"
metadata:
  category: devops
---

Full-featured skill body.
