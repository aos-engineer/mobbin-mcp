export interface PreviewScreen {
  id: string;
  screenUrl: string;
  isUserScreen?: boolean;
}

export interface SearchableApp {
  id: string;
  platform: string;
  appName: string;
  appLogoUrl: string;
  appTagline: string;
  keywords: string[];
  previewScreens: PreviewScreen[];
}

export interface AppResult {
  id: string;
  appName: string;
  appCategory: string;
  allAppCategories: string[];
  appLogoUrl: string;
  appTagline: string;
  platform: string;
  keywords: string[];
  appVersionId: string;
  appVersionPublishedAt: string;
  previewScreens: PreviewScreen[];
  previewVideoUrl: string | null;
  popularityMetric: number;
  trendingMetric: number;
  isRestricted: boolean;
}

export interface ScreenResult {
  type: string;
  id: string;
  screenUrl: string;
  fullpageScreenUrl: string | null;
  screenNumber: number;
  screenPatterns: string[];
  screenElements: string[];
  screenKeywords: string;
  appVersionId: string;
  appId: string;
  appName: string;
  appCategory: string;
  allAppCategories: string[];
  appLogoUrl: string;
  appTagline: string;
  companyHqRegion: string | null;
  companyStage: string | null;
  platform: string;
  popularityMetric: number;
  trendingMetric: number;
  metadata: { width: number; height: number };
  screenCdnImgSources?: { src: string };
}

export interface FlowScreen {
  id: string;
  order: number;
  hotspotType: string | null;
  hotspotX: number | null;
  hotspotY: number | null;
  hotspotWidth: number | null;
  hotspotHeight: number | null;
  videoTimestamp: number | null;
  screenUrl: string;
  screenId: string;
  screenElements: string[];
  screenPatterns: string[];
  metadata: { width: number; height: number };
}

export interface FlowResult {
  id: string;
  name: string;
  actions: string[];
  order: number;
  videoUrl: string | null;
  screens: FlowScreen[];
  // These fields appear when searching flows across apps
  appVersionId?: string;
  appId?: string;
  appName?: string;
  appCategory?: string;
  appLogoUrl?: string;
  platform?: string;
}

export interface Collection {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  mobileAppsCount: number;
  mobileScreensCount: number;
  mobileFlowsCount: number;
  webAppsCount: number;
  webScreensCount: number;
  webFlowsCount: number;
  mobilePreviewScreens: PreviewScreen[];
}

export interface PaginationOptions {
  pageSize: number;
  pageIndex: number;
  sortBy: string;
}

export interface ContentSearchResponse<T> {
  value: {
    searchRequestId: string;
    data: T[];
  };
}

export interface ValueResponse<T> {
  value: T;
}
