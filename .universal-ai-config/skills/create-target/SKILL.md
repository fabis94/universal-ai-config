---
name: create-target
description: Scaffold a new target type (e.g., Zed, Windsurf) for universal-ai-config
userInvocable: true
argumentHint: "<target-name>"
allowedTools: ["Read", "Write", "Glob", "Grep", "Bash"]
---

Create a new target implementation for universal-ai-config. A target maps universal template frontmatter and hooks to a specific AI coding assistant's configuration format.

## Steps

1. **Research the target's config format** — find documentation for how the target AI assistant expects its configuration files (rules, skills, agents, hooks). Look for:
   - File locations and naming conventions (e.g., `.cursor/rules/*.mdc`, `.github/instructions/*.md`)
   - Frontmatter format for each file type
   - Hook configuration format (JSON structure, event names)

2. **Create the target directory** — create `src/targets/<name>/index.ts`

3. **Implement `defineTarget()`** — use the pattern from existing targets:

```typescript
import { defineTarget } from "../define-target.js";
import type { UniversalFrontmatter, UniversalHookHandler } from "../../types.js";

export default defineTarget({
  name: "<target-name>",
  outputDir: ".<target-dir>",
  supportedTypes: ["instructions", "skills", "agents", "hooks"],

  instructions: {
    frontmatterMap: {
      description: "description",
      globs: "<target-specific-key>",
      alwaysApply: "<target-specific-key>",
    },
    getOutputPath: (name, fm) => `rules/${name}.<ext>`,
  },

  // skills, agents — similar pattern
  // hooks — implement transform function mapping universal events to target events
});
```

4. **Key decisions for each target:**
   - `frontmatterMap`: maps universal keys → target keys. Use a string for direct rename, or a function `(value, fm) => Record<string, unknown>` for transforms
   - `getOutputPath`: determines output file path from template name and frontmatter
   - Hook `transform`: converts universal event names and handler format to target format
   - Hook `mergeKey`: if the target's hook config is nested inside a larger settings file (like Claude's `settings.json` which has a `hooks` key)

5. **Register the target** — add to `src/targets/index.ts` and the `Target` type in `src/types.ts`

6. **Add tests** — create integration tests with a fixture that generates for the new target, verifying output paths and content

7. **Run `pnpm check`** to verify everything passes
