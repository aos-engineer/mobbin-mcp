---
name: mobbin-prompts
description: Generate implementation, analysis, onboarding, agent-specific, PR-reference, and feature-review prompt packs from saved Mobbin artifacts without loading the Mobbin MCP server. Use when the user wants captured Mobbin references turned into Codex, Claude Code, Pi, Mem Palace, onboarding, PR, or review-ready context.
allowed-tools:
  - Bash(node *)
  - Bash(npx *)
---

# Mobbin Prompts

Generate prompt-ready context from captured artifacts.

Use:

```bash
node scripts/mobbin-prompts.mjs <action> '<json>'
```

## Selectors

All actions can select artifacts with `artifact_ids`, `query`, `tags`, `type`, `app_name`, `feature_area`, `limit`, and `project_path`.

## Actions

- `feature-prompt`: unified MCP-equivalent prompt generator; `mode` is `implementation`, `analysis`, or `onboarding`
- `implementation-prompt`: implementation brief from references; requires or benefits from `objective`
- `analysis-prompt`: intended-vs-current analysis brief
- `onboarding-prompt`: teammate onboarding brief
- `agent-context`: target-specific context; `target` is `codex`, `claude_code`, `pi`, or `mem_palace`
- `pr-reference`: PR-ready markdown; accepts `title` and `objective`
- `feature-review`: diff-style review using `intended_artifact_ids` or `intended_query`, plus `actual_artifact_ids` or `actual_query`

## Examples

```bash
node scripts/mobbin-prompts.mjs feature-prompt '{"mode":"implementation","objective":"Build checkout confirmation","feature_area":"checkout","limit":6}'
node scripts/mobbin-prompts.mjs implementation-prompt '{"objective":"Build checkout confirmation","feature_area":"checkout","limit":6}'
node scripts/mobbin-prompts.mjs agent-context '{"target":"mem_palace","query":"onboarding","limit":10}'
node scripts/mobbin-prompts.mjs pr-reference '{"title":"Checkout reference pack","objective":"Implement the confirmation step","tags":["checkout"]}'
node scripts/mobbin-prompts.mjs feature-review '{"title":"Checkout review","intended_query":"checkout references","actual_query":"checkout shipped"}'
```
