import { afterEach, describe, expect, it } from "vitest";
import { CliProject } from "./cli-project.js";

describe("clean -t is the set being cleaned (CLI)", () => {
  const projects: CliProject[] = [];
  async function project(): Promise<CliProject> {
    const p = await CliProject.create();
    projects.push(p);
    await p.config({});
    return p;
  }
  afterEach(async () => {
    for (const p of projects.splice(0)) await p.dispose();
  });

  it("clean -t copilot removes the shared .mcp.json and only Copilot's own hooks file", async () => {
    const p = await project();
    await p.write(".mcp.json", "{}");
    await p.write(".github/hooks/hooks.json", "{}");
    await p.write(".github/hooks/pre-commit.sh", "#!/bin/sh");
    await p.write(".github/workflows/ci.yml", "on: push");

    await p.run("clean", ["-t", "copilot"]);

    expect(await p.exists(".mcp.json")).toBe(false);
    expect(await p.exists(".github/hooks/hooks.json")).toBe(false);
    expect(await p.exists(".github/hooks/pre-commit.sh")).toBe(true);
    expect(await p.exists(".github/workflows/ci.yml")).toBe(true);
  });

  it("removes the legacy .vscode/mcp.json uac 2.x wrote for Copilot", async () => {
    const p = await project();
    await p.write(".vscode/mcp.json", "{}");
    await p.write(".vscode/settings.json", "{}");
    await p.run("clean", ["-t", "copilot"]);
    expect(await p.exists(".vscode/mcp.json")).toBe(false);
    expect(await p.exists(".vscode/settings.json")).toBe(true);
  });

  it("clean -t claude leaves AGENTS.md alone without agentsMd.enable", async () => {
    const p = await project();
    await p.write(".claude/rules/a.md");
    await p.write("AGENTS.md");

    await p.run("clean", ["-t", "claude"]);
    expect(await p.exists(".claude/rules")).toBe(false);
    expect(await p.exists("AGENTS.md")).toBe(true);
  });

  it("clean -t claude removes AGENTS.md files when agentsMd.enable made them claude's output", async () => {
    const p = await CliProject.create();
    projects.push(p);
    await p.config({ agentsMd: { enable: true } });
    await p.write("AGENTS.md");
    await p.write("pkg/AGENTS.md");

    await p.run("clean", ["-t", "claude"]);
    expect(await p.exists("AGENTS.md")).toBe(false);
    expect(await p.exists("pkg/AGENTS.md")).toBe(false);
  });

  it("removes only the merged key from files shared with user settings", async () => {
    const p = await project();
    await p.write(
      ".claude/settings.json",
      JSON.stringify({ permissions: { allow: ["Bash"] }, hooks: { Stop: [] } }),
    );
    await p.write(".codex/config.toml", 'model = "gpt-6.1-sol"\n[mcp_servers.a]\ncommand = "x"\n');

    await p.run("clean", ["-t", "claude,codex"]);

    expect(JSON.parse(await p.read(".claude/settings.json"))).toEqual({
      permissions: { allow: ["Bash"] },
    });
    expect(await p.read(".codex/config.toml")).toBe('model = "gpt-6.1-sol"\n');
  });

  it("skips override files inside the templates dir's input folders", async () => {
    const p = await project();
    await p.write(".universal-ai-config/skills/x/AGENTS.override.md", "template input");
    await p.write("pkg/AGENTS.override.md");
    await p.run("clean");
    expect(await p.exists(".universal-ai-config/skills/x/AGENTS.override.md")).toBe(true);
    expect(await p.exists("pkg/AGENTS.override.md")).toBe(false);
  });
});
