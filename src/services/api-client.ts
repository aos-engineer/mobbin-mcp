import {
  MOBBIN_BASE_URL,
  ALLOWED_IMAGE_HOSTS,
  MAX_IMAGE_SIZE_BYTES,
  API_FETCH_TIMEOUT_MS,
  IMAGE_FETCH_TIMEOUT_MS,
  BYTESCALE_CDN_BASE,
  SUPABASE_STORAGE_PREFIX,
  DEFAULT_PAGE_SIZE,
  DEFAULT_PAGE_INDEX,
  COLOR_SAMPLE_SIZE,
  COLOR_QUANTIZE_STEP,
  COLOR_QUANTIZE_MAX,
} from "../constants.js";
import { redactSensitiveText } from "../utils/security.js";
import { getSharp } from "../utils/sharp.js";
import type {
  AppResult,
  ScreenResult,
  FlowResult,
  Collection,
  SearchableApp,
  SearchableSite,
  SiteSectionResult,
  ContentSearchResponse,
  ValueResponse,
} from "../types.js";
import type { MobbinAuth } from "./auth.js";

/**
 * HTTP client for Mobbin's internal Next.js API routes.
 *
 * Mobbin has no public API — these endpoints were reverse-engineered via Playwright.
 * Auth is handled via {@link MobbinAuth}, which manages the Supabase session cookie
 * and automatically refreshes tokens before they expire.
 *
 * All endpoints live at `https://mobbin.com/api/...` and proxy to Supabase server-side.
 */
export class MobbinApiClient {
  private auth: MobbinAuth;
  private cache = new Map<string, { expiresAt: number; value: unknown }>();
  private inFlight = new Map<string, Promise<unknown>>();

  constructor(auth: MobbinAuth) {
    this.auth = auth;
  }

  private async getOrSetCache<T>(
    key: string,
    ttlMs: number,
    loader: () => Promise<T>,
  ): Promise<T> {
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value as T;
    }

    const existing = this.inFlight.get(key);
    if (existing) {
      return existing as Promise<T>;
    }

    const promise = loader()
      .then((value) => {
        this.cache.set(key, { value, expiresAt: Date.now() + ttlMs });
        return value;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, promise);
    return promise;
  }

  /** Make an authenticated request to a Mobbin API route. Automatically uses a fresh token. */
  private async request<T>(
    path: string,
    options: { method?: string; body?: unknown } = {},
  ): Promise<T> {
    const { method = "GET", body } = options;
    const cookie = await this.auth.getCookieValue();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_FETCH_TIMEOUT_MS);

    const headers: Record<string, string> = {
      Cookie: cookie,
    };

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    try {
      const res = await fetch(`${MOBBIN_BASE_URL}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `Mobbin API error: ${res.status} ${res.statusText} - ${path}${text ? `: ${redactSensitiveText(text)}` : ""}`,
        );
      }

      return res.json() as Promise<T>;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Mobbin API request timed out after ${API_FETCH_TIMEOUT_MS}ms: ${path}`, {
          cause: error,
        });
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /** Fetch an authenticated Mobbin page as text. Used for Next.js RSC-backed site pages. */
  private async requestText(
    path: string,
    options: { redirect?: "error" | "follow" | "manual" } = {},
  ): Promise<Response> {
    const cookie = await this.auth.getCookieValue();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(`${MOBBIN_BASE_URL}${path}`, {
        headers: { Cookie: cookie },
        redirect: options.redirect ?? "follow",
        signal: controller.signal,
      });

      if (!res.ok && (res.status < 300 || res.status >= 400)) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `Mobbin page request failed: ${res.status} ${res.statusText} - ${path}${text ? `: ${redactSensitiveText(text)}` : ""}`,
        );
      }

      return res;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Mobbin page request timed out after ${API_FETCH_TIMEOUT_MS}ms: ${path}`, {
          cause: error,
        });
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Search and browse apps with category filtering and pagination.
   * Endpoint: `POST /api/content/search-apps`
   */
  async searchApps(params: {
    platform: string;
    appCategories?: string[];
    pageSize?: number;
    pageIndex?: number;
    sortBy?: string;
  }): Promise<ContentSearchResponse<AppResult>> {
    return this.getOrSetCache(
      `search-apps:${JSON.stringify(params)}`,
      60 * 1000,
      () =>
        this.request("/api/content/search-apps", {
          method: "POST",
          body: {
            searchRequestId: "",
            filterOptions: {
              platform: params.platform,
              appCategories: params.appCategories ?? null,
            },
            paginationOptions: {
              pageSize: params.pageSize ?? DEFAULT_PAGE_SIZE,
              pageIndex: params.pageIndex ?? DEFAULT_PAGE_INDEX,
              sortBy: params.sortBy ?? "publishedAt",
            },
          },
        }),
    );
  }

  /**
   * Search screens across all apps by patterns, elements, or OCR keywords.
   * Endpoint: `POST /api/content/search-screens`
   */
  async searchScreens(params: {
    platform: string;
    screenPatterns?: string[];
    screenElements?: string[];
    screenKeywords?: string[];
    appCategories?: string[];
    hasAnimation?: boolean;
    pageSize?: number;
    pageIndex?: number;
    sortBy?: string;
  }): Promise<ContentSearchResponse<ScreenResult>> {
    return this.getOrSetCache(
      `search-screens:${JSON.stringify(params)}`,
      60 * 1000,
      () =>
        this.request("/api/content/search-screens", {
          method: "POST",
          body: {
            searchRequestId: "",
            filterOptions: {
              platform: params.platform,
              screenPatterns: params.screenPatterns ?? null,
              screenElements: params.screenElements ?? null,
              screenKeywords: params.screenKeywords ?? null,
              appCategories: params.appCategories ?? null,
              hasAnimation: params.hasAnimation ?? null,
            },
            paginationOptions: {
              pageSize: params.pageSize ?? DEFAULT_PAGE_SIZE,
              pageIndex: params.pageIndex ?? DEFAULT_PAGE_INDEX,
              sortBy: params.sortBy ?? "trending",
            },
          },
        }),
    );
  }

  /**
   * Search user flows/journeys by action type (e.g., "Creating Account").
   * Endpoint: `POST /api/content/search-flows`
   */
  async searchFlows(params: {
    platform: string;
    flowActions?: string[];
    appCategories?: string[];
    pageSize?: number;
    pageIndex?: number;
    sortBy?: string;
  }): Promise<ContentSearchResponse<FlowResult>> {
    return this.getOrSetCache(
      `search-flows:${JSON.stringify(params)}`,
      60 * 1000,
      () =>
        this.request("/api/content/search-flows", {
          method: "POST",
          body: {
            searchRequestId: "",
            filterOptions: {
              platform: params.platform,
              flowActions: params.flowActions ?? null,
              appCategories: params.appCategories ?? null,
            },
            paginationOptions: {
              pageSize: params.pageSize ?? DEFAULT_PAGE_SIZE,
              pageIndex: params.pageIndex ?? DEFAULT_PAGE_INDEX,
              sortBy: params.sortBy ?? "trending",
            },
          },
        }),
    );
  }

  /**
   * Fast autocomplete search — returns matching IDs grouped by relevance.
   * Results contain only IDs; cross-reference with {@link getSearchableApps} for full details.
   * Endpoint: `POST /api/search-bar/search`
   */
  async autocompleteSearch(params: {
    query: string;
    experience?: string;
    platform?: string;
  }): Promise<{
    value: {
      experience: string;
      primary?: Array<{ id: string; type: string }>;
      other?: Array<{ id: string; type: string }>;
      secondaryPlatform?: Array<{ id: string; type: string }>;
      sites?: Array<{ id: string; type: string }>;
      web?: Array<{ id: string; type: string }>;
      ios?: Array<{ id: string; type: string }>;
    };
  }> {
    return this.getOrSetCache(
      `autocomplete:${JSON.stringify(params)}`,
      30 * 1000,
      () =>
        this.request("/api/search-bar/search", {
          method: "POST",
          body: {
            query: params.query,
            experience: params.experience ?? "apps",
            platform: params.platform ?? "ios",
          },
        }),
    );
  }

  /**
   * Fetch the full list of apps for a platform (used for autocomplete cross-referencing).
   * This is a large response (~1000+ apps); results are cached by the Mobbin client.
   * Endpoint: `GET /api/searchable-apps/{platform}`
   */
  async getSearchableApps(platform: string): Promise<SearchableApp[]> {
    return this.getOrSetCache(`searchable-apps:${platform}`, 60 * 60 * 1000, () =>
      this.request(`/api/searchable-apps/${platform}`),
    );
  }

  /**
   * Fetch the full list of Mobbin sites for client-side search/autocomplete.
   * Sites are a separate Mobbin experience from iOS/Android/Web apps.
   * Endpoint: `POST /api/search-bar/fetch-searchable-sites`
   */
  async getSearchableSites(): Promise<SearchableSite[]> {
    return this.getOrSetCache("searchable-sites", 60 * 60 * 1000, () =>
      this.request<ValueResponse<SearchableSite[]>>("/api/search-bar/fetch-searchable-sites", {
        method: "POST",
      }).then((response) => response.value),
    );
  }

  /**
   * Search Mobbin's sites collection locally using the searchable-sites payload.
   * The Mobbin search-bar endpoint returns IDs only, so this keeps rich metadata in the result.
   */
  async searchSites(params: {
    query?: string;
    pageSize?: number;
    pageIndex?: number;
  }): Promise<SearchableSite[]> {
    const sites = await this.getSearchableSites();
    const normalizedQuery = params.query?.trim().toLowerCase();
    const matchedSites = normalizedQuery
      ? sites
          .map((site) => ({
            site,
            rank: rankSiteMatch(site, normalizedQuery),
          }))
          .filter((match) => match.rank !== Number.POSITIVE_INFINITY)
          .sort((a, b) => a.rank - b.rank || a.site.name.localeCompare(b.site.name))
          .map((match) => match.site)
      : sites;

    const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;
    const pageIndex = params.pageIndex ?? DEFAULT_PAGE_INDEX;
    const start = pageIndex * pageSize;
    return matchedSites.slice(start, start + pageSize);
  }

  /**
   * Fetch copyable site sections from Mobbin's sites experience.
   * Mobbin renders these through the Next.js site detail page rather than a JSON API endpoint.
   */
  async getSiteSections(params: {
    siteId?: string;
    query?: string;
    siteName?: string;
    pageSize?: number;
    pageIndex?: number;
  }): Promise<SiteSectionResult[]> {
    const site = await this.resolveSearchableSite(params);
    const siteVersionId = await this.resolveLatestSiteVersionId(site);
    const slug = slugifySiteName(site.name);
    const sectionsPath = `/sites/${slug}-${site.id}/${siteVersionId}/sections`;

    return this.getOrSetCache(
      `site-sections:${site.id}:${siteVersionId}:${params.pageSize ?? DEFAULT_PAGE_SIZE}:${params.pageIndex ?? DEFAULT_PAGE_INDEX}`,
      60 * 1000,
      async () => {
        const res = await this.requestText(sectionsPath);
        const html = await res.text();
        const sections = parseSiteSectionsFromHtml(html, site, siteVersionId);
        const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;
        const pageIndex = params.pageIndex ?? DEFAULT_PAGE_INDEX;
        const start = pageIndex * pageSize;
        return sections.slice(start, start + pageSize);
      },
    );
  }

  private async resolveSearchableSite(params: {
    siteId?: string;
    query?: string;
    siteName?: string;
  }): Promise<SearchableSite> {
    const sites = await this.getSearchableSites();
    if (params.siteId) {
      const site = sites.find((candidate) => candidate.id === params.siteId);
      if (site) return site;
      if (params.siteName) {
        return {
          id: params.siteId,
          name: params.siteName,
          logo_url: "",
          tagline: "",
          keywords: [],
        };
      }
      throw new Error(`No Mobbin site found for site_id '${params.siteId}'. Provide site_name as a fallback.`);
    }

    const matches = await this.searchSites({ query: params.query, pageSize: 1, pageIndex: 0 });
    const site = matches[0];
    if (!site) {
      throw new Error(`No Mobbin site found for query '${params.query ?? ""}'.`);
    }
    return site;
  }

  private async resolveLatestSiteVersionId(site: SearchableSite): Promise<string> {
    const slug = slugifySiteName(site.name);
    const res = await this.requestText(`/sites/${slug}-${site.id}`, { redirect: "manual" });
    const location = res.headers.get("location") ?? res.url;
    const match = location.match(/\/sites\/[^/]+\/([0-9a-f-]{36})\/(?:preview|sections)/i);
    if (!match) {
      throw new Error(`Unable to resolve latest Mobbin site version for '${site.name}' (${site.id}).`);
    }
    return match[1];
  }

  /**
   * Get popular apps grouped by category with preview screenshots.
   * Endpoint: `POST /api/popular-apps/fetch-popular-apps-with-preview-screens`
   */
  async getPopularApps(params: { platform: string; limitPerCategory?: number }): Promise<
    ValueResponse<
      Array<{
        app_id: string;
        app_name: string;
        app_logo_url: string;
        preview_screens: Array<{ id: string; screenUrl: string }>;
        app_category: string;
        secondary_app_categories: string[];
        popularity_metric: number;
      }>
    >
  > {
    return this.getOrSetCache(
      `popular-apps:${params.platform}:${params.limitPerCategory ?? 10}`,
      10 * 60 * 1000,
      () =>
        this.request("/api/popular-apps/fetch-popular-apps-with-preview-screens", {
          method: "POST",
          body: {
            platform: params.platform,
            limitPerCategory: params.limitPerCategory ?? 10,
          },
        }),
    );
  }

  /**
   * Fetch the authenticated user's saved collections with item counts.
   * Endpoint: `POST /api/collection/fetch-collections`
   */
  async getCollections(): Promise<ValueResponse<Collection[]>> {
    return this.getOrSetCache("collections", 60 * 1000, () =>
      this.request("/api/collection/fetch-collections", {
        method: "POST",
      }),
    );
  }

  /**
   * Fetch the full filter taxonomy — all app categories, screen patterns,
   * UI elements, and flow actions with definitions and content counts.
   * Endpoint: `POST /api/filter-tags/fetch-dictionary-definitions`
   */
  async getDictionaryDefinitions(): Promise<ValueResponse<unknown>> {
    return this.getOrSetCache("dictionary-definitions", 24 * 60 * 60 * 1000, () =>
      this.request("/api/filter-tags/fetch-dictionary-definitions", {
        method: "POST",
        body: {},
      }),
    );
  }

  /**
   * Convert a Supabase storage URL to its Bytescale CDN equivalent.
   * Supabase storage URLs are not directly accessible — images are served via CDN.
   *
   * Input:  https://ujasntkfphywizsdaapi.supabase.co/storage/v1/object/public/content/app_screens/{uuid}.png
   * Output: https://bytescale.mobbin.com/FW25bBB/image/mobbin.com/prod/content/app_screens/{uuid}.png?f=webp&w=1920&q=85&fit=shrink-cover
   */
  private toCdnUrl(imageUrl: string): string {
    const parsed = new URL(imageUrl);

    // Already a CDN URL — use as-is
    if (parsed.hostname === "bytescale.mobbin.com") {
      return imageUrl;
    }

    // Convert Supabase storage URL to CDN URL
    const storageIdx = parsed.pathname.indexOf(SUPABASE_STORAGE_PREFIX);
    if (storageIdx === -1) {
      throw new Error(`Unrecognized Supabase URL format: ${imageUrl}`);
    }

    const storagePath = parsed.pathname.slice(storageIdx + SUPABASE_STORAGE_PREFIX.length);
    return `${BYTESCALE_CDN_BASE}/${storagePath}?f=webp&w=1920&q=85&fit=shrink-cover`;
  }

  /**
   * Fetch a screen image from its URL and return it as base64.
   * Automatically converts Supabase storage URLs to Bytescale CDN URLs.
   * No authentication required — these are public CDN assets.
   */
  async fetchScreenImage(imageUrl: string): Promise<{
    base64: string;
    mimeType: string;
    sizeBytes: number;
    buffer: Buffer;
  }> {
    const parsed = new URL(imageUrl);
    if (!ALLOWED_IMAGE_HOSTS.includes(parsed.hostname)) {
      throw new Error(
        `Untrusted image host: ${parsed.hostname}. Only Supabase storage and Bytescale CDN URLs are supported.`,
      );
    }

    const fetchUrl = this.toCdnUrl(imageUrl);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(fetchUrl, { signal: controller.signal });

      if (!res.ok) {
        throw new Error(`Failed to fetch image: ${res.status} ${res.statusText} — ${fetchUrl}`);
      }

      const contentLength = res.headers.get("content-length");
      if (contentLength && parseInt(contentLength, 10) > MAX_IMAGE_SIZE_BYTES) {
        throw new Error(
          `Image too large (${contentLength} bytes). Max: ${MAX_IMAGE_SIZE_BYTES} bytes.`,
        );
      }

      const buffer = await res.arrayBuffer();
      if (buffer.byteLength > MAX_IMAGE_SIZE_BYTES) {
        throw new Error(
          `Image too large (${buffer.byteLength} bytes). Max: ${MAX_IMAGE_SIZE_BYTES} bytes.`,
        );
      }

      let mimeType = res.headers.get("content-type")?.split(";")[0]?.trim() || "";
      if (!mimeType || mimeType === "application/octet-stream") {
        if (fetchUrl.includes("f=webp")) mimeType = "image/webp";
        else if (fetchUrl.endsWith(".png")) mimeType = "image/png";
        else if (fetchUrl.endsWith(".jpg") || fetchUrl.endsWith(".jpeg")) mimeType = "image/jpeg";
        else mimeType = "image/png";
      }

      const base64 = Buffer.from(buffer).toString("base64");
      return {
        base64,
        mimeType,
        sizeBytes: buffer.byteLength,
        buffer: Buffer.from(buffer),
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Extract dominant colors from a screen image buffer.
   * Returns an array of hex color strings sorted by frequency.
   */
  async extractColors(imageBuffer: Buffer, maxColors: number = 8): Promise<string[]> {
    const sharp = await getSharp();
    // Resize to small thumbnail for faster color sampling
    const { data } = await sharp(imageBuffer)
      .resize(COLOR_SAMPLE_SIZE, COLOR_SAMPLE_SIZE, { fit: "cover" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Count pixel colors, quantized to reduce noise (round to nearest step)
    const colorCounts = new Map<string, number>();
    for (let i = 0; i < data.length; i += 3) {
      const r = Math.min(
        Math.round(data[i] / COLOR_QUANTIZE_STEP) * COLOR_QUANTIZE_STEP,
        COLOR_QUANTIZE_MAX,
      );
      const g = Math.min(
        Math.round(data[i + 1] / COLOR_QUANTIZE_STEP) * COLOR_QUANTIZE_STEP,
        COLOR_QUANTIZE_MAX,
      );
      const b = Math.min(
        Math.round(data[i + 2] / COLOR_QUANTIZE_STEP) * COLOR_QUANTIZE_STEP,
        COLOR_QUANTIZE_MAX,
      );
      const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
      colorCounts.set(hex, (colorCounts.get(hex) || 0) + 1);
    }

    // Sort by frequency and return top colors
    return Array.from(colorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxColors)
      .map(([hex]) => hex);
  }
}

function rankSiteMatch(site: SearchableSite, query: string): number {
  const name = site.name.toLowerCase();
  const tagline = site.tagline.toLowerCase();
  const keywords = site.keywords.map((keyword) => keyword.toLowerCase());

  if (name === query) return 0;
  if (name.startsWith(query)) return 1;
  if (keywords.some((keyword) => keyword === query)) return 2;
  if (name.includes(query)) return 3;
  if (tagline.includes(query)) return 4;
  if (keywords.some((keyword) => keyword.includes(query))) return 5;
  return Number.POSITIVE_INFINITY;
}

function slugifySiteName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseSiteSectionsFromHtml(
  html: string,
  site: SearchableSite,
  siteVersionId: string,
): SiteSectionResult[] {
  const match = html.match(/\\"sections\\":(\[.*?\]),\\"paywalled\\":/s);
  if (!match) return [];

  const decodedSectionsJson = JSON.parse(`"${match[1]}"`) as string;
  const normalizedSectionsJson = decodedSectionsJson.replace(/"\$undefined"/g, "null");
  const rawSections = JSON.parse(normalizedSectionsJson) as RawSiteSection[];

  return rawSections
    .map((section) => ({
      id: section.id,
      siteId: site.id,
      siteVersionId,
      siteName: site.name,
      pageUrl: section.page_url,
      type: section.type,
      pageImageUrl: section.page_image_url,
      sectionImageUrl: buildSiteSectionImageUrl(section),
      pageVideoUrl: section.page_video_url,
      videoTimestampStartMs: section.video_timestamp_start_ms,
      videoTimestampEndMs: section.video_timestamp_end_ms,
      imagePositionYStart: section.image_position_y_start,
      imagePositionYEnd: section.image_position_y_end,
      displayOrder: section.display_order,
      patterns: section.patterns ?? [],
      popularityMetric: section.popularity_metric,
      trendingMetric: section.trending_metric,
      metadata: section.metadata
        ? {
            width: section.metadata.width,
            height: section.metadata.height,
          }
        : undefined,
      textPreview: buildSectionTextPreview(section.metadata?.boundingBoxes),
    }))
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

function buildSiteSectionImageUrl(section: RawSiteSection): string {
  const baseUrl = toBytescaleImageUrl(section.page_image_url);
  const cropHeight =
    typeof section.image_position_y_start === "number" && typeof section.image_position_y_end === "number"
      ? Math.max(section.image_position_y_end - section.image_position_y_start, 1)
      : section.metadata?.height;

  const params = new URLSearchParams({
    f: "webp",
    q: "85",
    fit: "shrink-cover",
    f2: "jpg",
    w: "1920",
  });

  if (typeof section.image_position_y_start === "number" && cropHeight) {
    params.set("crop-x", "0");
    params.set("crop-w", "3840");
    params.set("crop-y", String(section.image_position_y_start));
    params.set("crop-h", String(cropHeight));
  }

  return `${baseUrl}?${params.toString()}`;
}

function toBytescaleImageUrl(imageUrl: string): string {
  const parsed = new URL(imageUrl);
  if (parsed.hostname === "bytescale.mobbin.com") {
    return `${parsed.origin}${parsed.pathname}`;
  }

  if (!parsed.pathname.startsWith(SUPABASE_STORAGE_PREFIX)) {
    return imageUrl;
  }

  const storagePath = parsed.pathname.slice(SUPABASE_STORAGE_PREFIX.length);
  return `${BYTESCALE_CDN_BASE}/${storagePath}`;
}

function buildSectionTextPreview(boundingBoxes?: Array<{ text?: string }>): string | undefined {
  if (!boundingBoxes || boundingBoxes.length === 0) return undefined;
  return boundingBoxes
    .map((box) => box.text)
    .filter((text): text is string => Boolean(text))
    .join(" ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .slice(0, 500);
}

interface RawSiteSection {
  id: string;
  page_url: string;
  type: string;
  page_image_url: string;
  page_video_url?: string;
  video_timestamp_start_ms?: number;
  video_timestamp_end_ms?: number;
  image_position_y_start?: number;
  image_position_y_end?: number;
  popularity_metric: number;
  trending_metric: number;
  display_order: number;
  metadata?: {
    width?: number;
    height?: number;
    boundingBoxes?: Array<{ text?: string }>;
  } | null;
  patterns?: string[];
}
