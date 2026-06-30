# Adaptation Playbook

The discipline that turns a reference flow into a flow that *belongs* to the project.
This is the difference between "our app now feels like a coherent product that learned
from the best" and "our app is wearing another company's clothes."

## The mapping discipline

Every transferable lesson from the Flow Model must land on something concrete in the
project before it counts as adopted. For each lesson, answer:

- **Which project route/screen** does this state become?
- **Which existing component** renders it? If none exists, is the right move to build
  a new reusable component or extend an existing one? Prefer extending — a flow should
  not fork the design system.
- **Which design tokens** (color, spacing, radius, type scale) apply? Pull these from
  the project, never from the reference's extracted colors. The reference's palette is
  for *understanding contrast and emphasis*, not for pasting hex values.
- **Which domain entities** replace the reference's? Map the reference's nouns to the
  project's nouns explicitly (their "course" is our "playlist", their "streak" is our
  "weekly goal").

If a lesson cannot be mapped to anything real, it is probably incidental — drop it.

## Keep / drop / adapt / add

This works whether or not a project already exists. For an existing flow the baseline
is "what we ship today"; for a greenfield build the baseline is simply "the reference."
Either way, force every part of the reference flow into one bucket — and always produce
this table, even for a brand-new app, because it is what turns observation into a
buildable, domain-fitted plan:

- **Keep** — works as-is in our context; adopt the structure directly.
- **Drop** — solves a problem our domain does not have, or adds a step our users do
  not need. Removing steps is often the biggest win; do not adopt friction just
  because the reference had it.
- **Adapt** — right idea, wrong specifics. Keep the pattern, change the content,
  component, or sequencing to fit.
- **Add** — our domain needs a step the reference skipped (compliance, a required
  field, an extra confirmation). Name it and justify it.

A flow that is 100% "keep" usually means you copied without thinking. Expect a healthy
mix.

## Enhance where the project has an edge

The brief is to *match or exceed* the reference, not merely match. Look for places the
project can do better because of something the reference lacked: existing user data
that lets you skip a step, a richer integration, a faster path. Adopting a flow is the
moment to bank those advantages, not bury them.

## Stack-specific notes

Detect the stack first (`package.json`, `pubspec.yaml`, route/screen layout, design
system files), then apply the relevant guidance.

### Web (React / Next / Tailwind / shadcn and similar)
- States usually map to **routes or route segments**; branches map to conditional
  render + URL/search-param state. Decide early whether a step is its own URL (good for
  deep-linking and back-button behavior) or a step within one page.
- Reuse the component library (shadcn/ui or the project's own). Map reference patterns
  to existing primitives (`Dialog`, `Sheet`, `Form`, `Tabs`) before inventing new ones.
- Express visuals through design tokens / CSS variables / Tailwind theme — not inline
  hex from the reference.
- Mind loading/empty/error per route; SSR/streaming changes where those states live.

### Mobile (React Native / Expo, Flutter)
- States map to **screens in a navigation stack** (React Navigation, Expo Router,
  Flutter Navigator/GoRouter). Branches are stack pushes, modals, or bottom sheets.
- Honor platform conventions the reference implies: gestures (swipe-back), haptics on
  key confirmations, safe-area insets, keyboard avoidance, and the platform's modal vs
  push semantics. A flow that ignores these reads as foreign even if the steps match.
- Motion matters more on mobile — match the reference's *timing and easing intent*
  using the project's animation library (Reanimated, Moti, Flutter implicit/explicit
  animations), not arbitrary values.
- Watch performance: long onboarding carousels and image-heavy screens need lazy
  loading and list virtualization.

### Stack-agnostic / unknown
- If the stack is unclear, ask or infer from the repo, and keep the spec's UI mapping
  column expressed as "component + token" placeholders the implementer fills in.
- Keep the Flow Model and spec stack-neutral above the UI-mapping layer so the same
  spec can target more than one platform if the project is multi-platform.

## Common failure modes to avoid

- **Costume copying** — pasting the reference's colors, copy, and illustrations. Fix:
  map to project tokens and rewrite copy in the project's voice.
- **Friction tourism** — adopting steps that exist only because of the reference's
  business model. Fix: the keep/drop/adapt/add pass.
- **Orphaned components** — building flow-only components that ignore the design
  system. Fix: extend existing primitives.
- **Happy-path-only** — shipping the flow without empty/error/returning states. Fix:
  the spec forces every branch to be specified before build.
