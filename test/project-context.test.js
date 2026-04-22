import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "mobbin-mcp-data-"));
process.env.MOBBIN_DATA_DIR = tempDataDir;

const { resolveProjectContext } = await import("../dist/utils/project-context.js");

test("resolveProjectContext uses explicit path outside git", () => {
  const tempProject = fs.mkdtempSync(path.join(os.tmpdir(), "mobbin-mcp-project-"));
  const context = resolveProjectContext(tempProject);

  assert.equal(context.projectRoot, fs.realpathSync(tempProject));
  assert.equal(context.gitRoot, null);
  assert.equal(context.detectedFrom, "explicit_path");
  assert.ok(context.projectId.length > 0);
});
