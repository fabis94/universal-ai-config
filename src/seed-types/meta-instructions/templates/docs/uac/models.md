# Model identifiers per target

The `model` field on agents and skills accepts target-specific identifier strings. Vocabularies differ — even for the same underlying model, syntax varies (Anthropic uses hyphens, Copilot/Cursor use dots). uac does not auto-translate; use per-target overrides when targeting multiple platforms.

This list is a point-in-time snapshot (verified 2026-05-26). Vendors add and retire models frequently — always cross-reference the official docs linked in each section before pinning a specific ID.

## Claude Code

Accepted in agent and skill frontmatter `model:`. Reference: https://code.claude.com/docs/en/sub-agents and https://docs.claude.com/en/docs/about-claude/models/overview.

- **Aliases:** `sonnet`, `opus`, `haiku`, `inherit` (default — uses the parent conversation's model)
- **Current full IDs:** `claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001` (alias `claude-haiku-4-5`)
- **Still available:** `claude-opus-4-6`, `claude-opus-4-5-20251101` (alias `claude-opus-4-5`), `claude-sonnet-4-5-20250929` (alias `claude-sonnet-4-5`), `claude-opus-4-1-20250805` (alias `claude-opus-4-1`)
- **Deprecated (retire 2026-06-15):** `claude-sonnet-4-20250514` (alias `claude-sonnet-4-0`), `claude-opus-4-20250514` (alias `claude-opus-4-0`)

## GitHub Copilot

Accepted in agent frontmatter `model:`. Copilot also accepts an **array of prioritized models** — it falls back through the list if the first is unavailable. Identifiers use **dots**, not hyphens. Reference: https://docs.github.com/en/copilot/reference/ai-models/supported-models.

- **OpenAI:** `gpt-4.1`, `gpt-5-mini`, `gpt-5.2`, `gpt-5.2-codex`, `gpt-5.3-codex`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.4-nano`, `gpt-5.5`
- **Anthropic:** `claude-haiku-4.5`, `claude-opus-4.5`, `claude-opus-4.6`, `claude-opus-4.6-fast`, `claude-opus-4.7`, `claude-sonnet-4.5`, `claude-sonnet-4.6`
- **Google:** `gemini-2.5-pro`, `gemini-3-flash`, `gemini-3.1-pro`, `gemini-3.5-flash`
- **Fine-tuned:** `raptor-mini`, `goldeneye`

## Cursor

Cursor selects models primarily via the IDE model picker, not config files. Cursor rules/skills/agents do not have a documented `model:` frontmatter field, and uac does not emit one for Cursor. Reference: https://cursor.com/docs/models lists the available display names (Auto, Composer 1/1.5/2/2.5, Claude 4.6/4.7 Sonnet/Opus, GPT-5.4, Gemini 3 Pro, Grok 4.3, Kimi K2.5, etc.) but they're UI selections, not config identifiers.

## OpenAI Codex

Accepted in agent frontmatter `model:`, top-level `model =` in `~/.codex/config.toml`, and inside `[profiles.*]` blocks. All lowercase, dotted. Reference: https://developers.openai.com/codex/config-reference and https://developers.openai.com/codex/changelog.

- **Models:** `gpt-5.5` (current default), `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.3-codex`, `gpt-5.3-codex-spark`, `gpt-5.2`
- **`model_reasoning_effort` values:** `minimal`, `low`, `medium`, `high`, `xhigh` (xhigh is model-dependent)
- **`plan_mode_reasoning_effort` values:** `none`, `minimal`, `low`, `medium`, `high`, `xhigh`
- No `inherit` keyword.

## Cross-target gotcha

The same underlying Anthropic model has **different identifier syntax** across targets:

- Claude Code: `claude-sonnet-4-6` (hyphens)
- Copilot: `claude-sonnet-4.6` (dots)

A single literal `model:` value will be wrong on at least one target. Use a per-target override:

```yaml
model:
  claude: claude-sonnet-4-6
  copilot: claude-sonnet-4.6
  codex: gpt-5.5
  default: gpt-5.5
```
