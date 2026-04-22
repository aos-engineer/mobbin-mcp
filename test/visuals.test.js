import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";

const visuals = await import("../dist/utils/visuals.js");

async function solidPng(color) {
  return sharp({
    create: {
      width: 64,
      height: 64,
      channels: 3,
      background: color,
    },
  })
    .png()
    .toBuffer();
}

test("visual hashing, similarity matching, and contact sheet generation work", async () => {
  const redA = await solidPng("#ff0000");
  const redB = await solidPng("#ff1111");
  const blue = await solidPng("#0000ff");

  const redHashA = await visuals.computePerceptualHash(redA);
  const redHashB = await visuals.computePerceptualHash(redB);
  const blueHash = await visuals.computePerceptualHash(blue);

  assert.equal(visuals.hammingDistance(redHashA, redHashA), 0);

  const matches = visuals.findSimilarityMatches({
    artifacts: [
      {
        id: "artifact-red",
        type: "screen",
        title: "Red",
        summary: "Red example",
        source: "manual",
        tags: [],
        participants: [],
        implementationHints: [],
        decisions: [],
        references: [],
        collections: [],
        steps: [],
        visualHashes: [redHashB],
        sourceUrls: [],
        patterns: [],
        elements: [],
        relatedArtifactIds: [],
        projectId: "demo",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "artifact-blue",
        type: "screen",
        title: "Blue",
        summary: "Blue example",
        source: "manual",
        tags: [],
        participants: [],
        implementationHints: [],
        decisions: [],
        references: [],
        collections: [],
        steps: [],
        visualHashes: [blueHash],
        sourceUrls: [],
        patterns: [],
        elements: [],
        relatedArtifactIds: [],
        projectId: "demo",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    targetHashes: [redHashA],
    maxDistance: 16,
    limit: 5,
  });

  assert.equal(matches[0].artifact.id, "artifact-red");

  const contactSheet = await visuals.buildContactSheet({
    items: [
      { label: "Red", buffer: redA },
      { label: "Blue", buffer: blue },
    ],
    columns: 2,
  });

  assert.ok(contactSheet.byteLength > 0);
});
