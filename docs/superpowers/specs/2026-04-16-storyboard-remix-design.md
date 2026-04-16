# Storyboard Remix — Design

**Status:** Approved, pending implementation plan
**Depends on:** Storyboard-first flow (`2026-04-16-storyboard-first-flow-design.md`), Storyboard fullscreen preview (`2026-04-16-storyboard-fullscreen-design.md`)

## Goal

Let a user start from one generated storyboard option and iteratively customize individual screens — edit the prompt, regenerate that screen, swap in a screen from a sibling option, or skip steps — until they converge on a single final flow. Finalizing produces a new sibling option that lives alongside the originals (not a replacement) and can be picked for integration like any other option.

## Mental Model

"Start from one, tweak toward one."

A user picks a base option (e.g. Option 2), lands on a page where each step of that option is rendered as its own editable card. They can regenerate any single screen with a prompt ("make the CTA green"), swap any single screen from another option ("use Option 1's welcome screen"), or skip any step. The original options are preserved untouched — the customized version is persisted as a new sibling.

## User Flow

1. On the pick-a-flow page, each storyboard strip has a new `Customize` button next to `Pick this flow`.
2. Clicking `Customize` on Option 2 creates a draft (server-side) cloned from Option 2 and navigates to `/customize/:draftId`.
3. The Customize page stacks each step of Option 2 vertically as editable cards. The auth screens (login/signup) are not customizable and are not shown — they remain the project-level default.
4. Per card the user can:
   - Type a prompt and click **Regenerate** → card spins, then rerenders with new mockup
   - Toggle **Skip** → card dims to 40% opacity; this step will be absent from the finalized flow
   - Click one of the **Swap** buttons (one per other option) → copies that option's screen with the same step name into this card
   - Click **⤢** → open the existing fullscreen modal on this single screen (with `Close` in place of `Pick`)
5. `← Back` returns to the pick page. Draft is auto-saved throughout, so no dirty-check warning.
6. **Finalize** creates a new sibling option row with `status = 'ready'` and navigates onward to build/preview (same path as picking from the strip).

## Scope

**In scope:**
- Customize page + per-screen editable cards
- Per-screen regenerate via Claude (prompt-driven)
- Per-screen swap (by step name, from sibling options)
- Per-step skip
- Auto-save of all edits to a draft row
- Finalize flow that produces a new sibling option
- Reuse of existing fullscreen modal (with Pick → Close mode)

**Out of scope:**
- Customizing auth screens (login/signup stay as project-level default)
- Reordering steps
- Adding or removing steps (only skip toggles existing steps)
- Undo stack / history viewer (history is captured in DB but not surfaced in UI)
- Rollback after finalize (finalized option is permanent; regenerate fresh if regretted)
- Multi-tab conflict resolution (last-write-wins)
- Mobile-dedicated UX (desktop-first, stacks gracefully)

## Data Flow Summary

```
Pick page → [Customize click] → POST /api/customize → draft row created → redirect
Customize page → [mount] → GET /api/customize/:id → render cards
Card edit (regen) → POST /api/customize/:id/screens/:stepName/regenerate → Claude → DB update → card rerenders
Card edit (swap) → POST /api/customize/:id/screens/:stepName/swap → DB update → card rerenders
Card edit (skip) → PATCH /api/customize/:id {skippedSteps} → DB update
Finalize → POST /api/customize/:id/finalize → flip status to 'ready' → redirect to build
```

## Schema Changes

```sql
ALTER TYPE option_status ADD VALUE 'customizing';
ALTER TYPE option_status ADD VALUE 'ready';

ALTER TABLE onboarding_options
  ADD COLUMN base_option_id uuid REFERENCES onboarding_options(id),
  ADD COLUMN skipped_steps text[] NOT NULL DEFAULT '{}',
  ADD COLUMN customize_history jsonb NOT NULL DEFAULT '[]';
```

**Semantics:**
- `base_option_id` NULL for original generated options; set for drafts/finalized remixes, pointing to the option they were cloned from.
- `skipped_steps` is an array of step names to exclude at build time.
- `customize_history` is an append-only log of edits: `[{timestamp, type: "regenerate"|"swap", stepName, prompt?, sourceOptionId?}]`. Captured for future undo UI; not surfaced in v1.
- `status` values: existing `'storyboard'` | `'built'`, plus new `'customizing'` (draft) | `'ready'` (finalized remix).

**State machine:**
- Originals: `storyboard` → (build) → `built`
- Remixes: `customizing` (draft) → (finalize) → `ready` → (build) → `built`

Drafts are ordinary `onboarding_options` rows. A draft is just a row with `status = 'customizing'` and a `base_option_id`.

## API Routes

All under `apps/api/src/routes/customize.ts`.

### `POST /api/customize`
Body: `{ baseOptionId: string }`
Creates a draft row by cloning the base option's `flowStructure`, `mockupCode`, `name` (appended with "(remix)"), `rationale`. Sets `status = 'customizing'`, `base_option_id = baseOptionId`. Returns the full draft row.

**Idempotency:** If a draft with `status = 'customizing'` and the same `base_option_id` already exists for this project, return it instead of creating a new one. (Matches CLAUDE.md idempotency discipline.)

### `GET /api/customize/:id`
Returns the draft row plus the sibling options (for swap buttons). 404 if not found.

### `PATCH /api/customize/:id`
Body: `{ skippedSteps?: string[] }`
Validates all step names exist in the draft's `flowStructure`. Updates `skippedSteps` only — rejects any other field.

### `POST /api/customize/:id/screens/:stepName/regenerate`
Body: `{ prompt: string }` (trimmed, non-empty)
Loads the current `mockupCode[stepName]`, calls `screen-regenerator.ts` with `(currentCode, prompt, stepContext)`. On success: updates `mockupCode[stepName]`, appends to `customize_history`. On malformed output or API error: throws `GenerationFailedError`, leaves DB unchanged, returns `{error: "generation_failed", retryable: true}` with appropriate status.

### `POST /api/customize/:id/screens/:stepName/swap`
Body: `{ sourceOptionId: string }`
Loads source option, finds matching `stepName` in its `mockupCode`. If found: overwrites draft's `mockupCode[stepName]`, appends to `customize_history`. If source is missing that step: returns 400. (UI grays the button, so this is defense-in-depth.)

### `POST /api/customize/:id/finalize`
Validates the draft has at least one change relative to its base (any regen, swap, or skip). Rejects with 400 "No changes made" otherwise. Flips `status` to `'ready'`. Idempotent: second call on a `'ready'` draft returns the same row unchanged.

## New Files

- `apps/api/src/routes/customize.ts` — Hono routes above
- `apps/api/src/services/screen-regenerator.ts` — Claude wrapper for single-screen regen
- `apps/api/src/prompts/customize.ts` — System prompt for regen ("you are editing one React component; keep its props and exports unchanged; apply the user's requested change")
- `apps/web/src/app/customize/[id]/page.tsx` — Next.js page, server component, fetches draft
- `apps/web/src/app/customize/[id]/customize-view.tsx` — Client component, orchestrates cards
- `apps/web/src/components/customize-screen-card.tsx` — Per-screen card with prompt textarea + swap buttons
- `apps/web/src/lib/customize-api.ts` — Typed fetch wrappers

## Modified Files

- `apps/web/src/components/storyboard-strip.tsx` — Add `Customize` button next to `Pick this flow`
- `apps/web/src/components/storyboard-fullscreen.tsx` — Add `showPickButton?: boolean` prop (default true). When false, render Close button in place of Pick. Also accept a single-screen sequence mode for the customize page's use.
- `packages/db/src/schema.ts` — New enum values, new columns
- New migration under `packages/db/drizzle/` — `ALTER TYPE` + `ALTER TABLE`

## Customize Page UI Detail

```
┌──────────────────────────────────────────────────────────────┐
│  ← Back                                        [ Finalize ]  │
├──────────────────────────────────────────────────────────────┤
│  Remix of: Option 2 — "Guided setup"                         │
│                                                              │
│  ┌─ welcome ────────────────────────────────────────────┐   │
│  │  [ ] Skip this step          [⤢]                     │   │
│  │  ┌──────────────────────────────────────────────┐   │   │
│  │  │  <iframe: current mockup, scaled>            │   │   │
│  │  └──────────────────────────────────────────────┘   │   │
│  │  ┌──────────────────────────────────────────────┐   │   │
│  │  │ Prompt: make the CTA green and bolder     📝 │   │   │
│  │  └──────────────────────────────────────────────┘   │   │
│  │  [ Regenerate ]                                      │   │
│  │  Swap from: [ Option 1 ] [ Option 3 ]                │   │
│  │  Status: Ready                                       │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─ profile-setup ─────────────────────────────────────┐   │
│  │  ... (same card anatomy) ...                         │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

**Card anatomy:**
- Step name label (top-left)
- Skip checkbox (when checked, dims card to 40% opacity, preserves edit controls)
- Preview iframe (~320px height, scaled to fit, uses single-screen bundler)
- Fullscreen button (`⤢`) — opens existing modal with `showPickButton={false}`
- Prompt textarea + Regenerate button (disabled when empty or while regenerating)
- Swap buttons (one per other option; grayed out if source lacks this step)
- Status line: `Ready` | `Regenerating…` | `Failed — Retry` | `Swapped from Option N`

**Regen flow (6 steps):**
1. User types prompt, clicks Regenerate
2. Button disables, status flips to `Regenerating…`
3. POST to API
4. On success: bump iframe key (forces reload) so the new `mockupCode` renders
5. On failure: status becomes `Failed — Retry`, prompt text preserved, previous code intact
6. Textarea remains editable throughout so the user can refine the prompt for retry

**Navigation:**
- `← Back` always enabled (state already persisted)
- `Finalize` disabled when draft is byte-identical to base; tooltip: "Make at least one change first"

## Error Handling & Edge Cases

### Regenerate failures
| Failure | UX |
|---|---|
| Claude API error (5xx, rate limit, credit exhaustion) | Card → `Failed — Retry`. Prompt preserved. Previous mockup intact. Server returns `{error, retryable: true}`. |
| Malformed Claude response (can't parse component) | Same. Server validates output before persisting. |
| Network drop mid-request | Client-side timeout (60s). Card → `Failed — Retry`. Server-side write still happens; next page load reconciles. |
| Empty prompt | Button disabled until non-empty (trimmed). No request sent. |

### Concurrent regenerations
Per-card state isolation. No cross-card locking. Rate-limits surface per-card, others unaffected.

### Stale draft recovery
- Base option deleted: draft loads fine (self-contained). Swap buttons for deleted siblings gray out with tooltip "Source option no longer available."
- Draft row deleted: `GET /api/customize/:id` returns 404 → "This draft was deleted" + link to pick page.

### Navigation mid-regenerate
No warning. Navigation proceeds. Server request completes regardless. Next mount reconciles from server state. No optimistic UI.

### Finalize edge cases
- Disabled when draft identical to base
- Clicked twice: idempotent (returns same row)
- In-flight regens: disabled until all cards are `Ready` or `Failed`; failed cards block with inline message

### Swap edge cases
- Source live-read at swap time (no snapshotting)
- Swap then regen: regen operates on swapped-in code
- Source missing the step: button grayed from render time

### Out of scope for v1
- Undo UI (history is captured, not surfaced)
- Rollback after finalize
- Two-tab conflict resolution (last-write-wins)

## Testing Strategy

### Unit tests

**`apps/api/src/services/screen-regenerator.test.ts`**
- Happy path: component code + prompt → new code
- Malformed Claude response → `GenerationFailedError` (retryable)
- Prompt preserved through error path
- Anthropic SDK mocked, no real calls

**`apps/api/src/routes/customize.test.ts`**
- `POST /api/customize` idempotent for same project + base
- `GET /api/customize/:id` 404 on missing
- `PATCH /api/customize/:id` updates `skippedSteps` only; rejects others
- `POST /screens/:stepName/regenerate` on missing step → 404
- `POST /screens/:stepName/swap` from source missing step → 400
- `POST /finalize` on unmodified draft → 400
- `POST /finalize` idempotent on already-ready draft

All Claude responses mocked via shared fixture module.

### Light smoke tests (React Testing Library)

**`customize-screen-card.test.tsx`**
- Regenerate disabled when prompt empty
- Clicking Regenerate flips card to `Regenerating…`
- Mock success bumps iframe key
- Mock failure shows `Failed — Retry` and preserves prompt
- Skip dims preview to 40%
- Swap button grayed when source lacks step

### Manual E2E checklist

- [ ] Pick page → Customize on an option → `/customize/:id` renders all steps
- [ ] Type edit prompt → regenerate → new mockup
- [ ] Check skip → dims → finalize → finalized option excludes step
- [ ] Swap one card from sibling → preview updates → status shows source
- [ ] Fullscreen button opens modal with Close (not Pick)
- [ ] Simulated regen failure → retry succeeds
- [ ] Navigate back mid-regen → return → state reconciled
- [ ] Finalize with zero changes → disabled with tooltip
- [ ] Finalize valid draft → build/preview page (same as strip pick)
- [ ] Two finalized remixes from the same base coexist as siblings (idempotency guard only applies to active `customizing` drafts, not to finalized `ready`/`built` remixes)

### Intentionally NOT tested
- No existing web UI e2e harness
- No load/perf tests on regen
- No cross-browser matrix (desktop Chrome only)
- No accessibility audit (matches fullscreen modal posture)

## Success Criteria

- Customize button on every storyboard strip
- Landing on `/customize/:id` renders all steps of the base option as editable cards
- Regenerate, swap, and skip all persist and round-trip through page reload
- Finalize creates a new sibling option that renders alongside originals on the pick page
- Original options are never mutated by customization
- Failed regens surface clearly without losing the user's prompt
- No regression to existing pick/fullscreen/build flows

## Risks

1. **Prompt quality:** Users may phrase changes ambiguously. The regen system prompt must strongly constrain Claude to keep props/exports unchanged. Out-of-scope edits (e.g., "add a new step") will produce broken code; the malformed-response path handles it but UX is "retry with clearer prompt."
2. **Draft proliferation:** One draft per (project, baseOption) is reasonable; the idempotency guard in POST /customize prevents fanout.
3. **Schema migration risk:** `ALTER TYPE` on enums is non-transactional in Postgres. Migration must be standalone (not bundled with other changes). Zero-downtime-safe because existing rows never use the new values.
4. **Iframe perf on large customize pages:** A 6-step option = 6 iframes. Same constraint as storyboard strips today; reuse the existing bundler so perf characteristics match. If it bogs down, address in follow-up (e.g. lazy-mount cards below the fold).
