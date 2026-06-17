import { isAbsolute, resolve } from "node:path";

/**
 * A skill source resolved into either a GitHub repo to clone or a local directory.
 * A simplified port of the `skills` package source parser — GitHub + local only.
 */
export type ParsedSkillSource =
  | {
      type: "local";
      /** Resolved absolute path */
      localPath: string;
      subpath?: string;
      skillFilter?: string;
    }
  | {
      type: "github";
      /** HTTPS clone URL */
      cloneUrl: string;
      /** Branch, tag, or commit to fetch */
      ref?: string;
      /** Subdirectory within the repo to search for skills */
      subpath?: string;
      /** Single-skill filter carried by a `@skill` suffix */
      skillFilter?: string;
    };

type GithubExtra = {
  ref?: string;
  subpath?: string;
  skillFilter?: string;
};

function isLocalPath(input: string): boolean {
  return (
    isAbsolute(input) ||
    input.startsWith("./") ||
    input.startsWith("../") ||
    input === "." ||
    input === ".." ||
    // Windows absolute paths like C:\ or D:/
    /^[a-zA-Z]:[/\\]/.test(input)
  );
}

/**
 * Reject subpaths containing ".." segments that could escape the repo root.
 * Trailing slashes are trimmed for consistency.
 */
function sanitizeSubpath(subpath: string): string {
  const normalized = subpath.replace(/\\/g, "/");
  for (const segment of normalized.split("/")) {
    if (segment === "..") {
      throw new Error(
        `Unsafe subpath "${subpath}": must not contain ".." path traversal segments.`,
      );
    }
  }
  return normalized.replace(/\/+$/, "");
}

function decodeFragment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

interface Fragment {
  base: string;
  ref?: string;
  skillFilter?: string;
}

/** Split a trailing `#ref` or `#ref@skill` fragment off a source string. */
function splitFragment(input: string): Fragment {
  const hashIndex = input.indexOf("#");
  if (hashIndex < 0) return { base: input };

  const base = input.slice(0, hashIndex);
  const fragment = input.slice(hashIndex + 1);
  if (!fragment) return { base };

  const atIndex = fragment.indexOf("@");
  if (atIndex < 0) {
    return { base, ref: decodeFragment(fragment) };
  }
  const ref = fragment.slice(0, atIndex);
  const skill = fragment.slice(atIndex + 1);
  return {
    base,
    ref: ref ? decodeFragment(ref) : undefined,
    skillFilter: skill ? decodeFragment(skill) : undefined,
  };
}

function githubSource(owner: string, repo: string, extra: GithubExtra = {}): ParsedSkillSource {
  const cleanRepo = repo.replace(/\.git$/, "");
  return {
    type: "github",
    cloneUrl: `https://github.com/${owner}/${cleanRepo}.git`,
    ...extra,
  };
}

/**
 * Parse a skill source string into a structured {@link ParsedSkillSource}.
 *
 * Supported forms:
 * - local paths: `./dir`, `../dir`, `/abs`, `.`, `C:\dir`
 * - GitHub shorthand: `owner/repo`, `owner/repo/subpath`, `owner/repo@skill`
 * - `github:` prefix: `github:owner/repo`
 * - GitHub URLs: `https://github.com/owner/repo[/tree/<ref>[/<subpath>]]`
 * - `#ref` / `#ref@skill` fragments on any of the above git forms
 */
export function parseSkillSource(input: string): ParsedSkillSource {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Skill source must not be empty.");
  }

  // Local paths bypass fragment parsing entirely.
  if (isLocalPath(trimmed)) {
    return { type: "local", localPath: resolve(trimmed) };
  }

  const { base, ref: fragmentRef, skillFilter: fragmentSkill } = splitFragment(trimmed);

  // `github:owner/repo…` prefix — strip and continue as shorthand.
  const value = base.replace(/^github:/, "");

  const optional: GithubExtra = {
    ...(fragmentRef ? { ref: fragmentRef } : {}),
    ...(fragmentSkill ? { skillFilter: fragmentSkill } : {}),
  };

  // GitHub URL with branch + subpath: github.com/owner/repo/tree/<ref>/<subpath>
  const treeWithPath = value.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/tree\/([^/]+)\/(.+)/);
  if (treeWithPath) {
    const [, owner = "", repo = "", ref = "", subpath = ""] = treeWithPath;
    return githubSource(owner, repo, {
      ref: ref || fragmentRef,
      subpath: sanitizeSubpath(subpath),
      ...(fragmentSkill ? { skillFilter: fragmentSkill } : {}),
    });
  }

  // GitHub URL with branch only: github.com/owner/repo/tree/<ref>
  const treeOnly = value.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/tree\/([^/]+)\/?$/);
  if (treeOnly) {
    const [, owner = "", repo = "", ref = ""] = treeOnly;
    return githubSource(owner, repo, {
      ref: ref || fragmentRef,
      ...(fragmentSkill ? { skillFilter: fragmentSkill } : {}),
    });
  }

  // GitHub URL: github.com/owner/repo
  const repoUrl = value.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
  if (repoUrl) {
    const [, owner = "", repo = ""] = repoUrl;
    return githubSource(owner, repo, optional);
  }

  // Shorthand with `@skill`: owner/repo@skill-name
  const atSkill = value.match(/^([^/]+)\/([^/@]+)@(.+)$/);
  if (atSkill && !value.includes(":")) {
    const [, owner = "", repo = "", skill = ""] = atSkill;
    return githubSource(owner, repo, {
      ...(fragmentRef ? { ref: fragmentRef } : {}),
      skillFilter: fragmentSkill || skill,
    });
  }

  // Shorthand: owner/repo or owner/repo/subpath
  const shorthand = value.match(/^([^/]+)\/([^/]+)(?:\/(.+?))?\/?$/);
  if (shorthand && !value.includes(":")) {
    const [, owner = "", repo = "", subpath] = shorthand;
    return githubSource(owner, repo, {
      ...(fragmentRef ? { ref: fragmentRef } : {}),
      ...(subpath ? { subpath: sanitizeSubpath(subpath) } : {}),
      ...(fragmentSkill ? { skillFilter: fragmentSkill } : {}),
    });
  }

  throw new Error(
    `Unrecognized skill source "${input}". Expected a GitHub repo ` +
      `(owner/repo[/subpath][@skill]), a github.com URL, or a local path.`,
  );
}
