---
name: mobbin-capture
description: Capture, manage, search, import, export, and sync local project-aware Mobbin reference artifacts without loading the Mobbin MCP server. Use when saving Mobbin screens, flows, notes, implementation references, design decisions, tags, feature areas, project context, shared stores, or durable reference packs.
allowed-tools:
  - Bash(node *)
  - Bash(npx *)
---

# Mobbin Capture

Manage the local project artifact store that replaces the MCP capture tools.

## Storage

Artifacts are saved under the active project identity in `~/.mobbin-mcp/projects/<project-id>/artifacts.json`. Project detection uses git, `MOBBIN_PROJECT_ROOT`, `PROJECT_ROOT`, or the current directory.

Use:

```bash
node scripts/mobbin-capture.mjs <action> '<json>'
```

## Actions

- `doctor`: inspect auth, project detection, data paths, and artifact count
- `project-context`: return detected project context
- `captures`: return the current project's full captured artifact index as JSON
- `capture`: save an artifact
- `get`: fetch one artifact by `artifact_id`
- `update`: update fields on an artifact
- `delete`: delete by `artifact_id`
- `search`: search by `query`, `tags`, `type`, `app_name`, `feature_area`, `limit`
- `catalog`: facet counts by type, tag, app, platform, pattern, element, feature area
- `export`: export selected artifacts as `json`, `markdown`, `prompt_pack`, `mem_palace_jsonl`, or `pr_markdown`
- `import`: import a JSON payload with `merge_strategy` `append` or `replace`
- `sync-shared-store`: push, pull, or merge with `MOBBIN_SHARED_STORE_DIR` or `shared_store_dir`

## Capture Fields

Required: `type`, `title`, `summary`.

Useful optional fields: `tags`, `notes`, `app_name`, `platform`, `feature_area`, `journey_name`, `session_name`, `participants`, `implementation_hints`, `decisions`, `references`, `steps`, `source_urls`, `screen_url`, `flow_name`, `patterns`, `elements`, `related_artifact_ids`, `project_path`.

`steps` accept `order`, `title`, `summary`, `screen_id`, `screen_url`, `patterns`, `elements`, and optional `hotspot` geometry. `decisions` accept `decision`, `rationale`, and `status` (`open`, `accepted`, `rejected`). `references` accept `label`, `url`, `artifact_id`, and `note`.

Valid `type` values: `screen`, `flow`, `note`, `implementation`, `design`, `reference`.

## Examples

```bash
node scripts/mobbin-capture.mjs doctor '{}'
node scripts/mobbin-capture.mjs capture '{"type":"screen","title":"Checkout confirmation","summary":"Reference for receipt layout and post-purchase actions.","app_name":"Example","platform":"ios","feature_area":"checkout","screen_url":"https://...","tags":["checkout","receipt"]}'
node scripts/mobbin-capture.mjs captures '{}'
node scripts/mobbin-capture.mjs search '{"feature_area":"checkout","limit":8}'
node scripts/mobbin-capture.mjs export '{"query":"checkout","format":"markdown"}'
```
