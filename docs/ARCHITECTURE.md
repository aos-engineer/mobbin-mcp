# Architecture

## What The Project Is

This repository is now a local MCP server that does two jobs:

1. Query Mobbin's reverse-engineered internal API for apps, screens, flows, filters, and collections.
2. Turn Mobbin references and mobbing-session notes into a project-aware local reference system that agents can search, export, and reuse.

## Runtime Architecture

- `src/index.ts`
  Registers MCP tools, prompts, and resources and starts the stdio server.
- `src/services/auth.ts`
  Parses Supabase session cookies, refreshes tokens, and keeps auth valid.
- `src/services/api-client.ts`
  Calls Mobbin's internal API routes, fetches images, and caches repeated reads.
- `src/utils/project-context.ts`
  Detects the active project from git, environment variables, or cwd.
- `src/utils/artifact-store.ts`
  Stores, searches, updates, deletes, imports, and exports captured artifacts.
- `src/utils/auth-store.ts`
  Handles machine-local auth storage and portable data-dir configuration.

## MCP Surface

### Search tools

- `mobbin_search_apps`
- `mobbin_search_screens`
- `mobbin_search_flows`
- `mobbin_quick_search`
- `mobbin_popular_apps`
- `mobbin_list_collections`
- `mobbin_get_filters`
- `mobbin_get_screen_detail`

### Capture/reference tools

- `mobbin_doctor`
- `mobbin_get_project_context`
- `mobbin_capture_artifact`
- `mobbin_get_captured_artifact`
- `mobbin_update_captured_artifact`
- `mobbin_delete_captured_artifact`
- `mobbin_search_captured_artifacts`
- `mobbin_get_capture_catalog`
- `mobbin_export_captured_artifacts`
- `mobbin_import_captured_artifacts`
- `mobbin_generate_feature_prompt`
- `mobbin_generate_agent_context`

### Resources

- `mobbin://project/context`
- `mobbin://project/captures`
- `mobbin://project/catalog`

### Prompts

- `mobbin_feature_implementation_prompt`
- `mobbin_feature_analysis_prompt`
- `mobbin_onboarding_brief_prompt`

## Storage Model

Machine-scoped state:

- Auth session: `~/.mobbin-mcp/auth.json`
- Project captures: `~/.mobbin-mcp/projects/<project-id>/artifacts.json`

Overridable via environment:

- `MOBBIN_DATA_DIR`
- `MOBBIN_AUTH_FILE`
- `MOBBIN_PROJECT_ROOT`
- `PROJECT_ROOT`

## Artifact Model

Each artifact can include:

- `type`: screen, flow, note, implementation, design, reference
- `source`: mobbin, manual, derived
- tags, notes, app/platform context
- feature area, journey, session name, participants
- implementation hints
- decisions with rationale/status
- references to URLs or other artifacts
- ordered steps with optional screen URLs and hotspot metadata

## Design Intent

The server is no longer just a Mobbin browser. It is intended to act as:

- a lightweight design memory system
- a prompt context generator
- a feature-analysis reference store
- a portable bridge between Claude Code, Codex, Pi, and memory systems
