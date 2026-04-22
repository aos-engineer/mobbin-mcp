# Portability

## Universal Interface

MCP is the primary portability layer.

Anything that can consume MCP tools/resources/prompts can use the same server directly. Agent-specific wrappers are only needed when an agent cannot consume MCP natively or when its prompt format benefits from extra shaping.

## Current Strategy

### Claude Code

- Native MCP client support
- Uses the server directly over stdio
- Benefits from prompts/resources plus the design-search tools

### Codex

- Native MCP client support
- Uses the same stdio server directly
- Benefits from repo-aware prompt/context generation and structured artifact capture

### Pi Or Other Conversational Agents

- If the agent supports MCP, connect directly
- If not, use exported prompt packs or a thin future CLI/HTTP wrapper
- `mobbin_generate_agent_context` already emits Pi-friendly context blocks

### Mem Palace Memory

- Use `mobbin_generate_agent_context` with target `mem_palace`
- Or `mobbin_export_captured_artifacts` with `mem_palace_jsonl`
- Treat exported JSONL as a memory-ingestion feed keyed by project, tags, feature area, and artifact type

## Wrapper Guidance

Use the universal MCP surface first.

Add wrappers only when needed for:

- connection bootstrapping
- auth bootstrapping
- non-MCP prompt templates
- memory ingestion adapters

## Recommended Team Setup

1. Authenticate once with `mobbin-mcp auth`
2. Add the MCP server to Claude Code and Codex
3. Capture references during mobbing sessions into the local project store
4. Generate agent-specific context on demand with `mobbin_generate_agent_context`
5. Export JSON or memory JSONL when the context needs to move outside MCP
