import { build } from "tsdown";

/** Build `dist/` so terminal tests run the bundled CLI users install, not the source. */
export async function buildCli(): Promise<void> {
  await build({ logLevel: "silent", dts: false });
}

/** vitest globalSetup for the e2e project: build once per run. */
export async function setup(): Promise<void> {
  await buildCli();
}
