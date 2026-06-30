import type { MobbinApiClient } from "../services/api-client.js";
import type {
  CapturedArtifact,
  FlowResult,
  ProjectArtifactIndex,
  ScreenResult,
  SiteSectionResult,
} from "../types.js";
import {
  createArtifactFromFlow,
  createArtifactFromScreen,
  createArtifactFromSiteSections,
  upsertArtifact,
} from "./artifact-store.js";
import { computePerceptualHash } from "./visuals.js";

type SearchSort = "trending" | "publishedAt";

interface CaptureBaseOptions {
  projectPath?: string;
  title?: string;
  summary?: string;
  tags?: string[];
  notes?: string;
  featureArea?: string;
  journeyName?: string;
  sessionName?: string;
  participants?: string[];
  implementationHints?: string[];
  sourceUrls?: string[];
  computeVisualHashes?: boolean;
  hashImageLimit?: number;
}

export interface CaptureFlowFromSearchOptions extends CaptureBaseOptions {
  platform: "ios" | "android" | "web";
  flowActions?: string[];
  categories?: string[];
  sortBy?: SearchSort;
  pageSize?: number;
  searchPages?: number;
  appName?: string;
  flowName?: string;
  flowId?: string;
  resultIndex?: number;
}

export interface CaptureScreenFromSearchOptions extends CaptureBaseOptions {
  platform: "ios" | "android" | "web";
  screenPatterns?: string[];
  screenElements?: string[];
  screenKeywords?: string[];
  categories?: string[];
  hasAnimation?: boolean;
  sortBy?: SearchSort;
  pageSize?: number;
  searchPages?: number;
  appName?: string;
  screenId?: string;
  resultIndex?: number;
}

export interface CaptureSiteSectionsOptions extends CaptureBaseOptions {
  siteId?: string;
  siteName?: string;
  query?: string;
  sectionIds?: string[];
  pageSize?: number;
  pageIndex?: number;
  maxSections?: number;
}

export interface CaptureResult<TSelected, TCandidate = TSelected> {
  project: ProjectArtifactIndex["project"];
  artifact: CapturedArtifact;
  artifactCount: number;
  selected: TSelected;
  candidates: TCandidate[];
  pagesSearched?: number;
}

function textIncludes(value: string | undefined, query: string | undefined): boolean {
  if (!query) return true;
  return Boolean(value?.toLowerCase().includes(query.trim().toLowerCase()));
}

function boundedPageSize(value?: number): number {
  return Math.max(1, Math.min(value ?? 10, 50));
}

function boundedSearchPages(value?: number): number {
  return Math.max(1, Math.min(value ?? 3, 10));
}

function boundedHashLimit(value?: number): number {
  return Math.max(1, Math.min(value ?? 6, 24));
}

async function visualHashesForUrls(
  client: MobbinApiClient,
  imageUrls: string[],
  enabled: boolean | undefined,
  limit: number | undefined,
): Promise<string[]> {
  if (!enabled) return [];

  const hashes = new Set<string>();
  for (const imageUrl of Array.from(new Set(imageUrls)).slice(0, boundedHashLimit(limit))) {
    try {
      const image = await client.fetchScreenImage(imageUrl);
      hashes.add(await computePerceptualHash(image.buffer));
    } catch {
      // Capture should still succeed when a single visual hash cannot be fetched.
    }
  }
  return Array.from(hashes);
}

function selectFlow(
  candidates: FlowResult[],
  params: CaptureFlowFromSearchOptions,
): FlowResult | null {
  const filtered = candidates.filter((flow) => {
    if (params.flowId && flow.id !== params.flowId) return false;
    if (!textIncludes(flow.appName, params.appName)) return false;
    if (!textIncludes(flow.name, params.flowName)) return false;
    return true;
  });

  return filtered[params.resultIndex ?? 0] ?? null;
}

function selectScreen(
  candidates: ScreenResult[],
  params: CaptureScreenFromSearchOptions,
): ScreenResult | null {
  const filtered = candidates.filter((screen) => {
    if (params.screenId && screen.id !== params.screenId) return false;
    if (!textIncludes(screen.appName, params.appName)) return false;
    return true;
  });

  return filtered[params.resultIndex ?? 0] ?? null;
}

export async function captureFlowFromSearch(
  client: MobbinApiClient,
  params: CaptureFlowFromSearchOptions,
): Promise<CaptureResult<FlowResult>> {
  const pageSize = boundedPageSize(params.pageSize);
  const searchPages = boundedSearchPages(params.searchPages);
  const candidates: FlowResult[] = [];
  let selected: FlowResult | null = null;
  let pagesSearched = 0;

  for (let pageIndex = 0; pageIndex < searchPages; pageIndex += 1) {
    const result = await client.searchFlows({
      platform: params.platform,
      flowActions: params.flowActions,
      appCategories: params.categories,
      appName: params.appName,
      sortBy: params.sortBy ?? "trending",
      pageSize,
      pageIndex,
    });
    pagesSearched += 1;
    candidates.push(...result.value.data);
    selected = selectFlow(candidates, params);
    if (selected || result.value.data.length < pageSize) break;
  }

  if (!selected) {
    throw new Error(
      `No Mobbin flow matched the capture filters after ${pagesSearched} page(s). Retrieved ${candidates.length} candidate flow(s).`,
    );
  }

  const visualHashes = await visualHashesForUrls(
    client,
    selected.screens.map((screen) => screen.screenUrl),
    params.computeVisualHashes,
    params.hashImageLimit,
  );
  const artifact = createArtifactFromFlow({
    flow: selected,
    projectPath: params.projectPath,
    title: params.title,
    summary: params.summary,
    tags: params.tags,
    notes: params.notes,
    featureArea: params.featureArea,
    journeyName: params.journeyName,
    sessionName: params.sessionName,
    participants: params.participants,
    implementationHints: params.implementationHints,
    sourceUrls: params.sourceUrls,
    visualHashes,
  });
  const index = upsertArtifact(artifact, params.projectPath);

  return {
    project: index.project,
    artifact,
    artifactCount: index.artifacts.length,
    selected,
    candidates,
    pagesSearched,
  };
}

export async function captureScreenFromSearch(
  client: MobbinApiClient,
  params: CaptureScreenFromSearchOptions,
): Promise<CaptureResult<ScreenResult>> {
  const pageSize = boundedPageSize(params.pageSize);
  const searchPages = boundedSearchPages(params.searchPages);
  const candidates: ScreenResult[] = [];
  let selected: ScreenResult | null = null;
  let pagesSearched = 0;

  for (let pageIndex = 0; pageIndex < searchPages; pageIndex += 1) {
    const result = await client.searchScreens({
      platform: params.platform,
      screenPatterns: params.screenPatterns,
      screenElements: params.screenElements,
      screenKeywords: params.screenKeywords,
      appCategories: params.categories,
      appName: params.appName,
      hasAnimation: params.hasAnimation,
      sortBy: params.sortBy ?? "trending",
      pageSize,
      pageIndex,
    });
    pagesSearched += 1;
    candidates.push(...result.value.data);
    selected = selectScreen(candidates, params);
    if (selected || result.value.data.length < pageSize) break;
  }

  if (!selected) {
    throw new Error(
      `No Mobbin screen matched the capture filters after ${pagesSearched} page(s). Retrieved ${candidates.length} candidate screen(s).`,
    );
  }

  const visualHashes = await visualHashesForUrls(
    client,
    [selected.screenUrl],
    params.computeVisualHashes,
    params.hashImageLimit,
  );
  const artifact = createArtifactFromScreen({
    screen: selected,
    projectPath: params.projectPath,
    title: params.title,
    summary: params.summary,
    tags: params.tags,
    notes: params.notes,
    featureArea: params.featureArea,
    journeyName: params.journeyName,
    sessionName: params.sessionName,
    participants: params.participants,
    implementationHints: params.implementationHints,
    sourceUrls: params.sourceUrls,
    visualHashes,
  });
  const index = upsertArtifact(artifact, params.projectPath);

  return {
    project: index.project,
    artifact,
    artifactCount: index.artifacts.length,
    selected,
    candidates,
    pagesSearched,
  };
}

export async function captureSiteSections(
  client: MobbinApiClient,
  params: CaptureSiteSectionsOptions,
): Promise<CaptureResult<SiteSectionResult[], SiteSectionResult>> {
  const sections = await client.getSiteSections({
    siteId: params.siteId,
    siteName: params.siteName,
    query: params.query,
    pageSize: boundedPageSize(params.pageSize),
    pageIndex: params.pageIndex ?? 0,
  });
  const sectionIds = new Set(params.sectionIds ?? []);
  const candidates =
    sectionIds.size > 0 ? sections.filter((section) => sectionIds.has(section.id)) : sections;
  const selected = candidates.slice(
    0,
    Math.max(1, Math.min(params.maxSections ?? candidates.length, 50)),
  );

  if (selected.length === 0) {
    throw new Error(
      `No Mobbin site sections matched the capture filters. Retrieved ${sections.length} section(s).`,
    );
  }

  const visualHashes = await visualHashesForUrls(
    client,
    selected.map((section) => section.sectionImageUrl),
    params.computeVisualHashes,
    params.hashImageLimit,
  );
  const artifact = createArtifactFromSiteSections({
    sections: selected,
    projectPath: params.projectPath,
    title: params.title,
    summary: params.summary,
    tags: params.tags,
    notes: params.notes,
    featureArea: params.featureArea,
    journeyName: params.journeyName,
    sessionName: params.sessionName,
    participants: params.participants,
    implementationHints: params.implementationHints,
    sourceUrls: params.sourceUrls,
    visualHashes,
  });
  const index = upsertArtifact(artifact, params.projectPath);

  return {
    project: index.project,
    artifact,
    artifactCount: index.artifacts.length,
    selected,
    candidates: sections,
  };
}
