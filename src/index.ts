#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { MobbinAuth } from "./services/auth.js";
import { MobbinApiClient } from "./services/api-client.js";
import { DEFAULT_PAGE_SIZE } from "./constants.js";
import type { AgentTarget, CapturedArtifact, CapturedArtifactType, DictionaryCategory } from "./types.js";
import { readStoredSession, writeStoredSession, AUTH_FILE, DATA_DIR } from "./utils/auth-store.js";
import { resolveProjectContext } from "./utils/project-context.js";
import {
  buildAnalysisPrompt,
  buildArtifactCatalog,
  buildAgentContext,
  buildImplementationPrompt,
  buildOnboardingPrompt,
  createArtifact,
  deleteArtifact,
  exportArtifacts,
  formatArtifactList,
  getArtifactById,
  importArtifacts,
  loadProjectArtifacts,
  searchArtifacts,
  updateArtifact,
  upsertArtifact,
} from "./utils/artifact-store.js";
import {
  formatApps,
  formatCollections,
  formatFlows,
  formatScreenDetail,
  formatScreens,
} from "./utils/formatting.js";

const artifactTypeValues = [
  "screen",
  "flow",
  "note",
  "implementation",
  "design",
  "reference",
] satisfies [CapturedArtifactType, ...CapturedArtifactType[]];

const agentTargetValues = [
  "claude_code",
  "codex",
  "pi",
  "mem_palace",
] satisfies [AgentTarget, ...AgentTarget[]];

const artifactTypeSchema = z.enum(artifactTypeValues);
const agentTargetSchema = z.enum(agentTargetValues);
const artifactSourceSchema = z.enum(["mobbin", "manual", "derived"]);
const exportFormatSchema = z.enum(["json", "markdown", "prompt_pack", "mem_palace_jsonl"]);
const promptModeSchema = z.enum(["implementation", "analysis", "onboarding"]);

const artifactStepSchema = z.object({
  order: z.number().min(0).optional().describe("0-indexed step order"),
  title: z.string().optional().describe("Step title"),
  summary: z.string().optional().describe("What happens in this step"),
  screen_id: z.string().optional().describe("Mobbin screen ID if known"),
  screen_url: z.string().url().optional().describe("Mobbin screen URL if known"),
  patterns: z.array(z.string()).optional().describe("UI patterns in the step"),
  elements: z.array(z.string()).optional().describe("UI elements in the step"),
  hotspot: z
    .object({
      x: z.number().optional(),
      y: z.number().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
    })
    .optional()
    .describe("Optional normalized hotspot geometry"),
});

const artifactDecisionSchema = z.object({
  decision: z.string().describe("Decision statement"),
  rationale: z.string().describe("Why this decision was made"),
  status: z.enum(["accepted", "open", "rejected"]).default("open"),
});

const artifactReferenceSchema = z.object({
  label: z.string().describe("Reference label"),
  url: z.string().url().optional().describe("Optional URL"),
  artifact_id: z.string().optional().describe("Optional related captured artifact ID"),
  note: z.string().optional().describe("Optional note"),
});

function mapSteps(
  steps?: Array<z.infer<typeof artifactStepSchema>>,
): CapturedArtifact["steps"] | undefined {
  return steps?.map((step, index) => ({
    order: typeof step.order === "number" ? step.order : index,
    title: step.title,
    summary: step.summary,
    screenId: step.screen_id,
    screenUrl: step.screen_url,
    patterns: step.patterns ?? [],
    elements: step.elements ?? [],
    hotspot: step.hotspot,
  }));
}

function mapDecisions(
  decisions?: Array<z.infer<typeof artifactDecisionSchema>>,
): CapturedArtifact["decisions"] | undefined {
  return decisions?.map((decision) => ({
    decision: decision.decision,
    rationale: decision.rationale,
    status: decision.status,
  }));
}

function mapReferences(
  references?: Array<z.infer<typeof artifactReferenceSchema>>,
): CapturedArtifact["references"] | undefined {
  return references?.map((reference) => ({
    label: reference.label,
    url: reference.url,
    artifactId: reference.artifact_id,
    note: reference.note,
  }));
}

function buildCatalogText(catalog: ReturnType<typeof buildArtifactCatalog>["catalog"]): string {
  const formatBucket = (label: string, values: Record<string, number>): string[] => {
    const entries = Object.entries(values).sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) return [];
    return [
      `## ${label}`,
      ...entries.map(([key, count]) => `- ${key}: ${count}`),
    ];
  };

  return [
    `# Capture Catalog`,
    `- Total artifacts: ${catalog.totalArtifacts}`,
    "",
    ...formatBucket("By Type", catalog.byType),
    "",
    ...formatBucket("By Tag", catalog.byTag),
    "",
    ...formatBucket("By App", catalog.byAppName),
    "",
    ...formatBucket("By Platform", catalog.byPlatform),
    "",
    ...formatBucket("By Feature Area", catalog.byFeatureArea),
    "",
    ...formatBucket("By Pattern", catalog.byPattern),
    "",
    ...formatBucket("By Element", catalog.byElement),
  ]
    .filter(Boolean)
    .join("\n");
}

async function main() {
  if (process.argv[2] === "auth") {
    const { runAuthFlow } = await import("./cli/auth.js");
    await runAuthFlow();
    return;
  }

  let auth: MobbinAuth;
  const storedSession = readStoredSession();
  if (storedSession) {
    auth = MobbinAuth.fromSession(storedSession, (newSession) => {
      writeStoredSession(newSession);
    });
  } else {
    const cookieValue = process.env.MOBBIN_AUTH_COOKIE;
    if (!cookieValue) {
      console.error(
        "Error: No authentication found.\n\n" +
          "Option 1 (recommended): Run 'npx mobbin-mcp auth' to log in with your email.\n\n" +
          "Option 2: Set the MOBBIN_AUTH_COOKIE environment variable.\n" +
          "  1. Open mobbin.com and log in\n" +
          "  2. Open DevTools > Application > Cookies\n" +
          "  3. Copy the full cookie string (all cookies for mobbin.com)\n" +
          "  4. Set MOBBIN_AUTH_COOKIE to that value",
      );
      process.exit(1);
    }
    auth = MobbinAuth.fromCookie(cookieValue);
  }

  const client = new MobbinApiClient(auth);
  const server = new McpServer({
    name: "mobbin",
    version: "1.0.0",
    description:
      "Search Mobbin, capture reference artifacts, and generate prompt-ready context for implementation and analysis workflows.",
  });

  const selectArtifacts = (params: {
    artifact_ids?: string[];
    query?: string;
    type?: CapturedArtifactType;
    tags?: string[];
    app_name?: string;
    feature_area?: string;
    limit?: number;
    project_path?: string;
  }): { project: ReturnType<typeof loadProjectArtifacts>["project"]; artifacts: CapturedArtifact[] } => {
    const index = loadProjectArtifacts(params.project_path);
    const artifacts =
      params.artifact_ids && params.artifact_ids.length > 0
        ? index.artifacts.filter((artifact) => params.artifact_ids!.includes(artifact.id))
        : searchArtifacts({
            projectPath: params.project_path,
            query: params.query,
            tags: params.tags,
            type: params.type,
            appName: params.app_name,
            featureArea: params.feature_area,
            limit: params.limit ?? 8,
          }).results;

    return {
      project: index.project,
      artifacts,
    };
  };

  const buildPromptByMode = (params: {
    mode: z.infer<typeof promptModeSchema>;
    objective: string;
    artifacts: CapturedArtifact[];
    projectName: string;
  }): string => {
    if (params.mode === "analysis") {
      return buildAnalysisPrompt({
        objective: params.objective,
        artifacts: params.artifacts,
        projectName: params.projectName,
      });
    }

    if (params.mode === "onboarding") {
      return buildOnboardingPrompt({
        topic: params.objective,
        artifacts: params.artifacts,
        projectName: params.projectName,
      });
    }

    return buildImplementationPrompt({
      objective: params.objective,
      artifacts: params.artifacts,
      projectName: params.projectName,
    });
  };

  server.registerResource(
    "mobbin_project_context",
    "mobbin://project/context",
    {
      title: "Current Project Context",
      description: "Repository-aware context detected from the current runtime environment.",
      mimeType: "application/json",
    },
    async () => {
      const project = resolveProjectContext();
      return {
        contents: [
          {
            uri: "mobbin://project/context",
            mimeType: "application/json",
            text: JSON.stringify(project, null, 2),
          },
        ],
      };
    },
  );

  server.registerResource(
    "mobbin_project_captures",
    "mobbin://project/captures",
    {
      title: "Current Project Captures",
      description: "Locally captured Mobbin artifacts for the detected project.",
      mimeType: "application/json",
    },
    async () => {
      const index = loadProjectArtifacts();
      return {
        contents: [
          {
            uri: "mobbin://project/captures",
            mimeType: "application/json",
            text: JSON.stringify(index, null, 2),
          },
        ],
      };
    },
  );

  server.registerResource(
    "mobbin_project_capture_catalog",
    "mobbin://project/catalog",
    {
      title: "Current Project Capture Catalog",
      description: "Facet counts across captured artifacts for the active project.",
      mimeType: "application/json",
    },
    async () => {
      const catalog = buildArtifactCatalog();
      return {
        contents: [
          {
            uri: "mobbin://project/catalog",
            mimeType: "application/json",
            text: JSON.stringify(catalog, null, 2),
          },
        ],
      };
    },
  );

  const promptArgsSchema = {
    objective: z.string().describe("Goal for the generated prompt"),
    artifact_ids: z.array(z.string()).optional().describe("Optional explicit artifact IDs"),
    query: z.string().optional().describe("Optional artifact search query"),
    tags: z.array(z.string()).optional().describe("Optional required tags"),
    type: artifactTypeSchema.optional().describe("Optional artifact type filter"),
    limit: z.number().min(1).max(12).default(8).describe("Maximum artifacts to include"),
  };

  server.registerPrompt(
    "mobbin_feature_implementation_prompt",
    {
      title: "Feature Implementation Prompt",
      description: "Generate a prompt-ready implementation brief from captured artifacts.",
      argsSchema: promptArgsSchema,
    },
    async ({ objective, artifact_ids, query, tags, type, limit }) => {
      const { project, artifacts } = selectArtifacts({
        artifact_ids,
        query,
        tags,
        type,
        limit,
      });

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: buildImplementationPrompt({
                objective,
                artifacts,
                projectName: project.projectName,
              }),
            },
          },
        ],
      };
    },
  );

  server.registerPrompt(
    "mobbin_feature_analysis_prompt",
    {
      title: "Feature Analysis Prompt",
      description: "Generate an analysis prompt for comparing shipped UI against captured references.",
      argsSchema: promptArgsSchema,
    },
    async ({ objective, artifact_ids, query, tags, type, limit }) => {
      const { project, artifacts } = selectArtifacts({
        artifact_ids,
        query,
        tags,
        type,
        limit,
      });

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: buildAnalysisPrompt({
                objective,
                artifacts,
                projectName: project.projectName,
              }),
            },
          },
        ],
      };
    },
  );

  server.registerPrompt(
    "mobbin_onboarding_brief_prompt",
    {
      title: "Onboarding Brief Prompt",
      description: "Generate an onboarding brief from captured artifacts.",
      argsSchema: promptArgsSchema,
    },
    async ({ objective, artifact_ids, query, tags, type, limit }) => {
      const { project, artifacts } = selectArtifacts({
        artifact_ids,
        query,
        tags,
        type,
        limit,
      });

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: buildOnboardingPrompt({
                topic: objective,
                artifacts,
                projectName: project.projectName,
              }),
            },
          },
        ],
      };
    },
  );

  server.tool(
    "mobbin_search_apps",
    "Search and browse apps on Mobbin by category and platform. Returns app names, logos, preview screens, and version IDs for deeper exploration.",
    {
      platform: z.enum(["ios", "android", "web"]).default("ios").describe("Platform to search"),
      categories: z
        .array(z.string())
        .optional()
        .describe("Filter by app categories (e.g., 'Finance', 'AI', 'Music & Audio')"),
      sort_by: z
        .enum(["publishedAt", "trending", "popular", "top"])
        .default("publishedAt")
        .describe("Sort order"),
      page_size: z.number().min(1).max(50).default(DEFAULT_PAGE_SIZE).describe("Results per page"),
      page_index: z.number().min(0).default(0).describe("Page number (0-indexed)"),
    },
    async ({ platform, categories, sort_by, page_size, page_index }) => {
      const result = await client.searchApps({
        platform,
        appCategories: categories,
        pageSize: page_size,
        pageIndex: page_index,
        sortBy: sort_by,
      });
      return {
        content: [{ type: "text", text: formatApps(result.value.data) }],
      };
    },
  );

  server.tool(
    "mobbin_search_screens",
    "Search screens across all apps on Mobbin. Filter by screen patterns, UI elements, or text content.",
    {
      platform: z.enum(["ios", "android", "web"]).default("ios").describe("Platform to search"),
      screen_patterns: z.array(z.string()).optional().describe("Screen patterns to filter by"),
      screen_elements: z.array(z.string()).optional().describe("UI elements to filter by"),
      screen_keywords: z.array(z.string()).optional().describe("Text keywords found in screenshots"),
      categories: z.array(z.string()).optional().describe("Filter by app categories"),
      has_animation: z.boolean().optional().describe("Filter for animated screens only"),
      sort_by: z.enum(["trending", "publishedAt"]).default("trending").describe("Sort order"),
      page_size: z.number().min(1).max(50).default(DEFAULT_PAGE_SIZE).describe("Results per page"),
      page_index: z.number().min(0).default(0).describe("Page number (0-indexed)"),
    },
    async ({
      platform,
      screen_patterns,
      screen_elements,
      screen_keywords,
      categories,
      has_animation,
      sort_by,
      page_size,
      page_index,
    }) => {
      const result = await client.searchScreens({
        platform,
        screenPatterns: screen_patterns,
        screenElements: screen_elements,
        screenKeywords: screen_keywords,
        appCategories: categories,
        hasAnimation: has_animation,
        pageSize: page_size,
        pageIndex: page_index,
        sortBy: sort_by,
      });
      return {
        content: [{ type: "text", text: formatScreens(result.value.data) }],
      };
    },
  );

  server.tool(
    "mobbin_search_flows",
    "Search user flows/journeys across all apps on Mobbin. Filter by flow actions.",
    {
      platform: z.enum(["ios", "android", "web"]).default("ios").describe("Platform to search"),
      flow_actions: z.array(z.string()).optional().describe("Flow actions to filter by"),
      categories: z.array(z.string()).optional().describe("Filter by app categories"),
      sort_by: z.enum(["trending", "publishedAt"]).default("trending").describe("Sort order"),
      page_size: z.number().min(1).max(50).default(DEFAULT_PAGE_SIZE).describe("Results per page"),
      page_index: z.number().min(0).default(0).describe("Page number (0-indexed)"),
    },
    async ({ platform, flow_actions, categories, sort_by, page_size, page_index }) => {
      const result = await client.searchFlows({
        platform,
        flowActions: flow_actions,
        appCategories: categories,
        pageSize: page_size,
        pageIndex: page_index,
        sortBy: sort_by,
      });
      return {
        content: [{ type: "text", text: formatFlows(result.value.data) }],
      };
    },
  );

  server.tool(
    "mobbin_quick_search",
    "Quick autocomplete search for apps by name.",
    {
      query: z.string().describe("Search query"),
      platform: z.enum(["ios", "android", "web"]).default("ios").describe("Platform to search"),
    },
    async ({ query, platform }) => {
      const [searchResult, allApps] = await Promise.all([
        client.autocompleteSearch({ query, platform }),
        client.getSearchableApps(platform),
      ]);

      const appMap = new Map(allApps.map((app) => [app.id, app]));
      const matchedApps = [...searchResult.value.primary, ...searchResult.value.other]
        .filter((item) => item.type === "app")
        .map((item) => appMap.get(item.id))
        .filter(Boolean);

      if (matchedApps.length === 0) {
        return { content: [{ type: "text", text: "No apps found." }] };
      }

      const text = matchedApps
        .map((app, index) =>
          [
            `${index + 1}. **${app!.appName}** — ${app!.appTagline}`,
            `   ID: ${app!.id} | Platform: ${app!.platform}`,
            `   Logo: ${app!.appLogoUrl}`,
          ].join("\n"),
        )
        .join("\n\n");

      return { content: [{ type: "text", text }] };
    },
  );

  server.tool(
    "mobbin_popular_apps",
    "Get the most popular apps on Mobbin, grouped by category.",
    {
      platform: z.enum(["ios", "android", "web"]).default("ios").describe("Platform"),
      limit_per_category: z.number().min(1).max(20).default(10).describe("Max apps per category"),
    },
    async ({ platform, limit_per_category }) => {
      const result = await client.getPopularApps({
        platform,
        limitPerCategory: limit_per_category,
      });

      const apps = result.value;
      if (apps.length === 0) {
        return { content: [{ type: "text", text: "No popular apps found." }] };
      }

      const grouped = new Map<string, typeof apps>();
      for (const app of apps) {
        const category = app.app_category;
        if (!grouped.has(category)) grouped.set(category, []);
        grouped.get(category)!.push(app);
      }

      const text = Array.from(grouped.entries())
        .map(
          ([category, categoryApps]) =>
            `## ${category}\n` +
            categoryApps
              .map(
                (app, index) =>
                  `${index + 1}. **${app.app_name}** (popularity: ${app.popularity_metric})\n   ID: ${app.app_id}\n   Logo: ${app.app_logo_url}`,
              )
              .join("\n"),
        )
        .join("\n\n");

      return { content: [{ type: "text", text }] };
    },
  );

  server.tool(
    "mobbin_list_collections",
    "List your saved Mobbin collections with item counts.",
    {},
    async () => {
      const result = await client.getCollections();
      return {
        content: [{ type: "text", text: formatCollections(result.value) }],
      };
    },
  );

  server.tool(
    "mobbin_get_filters",
    "Get all available filter options for Mobbin search.",
    {},
    async () => {
      const result = await client.getDictionaryDefinitions();
      const categories = result.value as DictionaryCategory[];

      const text = categories
        .map((category) => {
          const entries = category.subCategories
            .flatMap((sub) => sub.entries)
            .filter((entry) => !entry.hidden)
            .map((entry) => {
              const counts = Object.entries(entry.contentCounts)
                .flatMap(([type, platforms]) =>
                  Object.entries(platforms).map(([platform, count]) => `${platform} ${type}: ${count}`),
                )
                .join(", ");
              return `  - **${entry.displayName}**: ${entry.definition.substring(0, 80)}${entry.definition.length > 80 ? "..." : ""} (${counts})`;
            });

          return `## ${category.displayName} (${category.experience})\nSlug: \`${category.slug}\`\n${entries.join("\n")}`;
        })
        .join("\n\n");

      return { content: [{ type: "text", text }] };
    },
  );

  server.tool(
    "mobbin_get_screen_detail",
    "Fetch a full screenshot image and metadata for a specific screen.",
    {
      screen_url: z.string().url().describe("The screen image URL from a previous search result"),
      screen_id: z.string().optional().describe("Screen ID from search results"),
      app_name: z.string().optional().describe("App name from search results"),
      screen_patterns: z.array(z.string()).optional().describe("UI patterns from search results"),
      screen_elements: z.array(z.string()).optional().describe("UI elements from search results"),
      dimensions: z
        .object({ width: z.number(), height: z.number() })
        .optional()
        .describe("Image dimensions from search result metadata"),
      extract_colors: z
        .boolean()
        .optional()
        .default(false)
        .describe("Extract dominant hex colors from the screenshot"),
    },
    async ({
      screen_url,
      screen_id,
      app_name,
      screen_patterns,
      screen_elements,
      dimensions,
      extract_colors,
    }) => {
      try {
        const { base64, mimeType, sizeBytes, buffer } = await client.fetchScreenImage(screen_url);
        const dominantColors = extract_colors ? await client.extractColors(buffer) : undefined;

        const metadataText = formatScreenDetail({
          screenUrl: screen_url,
          screenId: screen_id,
          appName: app_name,
          screenPatterns: screen_patterns,
          screenElements: screen_elements,
          dimensions,
          imageSizeBytes: sizeBytes,
          mimeType,
          dominantColors,
        });

        return {
          content: [
            { type: "text" as const, text: metadataText },
            { type: "image" as const, data: base64, mimeType },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to fetch screen image: ${message}\n\nURL attempted: ${screen_url}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "mobbin_doctor",
    {
      title: "Doctor",
      description:
        "Inspect authentication, project detection, artifact storage, and portability-related configuration.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const session = auth.getSession();
      const project = resolveProjectContext();
      const index = loadProjectArtifacts();
      const catalog = buildArtifactCatalog();

      const text = [
        `# Mobbin Doctor`,
        `- Auth file: ${AUTH_FILE}`,
        `- Data dir: ${DATA_DIR}`,
        `- Authenticated user: ${session.user.email}`,
        `- Session expires at: ${new Date(session.expires_at * 1000).toISOString()}`,
        `- Project: ${project.projectName}`,
        `- Project root: ${project.projectRoot}`,
        `- Detection source: ${project.detectedFrom}`,
        `- Remote URL: ${project.remoteUrl ?? "none"}`,
        `- Branch: ${project.branch ?? "none"}`,
        `- Captured artifacts: ${index.artifacts.length}`,
        `- Artifact types: ${Object.keys(catalog.catalog.byType).join(", ") || "none"}`,
      ].join("\n");

      return {
        content: [{ type: "text", text }],
        structuredContent: {
          auth: {
            authFile: AUTH_FILE,
            dataDir: DATA_DIR,
            email: session.user.email,
            expiresAt: session.expires_at,
          },
          project,
          artifactCount: index.artifacts.length,
          catalog: catalog.catalog,
        },
      };
    },
  );

  server.registerTool(
    "mobbin_get_project_context",
    {
      title: "Get Project Context",
      description:
        "Auto-detect the current repository or working directory and show where captures will be stored.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const project = resolveProjectContext();
      const index = loadProjectArtifacts();
      const text = [
        `## Project Context`,
        `- **Project ID**: ${project.projectId}`,
        `- **Project Name**: ${project.projectName}`,
        `- **Project Root**: ${project.projectRoot}`,
        `- **Detection**: ${project.detectedFrom}`,
        project.remoteUrl ? `- **Remote**: ${project.remoteUrl}` : "",
        project.branch ? `- **Branch**: ${project.branch}` : "",
        `- **Captured Artifacts**: ${index.artifacts.length}`,
      ]
        .filter(Boolean)
        .join("\n");

      return {
        content: [{ type: "text", text }],
        structuredContent: {
          project,
          artifactCount: index.artifacts.length,
        },
      };
    },
  );

  server.registerTool(
    "mobbin_capture_artifact",
    {
      title: "Capture Artifact",
      description:
        "Save a Mobbin screen, flow, note, design reference, or implementation note into the project-aware local index.",
      inputSchema: {
        type: artifactTypeSchema.describe("Artifact type"),
        title: z.string().min(3).describe("Short title for the captured artifact"),
        summary: z.string().min(10).describe("Concise summary of why this artifact matters"),
        source: artifactSourceSchema.default("mobbin").describe("How this artifact was created"),
        tags: z.array(z.string()).optional().describe("Searchable tags"),
        notes: z.string().optional().describe("Longer implementation or design notes"),
        app_name: z.string().optional().describe("Source app name"),
        platform: z.enum(["ios", "android", "web"]).optional().describe("Platform"),
        feature_area: z.string().optional().describe("Feature area or product surface"),
        journey_name: z.string().optional().describe("User journey or flow family"),
        session_name: z.string().optional().describe("Mobbing session name"),
        participants: z.array(z.string()).optional().describe("Session participants"),
        implementation_hints: z.array(z.string()).optional().describe("Concrete implementation hints"),
        decisions: z.array(artifactDecisionSchema).optional().describe("Decision log entries"),
        references: z.array(artifactReferenceSchema).optional().describe("Related links or artifacts"),
        steps: z.array(artifactStepSchema).optional().describe("Ordered flow or screen steps"),
        source_urls: z.array(z.string().url()).optional().describe("Related source URLs"),
        screen_url: z.string().url().optional().describe("Direct screen URL from Mobbin"),
        flow_name: z.string().optional().describe("Flow name when saving a flow artifact"),
        patterns: z.array(z.string()).optional().describe("Relevant screen patterns"),
        elements: z.array(z.string()).optional().describe("Relevant UI elements"),
        related_artifact_ids: z
          .array(z.string())
          .optional()
          .describe("Existing captured artifact IDs related to this one"),
        project_path: z.string().optional().describe("Optional explicit project path override"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({
      type,
      title,
      summary,
      source,
      tags,
      notes,
      app_name,
      platform,
      feature_area,
      journey_name,
      session_name,
      participants,
      implementation_hints,
      decisions,
      references,
      steps,
      source_urls,
      screen_url,
      flow_name,
      patterns,
      elements,
      related_artifact_ids,
      project_path,
    }) => {
      const artifact = createArtifact({
        projectPath: project_path,
        type,
        title,
        summary,
        source,
        tags,
        notes,
        appName: app_name,
        platform,
        featureArea: feature_area,
        journeyName: journey_name,
        sessionName: session_name,
        participants,
        implementationHints: implementation_hints,
        decisions: mapDecisions(decisions),
        references: mapReferences(references),
        steps: mapSteps(steps),
        sourceUrls: source_urls,
        screenUrl: screen_url,
        flowName: flow_name,
        patterns,
        elements,
        relatedArtifactIds: related_artifact_ids,
      });

      const index = upsertArtifact(artifact, project_path);
      const text = [
        `Saved artifact **${artifact.title}**.`,
        `- ID: ${artifact.id}`,
        `- Project: ${index.project.projectName}`,
        `- Type: ${artifact.type}`,
        `- Source: ${artifact.source}`,
        artifact.tags.length > 0 ? `- Tags: ${artifact.tags.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      return {
        content: [{ type: "text", text }],
        structuredContent: {
          artifact,
          project: index.project,
          artifactCount: index.artifacts.length,
        },
      };
    },
  );

  server.registerTool(
    "mobbin_get_captured_artifact",
    {
      title: "Get Captured Artifact",
      description: "Fetch a single captured artifact by ID.",
      inputSchema: {
        artifact_id: z.string().describe("Captured artifact ID"),
        project_path: z.string().optional().describe("Optional explicit project path override"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ artifact_id, project_path }) => {
      const { project, artifact } = getArtifactById(artifact_id, project_path);
      if (!artifact) {
        return {
          content: [{ type: "text", text: `Artifact not found: ${artifact_id}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: formatArtifactList([artifact]) }],
        structuredContent: {
          project,
          artifact,
        },
      };
    },
  );

  server.registerTool(
    "mobbin_update_captured_artifact",
    {
      title: "Update Captured Artifact",
      description: "Update metadata, notes, steps, or decisions on an existing captured artifact.",
      inputSchema: {
        artifact_id: z.string().describe("Captured artifact ID"),
        title: z.string().optional(),
        summary: z.string().optional(),
        source: artifactSourceSchema.optional(),
        tags: z.array(z.string()).optional(),
        notes: z.string().optional(),
        app_name: z.string().optional(),
        platform: z.enum(["ios", "android", "web"]).optional(),
        feature_area: z.string().optional(),
        journey_name: z.string().optional(),
        session_name: z.string().optional(),
        participants: z.array(z.string()).optional(),
        implementation_hints: z.array(z.string()).optional(),
        decisions: z.array(artifactDecisionSchema).optional(),
        references: z.array(artifactReferenceSchema).optional(),
        steps: z.array(artifactStepSchema).optional(),
        source_urls: z.array(z.string().url()).optional(),
        screen_url: z.string().url().optional(),
        flow_name: z.string().optional(),
        patterns: z.array(z.string()).optional(),
        elements: z.array(z.string()).optional(),
        related_artifact_ids: z.array(z.string()).optional(),
        project_path: z.string().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (args) => {
      const { project, artifact } = updateArtifact(
        args.artifact_id,
        {
          title: args.title,
          summary: args.summary,
          source: args.source,
          tags: args.tags,
          notes: args.notes,
          appName: args.app_name,
          platform: args.platform,
          featureArea: args.feature_area,
          journeyName: args.journey_name,
          sessionName: args.session_name,
          participants: args.participants,
          implementationHints: args.implementation_hints,
          decisions: mapDecisions(args.decisions),
          references: mapReferences(args.references),
          steps: mapSteps(args.steps),
          sourceUrls: args.source_urls,
          screenUrl: args.screen_url,
          flowName: args.flow_name,
          patterns: args.patterns,
          elements: args.elements,
          relatedArtifactIds: args.related_artifact_ids,
        },
        args.project_path,
      );

      if (!artifact) {
        return {
          content: [{ type: "text", text: `Artifact not found: ${args.artifact_id}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: `Updated artifact **${artifact.title}** (${artifact.id}).` }],
        structuredContent: {
          project,
          artifact,
        },
      };
    },
  );

  server.registerTool(
    "mobbin_delete_captured_artifact",
    {
      title: "Delete Captured Artifact",
      description: "Delete a captured artifact from the local project index.",
      inputSchema: {
        artifact_id: z.string().describe("Captured artifact ID"),
        project_path: z.string().optional().describe("Optional explicit project path override"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ artifact_id, project_path }) => {
      const result = deleteArtifact(artifact_id, project_path);
      if (!result.deleted) {
        return {
          content: [{ type: "text", text: `Artifact not found: ${artifact_id}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: `Deleted artifact ${artifact_id}.` }],
        structuredContent: result,
      };
    },
  );

  server.registerTool(
    "mobbin_search_captured_artifacts",
    {
      title: "Search Captured Artifacts",
      description: "Search previously captured screens, flows, notes, and implementation references.",
      inputSchema: {
        query: z.string().optional().describe("Full-text query"),
        tags: z.array(z.string()).optional().describe("Require all listed tags"),
        type: artifactTypeSchema.optional().describe("Restrict to one artifact type"),
        app_name: z.string().optional().describe("Restrict to a source app"),
        feature_area: z.string().optional().describe("Restrict to a feature area"),
        limit: z.number().min(1).max(50).default(10).describe("Maximum results to return"),
        project_path: z.string().optional().describe("Optional explicit project path override"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ query, tags, type, app_name, feature_area, limit, project_path }) => {
      const { project, results } = searchArtifacts({
        projectPath: project_path,
        query,
        tags,
        type,
        appName: app_name,
        featureArea: feature_area,
        limit,
      });

      return {
        content: [
          {
            type: "text",
            text: [`## ${project.projectName} Captured Artifacts`, formatArtifactList(results)]
              .filter(Boolean)
              .join("\n\n"),
          },
        ],
        structuredContent: {
          project,
          results,
        },
      };
    },
  );

  server.registerTool(
    "mobbin_get_capture_catalog",
    {
      title: "Get Capture Catalog",
      description: "Return tag, type, app, platform, pattern, and feature-area counts for captured artifacts.",
      inputSchema: {
        project_path: z.string().optional().describe("Optional explicit project path override"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ project_path }) => {
      const { project, catalog } = buildArtifactCatalog(project_path);
      return {
        content: [{ type: "text", text: [`## ${project.projectName} Catalog`, buildCatalogText(catalog)].join("\n\n") }],
        structuredContent: {
          project,
          catalog,
        },
      };
    },
  );

  server.registerTool(
    "mobbin_export_captured_artifacts",
    {
      title: "Export Captured Artifacts",
      description:
        "Export selected artifacts as JSON, Markdown, prompt packs, or Mem Palace JSONL records.",
      inputSchema: {
        format: exportFormatSchema.describe("Export format"),
        artifact_ids: z.array(z.string()).optional().describe("Optional explicit artifact IDs"),
        query: z.string().optional().describe("Optional artifact search query"),
        tags: z.array(z.string()).optional().describe("Optional required tags"),
        type: artifactTypeSchema.optional().describe("Optional artifact type filter"),
        app_name: z.string().optional().describe("Optional source app filter"),
        feature_area: z.string().optional().describe("Optional feature-area filter"),
        limit: z.number().min(1).max(50).default(12).describe("Maximum artifacts to export"),
        objective: z.string().optional().describe("Objective for prompt-pack style exports"),
        target_agent: agentTargetSchema.optional().describe("Target agent for prompt packs"),
        project_path: z.string().optional().describe("Optional explicit project path override"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({
      format,
      artifact_ids,
      query,
      tags,
      type,
      app_name,
      feature_area,
      limit,
      objective,
      target_agent,
      project_path,
    }) => {
      const { project, artifacts } = selectArtifacts({
        artifact_ids,
        query,
        tags,
        type,
        app_name,
        feature_area,
        limit,
        project_path,
      });
      const exported = exportArtifacts({
        projectPath: project_path,
        artifacts,
        format,
        objective,
        targetAgent: target_agent,
      });

      return {
        content: [{ type: "text", text: exported.output }],
        structuredContent: {
          project,
          artifacts,
          format,
          output: exported.output,
        },
      };
    },
  );

  server.registerTool(
    "mobbin_import_captured_artifacts",
    {
      title: "Import Captured Artifacts",
      description:
        "Import artifacts from a prior JSON export. Useful for sharing references across machines, projects, or agents.",
      inputSchema: {
        payload: z.string().min(2).describe("JSON payload containing artifacts or a project artifact index"),
        merge_strategy: z
          .enum(["append", "replace"])
          .default("append")
          .describe("How to combine imported artifacts with the current project store"),
        project_path: z.string().optional().describe("Optional explicit project path override"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ payload, merge_strategy, project_path }) => {
      try {
        const result = importArtifacts({
          projectPath: project_path,
          payload,
          mergeStrategy: merge_strategy,
        });

        return {
          content: [
            {
              type: "text",
              text: `Imported ${result.imported} artifacts into ${result.project.projectName}. Total artifacts: ${result.totalArtifacts}.`,
            },
          ],
          structuredContent: result,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Failed to import artifacts: ${message}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "mobbin_generate_feature_prompt",
    {
      title: "Generate Feature Prompt",
      description:
        "Generate prompt-ready implementation, analysis, or onboarding context from captured artifacts.",
      inputSchema: {
        mode: promptModeSchema.default("implementation").describe("Prompt mode"),
        objective: z.string().min(10).describe("Feature objective or analysis goal"),
        artifact_ids: z.array(z.string()).optional().describe("Optional explicit artifact IDs"),
        query: z.string().optional().describe("Optional search query"),
        tags: z.array(z.string()).optional().describe("Optional required tags"),
        type: artifactTypeSchema.optional().describe("Optional artifact type filter"),
        app_name: z.string().optional().describe("Optional source app filter"),
        feature_area: z.string().optional().describe("Optional feature-area filter"),
        limit: z.number().min(1).max(12).default(6).describe("Max artifacts when using search"),
        project_path: z.string().optional().describe("Optional explicit project path override"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ mode, objective, artifact_ids, query, tags, type, app_name, feature_area, limit, project_path }) => {
      const { project, artifacts } = selectArtifacts({
        artifact_ids,
        query,
        tags,
        type,
        app_name,
        feature_area,
        limit,
        project_path,
      });
      const prompt = buildPromptByMode({
        mode,
        objective,
        artifacts,
        projectName: project.projectName,
      });

      return {
        content: [{ type: "text", text: prompt }],
        structuredContent: {
          project,
          mode,
          selectedArtifacts: artifacts,
          prompt,
        },
      };
    },
  );

  server.registerTool(
    "mobbin_generate_agent_context",
    {
      title: "Generate Agent Context",
      description:
        "Generate agent-specific context packs for Claude Code, Codex, Pi, or Mem Palace memory ingestion.",
      inputSchema: {
        target_agent: agentTargetSchema.describe("Target agent"),
        objective: z.string().min(10).describe("Objective for the context pack"),
        artifact_ids: z.array(z.string()).optional().describe("Optional explicit artifact IDs"),
        query: z.string().optional().describe("Optional search query"),
        tags: z.array(z.string()).optional().describe("Optional required tags"),
        type: artifactTypeSchema.optional().describe("Optional artifact type filter"),
        app_name: z.string().optional().describe("Optional source app filter"),
        feature_area: z.string().optional().describe("Optional feature-area filter"),
        limit: z.number().min(1).max(12).default(6).describe("Maximum artifacts to include"),
        project_path: z.string().optional().describe("Optional explicit project path override"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ target_agent, objective, artifact_ids, query, tags, type, app_name, feature_area, limit, project_path }) => {
      const { project, artifacts } = selectArtifacts({
        artifact_ids,
        query,
        tags,
        type,
        app_name,
        feature_area,
        limit,
        project_path,
      });
      const output = buildAgentContext({
        target: target_agent,
        objective,
        artifacts,
        projectName: project.projectName,
      });

      return {
        content: [{ type: "text", text: output }],
        structuredContent: {
          project,
          targetAgent: target_agent,
          selectedArtifacts: artifacts,
          output,
        },
      };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
