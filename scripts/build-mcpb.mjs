#!/usr/bin/env node
/**
 * Build the Mobbin MCPB desktop bundle (mobbin-mcp.mcpb).
 *
 * This is a thin "launcher" bundle: the manifest runs `npx -y
 * @aos-engineer/mobbin-mcp@<version>` so npm resolves the correct native
 * `sharp` binary per platform at install time, and every release stays a
 * single small file with no platform-specific packaging.
 *
 * Keeps manifest.json in sync with package.json (version + pinned npx arg),
 * stages the manifest into a clean directory, and packs it with the mcpb CLI.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const manifestPath = path.join(root, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const pinned = `@aos-engineer/mobbin-mcp@${pkg.version}`;

// Keep the tracked manifest in sync with the package version so the bundle and
// the npm package it launches never drift.
let changed = false;
if (manifest.version !== pkg.version) {
  manifest.version = pkg.version;
  changed = true;
}
const args = manifest.server?.mcp_config?.args ?? [];
const npxIdx = args.findIndex((a) => typeof a === "string" && a.startsWith("@aos-engineer/mobbin-mcp"));
if (npxIdx !== -1 && args[npxIdx] !== pinned) {
  args[npxIdx] = pinned;
  changed = true;
}
if (changed) {
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Synced manifest.json to v${pkg.version}`);
}

// Stage a clean bundle directory containing only what ships in the .mcpb.
const stage = path.join(root, ".mcpb-build");
fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });
fs.copyFileSync(manifestPath, path.join(stage, "manifest.json"));
const icon = path.join(root, "icon.png");
if (fs.existsSync(icon)) {
  fs.copyFileSync(icon, path.join(stage, "icon.png"));
  if (!manifest.icon) {
    // note: icon is optional; only referenced if present
  }
}

const outDir = path.join(root, "dist-mcpb");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "mobbin-mcp.mcpb");

execFileSync("npx", ["--yes", "@anthropic-ai/mcpb@latest", "validate", path.join(stage, "manifest.json")], {
  stdio: "inherit",
});
execFileSync("npx", ["--yes", "@anthropic-ai/mcpb@latest", "pack", stage, outFile], { stdio: "inherit" });

fs.rmSync(stage, { recursive: true, force: true });
const bytes = fs.statSync(outFile).size;
console.log(`\nBuilt ${path.relative(root, outFile)} (${bytes} bytes) for v${pkg.version}`);
