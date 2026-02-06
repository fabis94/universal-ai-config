import { defineTarget } from "../define-target.js";

export default defineTarget({
  name: "cursor",
  outputDir: ".cursor",
  supportedTypes: ["instructions", "skills"],

  instructions: {
    frontmatterMap: {
      description: "description",
      globs: "globs",
      alwaysApply: "alwaysApply",
    },
    getOutputPath: (name) => `rules/${name}.mdc`,
  },

  skills: {
    frontmatterMap: {
      name: "name",
      description: "description",
      disableAutoInvocation: "disable-model-invocation",
      license: "license",
      compatibility: "compatibility",
      metadata: "metadata",
    },
    getOutputPath: (name) => `skills/${name}/SKILL.md`,
  },

  // agents: not supported — cursor has no agent files
});
