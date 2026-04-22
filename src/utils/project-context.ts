import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { ProjectContext } from "../types.js";

function firstDefined(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => typeof value === "string" && value.trim().length > 0)?.trim();
}

function safeRealPath(inputPath: string): string {
  try {
    return fs.realpathSync(inputPath);
  } catch {
    return path.resolve(inputPath);
  }
}

function runGit(args: string[], cwd: string): string | null {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "ignore"],
  });

  if (result.status !== 0) {
    return null;
  }

  const value = result.stdout.trim();
  return value.length > 0 ? value : null;
}

function parseRepoName(remoteUrl: string | null, fallbackRoot: string): string {
  if (!remoteUrl) {
    return path.basename(fallbackRoot);
  }

  const sshMatch = remoteUrl.match(/[:/]([^/:]+\/[^/]+?)(?:\.git)?$/);
  if (sshMatch?.[1]) {
    return sshMatch[1];
  }

  try {
    const parsed = new URL(remoteUrl);
    return parsed.pathname.replace(/^\/+/, "").replace(/\.git$/, "") || path.basename(fallbackRoot);
  } catch {
    return path.basename(fallbackRoot);
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function resolveProjectContext(projectPath?: string): ProjectContext {
  const seedPath = firstDefined(
    projectPath,
    process.env.MOBBIN_PROJECT_ROOT,
    process.env.PROJECT_ROOT,
    process.env.CLAUDE_PROJECT_DIR,
    process.env.CODEX_PROJECT_ROOT,
    process.env.INIT_CWD,
    process.env.PWD,
    process.cwd(),
  );

  const resolvedSeed = safeRealPath(seedPath ?? process.cwd());
  const gitRoot = runGit(["rev-parse", "--show-toplevel"], resolvedSeed);
  const projectRoot = gitRoot ? safeRealPath(gitRoot) : resolvedSeed;
  const remoteUrl = gitRoot ? runGit(["remote", "get-url", "origin"], projectRoot) : null;
  const branch = gitRoot ? runGit(["rev-parse", "--abbrev-ref", "HEAD"], projectRoot) : null;
  const repoName = parseRepoName(remoteUrl, projectRoot);
  const projectId = slugify(repoName) || slugify(path.basename(projectRoot)) || "default-project";

  return {
    projectId,
    projectName: repoName,
    projectRoot,
    gitRoot: gitRoot ? projectRoot : null,
    remoteUrl,
    branch,
    detectedFrom: gitRoot
      ? "git"
      : projectPath
        ? "explicit_path"
        : process.env.MOBBIN_PROJECT_ROOT || process.env.PROJECT_ROOT
          ? "environment"
          : "cwd",
  };
}
