# Storyboard Fullscreen Preview — Design

**Status:** Approved, pending implementation plan
**Depends on:** Storyboard-first flow (`2026-04-16-storyboard-first-flow-design.md`)

## Goal

Let users click any storyboard option in the pick-a-flow view and expand it into a full-screen carousel that renders each screen (login, signup, every flow step) at native 1:1 size, so they can judge "is this the flow I want?" against real-size UI instead of thumbnails.

## User Flow

1. User lands on storyboard pick page with 3 strip-style iframes (existing behavior).
2. User clicks anywhere on a strip's iframe, or clicks the new "Expand" (⤢) button in that strip's header.
3. Modal opens with a dark backdrop, centered panel, and a single iframe rendering the first screen (Login) at native size.
4. User navigates with ← → arrow keys or on-screen prev/next buttons. Panel indicator ("3 / 6") and screen-name label update.
5. User clicks "Pick this flow" from within the modal → same behavior as clicking it on the strip (triggers build, transitions to full preview page).
6. User closes modal with Esc, backdrop click, or the × button.

## Scope

**In scope:**
- Modal + carousel component
- Single-screen iframe renderer (new bundler function)
- Entry points: iframe click + explicit Expand button + hover affordance on thumbnail
- Keyboard (← → Esc) and pointer navigation
- "Pick this flow" from inside the modal

**Out of scope:**
- Shareable URLs / deep-linking to a specific screen
- Multiple open modals simultaneously
- Zoom or pan controls
- "Open in new tab"
- Editing / regenerating screens from fullscreen
- Mobile-responsive modal layout (desktop-first; basic sizing will work on mobile but no dedicated UX)

## Architecture

**New files:**
- `apps/web/src/components/storyboard-fullscreen.tsx` — modal component with carousel, keyboard handling, and pick button
- `apps/web/src/lib/single-screen-bundler.ts` — new function `buildSingleScreenHtml(componentCode, componentName)` that renders one React component in an iframe at native size

**Modified files:**
- `apps/web/src/components/storyboard-strip.tsx` — adds Expand button in header, makes iframe click trigger modal, manages local `isOpen` state, mounts `<StoryboardFullscreen />` when open

**No changes to:** API, session storage, routing, database, existing preview-bundler or storyboard-bundler.

## Panel Order

The carousel renders this sequence per option:
1. `authMockup.login` (label: "Login")
2. `authMockup.signup` (label: "Signup")
3..N. `option.mockupCode[step.stepName]` for each step in `option.flowStructure` (label: step name)

If a step's mockup is missing from `mockupCode`, skip that panel rather than erroring. Log a console warning.

## Bundler Design

`buildSingleScreenHtml(componentCode, componentName)` returns an HTML string for an iframe. Structure mirrors the existing storyboard-bundler but renders only one component at native size (no scaling, no side-by-side layout):

```
<html>
  <head>
    <script src="react + react-dom UMD"></script>
    <script src="tailwind CDN"></script>
    <script src="babel standalone"></script>
    <style>body { margin: 0; }</style>
  </head>
  <body>
    <div id="root"></div>
    <script type="text/babel" data-presets="typescript,react" data-type="module">
      {componentCode}
      const root = ReactDOM.createRoot(document.getElementById('root'));
      root.render(React.createElement({componentName}));
    </script>
  </body>
</html>
```

The iframe fills its container (100% width, 100% height inside the modal panel). The modal panel will be sized to match a typical desktop viewport (e.g., 1280×800 or viewport-relative: 90vw / 85vh capped).

**Helper reuse:** `extractComponent`, `toIdentifier`, `escapeHtml`, `escapeForTextScript` are duplicated between `preview-bundler.ts` and `storyboard-bundler.ts` already. A follow-up could extract them into a shared module, but it's out of scope here; just duplicate them again in `single-screen-bundler.ts` if needed, or import from `storyboard-bundler.ts`. Prefer the import path to minimize duplication now.

## Modal Component

Props:
```ts
interface Props {
  option: StoryboardOption;
  authMockup: { login: string; signup: string };
  onClose: () => void;
  onPick: () => void;
  picking: boolean;
}
```

State:
- `currentIndex: number` — which panel in the computed sequence is showing

Behaviors:
- Mounts on `isOpen = true` in parent; unmounts on close
- Registers `keydown` listener on mount for ← → Esc
- Backdrop click closes (but clicks on the inner panel do not)
- "Pick this flow" button disabled when `picking === true`, shows "Building…" label
- Renders into a React portal on `document.body` to escape any positioning ancestors

## Entry Points in Strip

The strip header currently has "Pick this flow" as the only button. New layout:

```
[ Name              ]     [ ⤢ Expand ] [ Pick this flow ]
[ Rationale...      ]
```

The iframe wrapper becomes a `<button>` or clickable `<div role="button" tabIndex={0}>` with:
- `onClick` → opens modal
- On hover: subtle overlay with "⤢ Click to expand"

Existing sandbox behavior stays (`sandbox="allow-scripts"`).

## Testing Strategy

**Unit tests:**
- `single-screen-bundler.test.ts` — assert output contains expected script tags, root div, component name, escaping is correct for edge cases (quotes in code, script tags in strings).
- Light smoke test for `StoryboardFullscreen` using React Testing Library — mount, assert label + indicator update on next/prev, assert Esc closes, assert "Pick this flow" calls `onPick`.

**No new API tests needed** (no backend changes).

**Manual E2E:**
- Open modal via iframe click, via Expand button
- Navigate with keyboard (← → Esc) and with on-screen buttons
- Pick from inside modal → transitions to build + full preview (same as picking from strip)
- Close modal, open a different option, verify state resets to index 0

## Risks / Edge Cases

1. **Large component code in iframe:** Already handled by existing bundlers; no new risk since we're just picking one component at a time.
2. **Component that depends on a parent layout:** Mockups are designed to be self-contained; if one breaks at native size, that's a mockup-quality issue (addressable via the existing generator prompts), not a modal issue.
3. **Z-index stacking:** Use `z-index: 9999` or Tailwind `z-50` on the portal root. No other full-screen UI in the app today.
4. **Keyboard focus trap:** Out of scope for v1. Tab can escape the modal; Esc still closes. Document as a known limitation if accessibility review comes up.
5. **Multiple strips, race conditions:** Only one modal can be open at a time per DOM (because each strip manages local state). Opening a second strip's modal while another is open is technically possible (two portals) but harmless — user will Esc the top one. Not worth guarding against.

## Success Criteria

- All 3 storyboards on the pick page expose an expand affordance on hover
- Clicking the iframe or the Expand button opens the modal
- Modal shows Login → Signup → flow steps in order, one at a time, native size
- ← → arrow keys and on-screen buttons navigate
- Esc, backdrop click, and × button all close the modal
- "Pick this flow" from inside the modal works identically to the strip's button
- No regression to existing strip behavior or to the build / integrate flows
