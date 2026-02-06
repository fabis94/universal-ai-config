import { defineTarget } from "../define-target.js";

export default defineTarget({
  name: "claude",
  outputDir: ".claude",
  supportedTypes: ["instructions", "skills", "agents"],

  instructions: {
    frontmatterMap: {
      description: "description",
      globs: (value, fm) => {
        if (fm.alwaysApply) {
          // When alwaysApply is true, omit paths entirely
          return {};
        }
        return { paths: value };
      },
      alwaysApply: () => {
        // Handled by globs mapper — alwaysApply means no paths field
        return {};
      },
    },
    getOutputPath: (name) => `rules/${name}.md`,
  },

  skills: {
    frontmatterMap: {
      name: "name",
      description: "description",
      disableAutoInvocation: "disable-model-invocation",
      userInvocable: "user-invocable",
      allowedTools: "allowed-tools",
      model: "model",
      subagentType: "agent",
      forkContext: (value) => (value ? { context: "fork" } : {}),
      argumentHint: "argument-hint",
      hooks: "hooks",
    },
    getOutputPath: (name) => `skills/${name}/SKILL.md`,
  },

  agents: {
    frontmatterMap: {
      name: "name",
      description: "description",
      model: "model",
      tools: "tools",
      disallowedTools: "disallowedTools",
      permissionMode: "permissionMode",
      skills: "skills",
      hooks: "hooks",
      memory: "memory",
    },
    getOutputPath: (name) => `agents/${name}.md`,
  },
});
