---
name: update-ai-config
description: Create, update, or manage AI configuration templates. Analyzes what the user needs and delegates to the appropriate template-specific skill.
---

# Manage AI Config Templates

**IMPORTANT:** This project uses universal-ai-config (`uac`). All AI configuration lives in the `<%%= config.templatesDir %>/` directory as universal templates. NEVER edit generated target-specific files (e.g. `.claude/`, `.github/copilot-instructions.md`, `.cursor/`) directly — those are overwritten on every `uac generate` run. Always modify the source templates in `<%%= config.templatesDir %>/`.

When the user wants to add or change AI configuration for this project, follow these steps:

## 1. Understand the Request

Read the template guide at `<%%= instructionPath('uac-template-guide') %>` to understand the available template types and when to use each.

## 2. Determine the Template Type

Based on the user's request, decide which type of template to work with:

- **Persistent context, rules, or guidelines** → Use `/update-instruction`
- **Repeatable task, workflow, or slash command** → Use `/update-skill`
- **Specialized AI persona with restricted tools** → Use `/update-agent`
- **Automatic lifecycle automation (on events)** → Use `/update-hook`

## 3. Delegate

Invoke the appropriate skill with the user's requirements. If the intent is ambiguous, ask the user to clarify before proceeding. For example:

- "Add a rule about error handling" → `/update-instruction`
- "Create a deploy workflow" → `/update-skill`
- "Set up a code reviewer" → `/update-agent`
- "Run linting after file edits" → `/update-hook`

## Important

The delegated skills (`/update-instruction`, `/update-skill`, `/update-agent`, `/update-hook`) must ONLY create or modify files inside `<%%= config.templatesDir %>/`. Never edit generated output files in `.claude/`, `.cursor/`, `.github/`, or similar target-specific directories — those are regenerated from templates and any direct changes will be lost.
