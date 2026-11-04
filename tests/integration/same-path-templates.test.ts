import { describe, expect, it } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generate } from "../../src/core/generate/index.js";
import { text } from "../test-helpers.js";

const instruction = (name: string, frontmatter: string, body: string) => ({
  name,
  type: "instructions" as const,
  content: `---\n${frontmatter}\n---\n${body}\n`,
});

describe("templates that render to the same path", () => {
  it("joins every always-on Copilot instruction into one copilot-instructions.md", async () => {
    const files = await generate({
      root: await mkdtemp(join(tmpdir(), "uac-same-path-")),
      targets: ["copilot"],
      types: ["instructions"],
      templates: [
        instruction("zeta", "alwaysApply: true\ndescription: Zeta", "Zeta body"),
        instruction("alpha", "alwaysApply: true\ndescription: Alpha", "Alpha body"),
        instruction("scoped", 'globs: "src/**"\ndescription: Scoped', "Scoped body"),
      ],
    });

    const always = files.filter((f) => f.path === ".github/copilot-instructions.md");
    expect(always).toHaveLength(1);
    expect(text(always[0])).toBe("Alpha body\n\nZeta body\n");
    expect(always[0]!.sourcePath).toBe("instructions/zeta.md,instructions/alpha.md");
    expect(files.map((f) => f.path)).toContain(".github/instructions/scoped.instructions.md");
  });

  it("writes a single always-on Copilot instruction without frontmatter", async () => {
    const files = await generate({
      root: await mkdtemp(join(tmpdir(), "uac-same-path-")),
      targets: ["copilot"],
      types: ["instructions"],
      templates: [instruction("general", "alwaysApply: true\ndescription: General", "Body")],
    });
    expect(text(files[0])).toBe("Body\n");
  });
});
