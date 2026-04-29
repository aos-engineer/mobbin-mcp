#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(root, "source", "skills");
const distDir = path.join(root, "dist");

const providerTargets = {
  cursor: [".cursor", "skills"],
  "claude-code": [".claude", "skills"],
  gemini: [".gemini", "skills"],
  codex: [".codex", "skills"],
  agents: [".agents", "skills"],
  github: [".github", "skills"],
  github: [".github", "skills"],
  kiro: [".kiro", "skills"],
  opencode: [".opencode", "skills"],
  pi: [".pi", "skills"],
  qoder: [".qoder", "skills"],
  trae: [".trae", "skills"],
  "trae-cn": [".trae-cn", "skills"],
  "rovo-dev": [".rovodev", "skills"],
  "roo-code": [".roo", "skills"],
  roocode: [".roocode", "skills"],
};

const targets = [
  path.join(distDir, "skills"),
  ...Object.entries(providerTargets).map(([provider, parts]) => path.join(distDir, provider, ...parts)),
];

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function removeDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

if (!fs.existsSync(sourceDir)) {
  console.error(`Missing skills source directory: ${sourceDir}`);
  process.exit(1);
}

for (const target of targets) {
  removeDir(target);
  fs.mkdirSync(target, { recursive: true });
}

const skills = fs
  .readdirSync(sourceDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

for (const skill of skills) {
  const skillDir = path.join(sourceDir, skill);
  const skillMd = path.join(skillDir, "SKILL.md");
  if (!fs.existsSync(skillMd)) {
    console.error(`Skill is missing SKILL.md: ${skill}`);
    process.exitCode = 1;
    continue;
  }

  for (const target of targets) {
    copyDir(skillDir, path.join(target, skill));
  }
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log(`Built ${skills.length} Mobbin skills: ${skills.join(", ")}`);
