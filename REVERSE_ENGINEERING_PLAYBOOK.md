# Reverse-Engineering Playbook

> Lessons learned from reverse-engineering **Mobbin** (internal Next.js + Supabase API) —
> packaged as a portable playbook for the next target: **Framer.com** site extraction
> → self-hosted Astro / Cloudflare / open-source stack.

This document is the handoff. Give it to a fresh project whose job is to pull
your existing Framer-published sites out of Framer and rebuild them on an
open-source, self-hostable runtime (Astro, Cloudflare Workers Sites, WordPress-on-Workers,
11ty, Next.js on your own infra — whichever fits).

---

## 1. Mental Model: What Reverse-Engineering a SaaS Frontend Actually Is

Reverse-engineering a SaaS product is **not** scraping HTML. It is:

1. **Identifying the runtime** — what framework renders pages, where state lives, where assets live.
2. **Mapping the private API** — the endpoints the official UI calls, their request/response shapes, auth model.
3. **Mapping the asset CDN** — images, videos, fonts, and how the URLs are constructed / signed.
4. **Rebuilding a clean data model** from the observed shapes (not the internal one — *your* portable one).
5. **Writing an adapter** that turns the private API into something you own (static files, a DB, MDX, JSON, etc).
6. **Writing a migration/export tool** that turns that adapter output into your target stack's source tree.

For Mobbin, steps 1–5 happened inside an MCP server. For Framer, the target is *exporting your own sites* rather than querying a live service — but the same five steps apply; step 6 becomes the primary deliverable.

---

## 2. What Worked When We Reverse-Engineered Mobbin

### 2.1 Start at the network layer, not the HTML

The single most valuable tool was the browser DevTools **Network tab** + **Playwright** replay. HTML gives you the rendered snapshot; the network tab gives you the **data contract**. Everything worth stealing — app lists, screen metadata, flow graphs, pagination, filters — was in JSON over `/api/...`.

Lesson: **trust XHR/fetch traffic over DOM scraping.** DOM shapes change; API shapes are versioned more slowly because they'd break the product's own clients.

### 2.2 Identify the stack before writing any code

Before writing an HTTP client we confirmed:

- Frontend: Next.js (visible via `_next/static/...`, `/_next/data/...` hints, `__NEXT_DATA__` in HTML).
- Backend: Supabase (`ujasntkfphywizsdaapi.supabase.co` visible in cookies + storage URLs).
- Auth: Supabase cookie-based (`sb-<project-ref>-auth-token.0` / `.1`) — **not** localStorage.
- Media: Bytescale CDN (`bytescale.mobbin.com`) + Supabase Storage (raw).
- Feature flags: GrowthBook (`cdn.growthbook.io`).
- Payments: Stripe.

**Do the same for Framer before writing code.** Framer publishes statically (mostly) with a client runtime + assets on their CDN. The shape you'll capture looks very different — closer to "crawl + rewrite" than "replay API calls" — and that changes the whole playbook (see §6).

### 2.3 Reuse the session instead of re-authenticating

Mobbin uses Google OAuth → Supabase. Reimplementing that flow was unnecessary. We **take the logged-in user's session cookie** via an `auth` CLI command and let the MCP refresh the token itself.

```
~/.mobbin-mcp/auth.json
```

Lesson: **don't reimplement OAuth; copy the session.** For Framer, the session cookie for framer.com (or an API token if they have one for team owners) is the right authentication surface. Keep credentials in a `~/.framer-export/auth.json` and treat it as machine-scoped state.

### 2.4 Treat the private API as a contract, then wrap it

Once we mapped the endpoints (see `API_DISCOVERY.md`), we wrote a small typed client (`src/services/api-client.ts`) with:

- Timeout + abort controller on every request.
- In-memory cache with TTL and in-flight coalescing (two parallel calls for the same key share one fetch).
- A single cookie-refresh path.
- Strong TypeScript types (`AppResult`, `ScreenResult`, `FlowResult`, …).

This is the minimum viable shape. For Framer, the equivalent is a typed wrapper around whatever endpoints serve: site list, page list, asset manifest, code component source, fonts, CMS collection contents.

### 2.5 Separate "fetch" from "capture" from "render"

The biggest architectural win in the Mobbin MCP was keeping three layers distinct:

| Layer | Responsibility | Mobbin file |
|---|---|---|
| Fetch | Talk to the private API | `src/services/api-client.ts` |
| Capture | Persist normalized artifacts locally | `src/utils/artifact-store.ts` |
| Render | Turn artifacts into prompts / markdown / contact sheets | `src/utils/visuals.ts`, generator tools |

For Framer-export the same split becomes:

| Layer | Responsibility |
|---|---|
| Fetch | Pull published pages, assets, code components, CMS rows, fonts |
| Capture | Normalize into a portable JSON tree + asset directory |
| Render | Emit Astro / 11ty / WordPress source files |

**Do not collapse these.** If rendering is coupled to fetching, you can't re-render into a second target (e.g. Astro *and* Cloudflare Pages + WP) without re-fetching.

### 2.6 Project-aware local storage

Mobbin MCP detects the active repo (git remote → env var → cwd) and stores artifacts under `~/.mobbin-mcp/projects/<project-id>/artifacts.json`. This made captures portable across sessions and agents.

For Framer-export, mirror this:

```
~/.framer-export/
  auth.json
  sites/
    <framer-site-id>/
      manifest.json        # pages, routes, locales, metadata
      pages/<slug>.json    # normalized page model
      assets/              # images, videos, fonts (by hash)
      cms/<collection>.json
      code/<component>.tsx
```

Keying by site ID (not by URL) means renames don't orphan captures.

### 2.7 Export formats matter more than the store

Mobbin MCP exports artifacts as JSON, Markdown, prompt-packs, and Mem Palace JSONL. Each consumer wanted a different shape; keeping them as separate *render targets* over a single capture store was the right call.

For Framer, plan the export targets up front:

- **Astro source tree** (primary).
- **WordPress-on-Cloudflare** (the new WP-style you mentioned).
- **11ty / Hugo / Next.js** (keep the door open — swap a renderer).
- **Raw portable JSON** (future-proof; lets you re-render years later).

One capture, many render targets.

### 2.8 Doctor / diagnostics tool from day one

`mobbin_doctor` inspects auth, project detection, artifact storage, and runtime health in one call. This saved *hours* of "why isn't it working" debugging.

Build `framer-export doctor` on day one. It should report: auth state, target site visibility, asset CDN reachability, disk quota for the capture dir, renderer availability (is `astro` installed? is the target repo writable?).

### 2.9 Capture the asset CDN URL *pattern*, not the URL

We captured the **shape** of media URLs:

```
https://<project>.supabase.co/storage/v1/object/public/content/app_screens/{uuid}.png
https://bytescale.mobbin.com/FW25bBB/image/mobbin.com/prod/file.webp?enc=...
```

That let us derive URLs without round-tripping, and also rewrite them on export (e.g. to your own R2 bucket). Framer has a similar pattern — `framerusercontent.com` for assets, with hash-based filenames. Capture the pattern and build a **URL rewriter** into your renderer so assets point at your own CDN after migration.

### 2.10 Pagination, filters, and taxonomies are the *real* API

The most underrated Mobbin endpoint was `/api/filter-tags/fetch-dictionary-definitions` — a single call that returns the entire taxonomy (categories, screen patterns, UI elements, flow actions). Without it you're guessing enum values.

For Framer, the equivalents to hunt for:
- The site manifest / route table (one call, all pages).
- The asset manifest (one call, all media refs).
- The CMS schema (one call, all collections + field types).

**Find the one endpoint that gives you the whole taxonomy.** Everything else is easier after that.

---

## 3. What We Wish We'd Done Earlier

1. **Write a live recorder first.** Before any client code, put Playwright in record-mode, click through the product, and dump every XHR to a `.har` file. That file becomes your ground-truth spec. For Framer: open each of your sites in preview + edit mode and record.
2. **Snapshot the response types as JSON fixtures, not prose.** Markdown docs drift from reality. Saved JSON fixtures + a runtime validator (Zod) don't.
3. **Version your captured artifact schema from v1.** Mobbin's artifact shape grew organically and we paid for it with migration code. Start `{"schemaVersion": 1, ...}` on day one.
4. **Separate "machine-local" state from "project-local" state early.** Auth is machine-scoped; captures are project-scoped; exports are target-scoped. Collapsing these is painful to unwind.
5. **Commit a `CAPTURES_FIXTURE.json` test harness.** It lets CI exercise the renderer without hitting the live service.

---

## 4. Anti-Patterns to Avoid

- **Don't scrape the rendered HTML if JSON is available.** HTML changes per deploy.
- **Don't embed auth tokens in code or commits.** Use a config dir and env override (`MOBBIN_DATA_DIR`, `MOBBIN_AUTH_FILE`). Mirror this: `FRAMER_DATA_DIR`, `FRAMER_AUTH_FILE`.
- **Don't over-model.** Capture what you observe; don't invent fields "for future use." Mobbin's artifact model got wide fast and most fields were only ever used in one renderer.
- **Don't couple the exporter to a single target.** "Just emit Astro" becomes a trap the moment you want WP-on-Workers.
- **Don't reimplement features the host still provides.** If Framer serves your site fine and you only need archive/export, do *just that* — don't build a CMS.
- **Don't let feature flags lie to you.** Mobbin gates UI with GrowthBook; an endpoint visible to one account may 404 for another. Framer likely gates CMS + code-component features by plan. Check with the *actual* paid account you're migrating.
- **Don't attack detection / rate limits.** Build with polite defaults (concurrency caps, backoff, User-Agent honesty). You own these sites; you don't need to fight the host.
- **Don't skip the legal read.** Framer's ToS permits exporting *your own* content; re-hosting *other people's* Framer sites is a different question. This playbook assumes you own the sites.

---

## 5. Reusable Architecture Template

The Mobbin MCP layout generalizes. For the Framer-export project use:

```
framer-export/
  src/
    cli/
      auth.ts              # login / paste-cookie flow
      export.ts            # main export command
      doctor.ts            # diagnostics
    services/
      auth.ts              # session management, refresh
      framer-client.ts     # typed wrapper around framer endpoints
      asset-fetcher.ts     # CDN downloader with cache + dedupe
    capture/
      site-capture.ts      # pulls one site -> portable JSON + assets
      schema.ts            # zod schemas, schemaVersion: 1
    render/
      astro.ts             # capture -> astro source tree
      wordpress.ts         # capture -> wp-on-workers source tree
      eleventy.ts          # capture -> 11ty source tree
    utils/
      url-rewriter.ts      # framerusercontent.com -> your CDN
      project-context.ts   # detect target repo
      store.ts             # ~/.framer-export/... io
  test/
    fixtures/              # recorded JSON fixtures
  docs/
    API_DISCOVERY.md       # the Framer endpoints you mapped
    ARCHITECTURE.md
    PORTABILITY.md         # which renderers, why
  REVERSE_ENGINEERING_PLAYBOOK.md  # this file
```

Mirrors Mobbin MCP's shape (`src/services`, `src/utils`, `src/cli`, `docs/`). That's not cargo-culting — it's the minimum viable separation for this class of tool.

---

## 6. Framer-Specific Notes (starting hypotheses, verify live)

Treat these as *starting hypotheses*, not facts. Confirm each against a recorded HAR on your actual account.

### 6.1 Runtime shape
- Framer publishes static HTML + a client-side runtime and hosts assets on `framerusercontent.com`.
- Published pages include an embedded JSON blob describing components/layout (similar in spirit to `__NEXT_DATA__`). Find it; it's probably the single most valuable artifact to capture.
- Framer's editor talks to an authenticated API (likely GraphQL or REST under `api.framer.com` / `framer.com/api`). This is where site list, page tree, CMS collections, and code components live.

### 6.2 Things worth capturing per site
- Route table (page slugs, locales, redirects).
- Per-page layout JSON (component tree, style overrides, breakpoints).
- CMS collections (schema + rows).
- Code components (TSX/JSX source if used).
- Assets referenced by each page (image, video, font) — dedupe by content hash.
- Global design tokens (colors, typography, spacing).
- SEO metadata (title, description, OG image per page).
- Form endpoints (Framer forms post somewhere; replace with your own handler).
- Analytics IDs / third-party embed config.

### 6.3 Known gotchas to plan for
- **Responsive variants**: Framer stores multiple layouts per breakpoint. Your renderer must decide: emit all breakpoints as CSS media queries, or collapse to one.
- **Animations/interactions**: Framer Motion state lives in the page JSON. Low-fidelity migrations drop these; high-fidelity ones need a runtime shim.
- **Code components**: user-authored TSX. Copy source + dependencies; don't try to re-parse.
- **Fonts**: often licensed through Framer's font service. Re-host may require relicensing — check before shipping.
- **Forms / newsletter / eCommerce**: server-side integrations you own separately.
- **CMS references**: rows reference each other by ID. Preserve IDs through the export; don't re-slug.

### 6.4 Renderer target trade-offs

| Target | Good for | Watch out for |
|---|---|---|
| **Astro** | Content-heavy marketing sites, MDX-friendly, cheapest to host, easiest to version-control | Interactive Framer components (drag/zoom/animated) need manual re-implementation |
| **WordPress on Cloudflare** | Editorially managed sites, non-dev collaborators, large content inventories | Heavier runtime, plugin surface, less "it's just files in git" |
| **Next.js / Remix (self-hosted)** | Needs SSR, auth, or dynamic routes matched to Framer's app-like behavior | Highest ops cost of the three |
| **11ty / Hugo** | Pure static, multilingual, fastest build | Least component-friendly |

Recommendation: export to **portable JSON first**, then render to **Astro** as the primary target. Keep WP + 11ty renderers as alternative back-ends over the same capture. This is exactly the one-capture-many-renderers split §2.7 argues for.

---

## 7. Workflow for the Next Project

1. **Legal + scope.** Write down which Framer sites you own and intend to migrate. Confirm ToS allows export of your own content.
2. **Record HARs.** Log in to Framer, open each site in the editor + preview, click through every page + CMS collection, save HAR files.
3. **Identify the stack.** Stack-trace cookies, CDN hosts, embedded JSON blobs. Document in `docs/API_DISCOVERY.md`.
4. **Write the auth bootstrap.** `framer-export auth` — paste cookie or token, store in `~/.framer-export/auth.json`.
5. **Write the typed client.** One endpoint at a time, with Zod schemas + JSON fixtures.
6. **Write the capture layer.** Per-site JSON + asset directory. Version it.
7. **Write the `doctor` command.**
8. **Write one renderer (Astro).** Prove round-trip on the smallest site first.
9. **Add URL-rewriter + asset re-host step.** Framer CDN → your CDN (R2 / Cloudflare Images / static-in-repo).
10. **Add second renderer (WordPress-on-Workers).** Forces you to keep capture + render decoupled.
11. **Add a `diff` command** that compares a live Framer site to the exported site page-by-page (screenshots + DOM) to catch regressions.
12. **Cut over one site.** DNS switch. Keep the Framer site live for a week in case of rollback.

---

## 8. Concrete Carry-Overs From Mobbin MCP

Things you can literally copy:

- `src/services/auth.ts` — cookie-based session refresh pattern.
- `src/services/api-client.ts` — the typed request wrapper with cache + in-flight coalescing + timeout.
- `src/utils/project-context.ts` — repo/project auto-detection.
- `src/utils/artifact-store.ts` — project-scoped local store pattern.
- `src/cli/auth.ts` — the paste-cookie bootstrap UX.
- `mobbin_doctor` shape — diagnostics tool layout.
- Env-var-driven data-dir pattern (`MOBBIN_DATA_DIR`) — use `FRAMER_DATA_DIR`.
- The three-layer separation (fetch / capture / render).
- The `docs/API_DISCOVERY.md` format (endpoint, request, response JSON examples).

Things that do **not** carry over:

- MCP tool surface (a CLI is a better UX than an MCP server for a one-shot export job — unless you *also* want agents to query your captured site content, in which case add an MCP adapter at the end).
- Visual/artifact matching (perceptual hashing, contact sheets) — specific to design inspiration use case.
- Mem Palace / agent-context generators — specific to Mobbin's "design memory" framing.

---

## 9. Definition of Done

The Framer-export project is done when:

1. `framer-export auth` works.
2. `framer-export doctor` reports all-green.
3. `framer-export capture <site>` produces a fully portable `~/.framer-export/sites/<id>/` tree with **no references back to framer.com**.
4. `framer-export render astro <site> <out-dir>` emits a buildable Astro project.
5. `astro build` on the output deploys to Cloudflare Pages / your host of choice.
6. Visual diff vs. the live Framer site is within agreed tolerance on every page.
7. All assets served from your CDN, not Framer's.
8. A second renderer (WP-on-Workers or 11ty) produces a working site from the same capture — proves the architecture.

---

## 10. TL;DR

- **Reverse-engineer the network, not the DOM.**
- **Copy the session; don't reimplement auth.**
- **Separate fetch / capture / render.** Then you can change targets cheaply.
- **Version the capture schema from v1.**
- **Build `doctor` on day one.**
- **One capture, many renderers.** Portable JSON is the pivot point.
- **Assume one privileged "give me the whole taxonomy" endpoint exists — find it first.**
- **For Framer specifically: the embedded page-JSON is the prize. Capture it, rewrite asset URLs, emit Astro first, keep WP/11ty renderers viable.**
