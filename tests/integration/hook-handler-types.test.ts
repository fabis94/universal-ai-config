import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { generate } from "../../src/core/generate/index.js";
import type { Diagnostic } from "../../src/core/diagnostics.js";
import type { Target } from "../../src/types.js";
import { text } from "../test-helpers.js";

const FIXTURE = join(import.meta.dirname, "../fixtures/hook-handler-types-project");

async function run(target: Target) {
  const diagnostics: Diagnostic[] = [];
  const files = await generate({
    root: FIXTURE,
    targets: [target],
    types: ["hooks"],
    onDiagnostic: (d) => diagnostics.push(d),
  });
  const file = files.find((f) => f.type === "hooks");
  const unsupported = diagnostics
    .filter((d) => d.code === "unsupported" && d.detail.kind === "handler-type")
    .map((d) => (d.detail as { name: string }).name)
    .sort();
  return { json: JSON.parse(text(file)) as Record<string, unknown>, unsupported };
}

type Group = { matcher?: string; hooks: Array<Record<string, unknown>> };

describe("hook handler types per target", () => {
  it("claude emits every handler type and reports nothing", async () => {
    const { json, unsupported } = await run("claude");
    const hooks = (json.hooks as Record<string, Group[]>).PreToolUse!;
    const types = hooks.flatMap((g) => g.hooks.map((h) => h.type));
    expect(types).toEqual(["command", "http", "mcp_tool", "agent", "command"]);
    expect(hooks.flatMap((g) => g.hooks).at(-1)!.command).toBe("claude-only.sh");
    expect((json.hooks as Record<string, Group[]>).SessionStart![0]!.hooks[0]!.type).toBe("prompt");
    expect(unsupported).toEqual([]);
  });

  it("copilot keeps command, http and sessionStart prompt; reports mcp_tool and agent", async () => {
    const { json, unsupported } = await run("copilot");
    const pre = (json.hooks as Record<string, Array<Record<string, unknown>>>).preToolUse!;
    expect(pre.map((h) => h.type)).toEqual(["command", "http"]);
    expect(pre[0]!.command).toBe("node guard.js --mode 'strict mode'");
    expect(pre[1]).toEqual({ type: "http", url: "https://hooks.example.com/pre" });
    expect((json.hooks as Record<string, Array<Record<string, unknown>>>).sessionStart).toEqual([
      { type: "prompt", prompt: "Say hi" },
    ]);
    expect(unsupported).toEqual(["agent", "mcp_tool"]);
  });

  it("cursor keeps command and prompt; reports http, mcp_tool and agent", async () => {
    const { json, unsupported } = await run("cursor");
    const pre = (json.hooks as Record<string, Array<Record<string, unknown>>>).preToolUse!;
    expect(pre).toEqual([
      { type: "command", command: "node guard.js --mode 'strict mode'", matcher: "Bash" },
    ]);
    expect(unsupported).toEqual(["agent", "http", "mcp_tool"]);
  });

  it("codex keeps command and mcp_tool; reports http, agent and prompt", async () => {
    const { json, unsupported } = await run("codex");
    const groups = (json.hooks as Record<string, Group[]>).PreToolUse!;
    expect(groups.flatMap((g) => g.hooks)).toEqual([
      { type: "command", command: "node guard.js --mode 'strict mode'" },
      {
        type: "mcp_tool",
        server: "audit",
        tool: "log",
        input: { path: "${tool_input.file_path}" },
      },
    ]);
    expect(unsupported).toEqual(["agent", "http", "prompt"]);
  });

  it("drops a handler whose required field a per-target override removed, silently", async () => {
    for (const target of ["copilot", "cursor", "codex"] as const) {
      const { json } = await run(target);
      expect(JSON.stringify(json)).not.toContain("claude-only.sh");
    }
  });
});
