---
name: mobbin-flow-architect
description: Study how a top app handles a user flow on Mobbin, evaluate your project, and adapt that flow into it — producing a flow spec, a task plan, and (with sign-off) the build. Use WHENEVER the goal is to model, mimic, match, restructure, or upgrade an app's onboarding, signup, checkout, paywall, search, settings, navigation, empty/first-run states, or overall UX after a real-world reference. Fires on "make our onboarding feel like Duolingo", "adapt Linear's quick-add into our app", or "study how [app] does [flow] in our React Native/Next.js/Flutter app". Trigger even when Mobbin isn't named, when no specific app is named ("what do the best apps do here"), and for greenfield builds. This is the reference → decompose → spec → plan → build pipeline. NOT for Mobbin lookups (mobbin-search), saving references (mobbin-capture), prompts from captures (mobbin-prompts), contact sheets (mobbin-visuals), a component with no reference flow (frontend-design), or debugging an existing flow (systematic-debugging).
allowed-tools:
  - Bash(node *)
  - Bash(npx *)
---

# Mobbin Flow Architect

Turn a great flow you can see on Mobbin into a great flow inside *this* project.

The job is not to photocopy screens. A reference app's flow is a teacher: it shows
how an experienced team sequenced steps, removed friction, and built momentum toward
a goal. Your work is to extract that *transferable structure*, leave the *incidental*
brand/domain/visual identity behind, and re-instantiate the structure inside the
current project's own domain, design system, and constraints — enhancing it where the
project has an advantage the reference lacked. Copying produces a costume; adapting
produces a flow that genuinely belongs to the product.

## How everything is invoked

Every Mobbin capability is reachable through one CLI. Prefer it for deterministic
orchestration:

```bash
npx -y @aos-engineer/mobbin-mcp skill <action> '<json-payload>'
```

The four sibling skills (`mobbin-search`, `mobbin-capture`, `mobbin-prompts`,
`mobbin-visuals`) wrap the same actions; invoke them when you want their extra
guidance, but the CLI above is enough to drive the whole pipeline. Run
`npx -y @aos-engineer/mobbin-mcp skill --help` to see every action.

**Before anything else, confirm _live_ access.** `doctor` only reads local files, so
it passes even when the token is expired — never trust it alone. Verify with one real
call:

```bash
npx -y @aos-engineer/mobbin-mcp skill doctor '{}'
npx -y @aos-engineer/mobbin-mcp skill quick-search '{"query":"onboarding","platform":"ios"}'
```

Run that first authenticated call **on its own**, before firing any others. Mobbin's
refresh token is single-use, so several `skill` calls launched in parallel while the
token is expired will race to rotate it and all fail. Once one call succeeds, the rest
are safe to batch.

**If Mobbin is unreachable** (auth expired, `refresh_token_already_used`, or API
errors), do not silently invent a flow and do not bury the result in empty stub files.
Instead:

1. Surface the one-command fix prominently — tell the user to run
   `npx -y @aos-engineer/mobbin-mcp auth`. It is interactive (browser login), so *they*
   run it, not you; in this CLI they can prefix it with `!`.
2. Then offer a choice: wait for re-auth and run the real pipeline, **or** let you draft
   a **provisional spec now** from general product knowledge of the reference, to be
   verified against real captures once auth is restored.
3. If they pick provisional, switch to **Provisional mode** (see below) and label it
   unmistakably. Never present recalled-from-memory structure as if it were captured
   from Mobbin — that exact confusion is what this skill exists to prevent.

## The pipeline

Work through five phases. Earlier phases are cheap and shape everything after them,
so do not skip ahead to code.

1. **Frame & locate** — pin down the target flow and the reference.
2. **Study & decompose** — turn the reference flow into a Flow Model.
3. **Evaluate** — map the model onto the current project; find the gap.
4. **Specify & plan** — write the flow spec and the task plan.
5. **Execute** — build it, pausing at a checkpoint for sign-off.

Announce which phase you are in as you go so the user can redirect early.

---

## Phase 1 — Frame & locate the reference

First, get crisp on two things: **which flow** (onboarding? checkout? a specific
search-to-result journey?) and **which platform** (`ios`, `android`, `web`). Then
identify the reference. Three entry modes:

- **Named reference** — the user names an app ("like Duolingo's onboarding"). Search
  for it directly.
- **Goal only** — the user describes intent ("our onboarding loses people"). *You*
  find candidates: `search-flows` by `flow_actions`/`categories`, or `popular-apps`
  in the relevant category. Surface 2–3 strong candidates with a one-line reason each,
  recommend one, and confirm before investing in a deep capture.
- **Direct pointer** — the user has a Mobbin URL or already-captured artifacts. Go
  straight to `screen-detail` / existing captures.

Discovery actions:

```bash
npx -y @aos-engineer/mobbin-mcp skill quick-search '{"query":"duolingo onboarding","platform":"ios"}'
npx -y @aos-engineer/mobbin-mcp skill search-flows '{"platform":"ios","flow_actions":["Onboarding"],"page_size":6}'
npx -y @aos-engineer/mobbin-mcp skill popular-apps '{"platform":"ios","limit_per_category":4}'
```

Keep `page_size` small (5–8). You want the *right* reference, not a pile of them.

## Phase 2 — Study & decompose the reference into a Flow Model

Capture the chosen flow so it becomes durable, ordered, inspectable data — not a
vague memory:

```bash
npx -y @aos-engineer/mobbin-mcp skill capture-flow '{"platform":"ios","flow_actions":["Onboarding"],"feature_area":"onboarding","compute_visual_hashes":true}'
```

This stores ordered steps, hotspots, screen URLs, patterns, and elements. Pull color
and detail on the screens that carry the most UX weight, and build a visual board so
you and the user are reasoning about the same thing:

```bash
npx -y @aos-engineer/mobbin-mcp skill screen-detail '{"screen_url":"https://mobbin.com/...","extract_colors":true}'
npx -y @aos-engineer/mobbin-mcp skill contact-sheet '{"feature_area":"onboarding","limit":8,"columns":4,"output_path":"onboarding-reference.png"}'
```

Now do the actual expert work: **decompose the flow into a model.** Do not just list
screens — capture the *why* behind the sequence. Read
[references/flow-decomposition.md](references/flow-decomposition.md) for the full
framework. In short, produce: the user's goal, the ordered states/screens with the
job done at each, the transitions and decision points (including error/empty/success
branches), the recurring UI patterns, the friction-reduction techniques, and the
**transferable-vs-incidental split** — which parts of this flow are the real lesson
and which are just this app's brand.

## Phase 3 — Evaluate the project (existing _or_ greenfield)

Understand what you're mapping the Flow Model onto before reshaping anything. Detect
the stack (look at `package.json`, `pubspec.yaml`, route/screen folders, the
design-system or token files). Two cases — figure out which you're in first, because
it changes what "evaluate" means:

- **Existing project** — there's a repo and maybe already a version of this flow.
  Locate the analogous routes/screens/components and the design tokens. Map the Flow
  Model onto the project's domain vocabulary, existing components, and constraints the
  reference never had. If a version of the flow already ships, a `feature-review` diff
  is the sharpest lens; otherwise `analysis-prompt` frames intended-vs-current:

  ```bash
  npx -y @aos-engineer/mobbin-mcp skill analysis-prompt '{"objective":"Compare our onboarding against the captured reference","feature_area":"onboarding","limit":6}'
  npx -y @aos-engineer/mobbin-mcp skill feature-review '{"title":"Onboarding gap","intended_query":"onboarding reference","actual_query":"current onboarding"}'
  ```

- **Greenfield / no existing flow** — a new app, or this flow doesn't exist yet, or
  there's no repo checked out (you're working from a described stack). There is nothing
  to diff against, so do not force a `feature-review`. Instead, evaluate the Flow Model
  against the *target domain*: state your assumptions about the app's entities,
  vocabulary, design system, and platform conventions explicitly, then run keep / drop
  / adapt / add **relative to the reference** — what to keep for v1, what to drop as
  out of scope, what to adapt to your domain, and what to add that your domain needs.
  The discipline is identical; the baseline is just "the reference" instead of "our
  current flow."

Either way, the output is a short **Gap & Mapping**: keep / drop / adapt / add, where
every "adapt" line names the reference pattern *and* the concrete project component,
token, or route it maps to (or the placeholder it will become, for greenfield). This
explicit gap is what keeps the result from becoming a costume — produce it in both
cases, never skip it. See
[references/adaptation-playbook.md](references/adaptation-playbook.md) for the mapping
discipline and stack-specific notes (web vs React Native / Flutter).

## Phase 4 — Specify & plan

Write two artifacts using the templates in
[references/spec-and-plan-templates.md](references/spec-and-plan-templates.md):

- **Flow Spec** — goal, the reference and why it was chosen, the state/screen table,
  transitions, per-screen UI mapping (reference pattern → project component/token),
  loading/empty/error/success states, motion and interaction notes, instrumentation,
  and acceptance criteria. The spec must be implementable by someone who never saw
  the Mobbin reference.
- **Task Plan** — the spec broken into small, ordered, independently verifiable tasks
  (scaffold → screens → navigation/state → data wiring → motion/polish → QA), each
  with its own acceptance check.

**Where to write them** — auto-detect the project's convention so the skill stays
portable:

1. If the project uses Agent OS (`.aos/`, `.agent-os/`, or a `create-spec` workflow),
   follow that layout.
2. Else if a `docs/specs/`, `specs/`, or similar folder exists, write there.
3. Else create `docs/flows/<flow-name>/spec.md` and `plan.md`.

State where you put them and why.

## Phase 5 — Execute with a checkpoint

Stop and present the Flow Spec, the Task Plan, and the visual board. Get an explicit
go-ahead before writing code — this is the moment course-corrections are cheapest,
and the user asked to review before execution.

After sign-off, implement task by task. Respect the project's own conventions: if it
has an `execute-tasks` / TDD / dev-execution workflow, use it; otherwise build in
small reviewable increments and verify each task against its acceptance check. Map
every reference pattern onto the project's existing components and design tokens —
never hardcode the reference's brand colors or copy. When the flow is working, offer a
PR-ready summary:

```bash
npx -y @aos-engineer/mobbin-mcp skill pr-reference '{"title":"Adopt reference onboarding flow","objective":"Ship the adapted onboarding flow","feature_area":"onboarding"}'
```

---

## Principles that keep this honest

- **Adapt the structure, not the skin.** The lesson is the sequencing and the
  friction removal, not the hex codes. Re-render everything through the project's
  design system.
- **Earn every step.** If the reference has a step the project's domain does not need,
  drop it. If the project needs a step the reference skipped, add it and say so.
- **Stay grounded in captured data.** Decompose from real captured steps and screen
  detail, not from memory of the app. If Mobbin is unreachable, do not quietly guess —
  switch to clearly-labeled Provisional mode so captured and recalled knowledge never
  get confused.
- **Make the gap explicit before building.** Keep / drop / adapt / add, mapped to real
  files. Skipping this is how teams end up with a flow that fights the rest of the app.

## Provisional mode (Mobbin unavailable)

Only when the user explicitly opts to proceed without live Mobbin data. The aim is to
stay useful without ever blurring "seen on Mobbin" into "recalled from memory."

- Put a banner at the very top of the spec:
  `> ⚠️ PROVISIONAL — built from general knowledge of <app>, NOT from captured Mobbin data. Re-auth and attach captures to verify before building.`
- Tag every reference-derived claim (states, ordering, patterns) with `[verify on Mobbin]`.
- Keep the same Flow Model → spec → plan structure. Once auth is restored, capturing
  the real flow becomes a quick verification/diff pass (`feature-review`), not a rewrite.
- Add a first task to the plan: re-auth, capture the real flow, diff it against this
  provisional spec, and amend. Treat any divergence as a spec correction, not a rebuild.

## Action quick reference

- Locate: `quick-search`, `search-flows`, `search-apps`, `popular-apps`
- Capture & inspect: `capture-flow`, `capture-screen`, `screen-detail`, `contact-sheet`
- Evaluate: `analysis-prompt`, `feature-review`, `find-similar`
- Hand off: `implementation-prompt`, `agent-context`, `pr-reference`

Full list: `npx -y @aos-engineer/mobbin-mcp skill --help`.
