# Mobbin Skills

This repo ships Mobbin as focused agent skills instead of requiring the MCP server to be loaded for every session.

Skills are the recommended setup. They do not connect to the MCP server or consume MCP context. Instead, each skill calls the installed package through `mobbin-mcp skill <action> '<json-payload>'`, reusing the same Mobbin auth, API client, project artifact store, prompt builders, and visual utilities that the MCP server uses internally.

If the four Mobbin skills are installed and visible in your CLI or IDE, you can remove any Mobbin MCP server entry from that tool unless you still need native MCP tools/resources/prompts or MCP inline image responses.

## Shape

Source skills live in `source/skills/`:

- `mobbin-search`: live Mobbin search, filters, sites, sections, collections, and screenshot detail
- `mobbin-capture`: project-aware artifact capture, catalog, import, export, and shared-store sync
- `mobbin-prompts`: implementation, analysis, onboarding, PR, feature-review, and agent context packs
- `mobbin-visuals`: contact sheets, visual similarity, and collection seeding

Each skill has a small bundled script under `scripts/`. The scripts call:

```bash
mobbin-mcp skill <action> '<json-payload>'
```

That command reuses the same Mobbin auth, API client, local artifact store, visual utilities, and prompt builders as the MCP implementation.

## Build

```bash
npm run build
```

The build compiles TypeScript and copies skills to:

- `dist/skills/`
- provider bundles like `dist/claude-code/.claude/skills/`, `dist/codex/.codex/skills/`, `dist/gemini/.gemini/skills/`, `dist/opencode/.opencode/skills/`, and the rest of the supported IDE/CLI directories

## Global Install

```bash
npm install -g @aos-engineer/mobbin-mcp
mobbin-mcp skills install
```

`mobbin-mcp skills install` creates symlinks from the global provider skill folders back to the package's built `dist/skills` directory. This keeps every CLI on the same installed skill version.

Supported global targets:

- `~/.claude/skills`
- `~/.codex/skills`
- `~/.agents/skills`
- `~/.gemini/skills`
- `~/.opencode/skills`
- `~/.pi/skills`
- `~/.cursor/skills`
- `~/.kiro/skills`
- `~/.qoder/skills`
- `~/.trae/skills`
- `~/.trae-cn/skills`
- `~/.rovodev/skills`
- `~/.roo/skills`
- `~/.roocode/skills`
- `~/.github/skills`

Useful commands:

```bash
mobbin-mcp skills status
mobbin-mcp skills install --provider=codex,claude-code,gemini
mobbin-mcp skills install --force
mobbin-mcp skills uninstall --provider=all
```

## Removing MCP

After installing skills, MCP is optional. You can remove the Mobbin MCP server from Claude Code, Codex, or another client if your workflow is covered by:

- `mobbin-search`
- `mobbin-capture`
- `mobbin-prompts`
- `mobbin-visuals`

Keep the MCP server only when you want an MCP-native surface, including:

- direct MCP tool calls instead of skill-triggered CLI calls
- MCP resources such as `mobbin://project/context`
- MCP prompt objects
- inline image content blocks from `mobbin_get_screen_detail`

The saved auth and artifact data are shared either way, so switching between skills and MCP does not migrate data.

## Release

```bash
npm run release:skill
```

This produces the skill release artifacts and the global symlink installer in `dist/`.

## Auth

Skills still need Mobbin auth for live API calls:

```bash
npx -y @aos-engineer/mobbin-mcp auth
```

Local capture and prompt actions that only read saved artifacts do not need live Mobbin API access.

## MCP Coverage

The skills are intended to cover the full MCP surface while loading only the focused instructions needed for a task.

### Tools

| MCP tool | Skill | Skill action |
| --- | --- | --- |
| `mobbin_search_apps` | `mobbin-search` | `search-apps` |
| `mobbin_search_sites` | `mobbin-search` | `search-sites` |
| `mobbin_get_site_sections` | `mobbin-search` | `site-sections` |
| `mobbin_search_screens` | `mobbin-search` | `search-screens` |
| `mobbin_search_flows` | `mobbin-search` | `search-flows` |
| `mobbin_quick_search` | `mobbin-search` | `quick-search` |
| `mobbin_popular_apps` | `mobbin-search` | `popular-apps` |
| `mobbin_list_collections` | `mobbin-search` | `collections` |
| `mobbin_get_filters` | `mobbin-search` | `filters` |
| `mobbin_get_screen_detail` | `mobbin-search` | `screen-detail` |
| `mobbin_doctor` | `mobbin-capture` | `doctor` |
| `mobbin_get_project_context` | `mobbin-capture` | `project-context` |
| `mobbin_capture_artifact` | `mobbin-capture` | `capture` |
| `mobbin_get_captured_artifact` | `mobbin-capture` | `get` |
| `mobbin_update_captured_artifact` | `mobbin-capture` | `update` |
| `mobbin_delete_captured_artifact` | `mobbin-capture` | `delete` |
| `mobbin_search_captured_artifacts` | `mobbin-capture` | `search` |
| `mobbin_get_capture_catalog` | `mobbin-capture` | `catalog` |
| `mobbin_export_captured_artifacts` | `mobbin-capture` | `export` |
| `mobbin_import_captured_artifacts` | `mobbin-capture` | `import` |
| `mobbin_generate_feature_prompt` | `mobbin-prompts` | `feature-prompt` |
| `mobbin_generate_agent_context` | `mobbin-prompts` | `agent-context` |
| `mobbin_generate_flow_contact_sheet` | `mobbin-visuals` | `contact-sheet` |
| `mobbin_find_similar_artifacts` | `mobbin-visuals` | `find-similar` |
| `mobbin_generate_pr_reference` | `mobbin-prompts` | `pr-reference` |
| `mobbin_sync_collections_to_artifacts` | `mobbin-visuals` | `sync-collections` |
| `mobbin_generate_feature_review` | `mobbin-prompts` | `feature-review` |
| `mobbin_sync_shared_store` | `mobbin-capture` | `sync-shared-store` |

### Resources

| MCP resource | Skill | Skill action |
| --- | --- | --- |
| `mobbin://project/context` | `mobbin-capture` | `project-context` |
| `mobbin://project/captures` | `mobbin-capture` | `captures` |
| `mobbin://project/catalog` | `mobbin-capture` | `catalog` |

### Prompts

| MCP prompt | Skill | Skill action |
| --- | --- | --- |
| `mobbin_feature_implementation_prompt` | `mobbin-prompts` | `implementation-prompt` or `feature-prompt` with `mode: "implementation"` |
| `mobbin_feature_analysis_prompt` | `mobbin-prompts` | `analysis-prompt` or `feature-prompt` with `mode: "analysis"` |
| `mobbin_onboarding_brief_prompt` | `mobbin-prompts` | `onboarding-prompt` or `feature-prompt` with `mode: "onboarding"` |

Known difference: `screen-detail` prints metadata and dominant colors through the CLI. The MCP response can also attach the screenshot as an inline image because MCP supports image content blocks.
