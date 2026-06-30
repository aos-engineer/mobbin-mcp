# Portability

## Universal Interface

Skills are the primary portability layer.

Anything that supports agent skills can use the focused Mobbin skill set without loading the MCP tool surface into the model context. The skills call `mobbin-mcp skill ...`, so they reuse the same package internals as MCP: auth, Mobbin API access, project artifact storage, prompt generation, visual hashing, and shared-store sync.

MCP remains available as an optional compatibility layer for clients that prefer native MCP tools/resources/prompts or need MCP inline image content.

## Install And Upgrade

```bash
npm install -g @aos-engineer/mobbin-mcp@latest
mobbin-mcp auth
mobbin-mcp skills install --force
mobbin-mcp skills status
```

`skills install --force` refreshes existing symlinks so every supported CLI points at the newly installed package version.

## Current Strategy

### Claude Code

- Recommended: install global skills with `mobbin-mcp skills install`
- Optional: add the MCP server if you want native MCP tools/resources/prompts
- Remove the Mobbin MCP entry when the four Mobbin skills appear in the skills list and you do not need MCP-specific image/resource behavior

### Codex

- Recommended: install global skills with `mobbin-mcp skills install`
- Optional: configure the MCP server for native MCP workflows
- Skills provide repo-aware prompt/context generation and structured artifact capture without loading MCP

### Pi Or Other Conversational Agents

- Recommended: install skills when the client supports them
- Use `mobbin-prompts` / `agent-context` for Pi-friendly context blocks
- Use MCP only when the client has MCP support and you specifically want that protocol surface

### Mem Palace Memory

- Use `mobbin_generate_agent_context` with target `mem_palace`
- Or `mobbin_export_captured_artifacts` with `mem_palace_jsonl`
- Treat exported JSONL as a memory-ingestion feed keyed by project, tags, feature area, and artifact type

## Wrapper Guidance

Use skills first.

Use MCP or wrappers only when needed for:

- MCP-native tools/resources/prompts
- inline image content blocks
- clients that do not support skills but do support MCP
- memory ingestion adapters

## Recommended Team Setup

1. Authenticate once with `npx -y @aos-engineer/mobbin-mcp auth`
2. Install skills with `mobbin-mcp skills install`
3. Capture references during mobbing sessions into the local project store with `capture-flow`, `capture-screen`, `capture-site-sections`, or manual `capture`
4. Generate agent-specific context on demand with `mobbin-prompts`
5. Export JSON or memory JSONL when context needs to move outside the local store

Optional MCP setup can coexist with skills, but it is no longer required for the standard workflow.

## Data Portability

- Auth is stored in `~/.mobbin-mcp/auth.json` unless overridden by `MOBBIN_AUTH_FILE`.
- Project captures are stored under `~/.mobbin-mcp/projects/<project-id>/artifacts.json` unless overridden by `MOBBIN_DATA_DIR`.
- Project identity is detected from git, `MOBBIN_PROJECT_ROOT`, `PROJECT_ROOT`, or the current directory.
- `mobbin_sync_shared_store` can push, pull, or merge a project store through a shared filesystem path.
