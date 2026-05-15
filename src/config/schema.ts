import { z } from "zod";
import type { UserConfig } from "../types.js";

const targetSchema = z.enum(["claude", "copilot", "cursor", "codex"]);
const templateTypeSchema = z.enum(["instructions", "skills", "agents", "hooks", "mcp"]);

const perTargetSchema = <T extends z.ZodType>(inner: T) =>
  z.union([
    inner,
    z.object({
      claude: inner.optional(),
      copilot: inner.optional(),
      cursor: inner.optional(),
      codex: inner.optional(),
      default: inner.optional(),
    }),
  ]);

const excludeSchema = perTargetSchema(z.array(z.string()));

const mcpConfigSchema = z.object({
  forceOptIn: perTargetSchema(z.boolean()).optional(),
  mcpServers: perTargetSchema(z.array(z.string())).optional(),
});

export const userConfigSchema = z.object({
  templatesDir: z.string().optional(),
  additionalTemplateDirs: z.array(z.string()).optional(),
  targets: z.array(targetSchema).optional(),
  types: z.array(templateTypeSchema).optional(),
  variables: z.record(z.string(), z.unknown()).optional(),
  outputDirs: z
    .object({
      claude: z.string().optional(),
      copilot: z.string().optional(),
      cursor: z.string().optional(),
      codex: z.string().optional(),
    })
    .optional(),
  exclude: excludeSchema.optional(),
  mcp: mcpConfigSchema.optional(),
});

export function defineConfig(config: UserConfig): UserConfig {
  return config;
}
