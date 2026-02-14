import { describe, it, expect } from "vitest";
import { resolveJsonVariables } from "../../src/core/resolve-json-variables.js";

describe("resolveJsonVariables", () => {
  describe("exact match (typed replacement)", () => {
    it("replaces with array value", () => {
      const result = resolveJsonVariables("{{myArgs}}", {
        myArgs: ["-y", "@playwright/mcp@latest"],
      });
      expect(result).toEqual(["-y", "@playwright/mcp@latest"]);
    });

    it("replaces with object value", () => {
      const result = resolveJsonVariables("{{myEnv}}", {
        myEnv: { API_KEY: "secret", HOST: "localhost" },
      });
      expect(result).toEqual({ API_KEY: "secret", HOST: "localhost" });
    });

    it("replaces with number value", () => {
      expect(resolveJsonVariables("{{port}}", { port: 3000 })).toBe(3000);
    });

    it("replaces with boolean value", () => {
      expect(resolveJsonVariables("{{enabled}}", { enabled: true })).toBe(true);
      expect(resolveJsonVariables("{{enabled}}", { enabled: false })).toBe(false);
    });

    it("replaces with null value", () => {
      expect(resolveJsonVariables("{{val}}", { val: null })).toBe(null);
    });

    it("replaces with string value", () => {
      expect(resolveJsonVariables("{{name}}", { name: "hello" })).toBe("hello");
    });

    it("keeps original when variable is undefined", () => {
      expect(resolveJsonVariables("{{missing}}", {})).toBe("{{missing}}");
    });
  });

  describe("embedded match (string interpolation)", () => {
    it("interpolates variable within a string", () => {
      const result = resolveJsonVariables("host-{{apiHost}}-suffix", {
        apiHost: "example.com",
      });
      expect(result).toBe("host-example.com-suffix");
    });

    it("interpolates multiple variables in one string", () => {
      const result = resolveJsonVariables("{{proto}}://{{host}}:{{port}}", {
        proto: "https",
        host: "example.com",
        port: 443,
      });
      expect(result).toBe("https://example.com:443");
    });

    it("keeps unresolved embedded placeholders", () => {
      const result = resolveJsonVariables("prefix-{{missing}}-suffix", {});
      expect(result).toBe("prefix-{{missing}}-suffix");
    });

    it("stringifies non-string values in embedded context", () => {
      const result = resolveJsonVariables("port={{port}}", { port: 3000 });
      expect(result).toBe("port=3000");
    });
  });

  describe("no match", () => {
    it("passes through plain strings", () => {
      expect(resolveJsonVariables("hello world", {})).toBe("hello world");
    });

    it("passes through numbers", () => {
      expect(resolveJsonVariables(42, {})).toBe(42);
    });

    it("passes through booleans", () => {
      expect(resolveJsonVariables(true, {})).toBe(true);
    });

    it("passes through null", () => {
      expect(resolveJsonVariables(null, {})).toBe(null);
    });
  });

  describe("nested structures", () => {
    it("walks objects recursively", () => {
      const result = resolveJsonVariables(
        {
          type: "stdio",
          command: "npx",
          args: "{{myArgs}}",
          env: { DISPLAY: "{{displayVar}}" },
        },
        {
          myArgs: ["-y", "@playwright/mcp@latest"],
          displayVar: ":0",
        },
      );
      expect(result).toEqual({
        type: "stdio",
        command: "npx",
        args: ["-y", "@playwright/mcp@latest"],
        env: { DISPLAY: ":0" },
      });
    });

    it("walks arrays recursively", () => {
      const result = resolveJsonVariables(["{{first}}", "plain", "{{second}}"], {
        first: [1, 2],
        second: "resolved",
      });
      expect(result).toEqual([[1, 2], "plain", "resolved"]);
    });

    it("handles deeply nested mixed structures", () => {
      const result = resolveJsonVariables(
        {
          mcpServers: {
            playwright: {
              args: "{{playwrightArgs}}",
              env: { HOST: "host-{{domain}}-api" },
            },
            plain: {
              args: ["-y", "pkg"],
            },
          },
        },
        {
          playwrightArgs: ["-y", "@playwright/mcp@latest", "--headless"],
          domain: "example.com",
        },
      );
      expect(result).toEqual({
        mcpServers: {
          playwright: {
            args: ["-y", "@playwright/mcp@latest", "--headless"],
            env: { HOST: "host-example.com-api" },
          },
          plain: {
            args: ["-y", "pkg"],
          },
        },
      });
    });
  });
});
