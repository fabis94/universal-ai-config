---
description: How to write and organize tests
globs: ["tests/**/*.ts", "**/*.test.ts"]
---

## Test Organization

- **Unit tests** (`tests/unit/`) — test pure functions in isolation: parser, config schema validation, resolve-overrides, target frontmatter mapping
- **Integration tests** (`tests/integration/`) — test the full generate pipeline end-to-end using fixtures

## Writing Integration Tests

```typescript
import { generate } from "../../src/core/generate.js";

const files = await generate({
  root: FIXTURES_DIR,
  targets: ["claude"],
  types: ["instructions"],
});

const rule = files.find((f) => f.path.includes("my-rule"));
expect(rule!.content).toContain("expected output");
```

## Fixture Projects

Each fixture is a minimal self-contained project under `tests/fixtures/`:

- `basic-project` — minimal templates, one of each type
- `complete-project` — exercises all frontmatter fields
- `complete-complex-project` — per-target overrides on all field types

When adding new features, prefer extending an existing fixture or creating a new one rather than modifying `basic-project`.

## Assertions

- Check `file.path` for correct output location
- Check `file.content` with `toContain()` for expected frontmatter keys/values
- Use `not.toContain()` to verify fields are correctly omitted for specific targets
- For hooks (JSON output), parse with `JSON.parse()` and assert on the object structure
