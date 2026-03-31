import { CHARACTER_LIMIT } from "../constants.js";
import type { AppResult, ScreenResult, FlowResult, Collection } from "../types.js";

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
      .join("\n")
  );

  return truncate(lines.join("\n\n"));
}

export function formatFlows(flows: FlowResult[]): string {
  if (flows.length === 0) return "No flows found.";

  const lines = flows.map((f, i) => {
    const screenList = f.screens
      .slice(0, 5)
      .map(
        (s, j) =>
          `  ${j + 1}. ${s.screenPatterns.join(", ") || "Step"} — ${s.screenUrl}`
      )
      .join("\n");
    const appInfo = f.appName ? `- **App**: ${f.appName}` : "";
    return [
      `### ${i + 1}. ${f.name}`,
      appInfo,
      `- **Actions**: ${f.actions.join(", ")}`,
      `- **Flow ID**: ${f.id}`,
      `- **Screens** (${f.screens.length} total):`,
      screenList,
      f.screens.length > 5
        ? `  ... and ${f.screens.length - 5} more screens`
        : "",
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
      .join("\n")
  );

  return truncate(lines.join("\n\n"));
}

function truncate(text: string): string {
  if (text.length <= CHARACTER_LIMIT) return text;
  return (
    text.substring(0, CHARACTER_LIMIT) +
    "\n\n---\n*Response truncated. Use pagination to see more results.*"
  );
}
