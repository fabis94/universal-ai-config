import { describe, expect, it } from "vitest";
import { parse as parseYAML } from "yaml";
import { renderMarkdown } from "../../src/core/generate/frontmatter.js";

/** What a line-based parser (Cursor's agent loader) sees: everything after the first `:`. */
function splitLines(content: string): Record<string, string> {
  const fm = content.split("---\n")[1] ?? "";
  const result: Record<string, string> = {};
  for (const line of fm.split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0 && !line.startsWith(" ")) result[line.slice(0, idx)] = line.slice(idx + 1).trim();
  }
  return result;
}

function yamlOf(content: string): Record<string, unknown> {
  return parseYAML(content.split("---\n")[1] ?? "") as Record<string, unknown>;
}

describe("renderMarkdown", () => {
  it("yaml style double-quotes strings", () => {
    expect(renderMarkdown({ name: "reviewer" }, "Body")).toBe('---\nname: "reviewer"\n---\nBody');
  });

  it("returns the body alone when no frontmatter is left", () => {
    expect(renderMarkdown({ a: undefined, b: null }, "\nBody")).toBe("Body");
  });
});

describe("line-safe frontmatter", () => {
  const fm = {
    name: "security-checker",
    description: "Performs a security analysis\nof the whole repository",
    model: "sonnet",
    tools: ["Read", "Grep", "Bash"],
    disallowedTools: ["Write"],
    maxTurns: 12,
    background: true,
  };
  const content = renderMarkdown(fm, "Body", "line-safe");

  it("writes plain single-line scalars and comma lists", () => {
    expect(content).toBe(
      [
        "---",
        "name: security-checker",
        "description: Performs a security analysis of the whole repository",
        "model: sonnet",
        "tools: Read, Grep, Bash",
        "disallowedTools: Write",
        "maxTurns: 12",
        "background: true",
        "---",
        "Body",
      ].join("\n"),
    );
  });

  it("gives a first-colon line parser clean values", () => {
    expect(splitLines(content)).toMatchObject({
      name: "security-checker",
      description: "Performs a security analysis of the whole repository",
      model: "sonnet",
      tools: "Read, Grep, Bash",
    });
  });

  it("stays valid YAML with the same values", () => {
    expect(yamlOf(content)).toEqual({
      ...fm,
      description: "Performs a security analysis of the whole repository",
      tools: "Read, Grep, Bash",
      disallowedTools: "Write",
    });
  });

  it("quotes values YAML can't hold plain", () => {
    const tricky = renderMarkdown(
      {
        a: "Reviews code: style and bugs",
        b: "# not a comment",
        c: "true",
        d: "1.5",
        e: "- dash",
        f: "has a # hash",
      },
      "",
      "line-safe",
    );
    expect(yamlOf(tricky)).toEqual({
      a: "Reviews code: style and bugs",
      b: "# not a comment",
      c: "true",
      d: "1.5",
      e: "- dash",
      f: "has a # hash",
    });
  });

  it("writes nested values as YAML blocks", () => {
    const nested = renderMarkdown(
      { name: "x", skills: ["a", "b"], hooks: { Stop: [{ command: "x" }] } },
      "",
      "line-safe",
    );
    expect(yamlOf(nested)).toEqual({
      name: "x",
      skills: ["a", "b"],
      hooks: { Stop: [{ command: "x" }] },
    });
    expect(splitLines(nested).name).toBe("x");
  });
});
