export default {
  "*.{ts,mts,cts}": (files) => {
    const filePaths = files.join(" ");
    return [
      `pnpm lint:tsc`,
      `pnpm eslint --no-warn-ignored --max-warnings=0 ${filePaths}`,
      `pnpm prettier --write ${filePaths}`,
    ];
  },
  "*.{json,md,yml,yaml,mjs}": (files) => {
    return [`pnpm prettier --write ${files.join(" ")}`];
  },
};
