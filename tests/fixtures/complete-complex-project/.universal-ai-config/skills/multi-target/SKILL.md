---
name: multi-target
description:
  claude: Claude test generation skill
  copilot: Copilot test generation skill
  cursor: Cursor test generation skill
model:
  claude: sonnet
allowedTools:
  claude: ["bash", "read", "write"]
disableAutoInvocation:
  claude: true
  copilot: true
  cursor: true
argumentHint:
  claude: "<file> [--verbose]"
  copilot: "<file> [--verbose]"
license: MIT
compatibility: ">=1.0.0"
metadata:
  category: testing
---
Generate comprehensive tests for the given code.
