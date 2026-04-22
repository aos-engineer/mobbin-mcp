import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "mobbin-mcp-data-"));
process.env.MOBBIN_DATA_DIR = tempDataDir;

const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "mobbin-mcp-project-"));
const sharedStoreDir = fs.mkdtempSync(path.join(os.tmpdir(), "mobbin-mcp-shared-"));

const artifactStore = await import("../dist/utils/artifact-store.js");
const sharedStore = await import("../dist/utils/shared-store.js");

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

  const prExport = artifactStore.exportArtifacts({
    projectPath,
    artifacts: [updated.artifact],
    format: "pr_markdown",
    objective: "Implement the checkout summary update safely.",
  });
  assert.match(prExport.output, /Reviewer Checklist/);

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

  const seeded = artifactStore.seedArtifactsFromCollections({
    projectPath,
    collections: [
      {
        id: "collection-1",
        workspaceId: "workspace-1",
        name: "checkout-inspiration",
        description: "Saved references for purchase flows.",
        isPublic: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: "user-1",
        mobileAppsCount: 1,
        mobileScreensCount: 2,
        mobileFlowsCount: 1,
        webAppsCount: 0,
        webScreensCount: 0,
        webFlowsCount: 0,
        mobilePreviewScreens: [
          {
            id: "preview-1",
            screenUrl: "https://bytescale.mobbin.com/example/preview.png",
          },
        ],
      },
    ],
    tags: ["seeded"],
  });
  assert.equal(seeded.createdArtifacts.length, 1);
  assert.equal(seeded.createdArtifacts[0].collections[0].name, "checkout-inspiration");

  const featureReview = artifactStore.buildFeatureReviewMarkdown({
    title: "Checkout review",
    projectName: "demo/project",
    intendedArtifacts: [updated.artifact],
    actualArtifacts: seeded.createdArtifacts,
  });
  assert.match(featureReview, /Diff Summary/);

  const sharedPush = sharedStore.syncSharedStore({
    projectPath,
    sharedStoreDir,
    direction: "push",
  });
  assert.ok(sharedPush.sharedArtifactCount >= 1);

  const sharedPull = sharedStore.syncSharedStore({
    projectPath,
    sharedStoreDir,
    direction: "pull",
  });
  assert.ok(sharedPull.localArtifactCount >= 1);

  const deletion = artifactStore.deleteArtifact(created.id, projectPath);
  assert.equal(deletion.deleted, true);
  assert.ok(deletion.artifactCount >= 1);
});
