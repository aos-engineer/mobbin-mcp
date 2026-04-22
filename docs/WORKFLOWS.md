# Workflows

## Reference Capture

1. Search Mobbin for apps, screens, or flows.
2. Inspect screenshots with `mobbin_get_screen_detail`.
3. Save meaningful references with `mobbin_capture_artifact`.
4. Add implementation notes, decisions, and steps as the session evolves.

## Feature Implementation

1. Search saved references with `mobbin_search_captured_artifacts`.
2. Review the project catalog with `mobbin_get_capture_catalog`.
3. Generate a prompt with `mobbin_generate_feature_prompt` or `mobbin_feature_implementation_prompt`.
4. Hand the output directly to Claude Code or Codex.
5. Attach `mobbin_generate_pr_reference` output to the PR when the feature is ready for review.

## Feature Analysis

1. Capture intended references and shipped screenshots separately.
2. Filter artifacts by feature area or tags.
3. Generate an analysis prompt with mode `analysis`.
4. Generate a diff-ready report with `mobbin_generate_feature_review`.
5. Compare intended versus actual behavior in the implementation repo.

## Onboarding

1. Search by feature area, journey, or session name.
2. Generate an onboarding brief from the selected captures.
3. Store the resulting brief in team docs or hand it to a new teammate.

## Memory Sync

1. Select relevant artifacts for a feature or product area.
2. Export with `mem_palace_jsonl` or generate `mem_palace` agent context.
3. Ingest the output into your memory layer with project metadata preserved.

## Visual Review

1. Select captured artifacts that represent a flow or feature area.
2. Generate a board with `mobbin_generate_flow_contact_sheet`.
3. Use `mobbin_find_similar_artifacts` to discover visually related references that may have been missed by text search.

## Shared Store Sync

1. Set `MOBBIN_SHARED_STORE_DIR` to a shared filesystem path.
2. Push your local artifacts with `mobbin_sync_shared_store`.
3. Pull or merge on another machine or teammate environment using the same project ID.
