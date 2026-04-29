#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [action, payload = "{}"] = process.argv.slice(2);
if (!action || action === "--help" || action === "-h") {
  console.log("Usage: node scripts/mobbin-search.mjs <action> '<json-payload>'");
  process.exit(0);
}

const here = dirname(fileURLToPath(import.meta.url));
const localBins = [];
let cursor = here;
for (let depth = 0; depth < 10; depth += 1) {
  localBins.push(resolve(cursor, "index.js"));
  cursor = resolve(cursor, "..");
}
const localBin = localBins.find((candidate) => existsSync(candidate));
const bin = process.env.MOBBIN_MCP_BIN || (localBin ? process.execPath : "npx");
const args = process.env.MOBBIN_MCP_BIN
  ? ["skill", action, payload]
  : localBin
    ? [localBin, "skill", action, payload]
    : ["-y", "@aos-engineer/mobbin-mcp", "skill", action, payload];

const result = spawnSync(bin, args, { stdio: "inherit", shell: false });
process.exit(result.status ?? 1);
