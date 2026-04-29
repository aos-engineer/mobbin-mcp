---
name: mobbin-search
description: Search and browse Mobbin design references without loading the Mobbin MCP server. Use when the user needs app, screen, flow, site, section, collection, filter, or screenshot reference discovery from Mobbin, including queries like "find checkout screens on Mobbin", "search Mobbin sites", "get Mobbin filters", or "inspect this Mobbin screen URL".
allowed-tools:
  - Bash(node *)
  - Bash(npx *)
---

# Mobbin Search

Search Mobbin from a focused skill instead of loading the MCP tool surface.

## Setup

Mobbin requires authentication. If commands fail with missing auth, run:

```bash
npx -y @aos-engineer/mobbin-mcp auth
```

Use the bundled script:

```bash
node scripts/mobbin-search.mjs <action> '<json>'
```

The script delegates to `mobbin-mcp skill <action> <json>` and accepts the same JSON fields as the old MCP tools.

## Actions

- `search-apps`: `platform`, `categories`, `sort_by`, `page_size`, `page_index`
- `search-screens`: `platform`, `screen_patterns`, `screen_elements`, `screen_keywords`, `categories`, `has_animation`, `sort_by`, `page_size`, `page_index`
- `search-flows`: `platform`, `flow_actions`, `categories`, `sort_by`, `page_size`, `page_index`
- `search-sites`: `query`, `page_size`, `page_index`
- `site-sections`: `site_id`, `site_name`, `query`, `page_size`, `page_index`
- `quick-search`: `query`, `platform`
- `popular-apps`: `platform`, `limit_per_category`
- `collections`: no required fields
- `filters`: no required fields
- `screen-detail`: `screen_url`, optional `screen_id`, `app_name`, `screen_patterns`, `screen_elements`, `extract_colors`

## Workflow

1. Translate the user's request into the narrowest action.
2. Keep `page_size` small, usually 5 to 10.
3. Return the useful names, IDs, URLs, patterns, and elements.
4. When a result should become durable project context, use the `mobbin-capture` skill to save it.

## Examples

```bash
node scripts/mobbin-search.mjs search-screens '{"platform":"ios","screen_patterns":["Checkout"],"page_size":5}'
node scripts/mobbin-search.mjs search-sites '{"query":"pricing","page_size":5}'
node scripts/mobbin-search.mjs site-sections '{"query":"linear","page_size":5}'
node scripts/mobbin-search.mjs screen-detail '{"screen_url":"https://...","extract_colors":true}'
```
