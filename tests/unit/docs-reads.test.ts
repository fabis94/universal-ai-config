import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { targets } from "../../src/targets/index.js";
import type { Reconcile } from "../../src/targets/define-target.js";

const CONFIG_DOC = join(
  import.meta.dirname,
  "../../src/seed-types/meta-instructions/templates/docs/uac/config.md",
);

const ACTION: Record<Reconcile, string> = {
  "loads-both": "skips its own output",
  "same-file": "skips its own output (same file)",
  "dedupes-identical": "keeps both; warns about hooks that would run twice",
  "prefers-own": "keeps both (the tool prefers its own copy)",
};

/** A table row's cells, trimmed (prettier pads columns). */
function cells(row: string): string[] {
  return row
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim().replace(/`/g, ""));
}

/** The rows the shared-outputs table must have: one per `reads` fact, in registry order. */
function expectedRows(): string[][] {
  const rows: string[][] = [];
  for (const [name, definition] of Object.entries(targets)) {
    for (const [type, reads] of Object.entries(definition.reads ?? {})) {
      for (const read of reads ?? []) {
        const source = read.from === "agentsMd" ? "AGENTS.md" : read.from;
        rows.push([name, type, source, ACTION[read.reconcile]]);
      }
    }
  }
  return rows;
}

describe("docs/uac/config.md shared-outputs table", () => {
  it("lists exactly the reads declared by the targets", () => {
    const lines = readFileSync(CONFIG_DOC, "utf-8").split("\n");
    const header = lines.findIndex(
      (line) => cells(line).join("|") === "Target|Type|Also reads|What uac does",
    );
    expect(header, "table header not found").toBeGreaterThan(-1);
    // Rows run from after the separator line to the first non-table line
    const rows: string[][] = [];
    for (const line of lines.slice(header + 2)) {
      if (!line.startsWith("|")) break;
      rows.push(cells(line));
    }
    expect(rows).toEqual(expectedRows());
  });
});
