import {
  MOBBIN_BASE_URL,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_COOKIE_PREFIX,
  TOKEN_REFRESH_BUFFER_SECONDS,
} from "../constants.js";
import { redactSensitiveText } from "../utils/security.js";

export interface SupabaseSession {
  access_token: string;
  token_type: string;
  expires_in: number;
  expires_at: number;
  refresh_token: string;
  user: {
    id: string;
    email: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

const COOKIE_CHUNK_SIZE = 3_800;

export interface MobbinRuntimeConfig {
  mobbinBaseUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseCookiePrefix: string;
}

const DEFAULT_RUNTIME_CONFIG: MobbinRuntimeConfig = {
  mobbinBaseUrl: MOBBIN_BASE_URL,
  supabaseUrl: SUPABASE_URL,
  supabaseAnonKey: SUPABASE_ANON_KEY,
  supabaseCookiePrefix: SUPABASE_COOKIE_PREFIX,
};

let runtimeConfig: MobbinRuntimeConfig = { ...DEFAULT_RUNTIME_CONFIG };
let runtimeConfigDiscoveryPromise: Promise<MobbinRuntimeConfig | null> | null = null;

export function inferCookiePrefixFromSupabaseUrl(supabaseUrl: string): string | null {
  try {
    const parsed = new URL(supabaseUrl);
    const projectRef = parsed.hostname.match(/^([a-z0-9]+)\.supabase\.co$/i)?.[1];
    return projectRef ? `sb-${projectRef}-auth-token` : null;
  } catch {
    return null;
  }
}

export function extractNextStaticScriptUrls(html: string): string[] {
  const matches = [...html.matchAll(/<script[^>]+src=["']([^"']*\/_next\/static\/chunks\/[^"']+\.js[^"']*)["']/g)];
  const urls = matches.map((match) => match[1]);
  return Array.from(new Set(urls));
}

export function extractMobbinRuntimeConfigFromBundle(bundle: string): Partial<MobbinRuntimeConfig> {
  const supabaseUrl = bundle.match(/NEXT_PUBLIC_SUPABASE_URL\s*:\s*"([^"]+)"/)?.[1];
  const supabaseAnonKey = bundle.match(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY\s*:\s*"([^"]+)"/)?.[1];
  const supabaseCookiePrefix = supabaseUrl ? inferCookiePrefixFromSupabaseUrl(supabaseUrl) : null;

  return {
    ...(supabaseUrl ? { supabaseUrl } : {}),
    ...(supabaseAnonKey ? { supabaseAnonKey } : {}),
    ...(supabaseCookiePrefix ? { supabaseCookiePrefix } : {}),
  };
}

/**
 * Manages Supabase auth tokens for the Mobbin API.
 *
 * The session is stored in two chunked cookies (`sb-...-auth-token.0` and `.1`)
 * because the JSON payload exceeds the 4KB single-cookie limit.
 *
 * On each request, {@link getCookieValue} checks whether the access token is
 * about to expire and proactively refreshes it via Supabase's
 * `POST /auth/v1/token?grant_type=refresh_token` endpoint.
 */
export class MobbinAuth {
  private session: SupabaseSession;
  private rawCookie: string;
  private refreshPromise: Promise<void> | null = null;
  private onSessionRefreshed?: (session: SupabaseSession) => void;
  private hasServedInitialCookie = false;

  private constructor(
    session: SupabaseSession,
    rawCookie: string,
    onSessionRefreshed?: (session: SupabaseSession) => void,
  ) {
    this.session = session;
    this.rawCookie = rawCookie;
    this.onSessionRefreshed = onSessionRefreshed;
  }

  static fromCookie(rawCookie: string): MobbinAuth {
    const session = MobbinAuth.parseSessionFromInput(rawCookie);
    return new MobbinAuth(session, MobbinAuth.buildCookieString(session));
  }

  static fromSession(
    session: SupabaseSession,
    onSessionRefreshed?: (session: SupabaseSession) => void,
  ): MobbinAuth {
    const rawCookie = MobbinAuth.buildCookieString(session);
    return new MobbinAuth(session, rawCookie, onSessionRefreshed);
  }

  /**
   * Returns a valid cookie string for use in request headers.
   * Automatically refreshes the token if it's expired or about to expire.
   */
  getSession(): SupabaseSession {
    return this.session;
  }

  async getCookieValue(): Promise<string> {
    if (this.isExpired()) {
      await this.refresh();
    } else if (this.hasServedInitialCookie && this.isExpiringSoon()) {
      await this.refresh();
    }
    this.hasServedInitialCookie = true;
    return this.rawCookie;
  }

  /** True if the access token has already expired. */
  private isExpired(): boolean {
    const nowSeconds = Math.floor(Date.now() / 1000);
    return nowSeconds >= this.session.expires_at;
  }

  /** True if the access token expires within {@link TOKEN_REFRESH_BUFFER_SECONDS}. */
  private isExpiringSoon(): boolean {
    const nowSeconds = Math.floor(Date.now() / 1000);
    return nowSeconds >= this.session.expires_at - TOKEN_REFRESH_BUFFER_SECONDS;
  }

  /**
   * Refresh the session using Supabase's token endpoint.
   * Deduplicates concurrent refresh calls so only one runs at a time.
   */
  private async refresh(): Promise<void> {
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = this.doRefresh();
    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async doRefresh(): Promise<void> {
    let config = MobbinAuth.getRuntimeConfig();
    let res = await MobbinAuth.refreshWithConfig(this.session.refresh_token, config);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const discoveredConfig =
        !MobbinAuth.hasExplicitSupabaseOverrides() &&
        MobbinAuth.shouldRetryWithDiscoveredConfig(res.status, text)
          ? await MobbinAuth.discoverRuntimeConfig()
          : null;

      if (discoveredConfig && MobbinAuth.applyRuntimeConfig(discoveredConfig)) {
        config = MobbinAuth.getRuntimeConfig();
        res = await MobbinAuth.refreshWithConfig(this.session.refresh_token, config);
        if (res.ok) {
          const newSession = (await res.json()) as SupabaseSession;
          this.session = newSession;
          this.rawCookie = MobbinAuth.buildCookieString(newSession);

          if (this.onSessionRefreshed) {
            this.onSessionRefreshed(newSession);
          }
          return;
        }
      }

      throw new Error(
        `Token refresh failed (${res.status}): ${redactSensitiveText(text)}. ` +
          "Run 'npx mobbin-mcp auth' to re-authenticate.",
      );
    }

    const newSession = (await res.json()) as SupabaseSession;
    this.session = newSession;
    this.rawCookie = MobbinAuth.buildCookieString(newSession);

    if (this.onSessionRefreshed) {
      this.onSessionRefreshed(newSession);
    }
  }

  private static getRuntimeConfig(): MobbinRuntimeConfig {
    return runtimeConfig;
  }

  private static applyRuntimeConfig(nextConfig: Partial<MobbinRuntimeConfig>): boolean {
    const merged: MobbinRuntimeConfig = {
      ...runtimeConfig,
      ...Object.fromEntries(
        Object.entries(nextConfig).filter(([, value]) => typeof value === "string" && value.trim().length > 0),
      ),
    };

    const changed =
      merged.mobbinBaseUrl !== runtimeConfig.mobbinBaseUrl ||
      merged.supabaseUrl !== runtimeConfig.supabaseUrl ||
      merged.supabaseAnonKey !== runtimeConfig.supabaseAnonKey ||
      merged.supabaseCookiePrefix !== runtimeConfig.supabaseCookiePrefix;

    runtimeConfig = merged;
    return changed;
  }

  private static hasExplicitSupabaseOverrides(): boolean {
    return Boolean(
      process.env.MOBBIN_SUPABASE_URL?.trim() ||
        process.env.MOBBIN_SUPABASE_PUBLISHABLE_KEY?.trim() ||
        process.env.MOBBIN_SUPABASE_COOKIE_PREFIX?.trim(),
    );
  }

  private static shouldRetryWithDiscoveredConfig(status: number, bodyText: string): boolean {
    const lowered = bodyText.toLowerCase();
    return (
      status === 401 ||
      lowered.includes("unregistered api key") ||
      lowered.includes("not registered for this project") ||
      lowered.includes("invalid api key")
    );
  }

  private static async refreshWithConfig(
    refreshToken: string,
    config: MobbinRuntimeConfig,
  ): Promise<Response> {
    return fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.supabaseAnonKey,
      },
      body: JSON.stringify({
        refresh_token: refreshToken,
      }),
    });
  }

  private static async discoverRuntimeConfig(fetchImpl: typeof fetch = fetch): Promise<MobbinRuntimeConfig | null> {
    if (runtimeConfigDiscoveryPromise) {
      return runtimeConfigDiscoveryPromise;
    }

    runtimeConfigDiscoveryPromise = (async () => {
      try {
        const baseConfig = MobbinAuth.getRuntimeConfig();
        const html = await fetchImpl(baseConfig.mobbinBaseUrl).then(async (response) => {
          if (!response.ok) {
            throw new Error(`Failed to fetch Mobbin homepage (${response.status})`);
          }
          return response.text();
        });

        const htmlConfig = extractMobbinRuntimeConfigFromBundle(html);
        if (htmlConfig.supabaseUrl && htmlConfig.supabaseAnonKey) {
          return {
            ...baseConfig,
            ...htmlConfig,
          };
        }

        const scriptUrls = extractNextStaticScriptUrls(html)
          .sort((a, b) => {
            const rank = (url: string) =>
              url.includes("main-app")
                ? 0
                : url.includes("app/layout")
                  ? 1
                  : url.includes("app/")
                    ? 2
                    : 3;
            return rank(a) - rank(b);
          })
          .slice(0, 12);

        for (const scriptUrl of scriptUrls) {
          const absoluteUrl = new URL(scriptUrl, baseConfig.mobbinBaseUrl).toString();
          const bundle = await fetchImpl(absoluteUrl).then(async (response) => {
            if (!response.ok) {
              return "";
            }
            return response.text();
          });

          if (!bundle) continue;

          const discovered = extractMobbinRuntimeConfigFromBundle(bundle);
          if (discovered.supabaseUrl && discovered.supabaseAnonKey) {
            return {
              ...baseConfig,
              ...discovered,
            };
          }
        }

        return null;
      } catch {
        return null;
      } finally {
        runtimeConfigDiscoveryPromise = null;
      }
    })();

    return runtimeConfigDiscoveryPromise;
  }

  private static normalizeInput(input: string): string {
    const trimmed = input.trim();

    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      return trimmed.slice(1, -1);
    }

    return trimmed;
  }

  private static tryParseSessionPayload(payload: string): SupabaseSession | null {
    const normalized = MobbinAuth.normalizeInput(payload);
    const candidates = [normalized];
    const seen = new Set<string>();

    const enqueue = (candidate: string | null | undefined) => {
      if (!candidate || seen.has(candidate)) {
        return;
      }
      seen.add(candidate);
      candidates.push(candidate);
    };

    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      try {
        const parsed = JSON.parse(candidate) as SupabaseSession;
        if (parsed?.access_token && parsed?.refresh_token && parsed?.expires_at) {
          return parsed;
        }
      } catch {
        // Try the next candidate form below.
      }

      try {
        const decoded = decodeURIComponent(candidate);
        if (decoded !== candidate) {
          enqueue(decoded);
        }
      } catch {
        // Ignore invalid URI encodings and continue with other forms.
      }

      const decodedBase64 = MobbinAuth.decodeBase64CookiePayload(candidate);
      if (decodedBase64 && decodedBase64 !== candidate) {
        enqueue(decodedBase64);
      }
    }

    return null;
  }

  private static decodeBase64CookiePayload(payload: string): string | null {
    const normalized = payload.startsWith("base64-") ? payload.slice("base64-".length) : payload;
    if (!/^[A-Za-z0-9+/_=-]+$/.test(normalized) || normalized.length < 16) {
      return null;
    }

    try {
      const base64 = normalized.replace(/-/g, "+").replace(/_/g, "/");
      const padding = "=".repeat((4 - (base64.length % 4)) % 4);
      return Buffer.from(base64 + padding, "base64").toString("utf8");
    } catch {
      return null;
    }
  }

  private static collectCookieChunks(cookie: string): string[] {
    const cookies = cookie.split(/;\s*/).reduce<Record<string, string>>((acc, part) => {
      const eqIdx = part.indexOf("=");
      if (eqIdx > 0) {
        acc[part.substring(0, eqIdx)] = part.substring(eqIdx + 1);
      }
      return acc;
    }, {});

    const candidatePrefixes = new Set<string>();
    if (cookies[SUPABASE_COOKIE_PREFIX] || cookies[`${SUPABASE_COOKIE_PREFIX}.0`]) {
      candidatePrefixes.add(SUPABASE_COOKIE_PREFIX);
    }

    for (const name of Object.keys(cookies)) {
      const match = name.match(/^(sb-[a-z0-9]+-auth-token)(?:\.(\d+))?$/i);
      if (match) {
        candidatePrefixes.add(match[1]);
      }
    }

    for (const prefix of candidatePrefixes) {
      if (cookies[prefix]) {
        return [cookies[prefix]];
      }

      const chunkEntries = Object.entries(cookies)
        .map(([name, value]) => {
          const match = name.match(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.(\\d+)$`));
          return match ? { index: Number.parseInt(match[1], 10), value } : null;
        })
        .filter((entry): entry is { index: number; value: string } => entry !== null)
        .sort((a, b) => a.index - b.index);

      if (chunkEntries.length > 0) {
        return chunkEntries.map((entry) => entry.value);
      }
    }

    return [];
  }

  /**
   * Parse a Supabase session from raw cookie text, a single cookie value,
   * or a direct JSON/localStorage session payload.
   */
  private static parseSessionFromInput(input: string): SupabaseSession {
    const normalizedInput = MobbinAuth.normalizeInput(input);

    const directSession = MobbinAuth.tryParseSessionPayload(normalizedInput);
    if (directSession) {
      return directSession;
    }

    const chunks = MobbinAuth.collectCookieChunks(normalizedInput);
    if (chunks.length > 0) {
      const chunkSession = MobbinAuth.tryParseSessionPayload(chunks.join(""));
      if (chunkSession) {
        return chunkSession;
      }
    }

    throw new Error(
      `Failed to parse Supabase session from input. ` +
        `Provide either the '${MobbinAuth.getRuntimeConfig().supabaseCookiePrefix}' cookie value, the ` +
        `'${MobbinAuth.getRuntimeConfig().supabaseCookiePrefix}.0/.1' cookie pair, or the raw JSON session ` +
        `from localStorage '${MobbinAuth.getRuntimeConfig().supabaseCookiePrefix}'.`,
    );
  }

  /**
   * Rebuild the raw cookie string from a session object.
   * Encodes the session using Supabase SSR's base64-url cookie format and
   * splits it into chunks when it approaches browser cookie size limits.
   */
  private static buildCookieString(session: SupabaseSession): string {
    const encoded = `base64-${Buffer.from(JSON.stringify(session), "utf8").toString("base64url")}`;
    const cookiePrefix = MobbinAuth.getRuntimeConfig().supabaseCookiePrefix;

    if (encoded.length <= COOKIE_CHUNK_SIZE) {
      return `${cookiePrefix}=${encoded}`;
    }

    const chunks: string[] = [];
    for (let index = 0; index < encoded.length; index += COOKIE_CHUNK_SIZE) {
      chunks.push(encoded.slice(index, index + COOKIE_CHUNK_SIZE));
    }

    return chunks.map((chunk, index) => `${cookiePrefix}.${index}=${chunk}`).join("; ");
  }
}
