# Flow Spec & Task Plan Templates

Two deliverables come out of Phase 4. They are written *in the project's own terms* —
someone who never opened Mobbin should be able to build from them. Reference the Flow
Model (Phase 2) and the Gap & Mapping (Phase 3) as you fill these in; do not restate
the reference app's brand.

## Where to write them

Auto-detect, in this order:
1. **Agent OS** — if `.aos/`, `.agent-os/`, or a `create-spec` workflow exists, follow
   that project's spec layout and naming.
2. **Existing specs folder** — `docs/specs/`, `specs/`, `docs/rfcs/`, etc.
3. **Fallback** — create `docs/flows/<flow-name>/spec.md` and `plan.md`.

Always tell the user the final paths and why you chose them.

---

## Flow Spec template

```markdown
# Flow Spec: <Flow name>

## Goal
<One or two sentences: what the user accomplishes and why it matters to the product.>

## Reference & rationale
- Reference: <app> — <platform> — <captured artifact id / Mobbin URL>
- Why this reference: <what it does well that we want>
- Transferable lessons we are adopting: <bulleted, from the Flow Model>
- What we are deliberately NOT copying: <incidental items left behind>

## States
| # | Screen / state | User's job | Entry condition | Exit / next | Project route or component |
|---|----------------|-----------|-----------------|-------------|----------------------------|
| 1 | ...            | ...       | ...             | ...         | <real file/route/component> |

## Transitions & branches
- Happy path: S1 → S2 → ... → done
- Branches (each MUST be specified, not implied):
  - <state>.loading: <what shows while waiting>
  - <state>.empty: <what shows with no data>
  - <state>.error: <message, recovery action>
  - returning user / skip / cancel: <behavior>

## UI mapping (reference pattern → project)
| Reference pattern | Project implementation (component + design token) |
|-------------------|---------------------------------------------------|
| Sticky bottom CTA | `<Button variant="primary">` + `--space-page-bottom` |
| ...               | ...                                               |

## Interaction & motion
<Transitions between screens, gestures, animation timing/easing, haptics on mobile.
Tie each to a real capability of the stack; do not promise motion the stack can't do.>

## Instrumentation
<Events to fire per step so the flow's funnel is measurable: e.g. flow_started,
step_completed{step}, flow_abandoned{step}, flow_completed.>

## Acceptance criteria
- [ ] <Observable, testable statement per important behavior>
- [ ] Every branch (loading/empty/error/returning) is handled
- [ ] Visuals use project design tokens, not reference brand values
- [ ] Instrumentation events fire as specified
```

## Task Plan template

Break the spec into small, ordered, independently verifiable tasks. Each task should
be reviewable on its own and carry its own check, so execution can pause between any
two tasks.

```markdown
# Task Plan: <Flow name>

> Source spec: <path>

## Tasks
1. **Scaffold** — routes/screens/navigation entries for all states. ✅ when the user
   can traverse empty placeholder screens end to end.
2. **Build screen <X>** — layout + components mapped from the spec. ✅ when it matches
   the spec's UI mapping using project tokens.
3. **Navigation & state** — wire transitions, branches, and the state machine. ✅ when
   every branch in the spec is reachable.
4. **Data wiring** — connect real data, loading/empty/error states. ✅ when real and
   failure data both render correctly.
5. **Motion & polish** — animations, haptics, micro-interactions per spec. ✅ when
   timing matches and nothing janks.
6. **Instrumentation & QA** — events + walk through acceptance criteria. ✅ when every
   acceptance box is checked.

## Checkpoint
Present spec + plan + visual board to the user BEFORE task 1. Build only after sign-off.
```

Keep tasks at a granularity where each is a focused change. If a task feels like it
spans the whole flow, split it.
