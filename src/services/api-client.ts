import { MOBBIN_BASE_URL } from "../constants.js";
import type {
  AppResult,
  ScreenResult,
  FlowResult,
  Collection,
  SearchableApp,
  ContentSearchResponse,
  ValueResponse,
} from "../types.js";

export class MobbinApiClient {
  private cookieValue: string;

  constructor(cookieValue: string) {
    this.cookieValue = cookieValue;
  }

  private async request<T>(
    path: string,
    options: { method?: string; body?: unknown } = {}
  ): Promise<T> {
    const { method = "GET", body } = options;

    const headers: Record<string, string> = {
      Cookie: this.cookieValue,
    };

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const res = await fetch(`${MOBBIN_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Mobbin API error: ${res.status} ${res.statusText} - ${path}${text ? `: ${text.substring(0, 200)}` : ""}`
      );
    }

    return res.json() as Promise<T>;
  }

  // --- App Search ---

  async searchApps(params: {
    platform: string;
    appCategories?: string[];
    pageSize?: number;
    pageIndex?: number;
    sortBy?: string;
  }): Promise<ContentSearchResponse<AppResult>> {
    return this.request("/api/content/search-apps", {
      method: "POST",
      body: {
        searchRequestId: "",
        filterOptions: {
          platform: params.platform,
          appCategories: params.appCategories ?? null,
        },
        paginationOptions: {
          pageSize: params.pageSize ?? 24,
          pageIndex: params.pageIndex ?? 0,
          sortBy: params.sortBy ?? "publishedAt",
        },
      },
    });
  }

  // --- Screen Search ---

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
    return this.request("/api/content/search-screens", {
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
          pageSize: params.pageSize ?? 24,
          pageIndex: params.pageIndex ?? 0,
          sortBy: params.sortBy ?? "trending",
        },
      },
    });
  }

  // --- Flow Search ---

  async searchFlows(params: {
    platform: string;
    flowActions?: string[];
    appCategories?: string[];
    pageSize?: number;
    pageIndex?: number;
    sortBy?: string;
  }): Promise<ContentSearchResponse<FlowResult>> {
    return this.request("/api/content/search-flows", {
      method: "POST",
      body: {
        searchRequestId: "",
        filterOptions: {
          platform: params.platform,
          flowActions: params.flowActions ?? null,
          appCategories: params.appCategories ?? null,
        },
        paginationOptions: {
          pageSize: params.pageSize ?? 24,
          pageIndex: params.pageIndex ?? 0,
          sortBy: params.sortBy ?? "trending",
        },
      },
    });
  }

  // --- Autocomplete Search ---

  async autocompleteSearch(params: {
    query: string;
    experience?: string;
    platform?: string;
  }): Promise<{
    value: {
      experience: string;
      primary: Array<{ id: string; type: string }>;
      other: Array<{ id: string; type: string }>;
      secondaryPlatform: Array<{ id: string; type: string }>;
      sites: Array<{ id: string; type: string }>;
    };
  }> {
    return this.request("/api/search-bar/search", {
      method: "POST",
      body: {
        query: params.query,
        experience: params.experience ?? "apps",
        platform: params.platform ?? "ios",
      },
    });
  }

  // --- Searchable Apps (full list for a platform) ---

  async getSearchableApps(
    platform: string
  ): Promise<SearchableApp[]> {
    return this.request(`/api/searchable-apps/${platform}`);
  }

  // --- Popular Apps ---

  async getPopularApps(params: {
    platform: string;
    limitPerCategory?: number;
  }): Promise<ValueResponse<Array<{
    app_id: string;
    app_name: string;
    app_logo_url: string;
    preview_screens: Array<{ id: string; screenUrl: string }>;
    app_category: string;
    secondary_app_categories: string[];
    popularity_metric: number;
  }>>> {
    return this.request("/api/popular-apps/fetch-popular-apps-with-preview-screens", {
      method: "POST",
      body: {
        platform: params.platform,
        limitPerCategory: params.limitPerCategory ?? 10,
      },
    });
  }

  // --- Collections ---

  async getCollections(): Promise<ValueResponse<Collection[]>> {
    return this.request("/api/collection/fetch-collections", {
      method: "POST",
    });
  }

  // --- Filter Taxonomy ---

  async getDictionaryDefinitions(): Promise<ValueResponse<unknown>> {
    return this.request("/api/filter-tags/fetch-dictionary-definitions", {
      method: "POST",
      body: {},
    });
  }
}
