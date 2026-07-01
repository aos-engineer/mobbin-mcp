# Desktop Apps: Claude Desktop, Claude Code, and Codex

This guide makes the Mobbin MCP server and skills usable in desktop clients. The short version: there is no single package that covers all of them, because the clients consume different things.

## Which format for which client

`.mcpb` (formerly `.dxt`) is a one-click **Claude Desktop** bundle. It is **not** consumed by Claude Code or Codex — those use plain MCP config (JSON/TOML). So we ship a hybrid.

| Client | MCP server | Skills |
| --- | --- | --- |
| **Claude Desktop** (chat app) | `.mcpb` bundle, one-click install | Agent Skills |
| **Claude Code** (CLI, desktop, IDE) | `claude mcp add` or `.mcp.json` | `mobbin-mcp skills install` → `~/.claude/skills` |
| **Codex** (CLI, desktop, IDE) | `~/.codex/config.toml` `[mcp_servers.*]` or `codex mcp add` | `~/.codex/skills` |

Notes:

- `.dxt` was renamed to `.mcpb` in late 2025 (`@anthropic-ai/dxt` → `@anthropic-ai/mcpb`). Existing `.dxt` files still load in Claude Desktop, but new bundles should be `.mcpb`. We ship `.mcpb`.
- All server paths above run the same published package (`npx -y @aos-engineer/mobbin-mcp`), so there is one thing to keep updated.
- Skills are the lighter path and cover Claude Code and Codex without loading the full MCP surface. Many users only need `mobbin-mcp skills install`. Use MCP when you specifically want native MCP tools, resources, prompts, or inline image responses.

## Authentication (once, any client)

Mobbin has no public API; the server uses your own logged-in session.

```bash
npx -y @aos-engineer/mobbin-mcp auth
```

This stores the session at `~/.mobbin-mcp/auth.json`, which every client reuses. Alternatively, pass a `MOBBIN_AUTH_COOKIE` env value in the config (see below).

## Claude Desktop (one-click `.mcpb`)

1. Build the bundle (or download it from a release):

   ```bash
   npm run build:mcpb    # produces dist-mcpb/mobbin-mcp.mcpb
   ```

2. Double-click `mobbin-mcp.mcpb`, or drag it into Claude Desktop → **Settings → Extensions**.
3. When prompted, paste your Mobbin auth cookie (or leave it blank if you already ran `mobbin-mcp auth`).

Requires Node.js on the machine (the bundle launches `npx -y @aos-engineer/mobbin-mcp`). Manual alternative, without the bundle: add [`examples/claude-desktop-config.json`](../examples/claude-desktop-config.json) to `~/Library/Application Support/Claude/claude_desktop_config.json`.

## Claude Code (CLI, desktop app, IDE)

MCP server:

```bash
claude mcp add mobbin -- npx -y @aos-engineer/mobbin-mcp
# or, with inline auth:
claude mcp add mobbin -e MOBBIN_AUTH_COOKIE="sb-...-auth-token.0=...; sb-...-auth-token.1=..." -- npx -y @aos-engineer/mobbin-mcp
```

Or drop [`examples/claude-code.mcp.json`](../examples/claude-code.mcp.json) into your project as `.mcp.json`.

Skills (recommended, no MCP needed):

```bash
npm install -g @aos-engineer/mobbin-mcp
mobbin-mcp skills install
```

Restart Claude Code so it discovers the skills. This is the same for the CLI, the desktop app, and the IDE extension.

## Codex (CLI, desktop app, IDE)

MCP server — add with the CLI:

```bash
codex mcp add mobbin -- npx -y @aos-engineer/mobbin-mcp
```

Or paste [`examples/codex-config.toml`](../examples/codex-config.toml) into `~/.codex/config.toml` (global) or `.codex/config.toml` (trusted project). In the desktop app / IDE extension: gear menu → **MCP settings → Open config.toml**. Restart Codex afterward.

Skills:

```bash
mobbin-mcp skills install --provider=codex
```

This links the skills into `~/.codex/skills`.

## Keeping the bundle in sync

`npm run build:mcpb` syncs `manifest.json` to the current `package.json` version (both the `version` field and the pinned `npx` argument), then validates and packs. Bump the package version first, then rebuild the bundle so the `.mcpb` and the npm package it launches never drift.

## References

- MCPB format and manifest: <https://github.com/modelcontextprotocol/mcpb>
- Claude Desktop Extensions: <https://www.anthropic.com/engineering/desktop-extensions>
- Claude Code MCP: <https://code.claude.com/docs/en/mcp>
- Codex MCP: <https://developers.openai.com/codex/mcp>
