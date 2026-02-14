export default {
  "*.{ts,mts}": (files) => {
    const filePaths = files.join(" ");
    return [
      `pnpm lint:tsc`,
      `pnpm eslint --no-warn-ignored --max-warnings=0 ${filePaths}`,
      `pnpm prettier --check ${filePaths}`,
    ];
  },
  "*.{json,md,yml,yaml,mjs}": (files) => {
    return [`pnpm prettier --write ${files.join(" ")}`];
  },
};
