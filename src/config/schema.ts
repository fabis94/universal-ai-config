import { z } from "zod";
import type { UserConfig } from "../types.js";

const targetSchema = z.enum(["claude", "copilot", "cursor"]);
const templateTypeSchema = z.enum(["instructions", "skills", "agents", "hooks", "mcp"]);

const excludeSchema = z.union([
  z.array(z.string()),
  z.object({
    claude: z.array(z.string()).optional(),
    copilot: z.array(z.string()).optional(),
    cursor: z.array(z.string()).optional(),
    default: z.array(z.string()).optional(),
  }),
]);

export const userConfigSchema = z.object({
  templatesDir: z.string().optional(),
  targets: z.array(targetSchema).optional(),
  types: z.array(templateTypeSchema).optional(),
  variables: z.record(z.string(), z.unknown()).optional(),
  outputDirs: z
    .object({
      claude: z.string().optional(),
      copilot: z.string().optional(),
      cursor: z.string().optional(),
    })
    .optional(),
  exclude: excludeSchema.optional(),
});

export function defineConfig(config: UserConfig): UserConfig {
  return config;
}
