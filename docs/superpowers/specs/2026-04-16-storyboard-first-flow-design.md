# Storyboard-First Onboarding Flow — Design

**Date:** 2026-04-16
**Status:** Approved (pending implementation plan)
**Context:** Onboarder app — analyzes a Next.js/Vite React project and generates onboarding flows

## Problem

Today the tool fully generates 2 complete onboarding options up-front, each with interactive step components. This is expensive (2× full Claude calls with 64K max_tokens each), slow, and the user may reject both options after seeing them — wasting the entire generation budget.

We want the user to **commit to a direction at a low-fidelity step**, then spend the expensive build budget only on the chosen direction.

## Goals

1. Present multiple onboarding options at **visual-only fidelity** so the user can pick a layout/vibe quickly
2. Generate a **full interactive build** only for the selected option — no wasted generations
3. Keep total token cost roughly equal to today (3 cheap mockups + 1 build ≈ 2 full options)
4. Preserve brand fidelity (real colors, real content) at both stages

## Non-Goals

- Per-screen mix-and-match ("Frankenstein" assembly from different options)
- Iterative refinement step between pick and build
- Changing auth generation policy (still shared across options)

## User Journey

1. User uploads project (unchanged)
2. **Analyze** → appProfile + designReferences (unchanged)
3. **Storyboard** → new stage. Produces 3 options with flow structure + static branded mockups for every screen. No interactivity.
4. **Preview page, storyboard mode** → 3 horizontal strips stacked vertically, each showing one option's full flow.
5. **Pick** → user clicks "Pick this flow" on their chosen strip.
6. **Build** → Claude regenerates the selected option as fully interactive code, using the approved static mocks as a visual reference.
7. **Preview page, full mode** → today's interactive preview, for the picked option only.
8. **Integrate** → unchanged.

## Architecture

### API

| Endpoint | Input | Output | Notes |
|---|---|---|---|
| `POST /analyze` | files, folderPath | projectId, appProfile | Unchanged |
| `POST /storyboard` | projectId | options[] with `mockupCode` | New. 1 plan call + 3 parallel mockup calls |
| `POST /build` | projectId, optionId | option with `componentCode` + `authCode` | New. 1 Claude call for the chosen option |

### DB — `onboarding_options` schema additions

```ts
// packages/db/src/schema.ts — onboardingOptions
{
  // existing
  id, projectId, name, rationale, flowStructure,
  componentCode,       // JSONB — populated after build (nullable until then)
  authCode,            // JSONB — populated after build (nullable until then)
  selected,            // BOOLEAN — flipped when user picks
  createdAt,

  // new
  mockupCode,          // JSONB — static mockup per step, always populated after /storyboard
  status,              // TEXT — "storyboard" | "built"
}
```

`componentCode` and `authCode` become nullable (today they're required). Migration needed.

### Web routes

| Route | Behavior |
|---|---|
| `/` | Upload (unchanged) |
| `/preview` | Two modes: `storyboard` (when all options are in `storyboard` status) and `full` (when a selected option is `built`). Same route, different renderer. Mode determined from the option data. |
| `/integrate` | Unchanged |

### Prompts

- **`GENERATE_STORYBOARD_SYSTEM_PROMPT`** — "Generate static visual mockups. No state, no hooks, no interactivity, no event handlers. Pure JSX with brand colors (resolved HSL values) and real content from the sample pages. Each screen is a function that returns JSX only."
- **`BUILD_SELECTED_OPTION_SYSTEM_PROMPT`** — "Build the full interactive version of an approved storyboard. Here are the visual mocks — stay faithful to their layout and content. Add state, validation, onNext/onBack navigation, event handlers."

Same color resolution rules as today (no `var(--primary)`, no `bg-primary` — only resolved HSL/hex).

## Storyboard Rendering

### Strip layout (one per option)

- Horizontal row of screens rendered inside a **single iframe per option** (one Babel compile pass, cheaper than 15 concurrent iframes across 3 options × 5 screens)
- Each screen scaled to ~40% (`transform: scale(0.4)`), ~400px thumbnail width
- Clicking a screen expands it to full size in a modal
- Option name + rationale above the strip
- "Pick this flow" CTA at the end of the strip

### Full page layout

- Header: "Pick a storyboard" + app name
- Vertical stack of 3 strips (option A / B / C)
- Each strip has its own iframe → one bad mockup doesn't break the others

### Mockup content rules

- Pure JSX, no imports, no state/hooks, no handlers
- Brand colors resolved to real HSL/hex values (same rules as today — the iframe has no user globals.css)
- Real content and vocabulary from sample pages
- One function per screen, returns JSX

## Build Stage

### Trigger

- User clicks "Pick this flow" on a strip
- Loading state: "Building [Option Name]..."
- `POST /build` with `projectId` + `optionId`
- On success → preview switches to `full` mode

### Build call composition

System prompt: `BUILD_SELECTED_OPTION_SYSTEM_PROMPT`

User message includes:
- App profile (trimmed designReferences — tailwind + globals + 1 sample page, same as today)
- The chosen option's `flowStructure`
- **The mockup code** for each step (as visual reference for the full build)
- Instruction to preserve mockup layout + content but add real interactivity

### Re-pick behavior

- User can click "Back to storyboards" in the full preview
- Picking a different option fires `/build` again
- Previous option's `componentCode` stays in DB (flip-back is free, no regen)
- Newly picked option gets `selected = true`; others flip to `selected = false`

## Error Handling

### Partial storyboard failures

- If 1 of 3 mockup generations fails, render the 2 that succeeded + a "Regenerate this option" slot for the failed one
- Options are generated in parallel — one Claude error doesn't cascade

### Build failure

- Show error overlay with retry button
- Storyboard state is preserved — user can try again or pick a different option

### Validation

- `/storyboard` rejects if project not found (404) or already has storyboard options (409 — caller must reset first)
- `/build` rejects if optionId doesn't belong to projectId (403) or option is already in `built` status (idempotent — return existing result)

## Token Budget

| Stage | Today | New |
|---|---|---|
| Plan call | 1 call, includes authCode + 2 option flow structures | 1 call, includes authCode + 3 option flow structures |
| Per-option code | 2 parallel calls, full interactive components | 3 parallel calls, static mockups (~3-5× smaller per call — no state, no handlers) |
| Build call | — | 1 call for picked option only (same size as today's per-option call) |
| **Total** | 1 + 2 full | 1 + 3 small + 1 full |

Net: roughly equal tokens, better UX, less waste on rejected options.

## Migration Path

1. Add `mockupCode` (nullable JSONB) and `status` (text, default `built` for back-compat) columns via migration
2. Make `componentCode` and `authCode` nullable
3. Ship new endpoints alongside existing `/generate` endpoint (don't remove yet)
4. Ship new `/preview` storyboard mode behind a feature flag or by status field
5. Once verified, remove `/generate` endpoint and deprecate legacy path

## Open Questions

None — all major decisions made in brainstorming. Implementation plan can proceed.
