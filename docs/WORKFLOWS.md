# Workflows

## Reference Capture

Use this when you are collecting inspiration before or during implementation.

1. Search Mobbin for apps, screens, flows, sites, or sections.
2. Capture durable references with the highest-level tool that fits:
   - `mobbin_capture_flow_from_search` for iOS, Android, or Web app flows
   - `mobbin_capture_screen_from_search` for individual app screens
   - `mobbin_capture_site_sections` for Mobbin site-section references
   - `mobbin_capture_artifact` for manual notes, implementation decisions, or non-Mobbin references
3. Inspect individual screenshots with `mobbin_get_screen_detail` when visual detail or color extraction is needed.
4. Add implementation notes, decisions, feature area, journey, and tags as the session evolves.
5. Review the saved corpus with `mobbin_search_captured_artifacts` and `mobbin_get_capture_catalog`.

The direct capture tools preserve ordered steps, screen URLs, source URLs, patterns, elements, hotspot metadata, and optional visual hashes automatically.

## Flow Adaptation

Use this when a flow in this project should match or learn from how a top app handles it (onboarding, signup, checkout, paywall, search, settings, navigation, or first-run states).

1. Run the `mobbin-flow-architect` skill with the target flow and project context.
2. It studies a reference flow on Mobbin, captures the relevant screens, and decomposes the *transferable* structure from the incidental brand/visual identity.
3. It evaluates the current project and produces a flow spec and task plan adapted to this project's domain, design system, and constraints.
4. With sign-off, it implements the adapted flow.

This skill builds on `mobbin-search` and `mobbin-capture`, and pairs with `mobbin-prompts` for follow-up implementation packs.

## Feature Implementation

1. Search saved references with `mobbin_search_captured_artifacts`.
2. Review the project catalog with `mobbin_get_capture_catalog`.
3. Generate a prompt with `mobbin_generate_feature_prompt` or `mobbin_feature_implementation_prompt`.
4. Hand the output directly to Claude Code or Codex.
5. Attach `mobbin_generate_pr_reference` output to the PR when the feature is ready for review.

## Feature Analysis

1. Capture intended Mobbin references with direct capture tools.
2. Capture shipped screenshots or implementation notes as `manual` or `derived` artifacts with `mobbin_capture_artifact`.
3. Filter artifacts by feature area, tags, app, platform, or journey.
4. Generate an analysis prompt with `mobbin_generate_feature_prompt` and `mode: "analysis"`.
5. Generate a diff-ready report with `mobbin_generate_feature_review`.
6. Compare intended versus actual behavior in the implementation repo.

## Onboarding

1. Search by feature area, journey, or session name.
2. Generate an onboarding brief from the selected captures.
3. Store the resulting brief in team docs or hand it to a new teammate.

## Memory Sync

1. Select relevant artifacts for a feature or product area.
2. Export with `mem_palace_jsonl` or generate `mem_palace` agent context.
3. Ingest the output into your memory layer with project metadata preserved.

## Visual Review

1. Capture flows/screens/site sections with `compute_visual_hashes: true`, or let `mobbin_find_similar_artifacts` compute missing hashes later.
2. Select captured artifacts that represent a flow or feature area.
3. Generate a board with `mobbin_generate_flow_contact_sheet`.
4. Use `mobbin_find_similar_artifacts` to discover visually related references that may have been missed by text search.

## Shared Store Sync

1. Set `MOBBIN_SHARED_STORE_DIR` to a shared filesystem path.
2. Push your local artifacts with `mobbin_sync_shared_store`.
3. Pull or merge on another machine or teammate environment using the same project ID.

## Skills-First CLI Equivalent

Every workflow above has a skills-first equivalent:

```bash
mobbin-mcp skill capture-flow '{"platform":"web","flow_actions":["Checkout"],"feature_area":"checkout"}'
mobbin-mcp skill capture-screen '{"platform":"ios","screen_patterns":["Login"],"feature_area":"auth"}'
mobbin-mcp skill capture-site-sections '{"query":"linear","max_sections":4,"feature_area":"marketing"}'
mobbin-mcp skill feature-prompt '{"mode":"implementation","feature_area":"checkout","objective":"Build checkout confirmation"}'
```

Use MCP when your client prefers native MCP tools/resources/prompts. Use skills when you want a smaller context footprint and the same local store.
