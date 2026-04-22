import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { CHARACTER_LIMIT } from "../constants.js";
import { DATA_DIR } from "./auth-store.js";
import { resolveProjectContext } from "./project-context.js";
import type {
  AgentTarget,
  ArtifactCollectionLink,
  ArtifactDecisionStatus,
  ArtifactExportFormat,
  ArtifactSourceType,
  CapturedArtifact,
  CapturedArtifactDecision,
  CapturedArtifactReference,
  CapturedArtifactStep,
  CapturedArtifactType,
  Collection,
  ProjectArtifactCatalog,
  ProjectArtifactIndex,
} from "../types.js";

const PROJECTS_DIR = path.join(DATA_DIR, "projects");
const STORE_VERSION = 2;

function ensureParentDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeJsonAtomic(filePath: string, data: unknown): void {
  ensureParentDir(filePath);
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tmpPath, filePath);
}

function clampText(value?: string): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, CHARACTER_LIMIT);
}

function normalizeList(values?: string[]): string[] {
  return Array.from(
    new Set(
      (values ?? [])
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => value.toLowerCase()),
    ),
  );
}

function sortByOrder<T extends { order: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.order - b.order);
}

function normalizeStep(step: Partial<CapturedArtifactStep>, index: number): CapturedArtifactStep {
  return {
    order: typeof step.order === "number" ? step.order : index,
    title: clampText(step.title),
    summary: clampText(step.summary),
    screenId: clampText(step.screenId),
    screenUrl: clampText(step.screenUrl),
    patterns: normalizeList(step.patterns),
    elements: normalizeList(step.elements),
    hotspot:
      step.hotspot &&
      (typeof step.hotspot.x === "number" ||
        typeof step.hotspot.y === "number" ||
        typeof step.hotspot.width === "number" ||
        typeof step.hotspot.height === "number")
        ? {
            x: step.hotspot.x,
            y: step.hotspot.y,
            width: step.hotspot.width,
            height: step.hotspot.height,
          }
        : undefined,
  };
}

function normalizeDecisionStatus(value?: string): ArtifactDecisionStatus {
  return value === "accepted" || value === "rejected" ? value : "open";
}

function normalizeDecision(
  decision: Partial<CapturedArtifactDecision>,
): CapturedArtifactDecision | null {
  const title = clampText(decision.decision);
  const rationale = clampText(decision.rationale);
  if (!title || !rationale) return null;

  return {
    decision: title,
    rationale,
    status: normalizeDecisionStatus(decision.status),
  };
}

function normalizeReference(
  reference: Partial<CapturedArtifactReference>,
): CapturedArtifactReference | null {
  const label = clampText(reference.label);
  if (!label) return null;

  return {
    label,
    url: clampText(reference.url),
    artifactId: clampText(reference.artifactId),
    note: clampText(reference.note),
  };
}

function normalizeCollectionLink(collection: Partial<ArtifactCollectionLink>): ArtifactCollectionLink | null {
  const collectionId = clampText(collection.collectionId);
  const name = clampText(collection.name);
  if (!collectionId || !name) return null;

  return {
    collectionId,
    name,
    isPublic: Boolean(collection.isPublic),
    counts: {
      mobileApps: collection.counts?.mobileApps ?? 0,
      mobileScreens: collection.counts?.mobileScreens ?? 0,
      mobileFlows: collection.counts?.mobileFlows ?? 0,
      webApps: collection.counts?.webApps ?? 0,
      webScreens: collection.counts?.webScreens ?? 0,
      webFlows: collection.counts?.webFlows ?? 0,
    },
  };
}

function normalizeSource(value?: string): ArtifactSourceType {
  return value === "manual" || value === "derived" ? value : "mobbin";
}

function normalizeArtifact(input: Partial<CapturedArtifact>, projectId: string): CapturedArtifact {
  const steps = sortByOrder((input.steps ?? []).map((step, index) => normalizeStep(step, index)));
  const decisions = (input.decisions ?? [])
    .map((decision) => normalizeDecision(decision))
    .filter((decision): decision is CapturedArtifactDecision => Boolean(decision));
  const references = (input.references ?? [])
    .map((reference) => normalizeReference(reference))
    .filter((reference): reference is CapturedArtifactReference => Boolean(reference));
  const collections = (input.collections ?? [])
    .map((collection) => normalizeCollectionLink(collection))
    .filter((collection): collection is ArtifactCollectionLink => Boolean(collection));
  const sourceUrls = Array.from(
    new Set(
      [...(input.sourceUrls ?? []), ...(input.screenUrl ? [input.screenUrl] : [])]
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );

  return {
    id: clampText(input.id) ?? crypto.randomUUID(),
    type: (input.type as CapturedArtifactType) ?? "reference",
    title: clampText(input.title) ?? "Untitled artifact",
    summary: clampText(input.summary) ?? "No summary provided.",
    source: normalizeSource(input.source),
    tags: normalizeList(input.tags),
    notes: clampText(input.notes),
    appName: clampText(input.appName),
    platform: clampText(input.platform),
    featureArea: clampText(input.featureArea),
    journeyName: clampText(input.journeyName),
    sessionName: clampText(input.sessionName),
    participants: normalizeList(input.participants),
    implementationHints: (input.implementationHints ?? [])
      .map((hint) => clampText(hint))
      .filter((hint): hint is string => Boolean(hint)),
    decisions,
    references,
    collections,
    steps,
    visualHashes: normalizeList(input.visualHashes),
    sourceUrls,
    screenUrl: clampText(input.screenUrl),
    flowName: clampText(input.flowName),
    patterns: normalizeList([
      ...(input.patterns ?? []),
      ...steps.flatMap((step) => step.patterns),
    ]),
    elements: normalizeList([
      ...(input.elements ?? []),
      ...steps.flatMap((step) => step.elements),
    ]),
    relatedArtifactIds: normalizeList(input.relatedArtifactIds),
    projectId,
    createdAt: clampText(input.createdAt) ?? new Date().toISOString(),
    updatedAt: clampText(input.updatedAt) ?? new Date().toISOString(),
  };
}

function scoreArtifact(artifact: CapturedArtifact, query?: string): number {
  if (!query) return 1;

  const haystack = [
    artifact.title,
    artifact.summary,
    artifact.notes,
    artifact.appName,
    artifact.featureArea,
    artifact.journeyName,
    artifact.sessionName,
    artifact.flowName,
    artifact.tags.join(" "),
    artifact.patterns.join(" "),
    artifact.elements.join(" "),
    artifact.participants.join(" "),
    artifact.implementationHints.join(" "),
    artifact.decisions.map((decision) => `${decision.decision} ${decision.rationale}`).join(" "),
    artifact.references.map((reference) => `${reference.label} ${reference.note ?? ""}`).join(" "),
    artifact.steps
      .map((step) => `${step.title ?? ""} ${step.summary ?? ""} ${step.patterns.join(" ")} ${step.elements.join(" ")}`)
      .join(" "),
    artifact.sourceUrls.join(" "),
    artifact.collections.map((collection) => `${collection.collectionId} ${collection.name}`).join(" "),
    artifact.visualHashes.join(" "),
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();

  let score = 0;
  for (const token of query.split(/\s+/).filter(Boolean)) {
    if (haystack.includes(token)) score += 2;
    if (artifact.title.toLowerCase().includes(token)) score += 5;
    if (artifact.tags.includes(token)) score += 4;
    if (artifact.type === token) score += 3;
    if (artifact.featureArea?.toLowerCase().includes(token)) score += 3;
  }

  return score;
}

function formatSteps(steps: CapturedArtifactStep[]): string[] {
  if (steps.length === 0) return [];

  return [
    "- **Steps**:",
    ...sortByOrder(steps).map((step) => {
      const details = [
        step.title ?? `Step ${step.order + 1}`,
        step.summary,
        step.screenUrl,
        step.patterns.length > 0 ? `patterns: ${step.patterns.join(", ")}` : "",
        step.elements.length > 0 ? `elements: ${step.elements.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join(" | ");
      return `  ${step.order + 1}. ${details}`;
    }),
  ];
}

function formatDecisions(decisions: CapturedArtifactDecision[]): string[] {
  if (decisions.length === 0) return [];
  return [
    "- **Decisions**:",
    ...decisions.map(
      (decision, index) =>
        `  ${index + 1}. [${decision.status}] ${decision.decision} — ${decision.rationale}`,
    ),
  ];
}

function formatImplementationHints(hints: string[]): string[] {
  if (hints.length === 0) return [];
  return ["- **Implementation Hints**:", ...hints.map((hint, index) => `  ${index + 1}. ${hint}`)];
}

function formatReferences(references: CapturedArtifactReference[]): string[] {
  if (references.length === 0) return [];
  return [
    "- **References**:",
    ...references.map((reference, index) =>
      [
        `  ${index + 1}. ${reference.label}`,
        reference.url ? ` (${reference.url})` : "",
        reference.artifactId ? ` [artifact: ${reference.artifactId}]` : "",
        reference.note ? ` — ${reference.note}` : "",
      ].join(""),
    ),
  ];
}

function formatCollections(collections: ArtifactCollectionLink[]): string[] {
  if (collections.length === 0) return [];
  return [
    "- **Collections**:",
    ...collections.map(
      (collection, index) =>
        `  ${index + 1}. ${collection.name} [${collection.collectionId}] — mobile(${collection.counts.mobileApps} apps, ${collection.counts.mobileScreens} screens, ${collection.counts.mobileFlows} flows), web(${collection.counts.webApps} apps, ${collection.counts.webScreens} screens, ${collection.counts.webFlows} flows)`,
    ),
  ];
}

export function getProjectStorePath(projectId: string): string {
  return path.join(PROJECTS_DIR, projectId, "artifacts.json");
}

export function loadProjectArtifacts(projectPath?: string): ProjectArtifactIndex {
  const project = resolveProjectContext(projectPath);
  const storePath = getProjectStorePath(project.projectId);

  try {
    const raw = JSON.parse(fs.readFileSync(storePath, "utf-8")) as Partial<ProjectArtifactIndex>;
    if (Array.isArray(raw.artifacts)) {
      return {
        version: STORE_VERSION,
        project,
        artifacts: raw.artifacts.map((artifact) => normalizeArtifact(artifact, project.projectId)),
      };
    }
  } catch {
    // Fall back to an empty index.
  }

  return {
    version: STORE_VERSION,
    project,
    artifacts: [],
  };
}

export function saveProjectArtifacts(index: ProjectArtifactIndex): void {
  writeJsonAtomic(getProjectStorePath(index.project.projectId), {
    ...index,
    version: STORE_VERSION,
  });
}

export function createArtifact(input: {
  projectPath?: string;
  type: CapturedArtifactType;
  title: string;
  summary: string;
  source?: ArtifactSourceType;
  tags?: string[];
  notes?: string;
  appName?: string;
  platform?: string;
  featureArea?: string;
  journeyName?: string;
  sessionName?: string;
  participants?: string[];
  implementationHints?: string[];
  decisions?: CapturedArtifactDecision[];
  references?: CapturedArtifactReference[];
  collections?: ArtifactCollectionLink[];
  steps?: CapturedArtifactStep[];
  visualHashes?: string[];
  sourceUrls?: string[];
  screenUrl?: string;
  flowName?: string;
  patterns?: string[];
  elements?: string[];
  relatedArtifactIds?: string[];
}): CapturedArtifact {
  const now = new Date().toISOString();
  const project = resolveProjectContext(input.projectPath);

  return normalizeArtifact(
    {
      ...input,
      source: input.source ?? "mobbin",
      createdAt: now,
      updatedAt: now,
    },
    project.projectId,
  );
}

export function upsertArtifact(artifact: CapturedArtifact, projectPath?: string): ProjectArtifactIndex {
  const index = loadProjectArtifacts(projectPath);
  const existingIndex = index.artifacts.findIndex((item) => item.id === artifact.id);
  const normalized = normalizeArtifact(
    {
      ...artifact,
      updatedAt: new Date().toISOString(),
      createdAt: artifact.createdAt,
    },
    index.project.projectId,
  );

  if (existingIndex >= 0) {
    index.artifacts[existingIndex] = normalized;
  } else {
    index.artifacts.unshift(normalized);
  }

  saveProjectArtifacts(index);
  return index;
}

export function mergeArtifacts(
  existingArtifacts: CapturedArtifact[],
  incomingArtifacts: CapturedArtifact[],
): CapturedArtifact[] {
  const byId = new Map(existingArtifacts.map((artifact) => [artifact.id, artifact]));

  for (const artifact of incomingArtifacts) {
    const existing = byId.get(artifact.id);
    if (!existing || Date.parse(artifact.updatedAt) >= Date.parse(existing.updatedAt)) {
      byId.set(artifact.id, artifact);
    }
  }

  return Array.from(byId.values()).sort(
    (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
  );
}

export function getArtifactById(
  artifactId: string,
  projectPath?: string,
): { project: ProjectArtifactIndex["project"]; artifact: CapturedArtifact | null } {
  const index = loadProjectArtifacts(projectPath);
  return {
    project: index.project,
    artifact: index.artifacts.find((artifact) => artifact.id === artifactId) ?? null,
  };
}

export function updateArtifact(
  artifactId: string,
  patch: Partial<CapturedArtifact>,
  projectPath?: string,
): { project: ProjectArtifactIndex["project"]; artifact: CapturedArtifact | null } {
  const index = loadProjectArtifacts(projectPath);
  const existing = index.artifacts.find((artifact) => artifact.id === artifactId);
  if (!existing) {
    return { project: index.project, artifact: null };
  }

  const updated = normalizeArtifact(
    {
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    },
    index.project.projectId,
  );

  const nextIndex = upsertArtifact(updated, projectPath);
  return {
    project: nextIndex.project,
    artifact: updated,
  };
}

export function deleteArtifact(
  artifactId: string,
  projectPath?: string,
): { project: ProjectArtifactIndex["project"]; deleted: boolean; artifactCount: number } {
  const index = loadProjectArtifacts(projectPath);
  const nextArtifacts = index.artifacts.filter((artifact) => artifact.id !== artifactId);
  const deleted = nextArtifacts.length !== index.artifacts.length;

  if (deleted) {
    index.artifacts = nextArtifacts;
    saveProjectArtifacts(index);
  }

  return {
    project: index.project,
    deleted,
    artifactCount: nextArtifacts.length,
  };
}

export function searchArtifacts(params: {
  projectPath?: string;
  query?: string;
  tags?: string[];
  type?: CapturedArtifactType;
  appName?: string;
  featureArea?: string;
  limit?: number;
}): { project: ProjectArtifactIndex["project"]; results: CapturedArtifact[] } {
  const index = loadProjectArtifacts(params.projectPath);
  const query = params.query?.trim().toLowerCase();
  const tags = normalizeList(params.tags);
  const appName = params.appName?.trim().toLowerCase();
  const featureArea = params.featureArea?.trim().toLowerCase();
  const limit = Math.max(1, Math.min(params.limit ?? 10, 50));

  const scored = index.artifacts
    .filter((artifact) => !params.type || artifact.type === params.type)
    .filter((artifact) => tags.length === 0 || tags.every((tag) => artifact.tags.includes(tag)))
    .filter((artifact) => !appName || artifact.appName?.toLowerCase() === appName)
    .filter((artifact) => !featureArea || artifact.featureArea?.toLowerCase() === featureArea)
    .map((artifact) => ({ artifact, score: scoreArtifact(artifact, query) }))
    .filter((entry) => !query || entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return Date.parse(b.artifact.updatedAt) - Date.parse(a.artifact.updatedAt);
    });

  return {
    project: index.project,
    results: scored.slice(0, limit).map((entry) => entry.artifact),
  };
}

export function buildArtifactCatalog(projectPath?: string): {
  project: ProjectArtifactIndex["project"];
  catalog: ProjectArtifactCatalog;
} {
  const index = loadProjectArtifacts(projectPath);
  const catalog: ProjectArtifactCatalog = {
    totalArtifacts: index.artifacts.length,
    byType: {},
    byTag: {},
    byAppName: {},
    byPlatform: {},
    byFeatureArea: {},
    byPattern: {},
    byElement: {},
  };

  const bump = (bucket: Record<string, number>, value?: string) => {
    if (!value) return;
    bucket[value] = (bucket[value] ?? 0) + 1;
  };

  for (const artifact of index.artifacts) {
    bump(catalog.byType, artifact.type);
    bump(catalog.byAppName, artifact.appName);
    bump(catalog.byPlatform, artifact.platform);
    bump(catalog.byFeatureArea, artifact.featureArea);
    for (const tag of artifact.tags) bump(catalog.byTag, tag);
    for (const pattern of artifact.patterns) bump(catalog.byPattern, pattern);
    for (const element of artifact.elements) bump(catalog.byElement, element);
  }

  return {
    project: index.project,
    catalog,
  };
}

export function formatArtifactList(artifacts: CapturedArtifact[]): string {
  if (artifacts.length === 0) {
    return "No captured artifacts found.";
  }

  return artifacts
    .map((artifact, index) =>
      [
        `### ${index + 1}. ${artifact.title}`,
        `- **ID**: ${artifact.id}`,
        `- **Type**: ${artifact.type}`,
        `- **Source**: ${artifact.source}`,
        `- **Summary**: ${artifact.summary}`,
        artifact.appName ? `- **App**: ${artifact.appName}` : "",
        artifact.flowName ? `- **Flow**: ${artifact.flowName}` : "",
        artifact.featureArea ? `- **Feature Area**: ${artifact.featureArea}` : "",
        artifact.journeyName ? `- **Journey**: ${artifact.journeyName}` : "",
        artifact.sessionName ? `- **Session**: ${artifact.sessionName}` : "",
        artifact.platform ? `- **Platform**: ${artifact.platform}` : "",
        artifact.tags.length > 0 ? `- **Tags**: ${artifact.tags.join(", ")}` : "",
        artifact.patterns.length > 0 ? `- **Patterns**: ${artifact.patterns.join(", ")}` : "",
        artifact.elements.length > 0 ? `- **Elements**: ${artifact.elements.join(", ")}` : "",
        artifact.participants.length > 0 ? `- **Participants**: ${artifact.participants.join(", ")}` : "",
        artifact.visualHashes.length > 0 ? `- **Visual Hashes**: ${artifact.visualHashes.join(", ")}` : "",
        artifact.screenUrl ? `- **Screen URL**: ${artifact.screenUrl}` : "",
        artifact.sourceUrls.length > 0 ? `- **Sources**: ${artifact.sourceUrls.join(", ")}` : "",
        artifact.notes ? `- **Notes**: ${artifact.notes}` : "",
        ...formatImplementationHints(artifact.implementationHints),
        ...formatDecisions(artifact.decisions),
        ...formatReferences(artifact.references),
        ...formatCollections(artifact.collections),
        ...formatSteps(artifact.steps),
        `- **Updated**: ${artifact.updatedAt}`,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
}

function formatArtifactForPrompt(artifact: CapturedArtifact, index: number): string {
  return [
    `${index + 1}. ${artifact.title} [${artifact.type}]`,
    `Summary: ${artifact.summary}`,
    artifact.appName ? `App: ${artifact.appName}` : "",
    artifact.featureArea ? `Feature Area: ${artifact.featureArea}` : "",
    artifact.journeyName ? `Journey: ${artifact.journeyName}` : "",
    artifact.flowName ? `Flow: ${artifact.flowName}` : "",
    artifact.tags.length > 0 ? `Tags: ${artifact.tags.join(", ")}` : "",
    artifact.patterns.length > 0 ? `Patterns: ${artifact.patterns.join(", ")}` : "",
    artifact.elements.length > 0 ? `Elements: ${artifact.elements.join(", ")}` : "",
    artifact.implementationHints.length > 0
      ? `Implementation Hints: ${artifact.implementationHints.join(" | ")}`
      : "",
    artifact.decisions.length > 0
      ? `Decisions: ${artifact.decisions.map((decision) => `[${decision.status}] ${decision.decision}: ${decision.rationale}`).join(" | ")}`
      : "",
    artifact.notes ? `Notes: ${artifact.notes}` : "",
    artifact.sourceUrls.length > 0 ? `Source URLs: ${artifact.sourceUrls.join(", ")}` : "",
    artifact.collections.length > 0
      ? `Collections: ${artifact.collections.map((collection) => collection.name).join(", ")}`
      : "",
    artifact.steps.length > 0
      ? `Steps: ${sortByOrder(artifact.steps)
          .map((step) => `${step.order + 1}. ${step.title ?? "Step"}${step.summary ? ` - ${step.summary}` : ""}`)
          .join(" | ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildImplementationPrompt(params: {
  objective: string;
  artifacts: CapturedArtifact[];
  projectName: string;
}): string {
  const artifactBlocks = params.artifacts.length
    ? params.artifacts.map((artifact, index) => formatArtifactForPrompt(artifact, index)).join("\n\n")
    : "No captured artifacts were selected.";

  return [
    `You are implementing a feature for the project "${params.projectName}".`,
    "",
    "Objective:",
    params.objective.trim(),
    "",
    "Relevant captured references:",
    artifactBlocks,
    "",
    "Instructions:",
    "- Extract the common UI patterns, interaction flow, and implementation cues from the references.",
    "- Produce a concrete implementation plan before coding.",
    "- Call out assumptions, missing details, and any deviation from the captured references.",
    "- Prefer reuse of established patterns over inventing new ones unless the references conflict.",
  ].join("\n");
}

export function buildAnalysisPrompt(params: {
  objective: string;
  artifacts: CapturedArtifact[];
  projectName: string;
}): string {
  const artifactBlocks = params.artifacts.length
    ? params.artifacts.map((artifact, index) => formatArtifactForPrompt(artifact, index)).join("\n\n")
    : "No captured artifacts were selected.";

  return [
    `You are analyzing an implemented feature in the project "${params.projectName}".`,
    "",
    "Analysis goal:",
    params.objective.trim(),
    "",
    "Reference material:",
    artifactBlocks,
    "",
    "Instructions:",
    "- Compare intended flow, interaction patterns, and implementation expectations against the current product behavior.",
    "- Call out gaps, ambiguities, regressions, and places where the shipped UI diverges from the references.",
    "- End with a concrete remediation plan ordered by impact.",
  ].join("\n");
}

export function buildOnboardingPrompt(params: {
  topic: string;
  artifacts: CapturedArtifact[];
  projectName: string;
}): string {
  const artifactBlocks = params.artifacts.length
    ? params.artifacts.map((artifact, index) => formatArtifactForPrompt(artifact, index)).join("\n\n")
    : "No captured artifacts were selected.";

  return [
    `Create an onboarding brief for the project "${params.projectName}".`,
    "",
    "Topic:",
    params.topic.trim(),
    "",
    "Source captures:",
    artifactBlocks,
    "",
    "Instructions:",
    "- Explain the user journey, key UI patterns, and implementation details a new teammate should understand.",
    "- Highlight important terminology, decisions, and pitfalls.",
    "- Organize the brief for fast ramp-up rather than exhaustive documentation.",
  ].join("\n");
}

export function buildAgentContext(params: {
  target: AgentTarget;
  objective: string;
  artifacts: CapturedArtifact[];
  projectName: string;
}): string {
  if (params.target === "mem_palace") {
    return params.artifacts
      .map((artifact) =>
        JSON.stringify({
          content: `${artifact.title}\n${artifact.summary}\n${artifact.notes ?? ""}`.trim(),
          metadata: {
            project: params.projectName,
            artifact_id: artifact.id,
            type: artifact.type,
            tags: artifact.tags,
            app_name: artifact.appName,
            feature_area: artifact.featureArea,
            flow_name: artifact.flowName,
            source_urls: artifact.sourceUrls,
          },
        }),
      )
      .join("\n");
  }

  const prompt =
    params.target === "pi"
      ? buildOnboardingPrompt({
          topic: params.objective,
          artifacts: params.artifacts,
          projectName: params.projectName,
        })
      : buildImplementationPrompt({
          objective: params.objective,
          artifacts: params.artifacts,
          projectName: params.projectName,
        });

  const agentPreamble =
    params.target === "claude_code"
      ? "Target agent: Claude Code\nUse the MCP tools and project context directly."
      : params.target === "codex"
        ? "Target agent: Codex\nUse repo context, produce an implementation plan, then make code changes."
        : "Target agent: Pi\nUse the material as conversational design and product context.";

  return [agentPreamble, "", prompt].join("\n");
}

function serializeArtifactsAsMarkdown(projectName: string, artifacts: CapturedArtifact[]): string {
  return [`# ${projectName} Captured Artifacts`, "", formatArtifactList(artifacts)].join("\n");
}

function serializeArtifactsAsPromptPack(
  projectName: string,
  objective: string,
  artifacts: CapturedArtifact[],
  target: AgentTarget,
): string {
  return buildAgentContext({
    target,
    objective,
    artifacts,
    projectName,
  });
}

export function buildPrReferenceMarkdown(params: {
  title: string;
  objective: string;
  artifacts: CapturedArtifact[];
  projectName: string;
}): string {
  const references =
    params.artifacts.length > 0
      ? params.artifacts
          .map((artifact) =>
            [
              `- **${artifact.title}** [${artifact.type}]`,
              artifact.summary ? `  - Summary: ${artifact.summary}` : "",
              artifact.appName ? `  - App: ${artifact.appName}` : "",
              artifact.featureArea ? `  - Feature Area: ${artifact.featureArea}` : "",
              artifact.screenUrl ? `  - Screen: ${artifact.screenUrl}` : "",
              artifact.sourceUrls.length > 0 ? `  - Sources: ${artifact.sourceUrls.join(", ")}` : "",
              artifact.implementationHints.length > 0
                ? `  - Implementation hints: ${artifact.implementationHints.join(" | ")}`
                : "",
            ]
              .filter(Boolean)
              .join("\n"),
          )
          .join("\n\n")
      : "- No captured artifacts were selected.";

  return [
    `# ${params.title}`,
    "",
    `Project: ${params.projectName}`,
    "",
    "## Objective",
    params.objective.trim(),
    "",
    "## Reference Artifacts",
    references,
    "",
    "## Reviewer Checklist",
    "- Verify the implementation follows the referenced flow and UI patterns.",
    "- Check any implementation hints and decisions listed above were respected or intentionally changed.",
    "- Call out deviations from the saved references in the PR description.",
  ].join("\n");
}

function diffList(intended: string[], actual: string[]): {
  shared: string[];
  intendedOnly: string[];
  actualOnly: string[];
} {
  const intendedSet = new Set(intended);
  const actualSet = new Set(actual);
  const shared = intended.filter((value) => actualSet.has(value));
  const intendedOnly = intended.filter((value) => !actualSet.has(value));
  const actualOnly = actual.filter((value) => !intendedSet.has(value));
  return { shared, intendedOnly, actualOnly };
}

export function buildFeatureReviewMarkdown(params: {
  title: string;
  projectName: string;
  intendedArtifacts: CapturedArtifact[];
  actualArtifacts: CapturedArtifact[];
}): string {
  const intendedPatterns = normalizeList(params.intendedArtifacts.flatMap((artifact) => artifact.patterns));
  const actualPatterns = normalizeList(params.actualArtifacts.flatMap((artifact) => artifact.patterns));
  const intendedElements = normalizeList(params.intendedArtifacts.flatMap((artifact) => artifact.elements));
  const actualElements = normalizeList(params.actualArtifacts.flatMap((artifact) => artifact.elements));
  const intendedTags = normalizeList(params.intendedArtifacts.flatMap((artifact) => artifact.tags));
  const actualTags = normalizeList(params.actualArtifacts.flatMap((artifact) => artifact.tags));

  const patternDiff = diffList(intendedPatterns, actualPatterns);
  const elementDiff = diffList(intendedElements, actualElements);
  const tagDiff = diffList(intendedTags, actualTags);

  return [
    `# ${params.title}`,
    "",
    `Project: ${params.projectName}`,
    "",
    "## Intended References",
    params.intendedArtifacts.length > 0 ? formatArtifactList(params.intendedArtifacts) : "No intended artifacts selected.",
    "",
    "## Actual References",
    params.actualArtifacts.length > 0 ? formatArtifactList(params.actualArtifacts) : "No actual artifacts selected.",
    "",
    "## Diff Summary",
    `- Shared patterns: ${patternDiff.shared.join(", ") || "none"}`,
    `- Intended-only patterns: ${patternDiff.intendedOnly.join(", ") || "none"}`,
    `- Actual-only patterns: ${patternDiff.actualOnly.join(", ") || "none"}`,
    `- Shared elements: ${elementDiff.shared.join(", ") || "none"}`,
    `- Intended-only elements: ${elementDiff.intendedOnly.join(", ") || "none"}`,
    `- Actual-only elements: ${elementDiff.actualOnly.join(", ") || "none"}`,
    `- Shared tags: ${tagDiff.shared.join(", ") || "none"}`,
    `- Intended-only tags: ${tagDiff.intendedOnly.join(", ") || "none"}`,
    `- Actual-only tags: ${tagDiff.actualOnly.join(", ") || "none"}`,
    "",
    "## Review Prompts",
    "- Which intended interactions are missing from the shipped flow?",
    "- Which shipped patterns do not appear in the intended references?",
    "- Are any implementation decisions contradicted by the actual UI?",
  ].join("\n");
}

export function seedArtifactsFromCollections(params: {
  collections: Collection[];
  projectPath?: string;
  tags?: string[];
}): { project: ProjectArtifactIndex["project"]; createdArtifacts: CapturedArtifact[]; totalArtifacts: number } {
  const project = resolveProjectContext(params.projectPath);
  const createdArtifacts = params.collections.map((collection) =>
    createArtifact({
      projectPath: params.projectPath,
      type: "reference",
      source: "mobbin",
      title: `Collection: ${collection.name}`,
      summary:
        collection.description?.trim() ||
        `Seeded from Mobbin collection ${collection.name} with ${collection.mobileScreensCount + collection.webScreensCount} screens and ${collection.mobileFlowsCount + collection.webFlowsCount} flows.`,
      tags: ["collection", ...(params.tags ?? []), collection.isPublic ? "public" : "private"],
      notes: collection.description || undefined,
      sessionName: collection.name,
      sourceUrls: collection.mobilePreviewScreens.map((screen) => screen.screenUrl),
      screenUrl: collection.mobilePreviewScreens[0]?.screenUrl,
      references: [
        {
          label: `Mobbin collection ${collection.name}`,
          note: `Collection ID ${collection.id}`,
        },
      ],
      collections: [
        {
          collectionId: collection.id,
          name: collection.name,
          isPublic: collection.isPublic,
          counts: {
            mobileApps: collection.mobileAppsCount,
            mobileScreens: collection.mobileScreensCount,
            mobileFlows: collection.mobileFlowsCount,
            webApps: collection.webAppsCount,
            webScreens: collection.webScreensCount,
            webFlows: collection.webFlowsCount,
          },
        },
      ],
      steps: collection.mobilePreviewScreens.map((screen, index) => ({
        order: index,
        title: `Preview ${index + 1}`,
        screenUrl: screen.screenUrl,
        patterns: [],
        elements: [],
      })),
    }),
  );

  const index = loadProjectArtifacts(params.projectPath);
  index.artifacts = mergeArtifacts(index.artifacts, createdArtifacts);
  saveProjectArtifacts(index);

  return {
    project: project,
    createdArtifacts,
    totalArtifacts: index.artifacts.length,
  };
}

export function exportArtifacts(params: {
  projectPath?: string;
  artifacts: CapturedArtifact[];
  format: ArtifactExportFormat;
  objective?: string;
  targetAgent?: AgentTarget;
}): { project: ProjectArtifactIndex["project"]; output: string } {
  const index = loadProjectArtifacts(params.projectPath);
  const target = params.targetAgent ?? "codex";

  const output =
    params.format === "json"
      ? JSON.stringify({ project: index.project, artifacts: params.artifacts }, null, 2)
      : params.format === "markdown"
        ? serializeArtifactsAsMarkdown(index.project.projectName, params.artifacts)
        : params.format === "pr_markdown"
          ? buildPrReferenceMarkdown({
              title: `PR Reference Pack`,
              objective: params.objective ?? "Reference artifacts for the implementation in this pull request.",
              artifacts: params.artifacts,
              projectName: index.project.projectName,
            })
        : params.format === "mem_palace_jsonl"
          ? buildAgentContext({
              target: "mem_palace",
              objective: params.objective ?? "Persist these design references as durable memories.",
              artifacts: params.artifacts,
              projectName: index.project.projectName,
            })
          : serializeArtifactsAsPromptPack(
              index.project.projectName,
              params.objective ?? "Use these artifacts as implementation context.",
              params.artifacts,
              target,
            );

  return {
    project: index.project,
    output,
  };
}

export function importArtifacts(params: {
  projectPath?: string;
  payload: string;
  mergeStrategy?: "append" | "replace";
}): { project: ProjectArtifactIndex["project"]; imported: number; totalArtifacts: number } {
  const index = loadProjectArtifacts(params.projectPath);
  const parsed = JSON.parse(params.payload) as
    | ProjectArtifactIndex
    | { artifacts: CapturedArtifact[] }
    | CapturedArtifact[];
  const importedArtifacts = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.artifacts)
      ? parsed.artifacts
      : [];
  const normalized = importedArtifacts.map((artifact) =>
    normalizeArtifact(
      {
        ...artifact,
        id: artifact.id ?? crypto.randomUUID(),
      },
      index.project.projectId,
    ),
  );

  if (params.mergeStrategy === "replace") {
    index.artifacts = normalized;
  } else {
    index.artifacts = mergeArtifacts(index.artifacts, normalized);
  }

  saveProjectArtifacts(index);
  return {
    project: index.project,
    imported: normalized.length,
    totalArtifacts: index.artifacts.length,
  };
}
