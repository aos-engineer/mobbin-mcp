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

test("Mobbin result builders preserve flow, screen, and site-section context", () => {
  const flowArtifact = artifactStore.createArtifactFromFlow({
    projectPath,
    featureArea: "onboarding",
    tags: ["reference"],
    visualHashes: ["abc123"],
    flow: {
      id: "flow-1",
      name: "Create account",
      actions: ["Creating Account"],
      order: 0,
      videoUrl: "https://bytescale.mobbin.com/example/flow.mp4",
      appVersionId: "app-version-1",
      appId: "app-1",
      appName: "Example Bank",
      appCategory: "Finance",
      appLogoUrl: "https://bytescale.mobbin.com/example/logo.png",
      platform: "ios",
      screens: [
        {
          id: "flow-screen-2",
          order: 1,
          hotspotType: "tap",
          hotspotX: 0.5,
          hotspotY: 0.8,
          hotspotWidth: 0.2,
          hotspotHeight: 0.1,
          videoTimestamp: 1200,
          screenUrl: "https://bytescale.mobbin.com/example/step-2.png",
          screenId: "screen-2",
          screenElements: ["Button"],
          screenPatterns: ["Verification"],
          metadata: { width: 390, height: 844 },
        },
        {
          id: "flow-screen-1",
          order: 0,
          hotspotType: null,
          hotspotX: null,
          hotspotY: null,
          hotspotWidth: null,
          hotspotHeight: null,
          videoTimestamp: 0,
          screenUrl: "https://bytescale.mobbin.com/example/step-1.png",
          screenId: "screen-1",
          screenElements: ["Input", "Button"],
          screenPatterns: ["Signup"],
          metadata: { width: 390, height: 844 },
        },
      ],
    },
  });

  assert.equal(flowArtifact.type, "flow");
  assert.equal(flowArtifact.appName, "Example Bank");
  assert.equal(flowArtifact.platform, "ios");
  assert.equal(flowArtifact.featureArea, "onboarding");
  assert.equal(flowArtifact.steps.length, 2);
  assert.equal(flowArtifact.steps[0].screenId, "screen-1");
  assert.equal(flowArtifact.steps[1].hotspot?.x, 0.5);
  assert.deepEqual(flowArtifact.visualHashes, ["abc123"]);
  assert.ok(flowArtifact.sourceUrls.includes("https://bytescale.mobbin.com/example/flow.mp4"));
  assert.ok(flowArtifact.patterns.includes("signup"));
  assert.ok(flowArtifact.elements.includes("button"));

  const screenArtifact = artifactStore.createArtifactFromScreen({
    projectPath,
    screen: {
      type: "curated",
      id: "screen-3",
      screenUrl: "https://bytescale.mobbin.com/example/screen.png",
      fullpageScreenUrl: "https://bytescale.mobbin.com/example/screen-full.png",
      screenNumber: 3,
      screenPatterns: ["Checkout"],
      screenElements: ["Card", "CTA"],
      screenKeywords: "Pay now Order summary",
      appVersionId: "app-version-2",
      appId: "app-2",
      appName: "Example Shop",
      appCategory: "Shopping",
      allAppCategories: ["Shopping"],
      appLogoUrl: "https://bytescale.mobbin.com/example/shop-logo.png",
      appTagline: "Shop faster",
      companyHqRegion: null,
      companyStage: null,
      platform: "web",
      popularityMetric: 10,
      trendingMetric: 5,
      metadata: { width: 1440, height: 1200 },
    },
  });

  assert.equal(screenArtifact.type, "screen");
  assert.equal(screenArtifact.screenUrl, "https://bytescale.mobbin.com/example/screen.png");
  assert.equal(screenArtifact.steps[0].summary, "Pay now Order summary");
  assert.ok(screenArtifact.sourceUrls.includes("https://bytescale.mobbin.com/example/screen-full.png"));

  const siteArtifact = artifactStore.createArtifactFromSiteSections({
    projectPath,
    featureArea: "marketing",
    sections: [
      {
        id: "section-2",
        siteId: "site-1",
        siteVersionId: "site-version-1",
        siteName: "Example Site",
        pageUrl: "https://example.com/pricing",
        type: "pricing",
        pageImageUrl: "https://bytescale.mobbin.com/example/page.png",
        sectionImageUrl: "https://bytescale.mobbin.com/example/section-2.png",
        displayOrder: 2,
        patterns: ["Pricing"],
        popularityMetric: 1,
        trendingMetric: 1,
        textPreview: "Plans for teams",
      },
      {
        id: "section-1",
        siteId: "site-1",
        siteVersionId: "site-version-1",
        siteName: "Example Site",
        pageUrl: "https://example.com",
        type: "hero",
        pageImageUrl: "https://bytescale.mobbin.com/example/page.png",
        sectionImageUrl: "https://bytescale.mobbin.com/example/section-1.png",
        displayOrder: 1,
        patterns: ["Hero"],
        popularityMetric: 1,
        trendingMetric: 1,
        textPreview: "Ship better products",
      },
    ],
  });

  assert.equal(siteArtifact.type, "design");
  assert.equal(siteArtifact.platform, "web");
  assert.equal(siteArtifact.steps.length, 2);
  assert.equal(siteArtifact.steps[0].screenId, "section-1");
  assert.equal(siteArtifact.steps[1].screenId, "section-2");
  assert.ok(siteArtifact.patterns.includes("hero"));
  assert.ok(siteArtifact.sourceUrls.includes("https://bytescale.mobbin.com/example/section-2.png"));
});
