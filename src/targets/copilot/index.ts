import { defineTarget, type FrontmatterMapper, type TargetContext } from "../define-target.js";
import type {
  UniversalFrontmatter,
  UniversalHookHandler,
  UniversalMCPInput,
  UniversalMCPServer,
} from "../../types.js";
import { normalizeGlobs } from "../../core/normalize-globs.js";
import { flattenCommand } from "../../core/shell.js";

// Copilot uses camelCase but with some different event names
const EVENT_NAME_MAP: Record<string, string> = {
  sessionStart: "sessionStart",
  sessionEnd: "sessionEnd",
  userPromptSubmit: "userPromptSubmitted",
  preToolUse: "preToolUse",
  postToolUse: "postToolUse",
  postToolUseFailure: "postToolUseFailure",
  // The main agent finishing a turn — not sessionEnd
  stop: "agentStop",
  subagentStart: "subagentStart",
  subagentStop: "subagentStop",
  preCompact: "preCompact",
  // permissionRequest and notification are CLI-only (not in the cloud agent)
  permissionRequest: "permissionRequest",
  notification: "notification",
  errorOccurred: "errorOccurred",
  // Copilot-only events
  userPromptTransformed: "userPromptTransformed",
  preMcpToolCall: "preMcpToolCall",
  postResult: "postResult",
  prePRDescription: "prePRDescription",
};

/** Copilot runs prompt hooks only at session start. */
const PROMPT_HOOK_EVENTS = new Set(["sessionStart"]);

function transformCopilotHandler(h: UniversalHookHandler): Record<string, unknown> {
  const type = h.type ?? "command";
  const entry: Record<string, unknown> = { type };
  switch (type) {
    case "http":
      entry.url = h.url;
      if (h.headers !== undefined) entry.headers = h.headers;
      if (h.allowedEnvVars !== undefined) entry.allowedEnvVars = h.allowedEnvVars;
      break;
    case "prompt":
      entry.prompt = h.prompt;
      break;
    default:
      // `command` is the cross-platform field (copied to bash and powershell).
      // Copilot's exec + args are CLI-only, so args are folded into the string.
      entry.command = flattenCommand(h.command ?? "", h.args);
      if (h.cwd !== undefined) entry.cwd = h.cwd;
      if (h.env !== undefined) entry.env = h.env;
  }
  if (h.matcher !== undefined) entry.matcher = h.matcher;
  if (h.timeout !== undefined) entry.timeoutSec = h.timeout;
  return entry;
}

function transformCopilotHooks(
  hooks: Record<string, UniversalHookHandler[]>,
  { report }: TargetContext,
): Record<string, unknown> {
  const result: Record<string, unknown[]> = {};

  for (const [event, handlers] of Object.entries(hooks)) {
    const copilotEvent = EVENT_NAME_MAP[event];
    if (!copilotEvent) continue;

    const entries: Record<string, unknown>[] = [];
    for (const h of handlers) {
      if (h.type === "prompt" && !PROMPT_HOOK_EVENTS.has(event)) {
        report({
          code: "unsupported",
          message: `${event}: Copilot runs "prompt" hook handlers only on sessionStart; dropping`,
          detail: { kind: "handler-type", name: "prompt" },
        });
        continue;
      }
      entries.push(transformCopilotHandler(h));
    }
    if (entries.length > 0) result[copilotEvent] = entries;
  }

  // Copilot rejects the whole file unless version is the number 1
  return { version: 1, hooks: result };
}

/** Fields only VS Code's legacy `.vscode/mcp.json` understood; the portable `.mcp.json` has none of them. */
const LEGACY_VSCODE_FIELDS = ["envFile", "sandbox", "sandboxEnabled", "dev"] as const;

/** Whether any string inside `value` references a VS Code `${input:…}` variable. */
function usesInputVariable(value: unknown): boolean {
  if (typeof value === "string") return value.includes("${input:");
  if (Array.isArray(value)) return value.some(usesInputVariable);
  if (value !== null && typeof value === "object") {
    return Object.values(value).some(usesInputVariable);
  }
  return false;
}

/**
 * The portable `.mcp.json` (`mcpServers`) that Copilot CLI, the Copilot app
 * and VS Code's default Copilot harness read. VS Code-only fields of the
 * legacy `.vscode/mcp.json` are dropped with a warning.
 */
function transformCopilotMCP(
  servers: Record<string, UniversalMCPServer>,
  inputs: UniversalMCPInput[] | undefined,
  { report }: TargetContext,
): Record<string, unknown> {
  if (inputs && inputs.length > 0) {
    report({
      code: "legacy-field",
      message:
        "mcp inputs dropped: only VS Code's legacy .vscode/mcp.json supports them. Use ${NAME} environment variables in .mcp.json instead",
      detail: { field: "inputs" },
    });
  }

  const mcpServers: Record<string, unknown> = {};
  for (const [name, server] of Object.entries(servers)) {
    const entry: Record<string, unknown> = {};
    if (server.type !== undefined) entry.type = server.type;
    if (server.command !== undefined) entry.command = server.command;
    if (server.args !== undefined) entry.args = server.args;
    if (server.env !== undefined) entry.env = server.env;
    if (server.cwd !== undefined) entry.cwd = server.cwd;
    if (server.url !== undefined) entry.url = server.url;
    if (server.headers !== undefined) entry.headers = server.headers;
    // Copilot CLI requires a tool list; "*" enables every tool
    entry.tools = server.enabledTools ?? ["*"];
    if (server.timeout !== undefined) entry.timeout = server.timeout;
    if (server.deferTools !== undefined) entry.deferTools = server.deferTools;
    const oauthClientId = (server.oauth as { clientId?: unknown } | undefined)?.clientId;
    if (oauthClientId !== undefined) entry.oauthClientId = oauthClientId;
    if (server.scopes !== undefined) entry.oauthScopes = server.scopes;

    for (const field of LEGACY_VSCODE_FIELDS) {
      if (server[field] === undefined) continue;
      report({
        code: "legacy-field",
        message: `mcp.${name}: ${field} dropped — only VS Code's legacy .vscode/mcp.json supports it`,
        detail: { field },
      });
    }
    if (usesInputVariable(entry)) {
      report({
        code: "legacy-field",
        message: `mcp.${name}: uses \${input:…}, which only VS Code's legacy .vscode/mcp.json resolves; Copilot sessions skip this server. Use \${NAME} environment variables instead`,
        detail: { field: "${input:}" },
      });
    }
    mcpServers[name] = entry;
  }
  return { mcpServers };
}

/** Drop a field only VS Code's Local harness accepts, with a warning. */
function localHarnessOnly(field: string): FrontmatterMapper {
  return (_value, _fm, { report }) => {
    report({
      code: "legacy-field",
      message: `agent field "${field}" dropped: only VS Code's Local harness accepts it, and the default Copilot harness rejects agents that set it`,
      detail: { field },
    });
    return {};
  };
}

/** A mapper that emits nothing for always-on templates (they have no frontmatter in Copilot). */
function scopedOnly(
  mapper: (value: unknown) => Record<string, unknown>,
): (value: unknown, fm: UniversalFrontmatter) => Record<string, unknown> {
  return (value, fm) => (fm.alwaysApply ? {} : mapper(value));
}

export default defineTarget({
  name: "copilot",
  outputDir: ".github",
  supportedTypes: ["instructions", "skills", "agents", "hooks", "mcp"],
  reads: {
    instructions: [
      {
        from: "agentsMd",
        reconcile: "loads-both",
        loses:
          "`applyTo` patterns, `excludeAgent` and `name`; nested AGENTS.md files load only after Copilot views a file in that folder (CLI 1.0 and later)",
      },
    ],
    hooks: [
      {
        // Copilot runs every hook from .claude/settings.json as well as its own
        from: "claude",
        reconcile: "loads-both",
        rejectsHandlerTypes: ["prompt", "agent", "mcp_tool"],
        loses:
          "Copilot-only events (userPromptTransformed, preMcpToolCall, postResult, prePRDescription), `cwd`/`env`, and hooks in the GitHub cloud agent, which reads only .github/hooks. Copilot runs Claude-format hooks with Claude's tool names and payloads, and exit code 1 blocks the tool",
      },
    ],
    mcp: [
      {
        // Both targets write the root .mcp.json
        from: "claude",
        reconcile: "same-file",
        loses:
          "Copilot-specific server values (per-target `copilot` overrides) and Copilot-only fields such as `deferTools`: the shared .mcp.json is rendered for Claude",
      },
    ],
    skills: [
      {
        from: "claude",
        reconcile: "prefers-own",
        loses: "nothing: Copilot shows its own copy of a skill both targets generate",
      },
    ],
    agents: [
      {
        from: "claude",
        reconcile: "prefers-own",
        loses: "nothing: Copilot uses its own copy of an agent both targets generate",
      },
    ],
  },

  instructions: {
    // Always-on instructions all go to copilot-instructions.md, a plain
    // markdown file with no frontmatter, so they map no fields at all.
    frontmatterMap: {
      description: scopedOnly((value) => ({ description: value })),
      // Copilot uses applyTo as a comma-separated string
      globs: scopedOnly((value) => ({ applyTo: normalizeGlobs(value).join(",") })),
      excludeAgent: scopedOnly((value) => ({ excludeAgent: value })),
      name: scopedOnly((value) => ({ name: value })),
    },
    outputPath: (name, frontmatter, { outputDir }) =>
      frontmatter.alwaysApply
        ? `${outputDir}/copilot-instructions.md`
        : `${outputDir}/instructions/${name}.instructions.md`,
    typeDir: ({ outputDir }) => `${outputDir}/instructions`,
    ownedPaths: ({ outputDir }) => [
      `${outputDir}/copilot-instructions.md`,
      `${outputDir}/instructions`,
    ],
    // Several always-on templates share copilot-instructions.md
    combine: (entries) =>
      [...entries]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((entry) => entry.body.trim())
        .join("\n\n") + "\n",
  },

  skills: {
    frontmatterMap: {
      name: "name",
      description: "description",
      disableAutoInvocation: "disable-model-invocation",
      userInvocable: "user-invocable",
      argumentHint: "argument-hint",
      compatibility: "compatibility",
      license: "license",
      metadata: "metadata",
      allowedTools: "allowed-tools",
      forkContext: (value) => (value ? { context: "fork" } : {}),
    },
    outputPath: (name, _fm, { outputDir }) => `${outputDir}/skills/${name}/SKILL.md`,
    typeDir: ({ outputDir }) => `${outputDir}/skills`,
    ownedPaths: ({ outputDir }) => [`${outputDir}/skills`],
  },

  agents: {
    frontmatterMap: {
      name: "name",
      description: "description",
      model: "model",
      tools: "tools",
      target: (value, _fm, { report }) => {
        if (value === "vscode" || value === "github-copilot") return { target: value };
        report({
          code: "suspicious-value",
          message: `agent target "${String(value)}" isn't "vscode" or "github-copilot"; dropped`,
          detail: { field: "target", value },
        });
        return {};
      },
      mcpServers: "mcp-servers",
      userInvocable: "user-invocable",
      disableAutoInvocation: "disable-model-invocation",
      hooks: "hooks",
      skills: "skills",
      effort: "reasoning-effort",
      modelPolicy: "model-policy",
      metadata: "metadata",
      includeCustomInstructions: "include-custom-instructions",
      deferredToolLoading: "deferred-tool-loading",
      strictToolsList: "strict-tools-list",
      github: "github",
      // VS Code Local-harness fields; the default Copilot harness rejects them
      handoffs: localHarnessOnly("handoffs"),
      subAgents: localHarnessOnly("agents"),
      argumentHint: localHarnessOnly("argument-hint"),
    },
    outputPath: (name, _fm, { outputDir }) => `${outputDir}/agents/${name}.agent.md`,
    typeDir: ({ outputDir }) => `${outputDir}/agents`,
    ownedPaths: ({ outputDir }) => [`${outputDir}/agents`],
  },

  hooks: {
    events: EVENT_NAME_MAP,
    handlerTypes: ["command", "http", "prompt"],
    transform: transformCopilotHooks,
    outputPath: ({ outputDir }) => `${outputDir}/hooks/hooks.json`,
  },

  mcp: {
    transform: transformCopilotMCP,
    // The portable location every Copilot surface reads (.vscode/mcp.json is legacy)
    outputPath: () => ".mcp.json",
  },
});
