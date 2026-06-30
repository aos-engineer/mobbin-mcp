# Flow Decomposition Framework

How to turn a captured reference flow into a **Flow Model** — the abstract structure
you actually transfer into the project. The captured artifact gives you ordered
screens; this framework gives you the reasoning behind them.

## Why decompose instead of copy

A flow is a small state machine wrapped around a user's goal. The screens are the
visible surface; the value is underneath — *what job the user does at each step, why
the steps are in that order, and which design choices remove friction.* If you copy
screens you inherit the surface and miss the value, and you drag along brand and
domain details that do not fit the project. Decomposing lets you keep the lesson and
drop the costume.

## The five lenses

Run the captured flow through each lens. Write the answers down — this becomes the
backbone of the spec.

### 1. Goal & beats
- What is the user ultimately trying to accomplish in this flow?
- Break it into **beats** — the emotional/cognitive checkpoints (e.g. onboarding:
  *spark interest → reduce commitment fear → first win → habit hook*). Beats are
  stack- and brand-independent, so they transfer cleanly.

### 2. States & jobs
For each captured step, record:
- **State/screen name** (abstract, not the app's label).
- **The one job** the user does here. If a screen has two jobs, note whether the
  reference is combining or the project should split them.
- **Inputs required** and **outputs produced** (what the user gives, what they get).

### 3. Transitions & decision points
- What advances the user from each state to the next (tap, submit, auto-advance)?
- Where does the flow **branch**? Capture every branch, not just the happy path:
  error, empty, returning-user, skip/dismiss, and success/confirmation states. These
  branches are where flows usually fail in implementation, so name them now.
- Are there loops or escape hatches (back, skip, "do this later")?

### 4. Patterns & techniques
- Recurring **UI patterns** (progress indicator, single-input-per-screen, bottom
  sheet, sticky CTA, skeleton loaders) — these are in the captured `patterns` and
  `elements` fields.
- **Friction-reduction techniques**: progressive disclosure, smart defaults,
  deferring account creation, social proof at the moment of doubt, optimistic UI,
  inline validation. These are the highest-value lessons — call them out explicitly.

### 5. Transferable vs incidental
The decisive lens. For every element of the flow, label it:
- **Transferable** — sequencing, beats, patterns, friction techniques, state coverage.
  These are *why the flow works* and should move into the project.
- **Incidental** — brand colors, illustration style, copy voice, the reference's
  specific domain entities, anything legally/contextually unique to that company.
  These stay behind; the project supplies its own.

When unsure, ask: *would this still be good advice for an app in a completely
different industry?* If yes, it is transferable.

## Output: the Flow Model

Produce a compact model the rest of the pipeline consumes:

```
Goal: <one sentence>
Beats: <beat 1> → <beat 2> → <beat 3> → ...

States:
| # | State (abstract) | User's job | Inputs | Output | Key patterns |
|---|------------------|-----------|--------|--------|--------------|
| 1 | ...              | ...       | ...    | ...    | ...          |

Transitions & branches:
- S1 --(submit valid)--> S2
- S1 --(invalid)--> S1.error
- S2 --(skip)--> S4
- ...

Transferable lessons: <bulleted list>
Incidental (leave behind): <bulleted list>
```

Keep it tight. The model is a thinking tool, not a deliverable — the deliverable is
the spec in Phase 4, which translates this model into the project's own terms.
