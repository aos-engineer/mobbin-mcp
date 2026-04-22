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

## Feature Analysis

1. Capture intended references and shipped screenshots separately.
2. Filter artifacts by feature area or tags.
3. Generate an analysis prompt with mode `analysis`.
4. Compare intended versus actual behavior in the implementation repo.

## Onboarding

1. Search by feature area, journey, or session name.
2. Generate an onboarding brief from the selected captures.
3. Store the resulting brief in team docs or hand it to a new teammate.

## Memory Sync

1. Select relevant artifacts for a feature or product area.
2. Export with `mem_palace_jsonl` or generate `mem_palace` agent context.
3. Ingest the output into your memory layer with project metadata preserved.
