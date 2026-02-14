export default {
  variables: {
    playwrightArgs: ["-y", "@playwright/mcp@latest"],
    displayVar: ":0",
    apiHost: "example.com",
    lintCommand: ".hooks/lint.sh",
  },
};
