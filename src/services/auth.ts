import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_COOKIE_PREFIX,
  TOKEN_REFRESH_BUFFER_SECONDS,
} from "../constants.js";

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
    if (this.isExpiringSoon()) {
      await this.refresh();
    }
    return this.rawCookie;
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
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        refresh_token: this.session.refresh_token,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Token refresh failed (${res.status}): ${text.substring(0, 200)}. ` +
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

    try {
      const decoded = decodeURIComponent(normalized);
      if (decoded !== normalized) {
        candidates.push(decoded);
      }
    } catch {
      // Ignore invalid URI encodings and continue with the raw payload.
    }

    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate) as SupabaseSession;
        if (parsed?.access_token && parsed?.refresh_token && parsed?.expires_at) {
          return parsed;
        }
      } catch {
        // Try the next candidate form.
      }
    }

    return null;
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
        `Provide either the '${SUPABASE_COOKIE_PREFIX}' cookie value, the ` +
        `'${SUPABASE_COOKIE_PREFIX}.0/.1' cookie pair, or the raw JSON session ` +
        `from localStorage '${SUPABASE_COOKIE_PREFIX}'.`,
    );
  }

  /**
   * Rebuild the raw cookie string from a session object.
   * Splits the JSON across two cookies to match Supabase's chunking behavior.
   */
  private static buildCookieString(session: SupabaseSession): string {
    const encoded = encodeURIComponent(JSON.stringify(session));
    const midpoint = Math.ceil(encoded.length / 2);
    const chunk0 = encoded.substring(0, midpoint);
    const chunk1 = encoded.substring(midpoint);
    return `${SUPABASE_COOKIE_PREFIX}.0=${chunk0}; ${SUPABASE_COOKIE_PREFIX}.1=${chunk1}`;
  }
}
