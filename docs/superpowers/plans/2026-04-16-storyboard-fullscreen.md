# Storyboard Fullscreen Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users click any storyboard option in the pick page and expand it into a full-screen modal carousel that renders each screen (login → signup → flow steps) at native 1:1 size.

**Architecture:** One new bundler function that renders a single React component in an iframe at full size; one new portal-mounted modal component that manages a linear carousel over all screens; strip component gets a click overlay + explicit expand button to trigger the modal.

**Tech Stack:** React 19, Next.js 15 (app router), TypeScript NodeNext, Tailwind v4, React portals. Iframe bundling uses existing Babel standalone + React UMD + Tailwind CDN pattern.

**Testing note:** apps/web has no existing test infrastructure (no vitest/jest config, no tests directory). Adding it solely for this feature is out of scope (YAGNI). Verification relies on TypeScript typecheck (`npx tsc --noEmit`) plus a manual E2E task at the end. If test infra is later added to apps/web, this feature is a sensible first target for unit tests.

---

## File Structure

**Create:**
- `apps/web/src/lib/single-screen-bundler.ts` — new bundler function `buildSingleScreenHtml(code, label)` renders one React component full-size in an iframe
- `apps/web/src/components/storyboard-fullscreen.tsx` — modal + carousel component

**Modify:**
- `apps/web/src/lib/storyboard-bundler.ts` — export the four shared helpers (`extractComponent`, `toIdentifier`, `escapeHtml`, `escapeForTextScript`) so the new bundler can import them instead of duplicating
- `apps/web/src/components/storyboard-strip.tsx` — add local open state, expand button in header, iframe click overlay, mount fullscreen modal when open

---

## Task 1: Export shared iframe-bundler helpers from storyboard-bundler.ts

**Why first:** Task 2 depends on these helpers. Exporting is a minimal, non-behavioral change that we can verify independently with typecheck.

**Files:**
- Modify: `apps/web/src/lib/storyboard-bundler.ts`

- [ ] **Step 1: Add `export` keyword to the four helper functions**

Edit `apps/web/src/lib/storyboard-bundler.ts`. Change:

```ts
function extractComponent(code: string, stepName: string): ExtractedComponent {
```

to:

```ts
export function extractComponent(code: string, stepName: string): ExtractedComponent {
```

Apply the same `export` prefix to these three other top-level helper functions in the same file:

```ts
export function toIdentifier(name: string): string {
```

```ts
export function escapeHtml(str: string): string {
```

```ts
export function escapeForTextScript(str: string): string {
```

Also export the `ExtractedComponent` interface at its current location:

```ts
export interface ExtractedComponent {
  declaration: string;
  name: string;
}
```

Update the comment above `buildStoryboardStripHtml` from:

```
 * Note: helpers (extractComponent, toIdentifier, escapeHtml,
 * escapeForTextScript) intentionally duplicate preview-bundler.ts for now.
 * If this pattern grows we can extract to a shared iframe-bundler helper
 * module — tracked as follow-up.
```

to:

```
 * Note: helpers (extractComponent, toIdentifier, escapeHtml,
 * escapeForTextScript) are exported for reuse by single-screen-bundler.ts.
 * They still duplicate preview-bundler.ts; consolidating all three bundlers
 * onto one shared helper module is tracked as follow-up.
```

- [ ] **Step 2: Typecheck the web app**

```bash
cd /Users/ryanhaugland/onboarder/apps/web && npx tsc --noEmit
```

Expected: exit 0 with no output. If there are errors, they must be fixed before commit.

- [ ] **Step 3: Commit**

```bash
cd /Users/ryanhaugland/onboarder
git add apps/web/src/lib/storyboard-bundler.ts
git commit -m "refactor(web): export iframe-bundler helpers for reuse"
```

---

## Task 2: Single-screen bundler

**Files:**
- Create: `apps/web/src/lib/single-screen-bundler.ts`

- [ ] **Step 1: Create the bundler file**

Create `apps/web/src/lib/single-screen-bundler.ts` with exactly this content:

```ts
import {
  extractComponent,
  toIdentifier,
  escapeHtml,
  escapeForTextScript,
} from "./storyboard-bundler";

/**
 * Build a single-iframe HTML document that renders one React component at
 * its native size, filling the iframe. Used by StoryboardFullscreen to show
 * one screen (login, signup, or a flow step) full-size in the carousel.
 *
 * Uses the same Babel standalone + React UMD + Tailwind CDN pipeline as
 * storyboard-bundler and preview-bundler. No scaling, no horizontal strip
 * layout — just one component in a centered root container.
 */
export function buildSingleScreenHtml(code: string, label: string): string {
  const comp = extractComponent(code, label);
  const safeName = toIdentifier(label);
  const slotName = `__screen_${safeName}`;

  const tsxSource = `
    const ${slotName} = (function() {
${comp.declaration}
      return typeof ${comp.name} !== "undefined" ? ${comp.name} : null;
    })();

    function Screen() {
      if (!${slotName}) {
        return <div className="p-8 text-gray-400">missing</div>;
      }
      return <${slotName}/>;
    }

    ReactDOM.createRoot(document.getElementById("root")).render(<Screen />);
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(label)}</title>
  <script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin="anonymous"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin="anonymous"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js" crossorigin="anonymous"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    html, body, #root { margin: 0; height: 100%; background: white; }
    body { overflow: auto; }
  </style>
</head>
<body>
  <div id="root"></div>
  <div id="preview-error" style="display:none;position:fixed;top:0;left:0;right:0;padding:12px;background:#fee2e2;color:#991b1b;font-family:monospace;font-size:12px;white-space:pre-wrap;z-index:9999;"></div>
  <script>
    function showPreviewError(msg) {
      var el = document.getElementById("preview-error");
      if (el) { el.style.display = "block"; el.textContent = msg; }
      try { console.error(msg); } catch(_) {}
    }
    window.addEventListener("error", function(e) {
      var detail = e.error && e.error.stack ? e.error.stack : (e.message || "unknown");
      showPreviewError("Runtime error: " + detail);
    });
  </script>
  <script id="screen-tsx-source" type="text/plain">${escapeForTextScript(tsxSource)}</script>
  <script>
    (function() {
      try {
        var source = document.getElementById("screen-tsx-source").textContent;
        var compiled = Babel.transform(source, {
          presets: [
            ["typescript", { isTSX: true, allExtensions: true, allowDeclareFields: true }],
            "react"
          ]
        }).code;
        (0, eval)(compiled);
      } catch (e) {
        showPreviewError("Compile error: " + (e && e.message ? e.message : String(e)));
      }
    })();
  </script>
</body>
</html>`;
}
```

- [ ] **Step 2: Typecheck the web app**

```bash
cd /Users/ryanhaugland/onboarder/apps/web && npx tsc --noEmit
```

Expected: exit 0 with no output.

- [ ] **Step 3: Commit**

```bash
cd /Users/ryanhaugland/onboarder
git add apps/web/src/lib/single-screen-bundler.ts
git commit -m "feat(web): add single-screen-bundler for native-size iframe rendering"
```

---

## Task 3: StoryboardFullscreen modal component

**Files:**
- Create: `apps/web/src/components/storyboard-fullscreen.tsx`

- [ ] **Step 1: Create the component file**

Create `apps/web/src/components/storyboard-fullscreen.tsx` with exactly this content:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { buildSingleScreenHtml } from "@/lib/single-screen-bundler";
import type { StoryboardOption } from "@/lib/api";

interface Props {
  option: StoryboardOption;
  authMockup: { login: string; signup: string };
  onClose: () => void;
  onPick: () => void;
  picking: boolean;
}

interface Panel {
  label: string;
  code: string;
}

export default function StoryboardFullscreen({
  option,
  authMockup,
  onClose,
  onPick,
  picking,
}: Props) {
  const panels = useMemo<Panel[]>(() => {
    const list: Panel[] = [];
    if (authMockup.login) list.push({ label: "Login", code: authMockup.login });
    if (authMockup.signup) list.push({ label: "Signup", code: authMockup.signup });
    for (const step of option.flowStructure) {
      const code = option.mockupCode[step.stepName];
      if (!code) {
        console.warn(
          `[StoryboardFullscreen] missing mockup for step "${step.stepName}" in option "${option.name}"`
        );
        continue;
      }
      list.push({ label: step.stepName, code });
    }
    return list;
  }, [option, authMockup]);

  const [currentIndex, setCurrentIndex] = useState(0);

  // Keyboard: arrows navigate, Esc closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowRight") {
        setCurrentIndex((i) => Math.min(panels.length - 1, i + 1));
      } else if (e.key === "ArrowLeft") {
        setCurrentIndex((i) => Math.max(0, i - 1));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, panels.length]);

  // Prevent body scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const current = panels[currentIndex];
  const html = useMemo(
    () => (current ? buildSingleScreenHtml(current.code, current.label) : ""),
    [current]
  );

  const isAtStart = currentIndex === 0;
  const isAtEnd = currentIndex >= panels.length - 1;

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/75"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${option.name} fullscreen preview`}
    >
      <header
        className="flex items-center justify-between px-6 py-3 bg-gray-900 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0">
          <h2 className="text-base font-semibold truncate">{option.name}</h2>
          <p className="text-xs text-gray-400 truncate">
            {current ? current.label : "No screens"} · {panels.length === 0 ? 0 : currentIndex + 1} / {panels.length}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onPick}
            disabled={picking || panels.length === 0}
            className="px-4 py-1.5 bg-white text-gray-900 text-sm font-medium rounded-lg hover:bg-gray-100 disabled:opacity-50"
          >
            {picking ? "Building…" : "Pick this flow"}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close fullscreen preview"
            className="w-8 h-8 flex items-center justify-center text-gray-300 hover:text-white text-xl"
          >
            ×
          </button>
        </div>
      </header>

      <div
        className="flex-1 flex items-stretch justify-center p-6 min-h-0"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
          disabled={isAtStart}
          aria-label="Previous screen"
          className="flex-shrink-0 w-12 self-center text-white text-3xl disabled:opacity-30"
        >
          ‹
        </button>

        <div className="flex-1 bg-white rounded-lg overflow-hidden mx-4 shadow-2xl">
          {current ? (
            <iframe
              key={currentIndex}
              srcDoc={html}
              className="w-full h-full border-0 block"
              sandbox="allow-scripts"
              title={`${option.name} — ${current.label}`}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              No screens available.
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setCurrentIndex((i) => Math.min(panels.length - 1, i + 1))}
          disabled={isAtEnd}
          aria-label="Next screen"
          className="flex-shrink-0 w-12 self-center text-white text-3xl disabled:opacity-30"
        >
          ›
        </button>
      </div>
    </div>,
    document.body
  );
}
```

- [ ] **Step 2: Typecheck the web app**

```bash
cd /Users/ryanhaugland/onboarder/apps/web && npx tsc --noEmit
```

Expected: exit 0 with no output.

- [ ] **Step 3: Commit**

```bash
cd /Users/ryanhaugland/onboarder
git add apps/web/src/components/storyboard-fullscreen.tsx
git commit -m "feat(web): add StoryboardFullscreen modal with native-size carousel"
```

---

## Task 4: Wire modal into StoryboardStrip

**Files:**
- Modify: `apps/web/src/components/storyboard-strip.tsx`

- [ ] **Step 1: Rewrite storyboard-strip.tsx to add expand button + click overlay + modal mount**

Replace the entire contents of `apps/web/src/components/storyboard-strip.tsx` with:

```tsx
"use client";

import { useMemo, useState } from "react";
import { buildStoryboardStripHtml } from "@/lib/storyboard-bundler";
import StoryboardFullscreen from "./storyboard-fullscreen";
import type { StoryboardOption } from "@/lib/api";

interface Props {
  option: StoryboardOption;
  authMockup: { login: string; signup: string };
  onPick: () => void;
  picking: boolean;
}

export default function StoryboardStrip({ option, authMockup, onPick, picking }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  const html = useMemo(
    () =>
      buildStoryboardStripHtml({
        name: option.name,
        flowStructure: option.flowStructure,
        mockupCode: option.mockupCode,
        authMockup,
      }),
    [option, authMockup]
  );

  return (
    <>
      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <header className="flex items-start justify-between p-5 border-b border-gray-100">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{option.name}</h3>
            <p className="text-sm text-gray-500 mt-1 max-w-2xl">{option.rationale}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              aria-label={`Expand ${option.name} to fullscreen`}
              className="px-3 py-2 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center gap-1.5"
            >
              <span aria-hidden="true">⤢</span>
              <span>Expand</span>
            </button>
            <button
              type="button"
              onClick={onPick}
              disabled={picking}
              className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50"
            >
              {picking ? "Building…" : "Pick this flow"}
            </button>
          </div>
        </header>

        <div
          className="relative group cursor-zoom-in"
          onClick={() => setIsOpen(true)}
          role="button"
          tabIndex={0}
          aria-label={`Expand ${option.name} to fullscreen`}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setIsOpen(true);
            }
          }}
        >
          <iframe
            srcDoc={html}
            className="w-full h-[340px] border-0 block pointer-events-none"
            sandbox="allow-scripts"
            title={`${option.name} storyboard`}
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors pointer-events-none">
            <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white text-gray-900 text-sm font-medium px-3 py-1.5 rounded-lg shadow-lg flex items-center gap-1.5">
              <span aria-hidden="true">⤢</span>
              <span>Click to expand</span>
            </div>
          </div>
        </div>
      </section>

      {isOpen && (
        <StoryboardFullscreen
          option={option}
          authMockup={authMockup}
          onClose={() => setIsOpen(false)}
          onPick={onPick}
          picking={picking}
        />
      )}
    </>
  );
}
```

Key changes vs. prior version:
- New `isOpen` state, reset to `false` initially.
- Header has two buttons now: Expand (new) + Pick this flow (existing).
- Iframe wrapped in a clickable div with `cursor-zoom-in` and a hover overlay showing "Click to expand". `pointer-events-none` on the iframe so clicks hit the wrapper.
- `<StoryboardFullscreen>` mounts conditionally when `isOpen`.
- `React.Fragment` (`<>`) wraps the section so the modal can be a sibling.

- [ ] **Step 2: Typecheck the web app**

```bash
cd /Users/ryanhaugland/onboarder/apps/web && npx tsc --noEmit
```

Expected: exit 0 with no output.

- [ ] **Step 3: Commit**

```bash
cd /Users/ryanhaugland/onboarder
git add apps/web/src/components/storyboard-strip.tsx
git commit -m "feat(web): wire fullscreen modal into storyboard strip with expand affordance"
```

---

## Task 5: Manual E2E verification

**Why:** No automated tests for web UI. Verify interactively before marking done.

- [ ] **Step 1: Start dev servers**

```bash
cd /Users/ryanhaugland/onboarder && npm run dev
```

Wait until both apps are ready:
- API on http://localhost:3011 (tsx watch)
- Web on http://localhost:3012 (next dev)

- [ ] **Step 2: Reach the storyboard pick page**

In a browser: go to http://localhost:3012, upload a zipped Next.js project or select a local folder, wait for analysis + storyboards to generate (uses existing flow), land on the pick page with 3 strips.

- [ ] **Step 3: Verify hover affordance**

Hover over any strip's iframe area. Expected: dark overlay fades in, "⤢ Click to expand" pill appears centered. Cursor becomes `zoom-in`.

- [ ] **Step 4: Open modal via iframe click**

Click anywhere on a strip's iframe thumbnail. Expected: fullscreen modal overlays the page. Header shows option name, current screen label ("Login"), and "1 / N". First screen renders at native size in the white panel.

- [ ] **Step 5: Navigate with keyboard**

Press `→` repeatedly. Expected: label + indicator update (Login → Signup → first step name → …). At the last screen, `→` does nothing and the right arrow button is dimmed.

Press `←` to go back. Expected: navigates in reverse. At index 0, left arrow is dimmed.

- [ ] **Step 6: Navigate with on-screen buttons**

Click the `›` and `‹` buttons. Expected: same as keyboard navigation.

- [ ] **Step 7: Close via Esc**

Press `Esc`. Expected: modal closes, storyboard pick page visible again.

- [ ] **Step 8: Close via backdrop click**

Open modal again, click outside the white content panel (on the dark backdrop). Expected: modal closes.

- [ ] **Step 9: Close via × button**

Open modal, click × in top-right. Expected: modal closes.

- [ ] **Step 10: Open via Expand button**

In the strip header, click "⤢ Expand". Expected: modal opens (same as iframe click path).

- [ ] **Step 11: Pick from inside modal**

Open modal on any option, click "Pick this flow" in the modal header. Expected: button shows "Building…", build completes, page transitions to full preview (same behavior as clicking Pick from the strip header). No lingering modal.

- [ ] **Step 12: Verify no regression on strip-level Pick**

Go back to storyboards (from full preview), click "Pick this flow" directly on a strip (without opening modal). Expected: builds and transitions same as before.

- [ ] **Step 13: State reset check**

Open modal on option A, navigate to index 3, close. Open modal on option B. Expected: starts at index 0 (Login), not index 3.

- [ ] **Step 14: Verify body scroll lock**

Open a modal. Try to scroll the underlying page. Expected: page does not scroll (only the iframe content can scroll internally). Close modal. Expected: page scrolls normally again.

- [ ] **Step 15: Commit verification record**

```bash
cd /Users/ryanhaugland/onboarder
git commit --allow-empty -m "chore: verify storyboard fullscreen preview end-to-end"
```

**Important:** Before running the above, confirm `git diff --cached` shows nothing staged and `git status` shows a clean tree. If anything is staged, do NOT commit — investigate first. (This is a lesson from the prior plan's verification commit, which silently captured staged changes.)

---

## Plan Self-Review

**Spec coverage:**
- ✅ "Modal + carousel component" → Task 3
- ✅ "Single-screen iframe renderer" → Task 2 (with helper export prep in Task 1)
- ✅ "Entry points: iframe click + explicit Expand button + hover affordance" → Task 4
- ✅ "Keyboard (← → Esc) and pointer navigation" → Task 3 (implementation), Task 5 steps 5-9 (verification)
- ✅ "'Pick this flow' from inside the modal" → Task 3 (implementation), Task 5 step 11 (verification)
- ✅ "No changes to API, session storage, routing, database" → confirmed by file list
- ✅ Panel order Login → Signup → flow steps → Task 3 (`panels` useMemo)
- ✅ Skip missing step mockups with console warning → Task 3
- ✅ Portal mount → Task 3 (`createPortal(..., document.body)`)
- ✅ Body scroll lock → Task 3 (step 14 verifies)
- ✅ State reset on reopen of different option → Task 4 (`isOpen` state scoped per strip, so opening a new strip mounts a fresh StoryboardFullscreen with currentIndex=0) → Task 5 step 13 verifies
- ⚠️ Spec says "Light smoke test for StoryboardFullscreen using React Testing Library" — deferred per testing note at top of plan (no test infra in apps/web, adding it is out of scope). Covered by manual Task 5 instead.

**Placeholder scan:** No TBDs, no "add error handling" stubs, all code blocks complete. The sole commented warning is in Task 5 Step 15 (`--allow-empty` gotcha from prior plan) which is a concrete safeguard, not a placeholder.

**Type consistency:**
- `StoryboardOption` imported from `@/lib/api` in both Task 3 and Task 4 → consistent.
- `authMockup: { login: string; signup: string }` shape matches Task 3 Props and Task 4 Props and storyboard-bundler input → consistent.
- `buildSingleScreenHtml(code, label)` — signature defined in Task 2, called in Task 3 with same arg order → consistent.
- Exported helper names in Task 1 match imports in Task 2 → consistent.
