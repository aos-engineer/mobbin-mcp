import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "mobbin-mcp-data-"));
process.env.MOBBIN_DATA_DIR = tempDataDir;

const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "mobbin-mcp-project-"));

const artifactStore = await import("../dist/utils/artifact-store.js");

test("artifact CRUD, search, catalog, export, and import work end-to-end", () => {
  const created = artifactStore.createArtifact({
    projectPath,
    type: "flow",
    title: "Checkout flow reference",
    summary: "Reference flow for a cleaner purchase journey.",
    featureArea: "checkout",
    journeyName: "purchase",
    sessionName: "Sprint 12 mobbing",
    participants: ["alex", "sam"],
    tags: ["checkout", "ios"],
    implementationHints: ["Reuse the payment summary card."],
    decisions: [
      {
        decision: "Use progressive disclosure for fees",
        rationale: "Avoid overwhelming users on the first screen",
        status: "accepted",
      },
    ],
    steps: [
      {
        order: 0,
        title: "Cart review",
        summary: "User confirms items before payment.",
        screenUrl: "https://bytescale.mobbin.com/example/cart.png",
        patterns: ["Cart"],
        elements: ["Card", "CTA"],
      },
    ],
    sourceUrls: ["https://mobbin.com/apps/example"],
  });

  artifactStore.upsertArtifact(created, projectPath);

  const fetched = artifactStore.getArtifactById(created.id, projectPath);
  assert.equal(fetched.artifact?.title, "Checkout flow reference");
  assert.equal(fetched.artifact?.featureArea, "checkout");

  const search = artifactStore.searchArtifacts({
    projectPath,
    query: "progressive disclosure checkout",
    limit: 5,
  });
  assert.equal(search.results.length, 1);
  assert.equal(search.results[0].id, created.id);

  const updated = artifactStore.updateArtifact(
    created.id,
    {
      notes: "Keep payment summary sticky near the CTA.",
      implementationHints: ["Use a sticky footer CTA."],
    },
    projectPath,
  );
  assert.equal(updated.artifact?.notes, "Keep payment summary sticky near the CTA.");

  const catalog = artifactStore.buildArtifactCatalog(projectPath);
  assert.equal(catalog.catalog.totalArtifacts, 1);
  assert.equal(catalog.catalog.byFeatureArea.checkout, 1);
  assert.equal(catalog.catalog.byType.flow, 1);

  const markdownExport = artifactStore.exportArtifacts({
    projectPath,
    artifacts: [updated.artifact],
    format: "markdown",
  });
  assert.match(markdownExport.output, /Checkout flow reference/);

  const memoryExport = artifactStore.exportArtifacts({
    projectPath,
    artifacts: [updated.artifact],
    format: "mem_palace_jsonl",
  });
  assert.match(memoryExport.output, /artifact_id/);

  const importedProjectPath = fs.mkdtempSync(path.join(os.tmpdir(), "mobbin-mcp-project-import-"));
  const importResult = artifactStore.importArtifacts({
    projectPath: importedProjectPath,
    payload: JSON.stringify({ artifacts: [updated.artifact] }),
    mergeStrategy: "append",
  });
  assert.equal(importResult.imported, 1);

  const deletion = artifactStore.deleteArtifact(created.id, projectPath);
  assert.equal(deletion.deleted, true);
  assert.equal(deletion.artifactCount, 0);
});
