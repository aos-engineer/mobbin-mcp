import { writeFileSync } from "node:fs";
import { MobbinAuth } from "../services/auth.js";
import { MobbinApiClient } from "../services/api-client.js";
import type { CapturedArtifact, CapturedArtifactType, DictionaryCategory } from "../types.js";
import { AUTH_FILE, DATA_DIR, readStoredSession, writeStoredSession } from "../utils/auth-store.js";
import { resolveProjectContext } from "../utils/project-context.js";
import {
  buildAgentContext,
  buildAnalysisPrompt,
  buildArtifactCatalog,
  buildFeatureReviewMarkdown,
  buildImplementationPrompt,
  buildOnboardingPrompt,
  buildPrReferenceMarkdown,
  createArtifact,
  deleteArtifact,
  exportArtifacts,
  formatArtifactList,
  getArtifactById,
  importArtifacts,
  loadProjectArtifacts,
  searchArtifacts,
  seedArtifactsFromCollections,
  updateArtifact,
  upsertArtifact,
} from "../utils/artifact-store.js";
import {
  formatApps,
  formatCollections,
  formatFlows,
  formatScreenDetail,
  formatScreens,
  formatSiteSections,
  formatSites,
} from "../utils/formatting.js";
import { syncSharedStore } from "../utils/shared-store.js";
import {
  buildContactSheet,
  collectArtifactVisualCandidates,
  computePerceptualHash,
  findSimilarityMatches,
} from "../utils/visuals.js";

type JsonRecord = Record<string, unknown>;

function readJsonArg(raw?: string): JsonRecord {
  if (!raw) return {};
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("The skill command payload must be a JSON object.");
  }
  return parsed as JsonRecord;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function strArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function bool(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function artifactType(value: unknown): CapturedArtifactType | undefined {
  return value === "screen" ||
    value === "flow" ||
    value === "note" ||
    value === "implementation" ||
    value === "design" ||
    value === "reference"
    ? value
    : undefined;
}

function recordArray(value: unknown): JsonRecord[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter(
    (item): item is JsonRecord => Boolean(item) && typeof item === "object" && !Array.isArray(item),
  );
}

function mapSteps(value: unknown): CapturedArtifact["steps"] | undefined {
  return recordArray(value)?.map((step, index) => ({
    order: num(step.order) ?? index,
    title: str(step.title),
    summary: str(step.summary),
    screenId: str(step.screen_id) ?? str(step.screenId),
    screenUrl: str(step.screen_url) ?? str(step.screenUrl),
    patterns: strArray(step.patterns) ?? [],
    elements: strArray(step.elements) ?? [],
    hotspot:
      step.hotspot && typeof step.hotspot === "object" && !Array.isArray(step.hotspot)
        ? {
            x: num((step.hotspot as JsonRecord).x),
            y: num((step.hotspot as JsonRecord).y),
            width: num((step.hotspot as JsonRecord).width),
            height: num((step.hotspot as JsonRecord).height),
          }
        : undefined,
  }));
}

function mapDecisions(value: unknown): CapturedArtifact["decisions"] | undefined {
  return recordArray(value)?.flatMap((decision) => {
    const title = str(decision.decision);
    const rationale = str(decision.rationale);
    if (!title || !rationale) return [];
    return [
      {
        decision: title,
        rationale,
        status:
          decision.status === "accepted" || decision.status === "rejected"
            ? decision.status
            : "open",
      },
    ];
  });
}

function mapReferences(value: unknown): CapturedArtifact["references"] | undefined {
  return recordArray(value)?.flatMap((reference) => {
    const label = str(reference.label);
    if (!label) return [];
    return [
      {
        label,
        url: str(reference.url),
        artifactId: str(reference.artifact_id) ?? str(reference.artifactId),
        note: str(reference.note),
      },
    ];
  });
}

function hasOwn(params: JsonRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(params, key);
}

function selectArtifacts(params: JsonRecord): {
  project: ReturnType<typeof loadProjectArtifacts>["project"];
  artifacts: CapturedArtifact[];
} {
  const projectPath = str(params.project_path);
  const artifactIds = strArray(params.artifact_ids);
  const index = loadProjectArtifacts(projectPath);
  const artifacts =
    artifactIds && artifactIds.length > 0
      ? index.artifacts.filter((artifact) => artifactIds.includes(artifact.id))
      : searchArtifacts({
          projectPath,
          query: str(params.query),
          tags: strArray(params.tags),
          type: artifactType(params.type),
          appName: str(params.app_name),
          featureArea: str(params.feature_area),
          limit: num(params.limit) ?? 8,
        }).results;

  return { project: index.project, artifacts };
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function formatCatalogText(catalog: ReturnType<typeof buildArtifactCatalog>["catalog"]): string {
  const bucket = (label: string, values: Record<string, number>): string[] => {
    const entries = Object.entries(values).sort((a, b) => b[1] - a[1]);
    return entries.length > 0 ? [`## ${label}`, ...entries.map(([key, count]) => `- ${key}: ${count}`), ""] : [];
  };

  return [
    "# Capture Catalog",
    `- Total artifacts: ${catalog.totalArtifacts}`,
    "",
    ...bucket("By Type", catalog.byType),
    ...bucket("By Tag", catalog.byTag),
    ...bucket("By App", catalog.byAppName),
    ...bucket("By Platform", catalog.byPlatform),
    ...bucket("By Feature Area", catalog.byFeatureArea),
    ...bucket("By Pattern", catalog.byPattern),
    ...bucket("By Element", catalog.byElement),
  ].join("\n");
}

async function createClient(): Promise<MobbinApiClient> {
  const storedSession = readStoredSession();
  if (storedSession) {
    return new MobbinApiClient(MobbinAuth.fromSession(storedSession, writeStoredSession));
  }

  const cookieValue = process.env.MOBBIN_AUTH_COOKIE;
  if (!cookieValue) {
    throw new Error(
      "No Mobbin authentication found. Run `mobbin-mcp auth` or set MOBBIN_AUTH_COOKIE.",
    );
  }

  return new MobbinApiClient(MobbinAuth.fromCookie(cookieValue));
}

async function runSearchAction(action: string, params: JsonRecord): Promise<void> {
  const client = await createClient();
  const platform = str(params.platform) ?? "ios";
  const pageSize = num(params.page_size) ?? 10;
  const pageIndex = num(params.page_index) ?? 0;

  if (action === "search-apps") {
    const result = await client.searchApps({
      platform,
      appCategories: strArray(params.categories),
      sortBy: str(params.sort_by) ?? "publishedAt",
      pageSize,
      pageIndex,
    });
    console.log(formatApps(result.value.data));
    return;
  }

  if (action === "search-screens") {
    const result = await client.searchScreens({
      platform,
      screenPatterns: strArray(params.screen_patterns),
      screenElements: strArray(params.screen_elements),
      screenKeywords: strArray(params.screen_keywords),
      appCategories: strArray(params.categories),
      hasAnimation: bool(params.has_animation),
      sortBy: str(params.sort_by) ?? "trending",
      pageSize,
      pageIndex,
    });
    console.log(formatScreens(result.value.data));
    return;
  }

  if (action === "search-flows") {
    const result = await client.searchFlows({
      platform,
      flowActions: strArray(params.flow_actions),
      appCategories: strArray(params.categories),
      sortBy: str(params.sort_by) ?? "trending",
      pageSize,
      pageIndex,
    });
    console.log(formatFlows(result.value.data));
    return;
  }

  if (action === "search-sites") {
    console.log(formatSites(await client.searchSites({ query: str(params.query), pageSize, pageIndex })));
    return;
  }

  if (action === "site-sections") {
    console.log(
      formatSiteSections(
        await client.getSiteSections({
          siteId: str(params.site_id),
          siteName: str(params.site_name),
          query: str(params.query),
          pageSize,
          pageIndex,
        }),
      ),
    );
    return;
  }

  if (action === "quick-search") {
    const query = str(params.query);
    if (!query) throw new Error("quick-search requires `query`.");
    if (platform === "sites") {
      console.log(formatSites(await client.searchSites({ query, pageSize, pageIndex })));
      return;
    }
    const normalized = query.toLowerCase();
    const apps = (await client.getSearchableApps(platform))
      .filter((app) =>
        [app.appName, app.appTagline, ...app.keywords].some((value) =>
          value.toLowerCase().includes(normalized),
        ),
      )
      .slice(pageIndex * pageSize, pageIndex * pageSize + pageSize);
    console.log(
      apps.length
        ? apps
            .map(
              (app, index) =>
                `${index + 1}. **${app.appName}** — ${app.appTagline}\n- ID: ${app.id}\n- Platform: ${app.platform}\n- Logo: ${app.appLogoUrl}`,
            )
            .join("\n\n")
        : "No apps found.",
    );
    return;
  }

  if (action === "popular-apps") {
    const result = await client.getPopularApps({
      platform,
      limitPerCategory: num(params.limit_per_category) ?? 10,
    });
    const lines = result.value.map(
      (app, index) =>
        `${index + 1}. **${app.app_name}** (${app.app_category})\n- ID: ${app.app_id}\n- Popularity: ${app.popularity_metric}\n- Logo: ${app.app_logo_url}`,
    );
    console.log(lines.length ? lines.join("\n\n") : "No popular apps found.");
    return;
  }

  if (action === "collections") {
    const result = await client.getCollections();
    console.log(formatCollections(result.value));
    return;
  }

  if (action === "filters") {
    const result = await client.getDictionaryDefinitions();
    const categories = result.value as DictionaryCategory[];
    console.log(
      categories
        .map((category) => {
          const entries = category.subCategories
            .flatMap((sub) => sub.entries)
            .filter((entry) => !entry.hidden)
            .map((entry) => `  - **${entry.displayName}**: ${entry.definition}`);
          return `## ${category.displayName} (${category.experience})\nSlug: \`${category.slug}\`\n${entries.join("\n")}`;
        })
        .join("\n\n"),
    );
    return;
  }

  if (action === "screen-detail") {
    const screenUrl = str(params.screen_url);
    if (!screenUrl) throw new Error("screen-detail requires `screen_url`.");
    const image = await client.fetchScreenImage(screenUrl);
    const dominantColors = bool(params.extract_colors)
      ? await client.extractColors(image.buffer)
      : undefined;
    console.log(
      formatScreenDetail({
        screenUrl,
        screenId: str(params.screen_id),
        appName: str(params.app_name),
        screenPatterns: strArray(params.screen_patterns),
        screenElements: strArray(params.screen_elements),
        imageSizeBytes: image.sizeBytes,
        mimeType: image.mimeType,
        dominantColors,
      }),
    );
    return;
  }

  throw new Error(`Unknown Mobbin search action: ${action}`);
}

async function runCaptureAction(action: string, params: JsonRecord): Promise<void> {
  if (action === "doctor") {
    const client = await createClient();
    void client;
    const project = resolveProjectContext(str(params.project_path));
    const index = loadProjectArtifacts(str(params.project_path));
    const catalog = buildArtifactCatalog(str(params.project_path));
    console.log(
      [
        "# Mobbin Doctor",
        `- Auth file: ${AUTH_FILE}`,
        `- Data dir: ${DATA_DIR}`,
        `- Project: ${project.projectName}`,
        `- Project root: ${project.projectRoot}`,
        `- Detection source: ${project.detectedFrom}`,
        `- Captured artifacts: ${index.artifacts.length}`,
        `- Artifact types: ${Object.keys(catalog.catalog.byType).join(", ") || "none"}`,
      ].join("\n"),
    );
    return;
  }

  if (action === "project-context") {
    printJson({
      project: resolveProjectContext(str(params.project_path)),
      artifactCount: loadProjectArtifacts(str(params.project_path)).artifacts.length,
    });
    return;
  }

  if (action === "captures") {
    printJson(loadProjectArtifacts(str(params.project_path)));
    return;
  }

  if (action === "capture") {
    const type = artifactType(params.type);
    const title = str(params.title);
    const summary = str(params.summary);
    if (!type || !title || !summary) throw new Error("capture requires `type`, `title`, and `summary`.");
    const artifact = createArtifact({
      projectPath: str(params.project_path),
      type,
      title,
      summary,
      source: params.source === "manual" || params.source === "derived" ? params.source : "mobbin",
      tags: strArray(params.tags),
      notes: str(params.notes),
      appName: str(params.app_name),
      platform: str(params.platform),
      featureArea: str(params.feature_area),
      journeyName: str(params.journey_name),
      sessionName: str(params.session_name),
      participants: strArray(params.participants),
      implementationHints: strArray(params.implementation_hints),
      decisions: mapDecisions(params.decisions),
      references: mapReferences(params.references),
      steps: mapSteps(params.steps),
      sourceUrls: strArray(params.source_urls),
      screenUrl: str(params.screen_url),
      flowName: str(params.flow_name),
      patterns: strArray(params.patterns),
      elements: strArray(params.elements),
      relatedArtifactIds: strArray(params.related_artifact_ids),
    });
    upsertArtifact(artifact, str(params.project_path));
    console.log(formatArtifactList([artifact]));
    return;
  }

  if (action === "get") {
    const id = str(params.artifact_id);
    if (!id) throw new Error("get requires `artifact_id`.");
    const result = getArtifactById(id, str(params.project_path));
    console.log(result.artifact ? formatArtifactList([result.artifact]) : `Artifact not found: ${id}`);
    return;
  }

  if (action === "update") {
    const id = str(params.artifact_id);
    if (!id) throw new Error("update requires `artifact_id`.");
    const patch: Partial<CapturedArtifact> = {};
    if (hasOwn(params, "title")) patch.title = str(params.title);
    if (hasOwn(params, "summary")) patch.summary = str(params.summary);
    if (hasOwn(params, "notes")) patch.notes = str(params.notes);
    if (hasOwn(params, "tags")) patch.tags = strArray(params.tags);
    if (hasOwn(params, "app_name")) patch.appName = str(params.app_name);
    if (hasOwn(params, "platform")) patch.platform = str(params.platform);
    if (hasOwn(params, "feature_area")) patch.featureArea = str(params.feature_area);
    if (hasOwn(params, "journey_name")) patch.journeyName = str(params.journey_name);
    if (hasOwn(params, "session_name")) patch.sessionName = str(params.session_name);
    if (hasOwn(params, "participants")) patch.participants = strArray(params.participants);
    if (hasOwn(params, "implementation_hints")) {
      patch.implementationHints = strArray(params.implementation_hints);
    }
    if (hasOwn(params, "decisions")) patch.decisions = mapDecisions(params.decisions);
    if (hasOwn(params, "references")) patch.references = mapReferences(params.references);
    if (hasOwn(params, "steps")) patch.steps = mapSteps(params.steps);
    if (hasOwn(params, "source_urls")) patch.sourceUrls = strArray(params.source_urls);
    if (hasOwn(params, "screen_url")) patch.screenUrl = str(params.screen_url);
    if (hasOwn(params, "flow_name")) patch.flowName = str(params.flow_name);
    if (hasOwn(params, "patterns")) patch.patterns = strArray(params.patterns);
    if (hasOwn(params, "elements")) patch.elements = strArray(params.elements);
    if (hasOwn(params, "related_artifact_ids")) {
      patch.relatedArtifactIds = strArray(params.related_artifact_ids);
    }
    const result = updateArtifact(
      id,
      patch,
      str(params.project_path),
    );
    console.log(result.artifact ? formatArtifactList([result.artifact]) : `Artifact not found: ${id}`);
    return;
  }

  if (action === "delete") {
    const id = str(params.artifact_id);
    if (!id) throw new Error("delete requires `artifact_id`.");
    printJson(deleteArtifact(id, str(params.project_path)));
    return;
  }

  if (action === "search") {
    const result = searchArtifacts({
      projectPath: str(params.project_path),
      query: str(params.query),
      tags: strArray(params.tags),
      type: artifactType(params.type),
      appName: str(params.app_name),
      featureArea: str(params.feature_area),
      limit: num(params.limit) ?? 10,
    });
    console.log(formatArtifactList(result.results));
    return;
  }

  if (action === "catalog") {
    console.log(formatCatalogText(buildArtifactCatalog(str(params.project_path)).catalog));
    return;
  }

  if (action === "export") {
    const { artifacts } = selectArtifacts(params);
    const result = exportArtifacts({
      projectPath: str(params.project_path),
      artifacts,
      format:
        params.format === "json" ||
        params.format === "markdown" ||
        params.format === "prompt_pack" ||
        params.format === "mem_palace_jsonl" ||
        params.format === "pr_markdown"
          ? params.format
          : "markdown",
      objective: str(params.objective),
      targetAgent:
        params.target_agent === "claude_code" ||
        params.target_agent === "codex" ||
        params.target_agent === "pi" ||
        params.target_agent === "mem_palace"
          ? params.target_agent
          : "codex",
    });
    console.log(result.output);
    return;
  }

  if (action === "import") {
    const payload = str(params.payload);
    if (!payload) throw new Error("import requires `payload`.");
    printJson(
      importArtifacts({
        projectPath: str(params.project_path),
        payload,
        mergeStrategy: params.merge_strategy === "replace" ? "replace" : "append",
      }),
    );
    return;
  }

  if (action === "sync-shared-store") {
    printJson(
      syncSharedStore({
        projectPath: str(params.project_path),
        sharedStoreDir: str(params.shared_store_dir),
        direction:
          params.direction === "push" || params.direction === "pull" || params.direction === "merge"
            ? params.direction
            : "merge",
      }),
    );
    return;
  }

  throw new Error(`Unknown Mobbin capture action: ${action}`);
}

async function runPromptAction(action: string, params: JsonRecord): Promise<void> {
  const { project, artifacts } = selectArtifacts(params);
  const objective = str(params.objective) ?? "Use these Mobbin references for the requested work.";

  if (action === "feature-prompt") {
    const mode = str(params.mode) ?? "implementation";
    if (mode === "analysis") {
      console.log(buildAnalysisPrompt({ objective, artifacts, projectName: project.projectName }));
    } else if (mode === "onboarding") {
      console.log(buildOnboardingPrompt({ topic: objective, artifacts, projectName: project.projectName }));
    } else {
      console.log(buildImplementationPrompt({ objective, artifacts, projectName: project.projectName }));
    }
    return;
  }

  if (action === "implementation-prompt") {
    console.log(buildImplementationPrompt({ objective, artifacts, projectName: project.projectName }));
    return;
  }

  if (action === "analysis-prompt") {
    console.log(buildAnalysisPrompt({ objective, artifacts, projectName: project.projectName }));
    return;
  }

  if (action === "onboarding-prompt") {
    console.log(buildOnboardingPrompt({ topic: objective, artifacts, projectName: project.projectName }));
    return;
  }

  if (action === "agent-context") {
    console.log(
      buildAgentContext({
        target:
          params.target === "claude_code" ||
          params.target === "codex" ||
          params.target === "pi" ||
          params.target === "mem_palace"
            ? params.target
            : "codex",
        objective,
        artifacts,
        projectName: project.projectName,
      }),
    );
    return;
  }

  if (action === "pr-reference") {
    console.log(
      buildPrReferenceMarkdown({
        title: str(params.title) ?? "Mobbin Reference Pack",
        objective,
        artifacts,
        projectName: project.projectName,
      }),
    );
    return;
  }

  if (action === "feature-review") {
    const intended = selectArtifacts({
      ...params,
      artifact_ids: strArray(params.intended_artifact_ids),
      query: str(params.intended_query),
    }).artifacts;
    const actual = selectArtifacts({
      ...params,
      artifact_ids: strArray(params.actual_artifact_ids),
      query: str(params.actual_query),
    }).artifacts;
    console.log(
      buildFeatureReviewMarkdown({
        title: str(params.title) ?? "Feature Review",
        projectName: project.projectName,
        intendedArtifacts: intended,
        actualArtifacts: actual,
      }),
    );
    return;
  }

  throw new Error(`Unknown Mobbin prompt action: ${action}`);
}

async function runVisualAction(action: string, params: JsonRecord): Promise<void> {
  const client = await createClient();
  const projectPath = str(params.project_path);

  if (action === "contact-sheet") {
    const { artifacts } = selectArtifacts(params);
    const candidates = artifacts.flatMap((artifact) => collectArtifactVisualCandidates(artifact)).slice(0, 24);
    const items = [];
    for (const candidate of candidates) {
      try {
        const image = await client.fetchScreenImage(candidate.imageUrl);
        items.push({ label: candidate.label, buffer: image.buffer });
      } catch {
        // Keep building a partial contact sheet when one image fails.
      }
    }
    if (items.length === 0) throw new Error("No fetchable screen images found in selected artifacts.");
    const buffer = await buildContactSheet({ items, columns: num(params.columns) ?? 3 });
    const output = str(params.output_path) ?? "mobbin-contact-sheet.png";
    writeFileSync(output, buffer);
    console.log(`Generated ${output} with ${items.length} images.`);
    return;
  }

  if (action === "find-similar") {
    const index = loadProjectArtifacts(projectPath);
    const artifactId = str(params.artifact_id);
    const screenUrl = str(params.screen_url);
    let targetHashes: string[] = [];
    if (artifactId) {
      const artifact = index.artifacts.find((item) => item.id === artifactId);
      if (!artifact) throw new Error(`Artifact not found: ${artifactId}`);
      targetHashes = artifact.visualHashes;
      if (targetHashes.length === 0) {
        for (const candidate of collectArtifactVisualCandidates(artifact)) {
          const image = await client.fetchScreenImage(candidate.imageUrl);
          targetHashes.push(await computePerceptualHash(image.buffer));
        }
        updateArtifact(artifact.id, { visualHashes: targetHashes }, projectPath);
      }
    } else if (screenUrl) {
      const image = await client.fetchScreenImage(screenUrl);
      targetHashes = [await computePerceptualHash(image.buffer)];
    } else {
      throw new Error("find-similar requires `artifact_id` or `screen_url`.");
    }

    const matches = findSimilarityMatches({
      artifacts: index.artifacts,
      targetHashes,
      artifactIdToExclude: artifactId,
      maxDistance: num(params.max_distance) ?? 8,
      limit: num(params.limit) ?? 8,
    });
    console.log(
      matches.length
        ? matches
            .map(
              (match, index) =>
                `${index + 1}. **${match.artifact.title}** — distance ${match.distance}\n   ID: ${match.artifact.id}\n   Type: ${match.artifact.type}`,
            )
            .join("\n\n")
        : "No visually similar artifacts found.",
    );
    return;
  }

  if (action === "sync-collections") {
    const result = await client.getCollections();
    const ids = strArray(params.collection_ids);
    const collections = ids?.length
      ? result.value.filter((collection) => ids.includes(collection.id))
      : result.value;
    printJson(seedArtifactsFromCollections({ collections, projectPath, tags: strArray(params.tags) }));
    return;
  }

  throw new Error(`Unknown Mobbin visual action: ${action}`);
}

export async function runSkillCommand(argv = process.argv.slice(2)): Promise<void> {
  const [, action, rawPayload] = argv;
  if (!action || action === "--help" || action === "-h") {
    console.log(`Usage: mobbin-mcp skill <action> '<json-payload>'

Groups:
  Search: search-apps, search-screens, search-flows, search-sites, site-sections,
          quick-search, popular-apps, collections, filters, screen-detail
  Capture: doctor, project-context, capture, get, update, delete, search, catalog,
           captures, export, import, sync-shared-store
  Prompts: feature-prompt, implementation-prompt, analysis-prompt, onboarding-prompt,
           agent-context, pr-reference, feature-review
  Visuals: contact-sheet, find-similar, sync-collections`);
    return;
  }

  const params = readJsonArg(rawPayload);
  const searchActions = new Set([
    "search-apps",
    "search-screens",
    "search-flows",
    "search-sites",
    "site-sections",
    "quick-search",
    "popular-apps",
    "collections",
    "filters",
    "screen-detail",
  ]);
  const captureActions = new Set([
    "doctor",
    "project-context",
    "captures",
    "capture",
    "get",
    "update",
    "delete",
    "search",
    "catalog",
    "export",
    "import",
    "sync-shared-store",
  ]);
  const promptActions = new Set([
    "feature-prompt",
    "implementation-prompt",
    "analysis-prompt",
    "onboarding-prompt",
    "agent-context",
    "pr-reference",
    "feature-review",
  ]);
  const visualActions = new Set(["contact-sheet", "find-similar", "sync-collections"]);

  if (searchActions.has(action)) return runSearchAction(action, params);
  if (captureActions.has(action)) return runCaptureAction(action, params);
  if (promptActions.has(action)) return runPromptAction(action, params);
  if (visualActions.has(action)) return runVisualAction(action, params);

  throw new Error(`Unknown Mobbin skill action: ${action}`);
}
