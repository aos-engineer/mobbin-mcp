import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

type Provider = {
  id: string;
  label: string;
  globalSkillsDir: string;
};

const PROVIDERS: Provider[] = [
  { id: "claude-code", label: "Claude Code", globalSkillsDir: "~/.claude/skills" },
  { id: "codex", label: "Codex", globalSkillsDir: "~/.codex/skills" },
  { id: "agents", label: "Codex Repo Skills / Agents", globalSkillsDir: "~/.agents/skills" },
  { id: "gemini", label: "Gemini CLI", globalSkillsDir: "~/.gemini/skills" },
  { id: "opencode", label: "OpenCode", globalSkillsDir: "~/.opencode/skills" },
  { id: "pi", label: "Pi", globalSkillsDir: "~/.pi/skills" },
  { id: "cursor", label: "Cursor", globalSkillsDir: "~/.cursor/skills" },
  { id: "kiro", label: "Kiro", globalSkillsDir: "~/.kiro/skills" },
  { id: "qoder", label: "Qoder", globalSkillsDir: "~/.qoder/skills" },
  { id: "trae", label: "Trae", globalSkillsDir: "~/.trae/skills" },
  { id: "trae-cn", label: "Trae China", globalSkillsDir: "~/.trae-cn/skills" },
  { id: "rovo-dev", label: "Rovo Dev", globalSkillsDir: "~/.rovodev/skills" },
  { id: "roo-code", label: "Roo Code", globalSkillsDir: "~/.roo/skills" },
  { id: "roocode", label: "RooCode", globalSkillsDir: "~/.roocode/skills" },
  { id: "github", label: "GitHub Copilot", globalSkillsDir: "~/.github/skills" },
];

type LinkResult = {
  provider: Provider;
  linked: string[];
  skipped: string[];
  removed: string[];
};

function expandHome(value: string): string {
  return value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
}

function distRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function sourceSkillsDir(): string {
  return path.join(distRoot(), "skills");
}

function readSkills(): string[] {
  const skillsDir = sourceSkillsDir();
  if (!fs.existsSync(skillsDir)) {
    throw new Error(`Built skills not found at ${skillsDir}. Run npm run build first.`);
  }

  return fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => fs.existsSync(path.join(skillsDir, name, "SKILL.md")))
    .sort();
}

function parseProviders(flags: string[]): Provider[] {
  const requested = flags
    .filter((flag) => flag.startsWith("--provider="))
    .flatMap((flag) =>
      flag
        .slice("--provider=".length)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    );

  if (requested.length === 0 || requested.includes("all")) {
    return PROVIDERS;
  }

  const selected: Provider[] = [];
  const missing: string[] = [];
  for (const id of requested) {
    const provider = PROVIDERS.find((candidate) => candidate.id === id);
    if (provider) selected.push(provider);
    else missing.push(id);
  }

  if (missing.length > 0) {
    throw new Error(`Unknown provider(s): ${missing.join(", ")}. Known providers: ${PROVIDERS.map((provider) => provider.id).join(", ")}`);
  }

  return selected;
}

function removeExisting(dest: string): boolean {
  try {
    fs.rmSync(dest, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

function linkSkill(src: string, dest: string, force: boolean): "linked" | "skipped" {
  if (fs.existsSync(dest)) {
    const stat = fs.lstatSync(dest);
    if (stat.isSymbolicLink()) {
      const target = fs.readlinkSync(dest);
      const resolved = path.resolve(path.dirname(dest), target);
      if (resolved === src) return "linked";
    }

    if (!force) return "skipped";
    removeExisting(dest);
  }

  fs.symlinkSync(src, dest, "dir");
  return "linked";
}

function install(provider: Provider, skills: string[], force: boolean): LinkResult {
  const skillsDir = expandHome(provider.globalSkillsDir);
  fs.mkdirSync(skillsDir, { recursive: true });

  const result: LinkResult = { provider, linked: [], skipped: [], removed: [] };
  for (const skill of skills) {
    const src = path.join(sourceSkillsDir(), skill);
    const dest = path.join(skillsDir, skill);
    const status = linkSkill(src, dest, force);
    result[status].push(skill);
  }

  return result;
}

function uninstall(provider: Provider, skills: string[]): LinkResult {
  const skillsDir = expandHome(provider.globalSkillsDir);
  const result: LinkResult = { provider, linked: [], skipped: [], removed: [] };

  for (const skill of skills) {
    const dest = path.join(skillsDir, skill);
    if (!fs.existsSync(dest)) {
      result.skipped.push(skill);
      continue;
    }

    const stat = fs.lstatSync(dest);
    if (!stat.isSymbolicLink()) {
      result.skipped.push(skill);
      continue;
    }

    fs.unlinkSync(dest);
    result.removed.push(skill);
  }

  return result;
}

function status(provider: Provider, skills: string[]): LinkResult {
  const skillsDir = expandHome(provider.globalSkillsDir);
  const result: LinkResult = { provider, linked: [], skipped: [], removed: [] };

  for (const skill of skills) {
    const dest = path.join(skillsDir, skill);
    if (!fs.existsSync(dest)) {
      result.skipped.push(skill);
      continue;
    }

    const stat = fs.lstatSync(dest);
    if (stat.isSymbolicLink()) result.linked.push(skill);
    else result.skipped.push(skill);
  }

  return result;
}

function printResults(action: string, results: LinkResult[]): void {
  for (const result of results) {
    const skillsDir = expandHome(result.provider.globalSkillsDir);
    const parts = [
      result.linked.length > 0 ? `${result.linked.length} linked` : "",
      result.removed.length > 0 ? `${result.removed.length} removed` : "",
      result.skipped.length > 0 ? `${result.skipped.length} skipped` : "",
    ].filter(Boolean);
    console.log(`${result.provider.label}: ${parts.join(", ") || "no changes"} (${skillsDir})`);
  }

  if (action === "install") {
    console.log("\nRestart any running CLI or IDE so it can discover the skill symlinks.");
  }
}

function printHelp(): void {
  console.log(`Usage: mobbin-mcp skills <install|uninstall|status> [options]

Options:
  --provider=<id[,id]>   Provider(s) to target. Default: all.
  --force                Replace existing real folders or wrong symlinks.

Providers:
${PROVIDERS.map((provider) => `  ${provider.id.padEnd(12)} ${provider.globalSkillsDir}`).join("\n")}

Examples:
  mobbin-mcp skills install
  mobbin-mcp skills install --provider=codex,claude-code,gemini
  mobbin-mcp skills install --force
  mobbin-mcp skills status
  mobbin-mcp skills uninstall --provider=all`);
}

export async function runSkillsCommand(argv = process.argv.slice(2)): Promise<void> {
  const [, action, ...flags] = argv;
  if (!action || action === "--help" || action === "-h" || action === "help") {
    printHelp();
    return;
  }

  const skills = readSkills();
  const providers = parseProviders(flags);
  const force = flags.includes("--force");

  if (action === "install") {
    printResults(action, providers.map((provider) => install(provider, skills, force)));
    return;
  }

  if (action === "uninstall") {
    printResults(action, providers.map((provider) => uninstall(provider, skills)));
    return;
  }

  if (action === "status") {
    printResults(action, providers.map((provider) => status(provider, skills)));
    return;
  }

  throw new Error(`Unknown skills action: ${action}`);
}
