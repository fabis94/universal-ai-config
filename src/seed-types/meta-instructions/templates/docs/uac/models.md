# Model identifiers per target

The `model` field on agents and skills takes target-specific identifier strings. Even the same underlying model is spelled differently per target: Claude Code and Cursor write Anthropic IDs with hyphens, Copilot with dots. uac does not translate model IDs; use per-target overrides when a template targets several tools.

This list is a point-in-time snapshot (verified 2026-11-04). Vendors add and retire models often — check the official docs linked in each section before pinning a specific ID.

## Claude Code

Accepted in agent and skill frontmatter `model:`. References: https://code.claude.com/docs/en/model-config, https://platform.claude.com/docs/en/models/overview and https://platform.claude.com/docs/en/about-claude/model-deprecations.

- **Aliases (agents and skills):** `fable`, `opus`, `sonnet`, `haiku`, `inherit` (default — the parent conversation's model)
- **Extra `/model` aliases (skills accept "the same values as `/model`"; not documented for agents):** `best` (fable where available, else opus), `opusplan`, `opus[1m]`, `sonnet[1m]`
- **Alias resolution on the Anthropic API:** `fable` → `claude-fable-5-1`, `opus` → `claude-opus-5-5`, `sonnet` → `claude-sonnet-5-5`, `haiku` → `claude-haiku-5-5`. Bedrock, Vertex and Foundry may resolve aliases to older versions.
- **Current full IDs:** `claude-fable-5-1`, `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`
- **Still available (legacy):** `claude-fable-5`, `claude-opus-5`, `claude-sonnet-5`, `claude-opus-4-8`, `claude-opus-4-7`, `claude-opus-4-6`, `claude-sonnet-4-6`, `claude-opus-4-5-20251101` (alias `claude-opus-4-5`), `claude-haiku-4-5-20251001` (alias `claude-haiku-4-5`)
- **Deprecated (retires 2026-11-30):** `claude-sonnet-4-5-20250929` (alias `claude-sonnet-4-5`) — use `claude-sonnet-5-5`
- **Retired (requests fail):** `claude-opus-4-1` / `claude-opus-4-1-20250805`, `claude-sonnet-4-0` / `claude-sonnet-4-20250514`, `claude-opus-4-0` / `claude-opus-4-20250514`
- **`[1m]` suffix:** appended to an ID or alias for 1M context on models without a native 1M window (e.g. `claude-opus-4-6[1m]`). Every 5.x model is natively 1M.

## GitHub Copilot

Accepted in agent frontmatter `model:`. IDs are lowercase runtime IDs with **dots** (Copilot CLI and VS Code's default Copilot harness use them; VS Code's legacy Local harness uses display names like `Claude Sonnet 5.5 (copilot)`). VS Code also accepts an array of prioritized models in `model:`. `auto` lets Copilot pick. Reference: https://docs.github.com/en/copilot/reference/ai-models/supported-models.

- **OpenAI:** `gpt-6.1-sol`, `gpt-6.1-terra`, `gpt-6-sol`, `gpt-6-luna`, `gpt-6-astra`, `gpt-5.6-sol`†, `gpt-5.6-luna`, `gpt-5.3-codex` (base/LTS model)
- **Anthropic:** `claude-opus-5.5`, `claude-sonnet-5.5`, `claude-haiku-5.5`, `claude-fable-5.1`†, `claude-fable-5`†, `claude-sonnet-5`†, `claude-haiku-4.5`, `claude-opus-4.8-fast`† (preview)
- **Google:** `gemini-4-argon`†, `gemini-3.8-flash`
- **xAI:** `grok-4.7`†, `grok-4.6`†
- **Microsoft:** `mai-code-1.1-flash`†
- **Moonshot AI:** `kimi-k3`†
- **Retiring 2026-11-16:** `claude-opus-5`†, `claude-opus-4.8`† (kept for annual plans), `gpt-5.6-terra`†
- **Annual Pro/Pro+ plans only:** `claude-sonnet-4.6`

† Derived from the display name using Copilot's naming convention, not printed verbatim upstream — confirm with `/model` in Copilot CLI or `model:` completions in VS Code.

## Cursor

Accepted in `.cursor/agents/*.md` frontmatter `model:` (uac emits it for the Cursor agents target). Values: `inherit` (default — the parent agent's model), `auto`, or a model ID with optional `[key=value,…]` parameters, e.g. `claude-opus-5[effort=high,context=300k]`. Cursor follows each vendor's spelling: **hyphens** for Anthropic (`claude-opus-5-5`), dots for OpenAI (`gpt-5.6-sol`). Cursor publishes no full ID table — `agent --list-models` (or `agent models`) in the CLI is the authoritative list. Reference: https://cursor.com/docs/subagents.

- **Confirmed IDs:** `composer-2.5` (default for new CLI sessions), `gpt-5.6-sol`, `gpt-5.6-sol-fast`, `claude-opus-5`, `claude-opus-5-5-fast`, `claude-opus-4-8-fast`
- **Catalog (display names; IDs follow the same spelling rules):** Claude Opus 5 / 5.5, Sonnet 5 / 5.5, Haiku 5.5, Fable 5 / 5.1, Opus 4.8; GPT-5.5, GPT-5.6 Sol/Terra/Luna; Gemini 3.1 Pro, Gemini 3.5–3.8 Flash, Gemini 4 Argon; Grok 4.5–4.7; Kimi K2.7 Code, Kimi K3; GLM 5.2/5.3; DeepSeek V4.1 Flash
- **Retired:** `composer-2` / `composer-2-fast` (rerouted to Composer 2.5)
- A subagent pinned to a model your team's admin settings block runs on the parent agent's model instead.

## OpenAI Codex

Accepted in agent frontmatter `model:` (written as `model` in `.codex/agents/<name>.toml`), top-level `model =` in `config.toml`, and in profile files (`$CODEX_HOME/<name>.config.toml`, selected with `codex --profile <name>`). All lowercase. Availability depends on sign-in method (ChatGPT vs API key), plan, client version and workspace admin settings. Reference: https://learn.chatgpt.com/docs/models.

- **Current:** `gpt-6.1-sol` (default since CLI 0.161.0), `gpt-6.1-terra` (CLI ≥ 0.159.0), `gpt-6-astra`, `gpt-6-sol`, `gpt-6-luna`
- **Previous generation, still listed:** `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna` (Codex prompts to upgrade to `gpt-6-sol` / `gpt-6-luna`)
- **API-key sessions only:** `gpt-5.5` (retired for ChatGPT sign-in on 2026-10-14)
- **Retired / deprecated:** `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.3-codex-spark`, `gpt-5.3-codex`, `gpt-5.2`
- **`model_reasoning_effort` values:** `low`, `medium`, `high`, `xhigh`, `max`, `ultra` — support depends on the model (`gpt-6-luna` / `gpt-5.6-luna` stop at `max`; `gpt-5.5` at `xhigh`). `minimal` / `none` still parse, but no current model advertises them. uac maps the universal `effort` field here; every Claude `effort` value is valid.
- No `inherit` keyword: omit `model` and the agent inherits the parent session's model and effort.

## Cross-target gotcha

The same underlying model has **different identifier syntax** across targets:

- Claude Code: `claude-sonnet-5-5` (hyphens)
- Cursor: `claude-sonnet-5-5` (hyphens for Anthropic; dots for OpenAI, e.g. `gpt-5.6-sol`)
- Copilot: `claude-sonnet-5.5` (dots)
- Codex: OpenAI models only

A single literal `model:` value will be wrong on at least one target. Use a per-target override:

```yaml
model:
  claude: claude-sonnet-5-5
  cursor: claude-sonnet-5-5
  copilot: claude-sonnet-5.5
  codex: gpt-6.1-sol
```
