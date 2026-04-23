# Mobbin MCP Server

A local-first MCP server for [Mobbin](https://mobbin.com) that now does two jobs:

1. Search Mobbin's reverse-engineered internal API for apps, screens, flows, filters, collections, and screenshots.
2. Turn Mobbin references and mobbing-session notes into a project-aware capture and reference system that agents can search, export, and reuse.

Mobbin has no public API. This server was built by reverse-engineering their internal endpoints.

## What It Does Now

- search Mobbin apps, screens, flows, collections, and filters
- fetch full screenshots and optional dominant colors
- auto-detect the active repository from git, env vars, or cwd
- capture design references, implementation notes, decisions, and flow steps into a local project store
- search, update, delete, catalog, import, and export captured artifacts
- generate visual contact sheets from saved screens and flows
- compute perceptual hashes and find visually similar captured artifacts
- generate PR-ready reference markdown and diff-ready feature review reports
- seed the local store from Mobbin collection metadata
- optionally sync the local project store with a filesystem-backed shared store
- generate prompt-ready implementation, analysis, onboarding, and agent-specific context packs
- support Claude Code, Codex, Pi-style conversational agents, and Mem Palace export workflows through the same MCP surface

## What Changed From The Original Fork

The original upstream project was mainly a Mobbin browser for Claude.

This repo now adds:

- project-aware local artifact storage
- capture CRUD and cataloging
- MCP resources and reusable prompts
- multi-agent context generation
- export/import workflows for reuse across sessions and systems
- diagnostics and tests

Changed assumptions:

- no longer Claude-only
- no longer search-only
- no longer limited to transient one-off inspiration lookup

Removed limitations from the old shape:

- no requirement to manually scope references per project
- no dependence on ad hoc prompt writing every time you want to reuse a flow
- no lack of MCP resources/prompts for downstream agents

## Tools

### Search Mobbin

| Tool | Description |
| --- | --- |
| `mobbin_search_apps` | Search and browse apps by category and platform |
| `mobbin_search_screens` | Search screens by UI patterns, elements, or text content |
| `mobbin_search_flows` | Search user flows by action type |
| `mobbin_quick_search` | Fast autocomplete search for apps by name |
| `mobbin_popular_apps` | Get popular apps grouped by category |
| `mobbin_list_collections` | List your saved collections |
| `mobbin_get_screen_detail` | Fetch a full screenshot image for a specific screen, with optional dominant color extraction |
| `mobbin_get_filters` | Get all available filter values |

### Capture And Reference Workflows

| Tool | Description |
| --- | --- |
| `mobbin_doctor` | Inspect auth, project detection, artifact storage, and runtime health |
| `mobbin_get_project_context` | Auto-detect the current repository / working directory and show capture state |
| `mobbin_capture_artifact` | Save screens, flows, notes, decisions, and implementation references into a local project index |
| `mobbin_get_captured_artifact` | Fetch a single captured artifact by ID |
| `mobbin_update_captured_artifact` | Update metadata, notes, steps, and decisions on an existing artifact |
| `mobbin_delete_captured_artifact` | Remove an artifact from the local project index |
| `mobbin_search_captured_artifacts` | Search previously captured artifacts by keyword, tag, type, app, or feature area |
| `mobbin_get_capture_catalog` | Return facet counts for types, tags, apps, patterns, and feature areas |
| `mobbin_export_captured_artifacts` | Export artifacts as JSON, Markdown, prompt packs, or Mem Palace JSONL |
| `mobbin_import_captured_artifacts` | Import artifacts from a previous export |
| `mobbin_generate_feature_prompt` | Generate implementation, analysis, or onboarding prompts from captured artifacts |
| `mobbin_generate_agent_context` | Generate agent-specific context for Claude Code, Codex, Pi, or Mem Palace |
| `mobbin_generate_flow_contact_sheet` | Generate a stitched PNG contact sheet from saved artifacts |
| `mobbin_find_similar_artifacts` | Find visually similar artifacts using perceptual hashes |
| `mobbin_generate_pr_reference` | Generate PR-ready markdown from selected references |
| `mobbin_sync_collections_to_artifacts` | Seed the local store from Mobbin collection metadata |
| `mobbin_generate_feature_review` | Generate a diff-ready intended-vs-actual feature review |
| `mobbin_sync_shared_store` | Push, pull, or merge the local project store with a shared filesystem store |

## Resources

| Resource | Description |
| --- | --- |
| `mobbin://project/context` | Current repo-aware project context detected from git or cwd |
| `mobbin://project/captures` | Current project's captured artifact index as JSON |
| `mobbin://project/catalog` | Current project's artifact catalog and facet counts |

## Prompts

| Prompt | Description |
| --- | --- |
| `mobbin_feature_implementation_prompt` | Build a reusable implementation prompt from captured artifacts |
| `mobbin_feature_analysis_prompt` | Build a feature-analysis prompt from captured artifacts |
| `mobbin_onboarding_brief_prompt` | Build an onboarding brief from captured artifacts |

## Setup

### Prerequisites

- Node.js 18+
- A [Mobbin](https://mobbin.com) account (free or paid)

## Installation

Published package:

```text
@aos-engineer/mobbin-mcp
```

Recommended install path:

```bash
npm install -g @aos-engineer/mobbin-mcp
mobbin-mcp auth
```

Contributor and fallback paths:

### Option A: Run From GitHub

```bash
npx -y github:aos-engineer/mobbin-mcp auth
```

### Option B: Run From A Local Checkout

```bash
git clone https://github.com/aos-engineer/mobbin-mcp.git
cd mobbin-mcp
npm install
npm run build
node dist/index.js
```

### 1. Authenticate

**Option A: global install (recommended for Claude Code)**

```bash
mobbin-mcp auth
```

**Option B: npm package path**

```bash
npx -y @aos-engineer/mobbin-mcp auth
```

**Option C: GitHub fallback**

```bash
npx -y github:aos-engineer/mobbin-mcp auth
```

**Option D: local checkout**

```bash
node dist/index.js auth
```

This is a one-time setup per machine. The session is stored globally and reused automatically across projects.

The CLI expects the two Supabase auth cookie chunks combined into one line:

1. Open [mobbin.com](https://mobbin.com) and log in
2. Open the browser console (`Cmd+Option+J`)
3. Run:

```js
copy(
  document.cookie
    .split("; ")
    .filter((c) => c.startsWith("sb-ujasntkfphywizsdaapi-auth-token.0=") || c.startsWith("sb-ujasntkfphywizsdaapi-auth-token.1="))
    .join("; ")
)
```

4. Paste that value into the CLI prompt

Your session is saved to `~/.mobbin-mcp/auth.json` (or `XDG_CONFIG_HOME/mobbin-mcp/auth.json`) and automatically refreshed.

> **What gets copied?** This copies only the two Supabase auth cookie chunks needed for Mobbin authentication. These are sensitive session credentials. They are stored locally on your machine at `~/.mobbin-mcp/auth.json` and are never sent anywhere except to Mobbin's API.

**Option B: Environment variable (manual)**

1. Open [mobbin.com](https://mobbin.com) in Chrome and log in
2. Open DevTools (`Cmd+Option+I`) → **Application** tab → **Cookies** → `https://mobbin.com`
3. Copy the full values of `sb-ujasntkfphywizsdaapi-auth-token.0` and `sb-ujasntkfphywizsdaapi-auth-token.1`
4. Combine them into a single string:

```
sb-ujasntkfphywizsdaapi-auth-token.0=<value0>; sb-ujasntkfphywizsdaapi-auth-token.1=<value1>
```
5. Set `MOBBIN_AUTH_COOKIE` to that value (see step 2 below)

### Environment variables

| Variable | Purpose |
| --- | --- |
| `MOBBIN_AUTH_COOKIE` | Manual auth input: combined `sb-...auth-token.0/.1` cookie pair |
| `MOBBIN_DATA_DIR` | Override the default data directory |
| `MOBBIN_AUTH_FILE` | Override the auth session file path |
| `MOBBIN_PROJECT_ROOT` | Explicit project root for capture storage |
| `PROJECT_ROOT` | Alternative explicit project root |

### 2. Add to Claude Code

Recommended global install path:

```bash
claude mcp add mobbin -- mobbin-mcp
```

npm fallback:

```bash
claude mcp add mobbin -- npx -y @aos-engineer/mobbin-mcp
```

GitHub fallback:

```bash
claude mcp add mobbin -- npx -y github:aos-engineer/mobbin-mcp
```

If you used the CLI auth command (Option A), no additional config is needed — the server reads from `~/.mobbin-mcp/auth.json` automatically.

If using the environment variable (Option B), pass it when adding:

Recommended global install path:

```bash
claude mcp add mobbin -e MOBBIN_AUTH_COOKIE="sb-ujasntkfphywizsdaapi-auth-token.0=...; sb-ujasntkfphywizsdaapi-auth-token.1=..." -- mobbin-mcp
```

npm fallback:

```bash
claude mcp add mobbin -e MOBBIN_AUTH_COOKIE="sb-ujasntkfphywizsdaapi-auth-token.0=...; sb-ujasntkfphywizsdaapi-auth-token.1=..." -- npx -y @aos-engineer/mobbin-mcp
```

GitHub fallback:

```bash
claude mcp add mobbin -e MOBBIN_AUTH_COOKIE="sb-ujasntkfphywizsdaapi-auth-token.0=...; sb-ujasntkfphywizsdaapi-auth-token.1=..." -- npx -y github:aos-engineer/mobbin-mcp
```

### 3. Add to Codex

If your Codex runtime is configured to use stdio MCP servers, prefer the installed binary:

```json
{
  "mcpServers": {
    "mobbin": {
      "command": "mobbin-mcp"
    }
  }
}
```

Package fallback:

```json
{
  "mcpServers": {
    "mobbin": {
      "command": "npx",
      "args": ["-y", "@aos-engineer/mobbin-mcp"]
    }
  }
}
```

For a local checkout, use:

```json
{
  "mcpServers": {
    "mobbin": {
      "command": "node",
      "args": ["/absolute/path/to/mobbin-mcp/dist/index.js"]
    }
  }
}
```

### Alternative: Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "mobbin": {
      "command": "npx",
      "args": ["-y", "@aos-engineer/mobbin-mcp"]
    }
  }
}
```

### Local MCP alternative

If you prefer a pinned local checkout instead of `npx`, build once locally and point your MCP client directly at the compiled server:

```json
{
  "mcpServers": {
    "mobbin": {
      "command": "node",
      "args": ["/absolute/path/to/mobbin-mcp/dist/index.js"]
    }
  }
}
```

## Example prompts

- "I'm designing a checkout flow for a food delivery app — show me how top apps like DoorDash and Uber Eats handle it"
- "Pull up the Duolingo onboarding flow and walk me through each screen's design decisions"
- "Find login screens that use bottom sheets and extract the color palette — I need inspiration for our auth redesign"
- "Compare how fintech apps handle settings screens — show me examples from Robinhood, Cash App, and Venmo"
- "Search for screens with card-based layouts in travel apps, then show me the best one in detail"
- "What UI patterns are trending right now on iOS? Show me the top screens"
- "Save this onboarding flow as a captured artifact for our auth redesign and tag it `signup`, `ios`, and `trust-building`"
- "Generate a Codex-ready implementation prompt for the checkout feature using our saved `checkout` references"
- "Export our saved growth-onboarding captures as Mem Palace JSONL"
- "Give me an onboarding brief for the billing area using everything tagged `billing`"
- "Generate a contact sheet for our saved onboarding references"
- "Find visually similar artifacts to this saved checkout screen"
- "Generate PR reference markdown for the billing redesign work"
- "Sync my Mobbin collections into this project's local artifact store"
- "Compare intended onboarding references against the actual shipped onboarding artifacts"

## How it works

Mobbin is a Next.js app backed by Supabase. This server calls Mobbin's internal API routes (`/api/content/search-apps`, `/api/content/search-screens`, etc.) using your session cookie for authentication. Tokens are automatically refreshed via Supabase's `/auth/v1/token` endpoint before they expire, and persisted back to `~/.mobbin-mcp/auth.json` when using the CLI auth method.

Screen images are served through Mobbin's Bytescale CDN. The `mobbin_get_screen_detail` tool automatically converts Supabase storage URLs from search results into CDN URLs, fetches the image, and returns it as base64 content that the model can see and analyze. Optional color extraction uses [sharp](https://sharp.pixelplumbing.com/) to return dominant hex colors from the screenshot.

Captured artifacts are stored locally in a project-aware index under `~/.mobbin-mcp/projects/<project-id>/artifacts.json`. The server auto-detects the active repository from git when possible, then falls back to the current working directory. This makes saved Mobbin references portable across MCP clients while still being scoped to the project you are working on.

Repeated Mobbin reads are cached in-process for short periods to reduce redundant API traffic for common searches, autocomplete, filters, collections, and popular app lookups.

Artifacts can include:

- feature area, journey, session name, and participants
- implementation hints and decision logs
- ordered steps with patterns, elements, and hotspot geometry
- references to URLs or other saved artifacts
- collection links and preview-screen derived references
- cached visual hashes for similarity search

## Recommended Workflow

1. Search Mobbin for relevant apps, screens, and flows.
2. Inspect screenshots with `mobbin_get_screen_detail`.
3. Save durable references with `mobbin_capture_artifact`.
4. Tag and organize them with feature area, journey, and decision notes.
5. Review the saved corpus with `mobbin_search_captured_artifacts` and `mobbin_get_capture_catalog`.
6. Generate contact sheets, PR reference packs, or feature review reports as needed.
7. Generate implementation, analysis, onboarding, or agent-specific context from the saved artifacts.
8. Optionally sync the project store with a shared filesystem-backed store for team reuse.

## Storage Layout

```text
~/.mobbin-mcp/
  auth.json
  projects/
    <project-id>/
      artifacts.json
```

The server is local-first. It does not require a shared backend to be useful, but captured artifacts can be exported and re-imported across machines, repos, or agents.

## Development

```bash
npm install
npm run build
npm run lint
npm test
```

Additional docs:

- [Architecture](docs/ARCHITECTURE.md)
- [Portability](docs/PORTABILITY.md)
- [Workflows](docs/WORKFLOWS.md)
- [Implementation Ideas](docs/IMPLEMENTATION_IDEAS.md)

## Project structure

```
src/
  index.ts              # MCP server entry point, CLI routing, and tool registration
  constants.ts          # API URLs, keys, and config
  types.ts              # TypeScript interfaces for Mobbin models and captured artifacts
  cli/
    auth.ts             # Interactive CLI authentication flow
  services/
    auth.ts             # Token parsing, expiry checks, and auto-refresh
    api-client.ts       # HTTP client for all Mobbin API endpoints with caching/timeouts
  utils/
    auth-store.ts       # Persistent session storage (~/.mobbin-mcp/auth.json)
    artifact-store.ts   # Project-aware capture store, search, import/export, and prompt generation
    formatting.ts       # Markdown formatters for tool responses
    project-context.ts  # Git / cwd auto-discovery for repository-aware capture
docs/
  ARCHITECTURE.md       # Current architecture and MCP surface
  PORTABILITY.md        # Agent portability strategy
  WORKFLOWS.md          # Recommended usage patterns
  IMPLEMENTATION_IDEAS.md # Next expansion ideas
test/
  *.test.js             # Node test coverage for capture store and project detection
```

## Roadmap

Priority next features:

1. Item-level collection sync once additional Mobbin collection-content endpoints are discovered.
2. Embedding-backed or hybrid visual/text similarity ranking beyond perceptual hashes.
3. Automatic screenshot capture of shipped application flows for direct intended-vs-actual comparison.
4. Shared HTTP-backed team storage instead of filesystem-only shared sync.
5. Design-system extraction from saved references into reusable implementation assets.

## License

MIT
