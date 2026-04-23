import type { CapturedArtifact } from "../types.js";
import { getSharp } from "./sharp.js";

export interface VisualCandidate {
  label: string;
  imageUrl: string;
  artifactId?: string;
}

export interface SimilarityMatch {
  artifact: CapturedArtifact;
  distance: number;
  sharedHash: string | null;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function collectArtifactVisualCandidates(artifact: CapturedArtifact): VisualCandidate[] {
  const candidates: VisualCandidate[] = [];

  if (artifact.screenUrl) {
    candidates.push({
      label: artifact.title,
      imageUrl: artifact.screenUrl,
      artifactId: artifact.id,
    });
  }

  for (const step of artifact.steps) {
    if (!step.screenUrl) continue;
    candidates.push({
      label: step.title ?? `${artifact.title} step ${step.order + 1}`,
      imageUrl: step.screenUrl,
      artifactId: artifact.id,
    });
  }

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.artifactId ?? ""}:${candidate.imageUrl}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function computePerceptualHash(imageBuffer: Buffer): Promise<string> {
  const sharp = await getSharp();
  const { data } = await sharp(imageBuffer)
    .resize(8, 8, { fit: "cover" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const values = Array.from(data as Uint8Array, (value) => Number(value));
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const bits = values.map((value) => (value >= average ? "1" : "0")).join("");

  let hex = "";
  for (let index = 0; index < bits.length; index += 4) {
    hex += parseInt(bits.slice(index, index + 4), 2).toString(16);
  }
  return hex;
}

export function hammingDistance(hashA: string, hashB: string): number {
  const length = Math.max(hashA.length, hashB.length);
  let distance = 0;

  for (let index = 0; index < length; index += 1) {
    if ((hashA[index] ?? "") !== (hashB[index] ?? "")) {
      distance += 1;
    }
  }

  return distance;
}

export function findSimilarityMatches(params: {
  artifacts: CapturedArtifact[];
  targetHashes: string[];
  artifactIdToExclude?: string;
  maxDistance?: number;
  limit?: number;
}): SimilarityMatch[] {
  const maxDistance = params.maxDistance ?? 8;
  const limit = params.limit ?? 10;
  const matches: SimilarityMatch[] = [];

  for (const artifact of params.artifacts) {
    if (params.artifactIdToExclude && artifact.id === params.artifactIdToExclude) {
      continue;
    }

    let bestDistance = Number.POSITIVE_INFINITY;
    let bestHash: string | null = null;

    for (const targetHash of params.targetHashes) {
      for (const candidateHash of artifact.visualHashes) {
        const distance = hammingDistance(targetHash, candidateHash);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestHash = candidateHash;
        }
      }
    }

    if (bestHash && bestDistance <= maxDistance) {
      matches.push({
        artifact,
        distance: bestDistance,
        sharedHash: bestHash,
      });
    }
  }

  return matches.sort((a, b) => a.distance - b.distance).slice(0, limit);
}

export async function buildContactSheet(params: {
  items: Array<{
    label: string;
    buffer: Buffer;
  }>;
  columns?: number;
  thumbWidth?: number;
  thumbHeight?: number;
}): Promise<Buffer> {
  const items = params.items.slice(0, 24);
  if (items.length === 0) {
    throw new Error("No images provided for contact sheet generation.");
  }

  const columns = Math.max(1, Math.min(params.columns ?? 3, 6));
  const thumbWidth = params.thumbWidth ?? 320;
  const thumbHeight = params.thumbHeight ?? 640;
  const labelHeight = 60;
  const cellWidth = thumbWidth;
  const cellHeight = thumbHeight + labelHeight;
  const rows = Math.ceil(items.length / columns);
  const canvasWidth = columns * cellWidth;
  const canvasHeight = rows * cellHeight;

  const sharp = await getSharp();
  const composites: Array<{ input: Buffer; left: number; top: number }> = [];

  for (const [index, item] of items.entries()) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const left = column * cellWidth;
    const top = row * cellHeight;
    const resized = await sharp(item.buffer)
      .resize(thumbWidth, thumbHeight, { fit: "contain", background: "#111111" })
      .png()
      .toBuffer();

    composites.push({
      input: resized,
      left,
      top,
    });

    const labelSvg = Buffer.from(`
      <svg width="${cellWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#111111"/>
        <text x="16" y="26" fill="#f5f5f5" font-size="20" font-family="Helvetica, Arial, sans-serif">
          ${escapeXml(item.label.slice(0, 42))}
        </text>
      </svg>
    `);

    composites.push({
      input: labelSvg,
      left,
      top: top + thumbHeight,
    });
  }

  return sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 3,
      background: "#0b0b0b",
    },
  })
    .composite(composites)
    .png()
    .toBuffer();
}
