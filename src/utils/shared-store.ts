import fs from "node:fs";
import path from "node:path";
import { loadProjectArtifacts, mergeArtifacts, saveProjectArtifacts } from "./artifact-store.js";
import type { ProjectArtifactIndex } from "../types.js";

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(tempPath, filePath);
}

export function resolveSharedStoreDir(explicitDir?: string): string | null {
  const value = explicitDir?.trim() || process.env.MOBBIN_SHARED_STORE_DIR?.trim();
  if (!value) return null;
  return path.resolve(value);
}

export function getSharedStorePath(projectId: string, sharedStoreDir: string): string {
  return path.join(sharedStoreDir, `${projectId}.artifacts.json`);
}

export function readSharedProjectArtifacts(
  projectId: string,
  sharedStoreDir: string,
): ProjectArtifactIndex | null {
  const filePath = getSharedStorePath(projectId, sharedStoreDir);

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as ProjectArtifactIndex;
  } catch {
    return null;
  }
}

export function syncSharedStore(params: {
  projectPath?: string;
  sharedStoreDir?: string;
  direction: "push" | "pull" | "merge";
}): {
  project: ProjectArtifactIndex["project"];
  sharedStoreDir: string;
  direction: "push" | "pull" | "merge";
  localArtifactCount: number;
  sharedArtifactCount: number;
} {
  const resolvedDir = resolveSharedStoreDir(params.sharedStoreDir);
  if (!resolvedDir) {
    throw new Error(
      "Shared store is not configured. Set MOBBIN_SHARED_STORE_DIR or pass shared_store_dir.",
    );
  }

  const localIndex = loadProjectArtifacts(params.projectPath);
  const sharedIndex = readSharedProjectArtifacts(localIndex.project.projectId, resolvedDir);
  const mergedShared = sharedIndex
    ? {
        ...sharedIndex,
        project: localIndex.project,
      }
    : {
        version: localIndex.version,
        project: localIndex.project,
        artifacts: [],
      };

  if (params.direction === "push") {
    mergedShared.artifacts = mergeArtifacts(mergedShared.artifacts, localIndex.artifacts);
    writeJsonAtomic(getSharedStorePath(localIndex.project.projectId, resolvedDir), mergedShared);
    return {
      project: localIndex.project,
      sharedStoreDir: resolvedDir,
      direction: params.direction,
      localArtifactCount: localIndex.artifacts.length,
      sharedArtifactCount: mergedShared.artifacts.length,
    };
  }

  if (params.direction === "pull") {
    localIndex.artifacts = mergeArtifacts(localIndex.artifacts, mergedShared.artifacts);
    saveProjectArtifacts(localIndex);
    return {
      project: localIndex.project,
      sharedStoreDir: resolvedDir,
      direction: params.direction,
      localArtifactCount: localIndex.artifacts.length,
      sharedArtifactCount: mergedShared.artifacts.length,
    };
  }

  const mergedArtifacts = mergeArtifacts(localIndex.artifacts, mergedShared.artifacts);
  localIndex.artifacts = mergedArtifacts;
  mergedShared.artifacts = mergedArtifacts;
  saveProjectArtifacts(localIndex);
  writeJsonAtomic(getSharedStorePath(localIndex.project.projectId, resolvedDir), mergedShared);

  return {
    project: localIndex.project,
    sharedStoreDir: resolvedDir,
    direction: params.direction,
    localArtifactCount: mergedArtifacts.length,
    sharedArtifactCount: mergedArtifacts.length,
  };
}
