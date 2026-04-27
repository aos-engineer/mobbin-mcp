import { CHARACTER_LIMIT } from "../constants.js";
import type {
  AppResult,
  ScreenResult,
  FlowResult,
  Collection,
  SearchableSite,
  SiteSectionResult,
} from "../types.js";

export function formatApps(apps: AppResult[]): string {
  if (apps.length === 0) return "No apps found.";

  const lines = apps.map((app, i) => {
    const screens = app.previewScreens
      .slice(0, 2)
      .map((s) => s.screenUrl)
      .join("\n    ");
    return [
      `### ${i + 1}. ${app.appName}`,
      `- **Tagline**: ${app.appTagline}`,
      `- **Category**: ${app.allAppCategories.join(", ")}`,
      `- **Platform**: ${app.platform}`,
      `- **App ID**: ${app.id}`,
      `- **Version ID**: ${app.appVersionId}`,
      `- **Popularity**: ${app.popularityMetric} | **Trending**: ${app.trendingMetric}`,
      `- **Logo**: ${app.appLogoUrl}`,
      screens ? `- **Preview screens**:\n    ${screens}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  });

  return truncate(lines.join("\n\n"));
}

export function formatSites(sites: SearchableSite[]): string {
  if (sites.length === 0) return "No sites found.";

  const lines = sites.map((site, i) =>
    [
      `### ${i + 1}. ${site.name}`,
      `- **Tagline**: ${site.tagline}`,
      `- **Site ID**: ${site.id}`,
      site.keywords.length > 0 ? `- **Keywords**: ${site.keywords.join(", ")}` : "",
      site.logo_url ? `- **Logo**: ${site.logo_url}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );

  return truncate(lines.join("\n\n"));
}

export function formatSiteSections(sections: SiteSectionResult[]): string {
  if (sections.length === 0) return "No site sections found.";

  const lines = sections.map((section, i) =>
    [
      `### ${i + 1}. ${section.siteName} — ${section.patterns.join(", ") || "Site section"}`,
      `- **Section ID**: ${section.id}`,
      `- **Site ID**: ${section.siteId}`,
      `- **Version ID**: ${section.siteVersionId}`,
      `- **Page URL**: ${section.pageUrl}`,
      `- **Type**: ${section.type}`,
      `- **Patterns**: ${section.patterns.join(", ") || "None"}`,
      `- **Section image**: ${section.sectionImageUrl}`,
      `- **Source page image**: ${section.pageImageUrl}`,
      section.pageVideoUrl ? `- **Video**: ${section.pageVideoUrl}` : "",
      typeof section.videoTimestampStartMs === "number" && typeof section.videoTimestampEndMs === "number"
        ? `- **Video segment**: ${section.videoTimestampStartMs}ms-${section.videoTimestampEndMs}ms`
        : "",
      typeof section.imagePositionYStart === "number" && typeof section.imagePositionYEnd === "number"
        ? `- **Image crop Y**: ${section.imagePositionYStart}-${section.imagePositionYEnd}`
        : "",
      section.metadata?.width && section.metadata?.height
        ? `- **Dimensions**: ${section.metadata.width}x${section.metadata.height}`
        : "",
      section.textPreview ? `- **Text preview**: ${section.textPreview}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );

  return truncate(lines.join("\n\n"));
}

export function formatScreens(screens: ScreenResult[]): string {
  if (screens.length === 0) return "No screens found.";

  const lines = screens.map((s, i) =>
    [
      `### ${i + 1}. ${s.appName} — ${s.screenPatterns.join(", ") || "Screen"}`,
      `- **App**: ${s.appName} (${s.appCategory})`,
      `- **Platform**: ${s.platform}`,
      `- **Patterns**: ${s.screenPatterns.join(", ") || "None"}`,
      `- **Elements**: ${s.screenElements.join(", ") || "None"}`,
      `- **Screen URL**: ${s.screenUrl}`,
      `- **App ID**: ${s.appId}`,
      `- **Screen ID**: ${s.id}`,
      s.metadata ? `- **Dimensions**: ${s.metadata.width}x${s.metadata.height}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );

  return truncate(lines.join("\n\n"));
}

export function formatFlows(flows: FlowResult[]): string {
  if (flows.length === 0) return "No flows found.";

  const lines = flows.map((f, i) => {
    const screenList = f.screens
      .slice(0, 5)
      .map((s, j) => `  ${j + 1}. ${s.screenPatterns.join(", ") || "Step"} — ${s.screenUrl}`)
      .join("\n");
    const appInfo = f.appName ? `- **App**: ${f.appName}` : "";
    return [
      `### ${i + 1}. ${f.name}`,
      appInfo,
      `- **Actions**: ${f.actions.join(", ")}`,
      `- **Flow ID**: ${f.id}`,
      `- **Screens** (${f.screens.length} total):`,
      screenList,
      f.screens.length > 5 ? `  ... and ${f.screens.length - 5} more screens` : "",
      f.videoUrl ? `- **Video**: ${f.videoUrl}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  });

  return truncate(lines.join("\n\n"));
}

export function formatCollections(collections: Collection[]): string {
  if (collections.length === 0) return "No collections found.";

  const lines = collections.map((c, i) =>
    [
      `### ${i + 1}. ${c.name}`,
      c.description ? `- **Description**: ${c.description}` : "",
      `- **ID**: ${c.id}`,
      `- **Mobile**: ${c.mobileAppsCount} apps, ${c.mobileScreensCount} screens, ${c.mobileFlowsCount} flows`,
      `- **Web**: ${c.webAppsCount} apps, ${c.webScreensCount} screens, ${c.webFlowsCount} flows`,
      `- **Public**: ${c.isPublic ? "Yes" : "No"}`,
      `- **Updated**: ${c.updatedAt}`,
    ]
      .filter(Boolean)
      .join("\n"),
  );

  return truncate(lines.join("\n\n"));
}

export function formatScreenDetail(params: {
  screenUrl: string;
  screenId?: string;
  appName?: string;
  screenPatterns?: string[];
  screenElements?: string[];
  dimensions?: { width: number; height: number };
  imageSizeBytes: number;
  mimeType: string;
  dominantColors?: string[];
}): string {
  const lines: string[] = [];

  lines.push(`## Screen Detail`);

  if (params.appName) {
    lines.push(`- **App**: ${params.appName}`);
  }
  if (params.screenId) {
    lines.push(`- **Screen ID**: ${params.screenId}`);
  }
  if (params.screenPatterns && params.screenPatterns.length > 0) {
    lines.push(`- **Patterns**: ${params.screenPatterns.join(", ")}`);
  }
  if (params.screenElements && params.screenElements.length > 0) {
    lines.push(`- **Elements**: ${params.screenElements.join(", ")}`);
  }
  if (params.dimensions) {
    lines.push(`- **Dimensions**: ${params.dimensions.width}x${params.dimensions.height}`);
  }
  if (params.dominantColors && params.dominantColors.length > 0) {
    lines.push(`- **Dominant Colors**: ${params.dominantColors.join(", ")}`);
  }
  lines.push(`- **Image format**: ${params.mimeType}`);
  lines.push(`- **Image size**: ${(params.imageSizeBytes / 1024).toFixed(1)} KB`);
  lines.push(`- **Source URL**: ${params.screenUrl}`);

  return lines.join("\n");
}

function truncate(text: string): string {
  if (text.length <= CHARACTER_LIMIT) return text;
  return (
    text.substring(0, CHARACTER_LIMIT) +
    "\n\n---\n*Response truncated. Use pagination to see more results.*"
  );
}
