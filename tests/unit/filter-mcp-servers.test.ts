import { describe, it, expect } from "vitest";
import { filterMCPServers } from "../../src/core/filter-mcp-servers.js";
import type { MCPConfig, UniversalMCPServer } from "../../src/types.js";

const SERVERS: Record<string, UniversalMCPServer> = {
  github: { command: "github-mcp" },
  playwright: { command: "playwright-mcp" },
  notion: { command: "notion-mcp" },
};

describe("filterMCPServers", () => {
  it("returns input unchanged when forceOptIn is unset", () => {
    const result = filterMCPServers(SERVERS, {}, "claude");
    expect(result.servers).toBe(SERVERS);
    expect(result.unknownNames).toEqual([]);
  });

  it("returns input unchanged when forceOptIn resolves to false", () => {
    const cfg: MCPConfig = { forceOptIn: false, mcpServers: ["github"] };
    const result = filterMCPServers(SERVERS, cfg, "claude");
    expect(result.servers).toBe(SERVERS);
    expect(result.unknownNames).toEqual([]);
  });

  it("filters down to allow-listed servers when forceOptIn is true", () => {
    const cfg: MCPConfig = { forceOptIn: true, mcpServers: ["github", "playwright"] };
    const result = filterMCPServers(SERVERS, cfg, "claude");
    expect(Object.keys(result.servers)).toEqual(["github", "playwright"]);
    expect(result.servers["github"]).toBe(SERVERS["github"]);
    expect(result.unknownNames).toEqual([]);
  });

  it("returns an empty result when forceOptIn is true and mcpServers is missing", () => {
    const cfg: MCPConfig = { forceOptIn: true };
    const result = filterMCPServers(SERVERS, cfg, "claude");
    expect(result.servers).toEqual({});
    expect(result.unknownNames).toEqual([]);
  });

  it("returns an empty result when forceOptIn is true and mcpServers is an empty array", () => {
    const cfg: MCPConfig = { forceOptIn: true, mcpServers: [] };
    const result = filterMCPServers(SERVERS, cfg, "claude");
    expect(result.servers).toEqual({});
    expect(result.unknownNames).toEqual([]);
  });

  it("reports unknown names while still emitting the matched subset", () => {
    const cfg: MCPConfig = {
      forceOptIn: true,
      mcpServers: ["github", "githb", "ntn"],
    };
    const result = filterMCPServers(SERVERS, cfg, "claude");
    expect(Object.keys(result.servers)).toEqual(["github"]);
    expect(result.unknownNames).toEqual(["githb", "ntn"]);
  });

  it("resolves per-target forceOptIn", () => {
    const cfg: MCPConfig = {
      forceOptIn: { claude: true, default: false },
      mcpServers: ["github"],
    };
    expect(Object.keys(filterMCPServers(SERVERS, cfg, "claude").servers)).toEqual(["github"]);
    expect(filterMCPServers(SERVERS, cfg, "copilot").servers).toBe(SERVERS);
    expect(filterMCPServers(SERVERS, cfg, "cursor").servers).toBe(SERVERS);
  });

  it("resolves per-target mcpServers lists", () => {
    const cfg: MCPConfig = {
      forceOptIn: true,
      mcpServers: {
        claude: ["github"],
        copilot: ["playwright", "notion"],
        default: [],
      },
    };
    expect(Object.keys(filterMCPServers(SERVERS, cfg, "claude").servers)).toEqual(["github"]);
    expect(Object.keys(filterMCPServers(SERVERS, cfg, "copilot").servers)).toEqual([
      "playwright",
      "notion",
    ]);
    expect(filterMCPServers(SERVERS, cfg, "cursor").servers).toEqual({});
  });

  it("falls back to default when target is missing from per-target mcpServers", () => {
    const cfg: MCPConfig = {
      forceOptIn: true,
      mcpServers: { default: ["github"] },
    };
    expect(Object.keys(filterMCPServers(SERVERS, cfg, "claude").servers)).toEqual(["github"]);
    expect(Object.keys(filterMCPServers(SERVERS, cfg, "cursor").servers)).toEqual(["github"]);
  });
});
