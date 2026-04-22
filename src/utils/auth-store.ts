import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { SupabaseSession } from "../services/auth.js";

function resolveDataDir(): string {
  if (process.env.MOBBIN_DATA_DIR?.trim()) {
    return path.resolve(process.env.MOBBIN_DATA_DIR);
  }

  if (process.env.XDG_CONFIG_HOME?.trim()) {
    return path.join(path.resolve(process.env.XDG_CONFIG_HOME), "mobbin-mcp");
  }

  return path.join(os.homedir(), ".mobbin-mcp");
}

export const DATA_DIR = resolveDataDir();
export const AUTH_DIR = DATA_DIR;
export const AUTH_FILE = process.env.MOBBIN_AUTH_FILE
  ? path.resolve(process.env.MOBBIN_AUTH_FILE)
  : path.join(AUTH_DIR, "auth.json");

export function readStoredSession(): SupabaseSession | null {
  try {
    const data = JSON.parse(fs.readFileSync(AUTH_FILE, "utf-8"));
    if (data.access_token && data.refresh_token && data.expires_at) {
      return data as SupabaseSession;
    }
    return null;
  } catch {
    return null;
  }
}

export function writeStoredSession(session: SupabaseSession): void {
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  const tmp = AUTH_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(session, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, AUTH_FILE);
}
