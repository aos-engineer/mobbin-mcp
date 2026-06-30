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
  CROSS_APP_SCAN_LIMIT,
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
  PreviewScreen,
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

  private async getOrSetCache<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
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
   *
   * Mobbin retired `POST /api/content/search-apps` (now 404). This is rebuilt on top of
   * the still-live `/api/searchable-apps/{platform}` list, enriched with the primary
   * category from the popular-apps endpoint. Per-app version IDs and popularity/trending
   * metrics are no longer exposed by a browse endpoint, so those fields are best-effort
   * (left empty / zero) — the cross-app screen and flow searches below carry the rich data.
   */
  async searchApps(params: {
    platform: string;
    appCategories?: string[];
    pageSize?: number;
    pageIndex?: number;
    sortBy?: string;
  }): Promise<ContentSearchResponse<AppResult>> {
    const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;
    const pageIndex = params.pageIndex ?? DEFAULT_PAGE_INDEX;
    return this.getOrSetCache(`search-apps:${JSON.stringify(params)}`, 60 * 1000, async () => {
      const [searchable, categoryMap] = await Promise.all([
        this.getSearchableApps(params.platform),
        this.getPopularCategoryMap(params.platform),
      ]);

      let apps = searchable;
      if (params.appCategories && params.appCategories.length > 0) {
        const wanted = new Set(params.appCategories.map((category) => category.toLowerCase()));
        apps = apps.filter((app) => {
          const category = categoryMap.map.get(app.id);
          return category !== undefined && wanted.has(category.toLowerCase());
        });
      }

      const start = pageIndex * pageSize;
      const data = apps
        .slice(start, start + pageSize)
        .map((app) => searchableAppToResult(app, categoryMap.map.get(app.id)));
      return { value: { searchRequestId: "", data } };
    });
  }

  /**
   * Search screens across apps by patterns, elements, or OCR keywords.
   *
   * Mobbin retired `POST /api/content/search-screens` (now 404). Screens are now embedded
   * in each app's RSC page (`/apps/<slug>-<platform>-<id>/<versionId>/screens`). Since there
   * is no longer a server-side cross-app index, this scans a bounded set of apps
   * ({@link CROSS_APP_SCAN_LIMIT}), parses their embedded screen data, and filters in code.
   *
   * Matching: OR within a facet, AND across facets. Pass `appName` to target a single app.
   */
  async searchScreens(params: {
    platform: string;
    screenPatterns?: string[];
    screenElements?: string[];
    screenKeywords?: string[];
    appCategories?: string[];
    appName?: string;
    hasAnimation?: boolean;
    pageSize?: number;
    pageIndex?: number;
    sortBy?: string;
  }): Promise<ContentSearchResponse<ScreenResult>> {
    const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;
    const pageIndex = params.pageIndex ?? DEFAULT_PAGE_INDEX;
    return this.getOrSetCache(`search-screens:${JSON.stringify(params)}`, 60 * 1000, async () => {
      const needed = (pageIndex + 1) * pageSize;
      const candidates = await this.resolveCandidateApps(params.platform, {
        categories: params.appCategories,
        appName: params.appName,
        limit: CROSS_APP_SCAN_LIMIT,
      });

      const matches: ScreenResult[] = [];
      for (const app of candidates) {
        if (matches.length >= needed) break;
        let content: AppContent;
        try {
          content = await this.getAppContent(app);
        } catch {
          continue;
        }
        let screenNumber = 0;
        for (const screen of content.content.screens) {
          screenNumber += 1;
          if (!screenMatchesFilters(screen, params)) continue;
          matches.push(mapRscScreenToResult(screen, content.meta, screenNumber));
        }
      }

      const start = pageIndex * pageSize;
      return { value: { searchRequestId: "", data: matches.slice(start, start + pageSize) } };
    });
  }

  /**
   * Search user flows/journeys by action type (e.g., "Creating Account").
   *
   * Mobbin retired `POST /api/content/search-flows` (now 404). Flows are now embedded in each
   * app's RSC page under `partialFlows`. As with {@link searchScreens}, this scans a bounded set
   * of apps ({@link CROSS_APP_SCAN_LIMIT}), joins each flow's screen references with the app's
   * screen lookup, filters by `flowActions` (OR within the facet), and orders by popularity.
   * Pass `appName` to target a single app.
   */
  async searchFlows(params: {
    platform: string;
    flowActions?: string[];
    appCategories?: string[];
    appName?: string;
    pageSize?: number;
    pageIndex?: number;
    sortBy?: string;
  }): Promise<ContentSearchResponse<FlowResult>> {
    const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;
    const pageIndex = params.pageIndex ?? DEFAULT_PAGE_INDEX;
    return this.getOrSetCache(`search-flows:${JSON.stringify(params)}`, 60 * 1000, async () => {
      const needed = (pageIndex + 1) * pageSize;
      const candidates = await this.resolveCandidateApps(params.platform, {
        categories: params.appCategories,
        appName: params.appName,
        limit: CROSS_APP_SCAN_LIMIT,
      });

      const matches: FlowResult[] = [];
      for (const app of candidates) {
        if (matches.length >= needed) break;
        let content: AppContent;
        try {
          content = await this.getAppContent(app);
        } catch {
          continue;
        }
        const screensById = new Map(content.content.screens.map((screen) => [screen.id, screen]));
        const appFlows = content.content.flows
          .filter((flow) => flowMatchesFilters(flow, params))
          .sort((a, b) => (b.popularityMetric ?? 0) - (a.popularityMetric ?? 0));
        for (const flow of appFlows) {
          matches.push(mapRscFlowToResult(flow, screensById, content.meta));
        }
      }

      const start = pageIndex * pageSize;
      return { value: { searchRequestId: "", data: matches.slice(start, start + pageSize) } };
    });
  }

  /**
   * Resolve the latest published version ID for an app by following Mobbin's
   * `/apps/<slug>-<platform>-<id>` 307 redirect. The slug segment may be any value
   * (Mobbin ignores it), but it must be present.
   */
  private async resolveLatestAppVersionId(
    platform: string,
    appId: string,
    slug: string,
  ): Promise<string> {
    const res = await this.requestText(`/apps/${slug}-${platform}-${appId}`, {
      redirect: "manual",
    });
    const location = res.headers.get("location") ?? res.url;
    const match = location.match(/\/apps\/[^/]+\/([0-9a-f-]{36})\/(?:screens|flows)/i);
    if (!match) {
      throw new Error(`Unable to resolve latest version for app '${appId}' (${platform}).`);
    }
    return match[1];
  }

  /**
   * Fetch and parse an app's embedded RSC content (flows + screens).
   * Both the `/screens` and `/flows` pages embed the same `partialFlows` + `screens` payload,
   * so a single fetch of `/screens` yields everything. Cached per app for 10 minutes.
   */
  private async getAppContent(app: CandidateApp): Promise<AppContent> {
    return this.getOrSetCache(`app-content:${app.platform}:${app.id}`, 10 * 60 * 1000, async () => {
      const slug = slugifyName(app.name) || "app";
      const versionId = await this.resolveLatestAppVersionId(app.platform, app.id, slug);
      const res = await this.requestText(
        `/apps/${slug}-${app.platform}-${app.id}/${versionId}/screens`,
      );
      const html = await res.text();
      const content = parseAppRscContent(html);
      const meta: AppContentMeta = {
        appId: app.id,
        appName: app.name,
        appLogoUrl: app.logoUrl,
        appTagline: app.tagline,
        platform: app.platform,
        appCategory: app.category,
        appVersionId: versionId,
      };
      return { meta, content };
    });
  }

  /**
   * Build a bounded, ranked list of candidate apps to scan for cross-app screen/flow search.
   * When `appName` is given, narrows to matching apps from the searchable-apps list.
   * Otherwise uses popular apps (category-interleaved), optionally filtered by `categories`,
   * and backfills from the full searchable-apps list when the popular set is too thin.
   */
  private async resolveCandidateApps(
    platform: string,
    opts: { categories?: string[]; appName?: string; limit: number },
  ): Promise<CandidateApp[]> {
    const [categoryIndex, searchable] = await Promise.all([
      this.getPopularCategoryMap(platform),
      this.getSearchableApps(platform),
    ]);
    const byId = new Map(searchable.map((app) => [app.id, app]));

    const toCandidate = (
      id: string,
      name: string,
      logoUrl: string,
      category: string,
    ): CandidateApp => {
      const known = byId.get(id);
      return {
        id,
        platform,
        name: known?.appName ?? name,
        logoUrl: known?.appLogoUrl ?? logoUrl ?? "",
        tagline: known?.appTagline ?? "",
        category: category || categoryIndex.map.get(id) || "",
        keywords: known?.keywords ?? [],
        previewScreens: known?.previewScreens ?? [],
      };
    };

    if (opts.appName) {
      const needle = opts.appName.trim().toLowerCase();
      const matched = searchable
        .filter(
          (app) =>
            app.appName.toLowerCase().includes(needle) ||
            app.keywords.some((keyword) => keyword.toLowerCase().includes(needle)),
        )
        .sort((a, b) => rankNameMatch(a.appName, needle) - rankNameMatch(b.appName, needle));
      return matched
        .slice(0, opts.limit)
        .map((app) => toCandidate(app.id, app.appName, app.appLogoUrl, ""));
    }

    let ordered = categoryIndex.ordered;
    if (opts.categories && opts.categories.length > 0) {
      const wanted = new Set(opts.categories.map((category) => category.toLowerCase()));
      ordered = ordered.filter((app) => wanted.has(app.category.toLowerCase()));
    }

    const candidates = ordered.map((app) =>
      toCandidate(app.id, app.name, app.logoUrl, app.category),
    );

    if ((!opts.categories || opts.categories.length === 0) && candidates.length < opts.limit) {
      const have = new Set(candidates.map((candidate) => candidate.id));
      for (const app of searchable) {
        if (have.has(app.id)) continue;
        candidates.push(toCandidate(app.id, app.appName, app.appLogoUrl, ""));
        if (candidates.length >= opts.limit) break;
      }
    }

    return candidates.slice(0, opts.limit);
  }

  /**
   * Fetch popular apps and index them by category. Returns both a flattened, deduped,
   * category-interleaved ordering (used as the cross-app scan order) and an app-id → category map.
   */
  private async getPopularCategoryMap(
    platform: string,
  ): Promise<{ map: Map<string, string>; ordered: PopularOrderedApp[] }> {
    return this.getOrSetCache(`popular-category-map:${platform}`, 10 * 60 * 1000, async () => {
      const grouped = await this.fetchPopularAppsByCategory(platform, 10);
      const map = new Map<string, string>();
      const ordered: PopularOrderedApp[] = [];
      for (const [category, apps] of Object.entries(grouped)) {
        if (!Array.isArray(apps)) continue;
        for (const app of apps) {
          if (!app?.app_id || map.has(app.app_id)) continue;
          map.set(app.app_id, category);
          ordered.push({
            id: app.app_id,
            name: app.app_name ?? "",
            logoUrl: app.app_logo_url ?? "",
            category,
          });
        }
      }
      return { map, ordered };
    });
  }

  /**
   * Fetch the popular-apps payload, normalized to a `{ category: app[] }` shape.
   * Mobbin changed `value` from an array to an object keyed by category; both forms are handled.
   */
  private async fetchPopularAppsByCategory(
    platform: string,
    limitPerCategory: number,
  ): Promise<Record<string, RawPopularApp[]>> {
    const res = await this.request<ValueResponse<unknown>>(
      "/api/popular-apps/fetch-popular-apps-with-preview-screens",
      { method: "POST", body: { platform, limitPerCategory } },
    );
    const value = res.value;

    if (Array.isArray(value)) {
      const grouped: Record<string, RawPopularApp[]> = {};
      for (const app of value as RawPopularApp[]) {
        if (!app?.app_id) continue;
        const category = (app as { app_category?: string }).app_category ?? "uncategorized";
        (grouped[category] ??= []).push(app);
      }
      return grouped;
    }

    if (value && typeof value === "object") {
      return value as Record<string, RawPopularApp[]>;
    }

    return {};
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
    return this.getOrSetCache(`autocomplete:${JSON.stringify(params)}`, 30 * 1000, () =>
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
      throw new Error(
        `No Mobbin site found for site_id '${params.siteId}'. Provide site_name as a fallback.`,
      );
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
      throw new Error(
        `Unable to resolve latest Mobbin site version for '${site.name}' (${site.id}).`,
      );
    }
    return match[1];
  }

  /**
   * Get popular apps grouped by category with preview screenshots.
   * Endpoint: `POST /api/popular-apps/fetch-popular-apps-with-preview-screens`
   *
   * Mobbin changed the response `value` from a flat array to an object keyed by category.
   * This flattens it back into the array shape callers expect (deduping apps across
   * categories, first category wins), deriving `app_category` from the category key and a
   * rank-based `popularity_metric` from the within-category ordering.
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
    const limitPerCategory = params.limitPerCategory ?? 10;
    return this.getOrSetCache(
      `popular-apps:${params.platform}:${limitPerCategory}`,
      10 * 60 * 1000,
      async () => {
        const grouped = await this.fetchPopularAppsByCategory(params.platform, limitPerCategory);
        const seen = new Set<string>();
        const data: Array<{
          app_id: string;
          app_name: string;
          app_logo_url: string;
          preview_screens: Array<{ id: string; screenUrl: string }>;
          app_category: string;
          secondary_app_categories: string[];
          popularity_metric: number;
        }> = [];

        for (const [category, apps] of Object.entries(grouped)) {
          if (!Array.isArray(apps)) continue;
          apps.forEach((app, index) => {
            if (!app?.app_id || seen.has(app.app_id)) return;
            seen.add(app.app_id);
            data.push({
              app_id: app.app_id,
              app_name: app.app_name ?? "",
              app_logo_url: app.app_logo_url ?? "",
              preview_screens: app.preview_screens ?? [],
              app_category: category,
              secondary_app_categories: [],
              popularity_metric: Math.max(0, apps.length - index),
            });
          });
        }

        return { value: data };
      },
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

function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function slugifySiteName(name: string): string {
  return slugifyName(name);
}

/** Rank an app-name match for sorting (lower is better): exact, prefix, then substring. */
function rankNameMatch(name: string, needle: string): number {
  const lowered = name.toLowerCase();
  if (lowered === needle) return 0;
  if (lowered.startsWith(needle)) return 1;
  return 2;
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
    typeof section.image_position_y_start === "number" &&
    typeof section.image_position_y_end === "number"
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

// ---------------------------------------------------------------------------
// Cross-app RSC search (replacements for the retired /api/content/search-* routes)
// ---------------------------------------------------------------------------

/** A normalized app candidate used as input to the cross-app RSC scan. */
interface CandidateApp {
  id: string;
  platform: string;
  name: string;
  logoUrl: string;
  tagline: string;
  category: string;
  keywords: string[];
  previewScreens: PreviewScreen[];
}

interface PopularOrderedApp {
  id: string;
  name: string;
  logoUrl: string;
  category: string;
}

interface RawPopularApp {
  app_id: string;
  app_name?: string;
  app_logo_url?: string;
  preview_screens?: Array<{ id: string; screenUrl: string }>;
}

/** App-level metadata captured while fetching an app's RSC page. */
interface AppContentMeta {
  appId: string;
  appName: string;
  appLogoUrl: string;
  appTagline: string;
  platform: string;
  appCategory: string;
  appVersionId: string;
}

interface AppContent {
  meta: AppContentMeta;
  content: ParsedAppContent;
}

interface ParsedAppContent {
  flows: RawAppFlow[];
  screens: RawAppScreen[];
}

/** A screen reference inside a flow (embedded `partialFlows[].screens[]`). */
interface RawFlowScreenRef {
  screenId: string;
  order: number;
  hotspotType: string | null;
  hotspotX: number | null;
  hotspotY: number | null;
  hotspotWidth: number | null;
  hotspotHeight: number | null;
  videoTimestamp: number | null;
}

/** A flow as embedded in an app's RSC page under `partialFlows`. */
interface RawAppFlow {
  id: string;
  name: string;
  actions?: string[];
  order: number;
  popularityMetric?: number;
  appVersionId?: string;
  appVersionPublishedAt?: string;
  screens: RawFlowScreenRef[];
  restricted?: boolean;
  videoCdnVideoSources?: unknown;
}

/** A screen as embedded in an app's RSC page under the `screens` lookup array. */
interface RawAppScreen {
  type?: string;
  id: string;
  screenUrl: string;
  width?: number;
  height?: number;
  screenElements?: string[];
  screenPatterns?: string[];
  isAppKeyScreen?: boolean;
  ocrBoundingBoxes?: Array<{ text?: string }>;
  animation_id?: string | null;
  appId?: string;
  appName?: string;
  appLogoUrl?: string;
  platform?: string;
  appVersionId?: string;
  appVersionPublishedAt?: string;
  restricted?: boolean;
  screenCdnImgSources?: { src?: string } | null;
  fullpageScreenCdnImgSources?: { src?: string } | null;
}

/**
 * Reconstruct the full Next.js RSC stream from an HTML page.
 *
 * The payload is streamed across many `self.__next_f.push([1,"<chunk>"])` calls, where each
 * `<chunk>` is a JSON string literal (quotes escaped as `\"`, etc.). Concatenating the decoded
 * chunks reproduces the complete RSC stream — even when a single row is split across pushes.
 */
function decodeNextRscStream(html: string): string {
  const marker = "self.__next_f.push([1,";
  let out = "";
  let from = 0;

  while (true) {
    const start = html.indexOf(marker, from);
    if (start === -1) break;

    let i = start + marker.length;
    while (i < html.length && html[i] !== '"') i += 1;
    if (html[i] !== '"') {
      from = start + marker.length;
      continue;
    }

    const literalStart = i;
    i += 1;
    let esc = false;
    for (; i < html.length; i += 1) {
      const c = html[i];
      if (esc) {
        esc = false;
        continue;
      }
      if (c === "\\") {
        esc = true;
        continue;
      }
      if (c === '"') break;
    }

    const literal = html.slice(literalStart, i + 1);
    try {
      out += JSON.parse(literal) as string;
    } catch {
      // Skip malformed chunks; the rest of the stream is still usable.
    }
    from = i + 1;
  }

  return out;
}

/** Return the substring of a balanced `[...]` array starting at `openIdx` (a `[`). */
function extractBalancedArray(stream: string, openIdx: number): string | null {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let j = openIdx; j < stream.length; j += 1) {
    const c = stream[j];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "[") depth += 1;
    else if (c === "]") {
      depth -= 1;
      if (depth === 0) return stream.slice(openIdx, j + 1);
    }
  }
  return null;
}

/** Locate `marker` in the stream and JSON.parse the balanced array that follows it. */
function extractRscArray<T>(stream: string, marker: string): T[] | null {
  const keyIdx = stream.indexOf(marker);
  if (keyIdx === -1) return null;
  const openIdx = stream.indexOf("[", keyIdx);
  if (openIdx === -1) return null;
  const arr = extractBalancedArray(stream, openIdx);
  if (!arr) return null;
  try {
    return JSON.parse(arr.replace(/"\$undefined"/g, "null")) as T[];
  } catch {
    return null;
  }
}

/** Parse an app detail RSC page into its embedded flows + screens. */
function parseAppRscContent(html: string): ParsedAppContent {
  const stream = decodeNextRscStream(html);
  const flows = extractRscArray<RawAppFlow>(stream, '"partialFlows":') ?? [];
  const screens = extractRscArray<RawAppScreen>(stream, '"screens":[{"type":"') ?? [];
  return { flows, screens };
}

/** True if any tag in `have` matches (case-insensitive equality or substring) any `wanted` tag. */
function anyTagMatches(have: string[] | undefined, wanted: string[]): boolean {
  if (!have || have.length === 0) return false;
  const lowered = have.map((tag) => tag.toLowerCase());
  return wanted.some((want) => {
    const lw = want.toLowerCase();
    return lowered.some((tag) => tag === lw || tag.includes(lw));
  });
}

function screenMatchesFilters(
  screen: RawAppScreen,
  params: {
    screenPatterns?: string[];
    screenElements?: string[];
    screenKeywords?: string[];
    hasAnimation?: boolean;
  },
): boolean {
  if (params.hasAnimation === true && !screen.animation_id) return false;
  if (params.hasAnimation === false && screen.animation_id) return false;
  if (
    params.screenPatterns &&
    params.screenPatterns.length > 0 &&
    !anyTagMatches(screen.screenPatterns, params.screenPatterns)
  ) {
    return false;
  }
  if (
    params.screenElements &&
    params.screenElements.length > 0 &&
    !anyTagMatches(screen.screenElements, params.screenElements)
  ) {
    return false;
  }
  if (params.screenKeywords && params.screenKeywords.length > 0) {
    const ocr = screenKeywordsFromOcr(screen.ocrBoundingBoxes).toLowerCase();
    if (!params.screenKeywords.some((keyword) => ocr.includes(keyword.toLowerCase()))) {
      return false;
    }
  }
  return true;
}

function flowMatchesFilters(flow: RawAppFlow, params: { flowActions?: string[] }): boolean {
  if (params.flowActions && params.flowActions.length > 0) {
    return anyTagMatches(flow.actions, params.flowActions);
  }
  return true;
}

/** Flatten an OCR bounding-box array into a single keyword string. */
function screenKeywordsFromOcr(boxes?: Array<{ text?: string }>): string {
  if (!boxes || boxes.length === 0) return "";
  return boxes
    .map((box) => box.text)
    .filter((text): text is string => Boolean(text))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Best-effort extraction of a playable video URL from a CDN video-sources object. */
function extractCdnVideoUrl(sources: unknown): string | null {
  if (!sources || typeof sources !== "object") return null;
  const value = sources as { src?: unknown; sources?: Array<{ src?: unknown; url?: unknown }> };
  if (typeof value.src === "string") return value.src;
  if (Array.isArray(value.sources)) {
    for (const entry of value.sources) {
      if (typeof entry?.src === "string") return entry.src;
      if (typeof entry?.url === "string") return entry.url;
    }
  }
  return null;
}

function mapRscScreenToResult(
  screen: RawAppScreen,
  meta: AppContentMeta,
  screenNumber: number,
): ScreenResult {
  return {
    type: screen.type ?? "curated",
    id: screen.id,
    screenUrl: screen.screenUrl,
    fullpageScreenUrl: screen.fullpageScreenCdnImgSources?.src ?? null,
    screenNumber,
    screenPatterns: screen.screenPatterns ?? [],
    screenElements: screen.screenElements ?? [],
    screenKeywords: screenKeywordsFromOcr(screen.ocrBoundingBoxes),
    appVersionId: screen.appVersionId ?? meta.appVersionId,
    appId: screen.appId ?? meta.appId,
    appName: screen.appName ?? meta.appName,
    appCategory: meta.appCategory,
    allAppCategories: meta.appCategory ? [meta.appCategory] : [],
    appLogoUrl: screen.appLogoUrl ?? meta.appLogoUrl,
    appTagline: meta.appTagline,
    companyHqRegion: null,
    companyStage: null,
    platform: screen.platform ?? meta.platform,
    popularityMetric: 0,
    trendingMetric: 0,
    metadata: { width: screen.width ?? 0, height: screen.height ?? 0 },
    screenCdnImgSources: screen.screenCdnImgSources?.src
      ? { src: screen.screenCdnImgSources.src }
      : undefined,
  };
}

function mapRscFlowToResult(
  flow: RawAppFlow,
  screensById: Map<string, RawAppScreen>,
  meta: AppContentMeta,
): FlowResult {
  const screens = flow.screens
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((ref) => {
      const screen = screensById.get(ref.screenId);
      return {
        id: ref.screenId,
        order: ref.order,
        hotspotType: ref.hotspotType ?? null,
        hotspotX: ref.hotspotX ?? null,
        hotspotY: ref.hotspotY ?? null,
        hotspotWidth: ref.hotspotWidth ?? null,
        hotspotHeight: ref.hotspotHeight ?? null,
        videoTimestamp: ref.videoTimestamp ?? null,
        screenUrl: screen?.screenUrl ?? "",
        screenId: ref.screenId,
        screenElements: screen?.screenElements ?? [],
        screenPatterns: screen?.screenPatterns ?? [],
        metadata: { width: screen?.width ?? 0, height: screen?.height ?? 0 },
      };
    });

  return {
    id: flow.id,
    name: flow.name,
    actions: flow.actions ?? [],
    order: flow.order,
    videoUrl: extractCdnVideoUrl(flow.videoCdnVideoSources),
    screens,
    appVersionId: flow.appVersionId ?? meta.appVersionId,
    appId: meta.appId,
    appName: meta.appName,
    appCategory: meta.appCategory,
    appLogoUrl: meta.appLogoUrl,
    platform: meta.platform,
  };
}

/** Build an {@link AppResult} from a searchable-apps record (best-effort fields where data is gone). */
function searchableAppToResult(app: SearchableApp, category: string | undefined): AppResult {
  return {
    id: app.id,
    appName: app.appName,
    appCategory: category ?? "",
    allAppCategories: category ? [category] : [],
    appLogoUrl: app.appLogoUrl,
    appTagline: app.appTagline,
    platform: app.platform,
    keywords: app.keywords ?? [],
    appVersionId: "",
    appVersionPublishedAt: "",
    previewScreens: app.previewScreens ?? [],
    previewVideoUrl: null,
    popularityMetric: 0,
    trendingMetric: 0,
    isRestricted: false,
  };
}
