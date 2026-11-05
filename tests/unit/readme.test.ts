import { describe, it, expect } from "vitest";
import { access, readdir, readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { userConfigSchema } from "../../src/config/schema.js";

// The README summarizes and links; the reference docs hold the detail. These
// checks keep the links between them working as either side changes.
const ROOT = join(import.meta.dirname, "../..");
const DOCS_DIR = join(ROOT, ".universal-ai-config/docs/uac");

/** Markdown with fenced blocks and inline code removed: examples aren't links or headings. */
function prose(markdown: string): string {
  return markdown.replace(/^```[^\n]*\n[\s\S]*?^```$/gm, "").replace(/`[^`\n]*`/g, "");
}

/** GitHub's anchor for a heading: lowercase, punctuation dropped, spaces to hyphens. */
function slug(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

function anchors(markdown: string): string[] {
  const withoutFences = markdown.replace(/^```[^\n]*\n[\s\S]*?^```$/gm, "");
  return [...withoutFences.matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) => slug(m[1]!));
}

function localLinks(markdown: string): string[] {
  return [...prose(markdown).matchAll(/\]\(([^)\s]+)\)/g)]
    .map((m) => m[1]!)
    .filter((link) => !/^[a-z]+:/i.test(link));
}

async function brokenLinks(file: string): Promise<string[]> {
  const broken: string[] = [];
  for (const link of localLinks(await readFile(file, "utf-8"))) {
    const [path, anchor] = link.split("#");
    const target = path ? join(dirname(file), path) : file;
    const exists = await access(target).then(
      () => true,
      () => false,
    );
    if (!exists) broken.push(link);
    else if (anchor && !anchors(await readFile(target, "utf-8")).includes(anchor)) {
      broken.push(link);
    }
  }
  return broken;
}

async function docFiles(): Promise<string[]> {
  return (await readdir(DOCS_DIR)).filter((name) => name.endsWith(".md")).sort();
}

describe("README", () => {
  it("links only to files and headings that exist", async () => {
    expect(localLinks(await readFile(join(ROOT, "README.md"), "utf-8")).length).toBeGreaterThan(0);
    expect(await brokenLinks(join(ROOT, "README.md"))).toEqual([]);
  });

  it("lists every reference doc in its Documentation table", async () => {
    const readme = await readFile(join(ROOT, "README.md"), "utf-8");
    const section = readme.split(/^## /m).find((s) => s.split("\n")[0]!.includes("Documentation"));
    expect(section, "README has a Documentation section").toBeDefined();

    const listed = localLinks(section!).map((link) => relative(DOCS_DIR, join(ROOT, link)));
    expect(listed.filter((name) => name.endsWith(".md")).sort()).toEqual(await docFiles());
  });
});

describe("README configuration", () => {
  // A short summary of every option, kept complete as options come and go
  const section = async () => {
    const readme = await readFile(join(ROOT, "README.md"), "utf-8");
    return readme.split(/^## /m).find((s) => s.split("\n")[0]!.includes("Configuration"))!;
  };

  it("names every config option", async () => {
    const named = new Set([...(await section()).matchAll(/`(\w+)`/g)].map((m) => m[1]!));
    const missing = Object.keys(userConfigSchema.shape).filter((option) => !named.has(option));
    expect(missing, "add a row to the README's Configuration table").toEqual([]);
  });

  it("lists only options that exist", async () => {
    const rows = [...(await section()).matchAll(/^\| `(\w+)`/gm)].map((m) => m[1]!);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((row) => !(row in userConfigSchema.shape))).toEqual([]);
  });
});

describe("reference docs", () => {
  it("link only to files and headings that exist", async () => {
    for (const name of await docFiles()) {
      expect(await brokenLinks(join(DOCS_DIR, name)), name).toEqual([]);
    }
  });
});
