---
name: mobbin-visuals
description: Generate visual contact sheets, find visually similar captured Mobbin artifacts, and seed captures from Mobbin collections without loading the Mobbin MCP server. Use for screenshot boards, visual similarity review, flow review, collection-to-artifact seeding, and visual reference comparison.
allowed-tools:
  - Bash(node *)
  - Bash(npx *)
---

# Mobbin Visuals

Visual workflows for saved Mobbin artifacts.

Use:

```bash
node scripts/mobbin-visuals.mjs <action> '<json>'
```

## Actions

- `contact-sheet`: generate a PNG from selected artifact screenshots. Select with `artifact_ids`, `query`, `tags`, `type`, `app_name`, `feature_area`, `limit`; set `columns` and `output_path`.
- `find-similar`: compare by `artifact_id` or direct `screen_url`; optional `max_distance`, `limit`.
- `sync-collections`: seed local artifacts from Mobbin collection metadata; optional `collection_ids`, `tags`, `project_path`.

## Examples

```bash
node scripts/mobbin-visuals.mjs contact-sheet '{"feature_area":"checkout","limit":6,"columns":3,"output_path":"checkout-contact-sheet.png"}'
node scripts/mobbin-visuals.mjs find-similar '{"artifact_id":"...","max_distance":8,"limit":8}'
node scripts/mobbin-visuals.mjs sync-collections '{"tags":["seeded-from-collection"]}'
```
