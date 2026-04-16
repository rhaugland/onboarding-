# Storyboard Remix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users start from one generated storyboard option and iteratively customize individual screens (edit/regen, swap from sibling, skip) into a finalized remix that lives alongside the originals.

**Architecture:** A customize "draft" is an `onboarding_options` row with `status='customizing'` and `base_option_id` pointing to its source. Users edit per-screen via Claude regen or sibling swap; skipped steps are tracked on the row. Finalize flips the row to `status='ready'`, filters out skipped steps, and hands off to the existing `/api/build` flow. Frontend adds a new `/customize/[id]` page that reuses the existing fullscreen modal in single-panel mode.

**Tech Stack:** Next.js 15 (App Router, React 19), Hono + Drizzle + Postgres, Anthropic SDK, Vitest, Tailwind v4, TypeScript NodeNext.

**Spec:** `docs/superpowers/specs/2026-04-16-storyboard-remix-design.md`

**Branch strategy:** Create `feature/storyboard-remix` off current master. Commit frequently. Don't merge until after the full plan is executed and manually verified.

---

## Task 1: Fix pre-existing API test failures (prerequisite)

These 3 tests fail on master today. Must be green before we add new tests so regressions are detectable.

**Files:**
- Modify: `apps/api/tests/services/claude.test.ts`
- Modify: `apps/api/tests/services/generator.test.ts`

- [ ] **Step 1: Read the failing tests and source to understand the shape drift**

Run: `npx turbo test --filter=@onboarder/api 2>&1 | grep -A 5 "FAIL"`

Read `apps/api/src/services/claude.ts` (already uses `.messages.stream(...).finalMessage()`) and `apps/api/src/services/generator.ts` (expects `componentCode` on each option response).

- [ ] **Step 2: Update claude.test.ts mock to match the streaming SDK surface**

The mock currently returns `{content: [...]}` from `messages.create(...)`. Replace with a `.messages.stream()` mock whose return has `.finalMessage()` resolving to `{content: [{type:"text", text:"..."}], stop_reason:"end_turn"}`.

Open `apps/api/tests/services/claude.test.ts` and replace the Anthropic mock. The key: `getClient().messages.stream({...}).finalMessage()` must be awaitable and return a final message with `content[0].text`.

```typescript
// Replacement mock — matches real SDK surface used in claude.ts
vi.mock("@anthropic-ai/sdk", () => {
  const finalMessage = vi.fn();
  const stream = vi.fn(() => ({ finalMessage }));
  const Anthropic = vi.fn(() => ({ messages: { stream } }));
  return { default: Anthropic, __helpers: { finalMessage, stream } };
});

// In each test, configure the finalMessage mock:
const sdk = (await import("@anthropic-ai/sdk")) as any;
sdk.__helpers.finalMessage.mockResolvedValue({
  content: [{ type: "text", text: '{"foo":"bar"}' }],
  stop_reason: "end_turn",
});
```

- [ ] **Step 3: Run the claude tests to verify they pass**

Run: `cd apps/api && npx vitest run tests/services/claude.test.ts`
Expected: All claude tests PASS.

- [ ] **Step 4: Update generator.test.ts mock to return componentCode on every option**

Open `apps/api/tests/services/generator.test.ts` and inspect the `sendPrompt` mock. It likely returns a plan response but not the per-option code response. Add the per-option code shape. Look at `apps/api/src/services/generator.ts:72-90` for what's expected: `result.componentCode` (a non-null object) for each option.

Update the mock so each option's mockup-code call resolves to `{componentCode: {"step-name": "<Step/>"}}` (keys matching that option's flowStructure).

- [ ] **Step 5: Run the generator tests to verify they pass**

Run: `cd apps/api && npx vitest run tests/services/generator.test.ts`
Expected: Generator tests PASS.

- [ ] **Step 6: Run the full API suite**

Run: `cd apps/api && npx vitest run`
Expected: All tests PASS (0 failures).

- [ ] **Step 7: Commit**

```bash
git add apps/api/tests/services/claude.test.ts apps/api/tests/services/generator.test.ts
git commit -m "fix(api): update test mocks to match current SDK and generator surfaces"
```

---

## Task 2: Add enum values + columns to schema

**Files:**
- Modify: `packages/db/src/schema.ts`

- [ ] **Step 1: Extend optionStatusEnum with two new values**

Open `packages/db/src/schema.ts`. Update `optionStatusEnum`:

```typescript
export const optionStatusEnum = pgEnum("option_status", [
  "storyboard",
  "customizing",
  "ready",
  "built",
]);
```

- [ ] **Step 2: Add base_option_id, skipped_steps, and customize_history columns**

In the same file, extend the `onboardingOptions` table. Add three columns after `selected`:

```typescript
export const onboardingOptions = pgTable("onboarding_options", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .references(() => projects.id)
    .notNull(),
  name: text("name").notNull(),
  rationale: text("rationale").notNull(),
  flowStructure: jsonb("flow_structure").notNull(),
  mockupCode: jsonb("mockup_code"),
  componentCode: jsonb("component_code"),
  authCode: jsonb("auth_code"),
  status: optionStatusEnum("status").default("storyboard").notNull(),
  selected: boolean("selected").default(false).notNull(),
  baseOptionId: uuid("base_option_id"),
  skippedSteps: text("skipped_steps").array().notNull().default([]),
  customizeHistory: jsonb("customize_history").notNull().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

Note: `baseOptionId` is a self-reference but we intentionally do NOT add a Drizzle `.references()` because self-referencing a table in Drizzle requires a separate declaration pattern — we'll just add the FK constraint in the migration SQL.

- [ ] **Step 3: Verify type-check passes**

Run: `cd packages/db && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema.ts
git commit -m "feat(db): add remix columns and option_status values for customize drafts"
```

---

## Task 3: Write the migration SQL

**Files:**
- Create: `packages/db/drizzle/0002_customize_columns.sql`

- [ ] **Step 1: Create the migration file**

Drizzle-kit can generate this automatically but to keep the plan bulletproof we write it by hand. Create `packages/db/drizzle/0002_customize_columns.sql`:

```sql
ALTER TYPE "public"."option_status" ADD VALUE IF NOT EXISTS 'customizing';--> statement-breakpoint
ALTER TYPE "public"."option_status" ADD VALUE IF NOT EXISTS 'ready';--> statement-breakpoint
ALTER TABLE "onboarding_options" ADD COLUMN "base_option_id" uuid;--> statement-breakpoint
ALTER TABLE "onboarding_options" ADD COLUMN "skipped_steps" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "onboarding_options" ADD COLUMN "customize_history" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "onboarding_options" ADD CONSTRAINT "onboarding_options_base_option_id_fk" FOREIGN KEY ("base_option_id") REFERENCES "public"."onboarding_options"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
```

Note: `ALTER TYPE ... ADD VALUE` cannot run inside a transaction in Postgres. Drizzle's migration runner handles each `statement-breakpoint`-separated statement as its own transaction unit.

- [ ] **Step 2: Register the migration in the meta file**

Open `packages/db/drizzle/meta/_journal.json` (if present). Append a new entry for this migration following the existing pattern. If the file doesn't exist, skip this step — drizzle-kit generates the meta automatically on next `db:generate`.

Run: `ls packages/db/drizzle/meta/` to confirm.

- [ ] **Step 3: Apply the migration to your local DB**

Run: `npm run db:migrate` (from repo root)
Expected: Migration applies cleanly. No errors.

- [ ] **Step 4: Verify the schema with a quick query**

Run (via your local psql or a temp script):
```sql
SELECT unnest(enum_range(NULL::option_status));
```
Expected: Returns 4 rows: `storyboard`, `customizing`, `ready`, `built`.

- [ ] **Step 5: Commit**

```bash
git add packages/db/drizzle/0002_customize_columns.sql packages/db/drizzle/meta/
git commit -m "feat(db): migration for customize draft columns and new enum values"
```

---

## Task 4: Write the customize prompts module

**Files:**
- Create: `apps/api/src/prompts/customize.ts`

- [ ] **Step 1: Create the prompts file with system + user builder**

Create `apps/api/src/prompts/customize.ts`:

```typescript
export const REGENERATE_SCREEN_SYSTEM_PROMPT = `You are editing ONE static JSX mockup of a single onboarding screen. The user wants a specific change applied. Keep everything else identical.

## CRITICAL: Static Only
- NO useState, useEffect, or any hooks
- NO event handlers (onClick, onSubmit, onChange)
- NO props — each component is a zero-argument function
- Plain JavaScript JSX, NOT TypeScript
- No import statements, no "use client"
- Default-exported zero-argument function returning JSX

## Preserve
- The component's default export name and signature
- Any copy/text that the user did NOT ask to change
- Overall layout unless the user explicitly requests a layout change
- Brand colors — if the current code uses resolved HSL/hex values, keep that exact style; never emit var(--primary) or bg-primary

## Apply
- The user's requested change, faithfully and literally
- If the request is ambiguous, pick the smallest interpretation

Respond with ONLY valid JSON:
{
  "mockupCode": "string - the updated static JSX component"
}`;

export function buildRegenerateScreenUserMessage(
  stepName: string,
  stepDescription: string,
  currentCode: string,
  userPrompt: string
): string {
  return [
    `# Regenerate Screen: ${stepName}`,
    ``,
    `## Step Description`,
    stepDescription,
    ``,
    `## Current Mockup`,
    "```jsx",
    currentCode,
    "```",
    ``,
    `## Requested Change`,
    userPrompt,
    ``,
    `Apply the requested change to the current mockup. Return the full updated component. Keep the default export name and signature identical. Static JSX only.`,
  ].join("\n");
}
```

- [ ] **Step 2: Verify type-check**

Run: `cd apps/api && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/prompts/customize.ts
git commit -m "feat(api): add customize prompts for single-screen regeneration"
```

---

## Task 5: Write the screen-regenerator service (test first)

**Files:**
- Create: `apps/api/tests/services/screen-regenerator.test.ts`
- Create: `apps/api/src/services/screen-regenerator.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/services/screen-regenerator.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const sendPromptMock = vi.fn();
vi.mock("../../src/services/claude.js", () => ({
  sendPrompt: sendPromptMock,
}));

describe("screen regenerator", () => {
  beforeEach(() => sendPromptMock.mockReset());

  it("returns updated mockupCode on happy path", async () => {
    sendPromptMock.mockResolvedValue({
      mockupCode: "function Welcome(){return <div>new</div>}",
    });
    const { regenerateScreen } = await import(
      "../../src/services/screen-regenerator.js"
    );
    const result = await regenerateScreen({
      stepName: "welcome",
      stepDescription: "greeting screen",
      currentCode: "function Welcome(){return <div>old</div>}",
      userPrompt: "change the text",
    });
    expect(result).toEqual({
      mockupCode: "function Welcome(){return <div>new</div>}",
    });
    expect(sendPromptMock).toHaveBeenCalledTimes(1);
  });

  it("throws GenerationFailedError when response lacks mockupCode", async () => {
    sendPromptMock.mockResolvedValue({ foo: "bar" });
    const { regenerateScreen, GenerationFailedError } = await import(
      "../../src/services/screen-regenerator.js"
    );
    await expect(
      regenerateScreen({
        stepName: "welcome",
        stepDescription: "d",
        currentCode: "x",
        userPrompt: "y",
      })
    ).rejects.toBeInstanceOf(GenerationFailedError);
  });

  it("throws GenerationFailedError when response.mockupCode is not a string", async () => {
    sendPromptMock.mockResolvedValue({ mockupCode: { notAString: true } });
    const { regenerateScreen, GenerationFailedError } = await import(
      "../../src/services/screen-regenerator.js"
    );
    await expect(
      regenerateScreen({
        stepName: "welcome",
        stepDescription: "d",
        currentCode: "x",
        userPrompt: "y",
      })
    ).rejects.toBeInstanceOf(GenerationFailedError);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx vitest run tests/services/screen-regenerator.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service**

Create `apps/api/src/services/screen-regenerator.ts`:

```typescript
import { sendPrompt } from "./claude.js";
import {
  REGENERATE_SCREEN_SYSTEM_PROMPT,
  buildRegenerateScreenUserMessage,
} from "../prompts/customize.js";

export class GenerationFailedError extends Error {
  readonly retryable = true;
  constructor(message: string) {
    super(message);
    this.name = "GenerationFailedError";
  }
}

interface RegenerateInput {
  stepName: string;
  stepDescription: string;
  currentCode: string;
  userPrompt: string;
}

interface RegenerateResult {
  mockupCode: string;
}

export async function regenerateScreen(
  input: RegenerateInput
): Promise<RegenerateResult> {
  const userMsg = buildRegenerateScreenUserMessage(
    input.stepName,
    input.stepDescription,
    input.currentCode,
    input.userPrompt
  );

  const response = (await sendPrompt(
    REGENERATE_SCREEN_SYSTEM_PROMPT,
    userMsg
  )) as { mockupCode?: unknown };

  if (
    !response ||
    typeof response !== "object" ||
    typeof response.mockupCode !== "string" ||
    response.mockupCode.length === 0
  ) {
    throw new GenerationFailedError(
      `Regenerate response missing or malformed mockupCode for step "${input.stepName}"`
    );
  }

  return { mockupCode: response.mockupCode };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && npx vitest run tests/services/screen-regenerator.test.ts`
Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/screen-regenerator.ts apps/api/tests/services/screen-regenerator.test.ts
git commit -m "feat(api): add screen-regenerator service with GenerationFailedError"
```

---

## Task 6: Add customize route — POST (create draft, idempotent)

**Files:**
- Create: `apps/api/src/routes/customize.ts`
- Create: `apps/api/tests/routes/customize.test.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Write the failing test for POST /api/customize**

Create `apps/api/tests/routes/customize.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const selectMock = vi.fn();
const insertMock = vi.fn();
const updateMock = vi.fn();

vi.mock("@onboarder/db", () => ({
  db: {
    select: (...args: any[]) => selectMock(...args),
    insert: (...args: any[]) => insertMock(...args),
    update: (...args: any[]) => updateMock(...args),
  },
  onboardingOptions: { id: "id", projectId: "projectId", baseOptionId: "baseOptionId", status: "status" },
  projects: {},
  eq: vi.fn((col, val) => ({ __eq: [col, val] })),
  and: vi.fn((...args) => ({ __and: args })),
}));

vi.mock("../../src/services/screen-regenerator.js", () => ({
  regenerateScreen: vi.fn(),
  GenerationFailedError: class extends Error {},
}));

describe("POST /api/customize", () => {
  beforeEach(() => {
    selectMock.mockReset();
    insertMock.mockReset();
    updateMock.mockReset();
  });

  it("creates a draft cloned from base option", async () => {
    // First select: base option lookup. Second select: existing draft check (none).
    selectMock
      .mockReturnValueOnce({
        from: () => ({
          where: () =>
            Promise.resolve([
              {
                id: "base-1",
                projectId: "proj-1",
                name: "Wizard",
                rationale: "good for setup",
                flowStructure: [{ stepName: "welcome", type: "form", description: "d" }],
                mockupCode: { welcome: "<Welcome/>" },
                status: "storyboard",
              },
            ]),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({ where: () => Promise.resolve([]) }),
      });

    const inserted: any[] = [];
    insertMock.mockReturnValue({
      values: (v: any) => ({
        returning: () => {
          const row = { ...v, id: "draft-1" };
          inserted.push(row);
          return Promise.resolve([row]);
        },
      }),
    });

    const { default: app } = await import("../../src/index.js");
    const res = await app.request("/api/customize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseOptionId: "base-1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("draft-1");
    expect(body.status).toBe("customizing");
    expect(body.baseOptionId).toBe("base-1");
    expect(body.name).toContain("Remix");
    expect(inserted[0].mockupCode).toEqual({ welcome: "<Welcome/>" });
  });

  it("returns existing draft when one already exists for (project, base)", async () => {
    selectMock
      .mockReturnValueOnce({
        from: () => ({
          where: () =>
            Promise.resolve([
              {
                id: "base-1",
                projectId: "proj-1",
                name: "Wizard",
                rationale: "r",
                flowStructure: [],
                mockupCode: {},
                status: "storyboard",
              },
            ]),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () =>
            Promise.resolve([{ id: "existing-draft", status: "customizing" }]),
        }),
      });

    const { default: app } = await import("../../src/index.js");
    const res = await app.request("/api/customize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseOptionId: "base-1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("existing-draft");
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("rejects without baseOptionId", async () => {
    const { default: app } = await import("../../src/index.js");
    const res = await app.request("/api/customize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when base option does not exist", async () => {
    selectMock.mockReturnValueOnce({
      from: () => ({ where: () => Promise.resolve([]) }),
    });
    const { default: app } = await import("../../src/index.js");
    const res = await app.request("/api/customize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseOptionId: "missing" }),
    });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx vitest run tests/routes/customize.test.ts`
Expected: FAIL — no route registered yet.

- [ ] **Step 3: Implement the route file with POST handler**

Create `apps/api/src/routes/customize.ts`:

```typescript
import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { db, onboardingOptions } from "@onboarder/db";

const customize = new Hono();

customize.post("/", async (c) => {
  const { baseOptionId } = await c.req.json<{ baseOptionId?: string }>();
  if (!baseOptionId) {
    return c.json({ error: "baseOptionId is required" }, 400);
  }

  const [base] = await db
    .select()
    .from(onboardingOptions)
    .where(eq(onboardingOptions.id, baseOptionId));

  if (!base) {
    return c.json({ error: "Base option not found" }, 404);
  }

  // Idempotency: return existing draft for (project, base) if one is active
  const existing = await db
    .select()
    .from(onboardingOptions)
    .where(
      and(
        eq(onboardingOptions.projectId, base.projectId),
        eq(onboardingOptions.baseOptionId, baseOptionId),
        eq(onboardingOptions.status, "customizing")
      )
    );

  if (existing.length > 0) {
    return c.json(existing[0]);
  }

  const [draft] = await db
    .insert(onboardingOptions)
    .values({
      projectId: base.projectId,
      name: `${base.name} — Remix`,
      rationale: base.rationale,
      flowStructure: base.flowStructure,
      mockupCode: base.mockupCode,
      status: "customizing",
      baseOptionId,
      skippedSteps: [],
      customizeHistory: [],
    })
    .returning();

  return c.json(draft);
});

export default customize;
```

- [ ] **Step 4: Register the route in index.ts**

Open `apps/api/src/index.ts`. Add the import and route registration:

```typescript
import customize from "./routes/customize.js";
// ... other imports ...

app.route("/api/customize", customize);
```

Place the import alongside other route imports (around line 10) and the registration alongside other `app.route` calls (around line 25).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/api && npx vitest run tests/routes/customize.test.ts`
Expected: All 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/customize.ts apps/api/tests/routes/customize.test.ts apps/api/src/index.ts
git commit -m "feat(api): add POST /api/customize for idempotent draft creation"
```

---

## Task 7: Add GET /api/customize/:id

**Files:**
- Modify: `apps/api/src/routes/customize.ts`
- Modify: `apps/api/tests/routes/customize.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `apps/api/tests/routes/customize.test.ts` (new describe block, beforeEach already defined in file scope — reuse):

```typescript
describe("GET /api/customize/:id", () => {
  beforeEach(() => {
    selectMock.mockReset();
  });

  it("returns draft with siblings", async () => {
    selectMock
      .mockReturnValueOnce({
        from: () => ({
          where: () =>
            Promise.resolve([
              {
                id: "draft-1",
                projectId: "proj-1",
                baseOptionId: "base-1",
                status: "customizing",
                flowStructure: [{ stepName: "welcome", type: "form", description: "d" }],
                mockupCode: { welcome: "<W/>" },
                name: "Wizard — Remix",
                rationale: "r",
                skippedSteps: [],
                customizeHistory: [],
              },
            ]),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () =>
            Promise.resolve([
              { id: "base-1", name: "Wizard", flowStructure: [], mockupCode: {}, status: "storyboard" },
              { id: "sib-2", name: "Tour", flowStructure: [], mockupCode: {}, status: "storyboard" },
            ]),
        }),
      });

    const { default: app } = await import("../../src/index.js");
    const res = await app.request("/api/customize/draft-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.draft.id).toBe("draft-1");
    expect(body.siblings).toHaveLength(2);
  });

  it("returns 404 when draft missing", async () => {
    selectMock.mockReturnValueOnce({
      from: () => ({ where: () => Promise.resolve([]) }),
    });
    const { default: app } = await import("../../src/index.js");
    const res = await app.request("/api/customize/missing");
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx vitest run tests/routes/customize.test.ts`
Expected: New GET tests FAIL; existing POST tests PASS.

- [ ] **Step 3: Add the GET handler**

In `apps/api/src/routes/customize.ts`, before `export default`, add:

```typescript
customize.get("/:id", async (c) => {
  const id = c.req.param("id");
  const [draft] = await db
    .select()
    .from(onboardingOptions)
    .where(eq(onboardingOptions.id, id));

  if (!draft) {
    return c.json({ error: "Draft not found" }, 404);
  }

  const siblings = await db
    .select()
    .from(onboardingOptions)
    .where(
      and(
        eq(onboardingOptions.projectId, draft.projectId),
        eq(onboardingOptions.status, "storyboard")
      )
    );

  return c.json({ draft, siblings });
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && npx vitest run tests/routes/customize.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/customize.ts apps/api/tests/routes/customize.test.ts
git commit -m "feat(api): add GET /api/customize/:id returning draft + siblings"
```

---

## Task 8: Add PATCH /api/customize/:id (skippedSteps only)

**Files:**
- Modify: `apps/api/src/routes/customize.ts`
- Modify: `apps/api/tests/routes/customize.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `apps/api/tests/routes/customize.test.ts`:

```typescript
describe("PATCH /api/customize/:id", () => {
  beforeEach(() => {
    selectMock.mockReset();
    updateMock.mockReset();
  });

  it("updates skippedSteps when all step names are valid", async () => {
    selectMock.mockReturnValueOnce({
      from: () => ({
        where: () =>
          Promise.resolve([
            {
              id: "draft-1",
              flowStructure: [
                { stepName: "welcome", type: "form", description: "d" },
                { stepName: "profile", type: "form", description: "d" },
              ],
            },
          ]),
      }),
    });

    let captured: any = null;
    updateMock.mockReturnValue({
      set: (data: any) => {
        captured = data;
        return { where: () => Promise.resolve(undefined) };
      },
    });

    const { default: app } = await import("../../src/index.js");
    const res = await app.request("/api/customize/draft-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skippedSteps: ["profile"] }),
    });

    expect(res.status).toBe(200);
    expect(captured.skippedSteps).toEqual(["profile"]);
  });

  it("rejects unknown step names", async () => {
    selectMock.mockReturnValueOnce({
      from: () => ({
        where: () =>
          Promise.resolve([
            {
              id: "draft-1",
              flowStructure: [{ stepName: "welcome", type: "form", description: "d" }],
            },
          ]),
      }),
    });

    const { default: app } = await import("../../src/index.js");
    const res = await app.request("/api/customize/draft-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skippedSteps: ["welcome", "bogus"] }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects fields other than skippedSteps", async () => {
    selectMock.mockReturnValueOnce({
      from: () => ({
        where: () =>
          Promise.resolve([{ id: "draft-1", flowStructure: [] }]),
      }),
    });

    const { default: app } = await import("../../src/index.js");
    const res = await app.request("/api/customize/draft-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "new name" }),
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx vitest run tests/routes/customize.test.ts`
Expected: New PATCH tests FAIL.

- [ ] **Step 3: Add the PATCH handler**

In `apps/api/src/routes/customize.ts`, before `export default`, add:

```typescript
customize.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = (await c.req.json()) as Record<string, unknown>;
  const keys = Object.keys(body);

  if (keys.length !== 1 || keys[0] !== "skippedSteps") {
    return c.json(
      { error: "Only skippedSteps may be updated via PATCH" },
      400
    );
  }

  const skippedSteps = body.skippedSteps;
  if (
    !Array.isArray(skippedSteps) ||
    !skippedSteps.every((s) => typeof s === "string")
  ) {
    return c.json({ error: "skippedSteps must be string[]" }, 400);
  }

  const [draft] = await db
    .select()
    .from(onboardingOptions)
    .where(eq(onboardingOptions.id, id));
  if (!draft) return c.json({ error: "Draft not found" }, 404);

  const validSteps = new Set(
    (draft.flowStructure as Array<{ stepName: string }>).map((s) => s.stepName)
  );
  const unknown = skippedSteps.filter((s: string) => !validSteps.has(s));
  if (unknown.length > 0) {
    return c.json(
      { error: `Unknown step names: ${unknown.join(", ")}` },
      400
    );
  }

  await db
    .update(onboardingOptions)
    .set({ skippedSteps: skippedSteps as string[] })
    .where(eq(onboardingOptions.id, id));

  return c.json({ ok: true });
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && npx vitest run tests/routes/customize.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/customize.ts apps/api/tests/routes/customize.test.ts
git commit -m "feat(api): add PATCH /api/customize/:id for skippedSteps"
```

---

## Task 9: Add POST /api/customize/:id/screens/:stepName/regenerate

**Files:**
- Modify: `apps/api/src/routes/customize.ts`
- Modify: `apps/api/tests/routes/customize.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `apps/api/tests/routes/customize.test.ts`:

```typescript
describe("POST /api/customize/:id/screens/:stepName/regenerate", () => {
  beforeEach(() => {
    selectMock.mockReset();
    updateMock.mockReset();
  });

  it("regenerates and persists updated mockup for matching step", async () => {
    selectMock.mockReturnValueOnce({
      from: () => ({
        where: () =>
          Promise.resolve([
            {
              id: "draft-1",
              flowStructure: [
                { stepName: "welcome", type: "form", description: "greet" },
              ],
              mockupCode: { welcome: "<Old/>" },
              customizeHistory: [],
            },
          ]),
      }),
    });

    let captured: any = null;
    updateMock.mockReturnValue({
      set: (data: any) => {
        captured = data;
        return { where: () => Promise.resolve(undefined) };
      },
    });

    const { regenerateScreen } = await import(
      "../../src/services/screen-regenerator.js"
    );
    (regenerateScreen as any).mockResolvedValue({ mockupCode: "<New/>" });

    const { default: app } = await import("../../src/index.js");
    const res = await app.request(
      "/api/customize/draft-1/screens/welcome/regenerate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "make it green" }),
      }
    );

    expect(res.status).toBe(200);
    expect(captured.mockupCode.welcome).toBe("<New/>");
    expect(captured.customizeHistory).toHaveLength(1);
    expect(captured.customizeHistory[0].type).toBe("regenerate");
  });

  it("returns 404 when step not in flowStructure", async () => {
    selectMock.mockReturnValueOnce({
      from: () => ({
        where: () =>
          Promise.resolve([
            {
              id: "draft-1",
              flowStructure: [{ stepName: "welcome", type: "form", description: "d" }],
              mockupCode: { welcome: "<W/>" },
              customizeHistory: [],
            },
          ]),
      }),
    });

    const { default: app } = await import("../../src/index.js");
    const res = await app.request(
      "/api/customize/draft-1/screens/bogus/regenerate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "x" }),
      }
    );
    expect(res.status).toBe(404);
  });

  it("rejects empty prompt", async () => {
    const { default: app } = await import("../../src/index.js");
    const res = await app.request(
      "/api/customize/draft-1/screens/welcome/regenerate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "   " }),
      }
    );
    expect(res.status).toBe(400);
  });

  it("returns retryable error on GenerationFailedError", async () => {
    selectMock.mockReturnValueOnce({
      from: () => ({
        where: () =>
          Promise.resolve([
            {
              id: "draft-1",
              flowStructure: [{ stepName: "welcome", type: "form", description: "d" }],
              mockupCode: { welcome: "<W/>" },
              customizeHistory: [],
            },
          ]),
      }),
    });

    const { regenerateScreen, GenerationFailedError } = await import(
      "../../src/services/screen-regenerator.js"
    );
    (regenerateScreen as any).mockRejectedValue(
      new GenerationFailedError("bad")
    );

    const { default: app } = await import("../../src/index.js");
    const res = await app.request(
      "/api/customize/draft-1/screens/welcome/regenerate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "x" }),
      }
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("generation_failed");
    expect(body.retryable).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx vitest run tests/routes/customize.test.ts`
Expected: New regenerate tests FAIL.

- [ ] **Step 3: Add the regenerate handler**

In `apps/api/src/routes/customize.ts`:

Add import at the top:

```typescript
import {
  regenerateScreen,
  GenerationFailedError,
} from "../services/screen-regenerator.js";
```

Then before `export default`, add:

```typescript
customize.post("/:id/screens/:stepName/regenerate", async (c) => {
  const id = c.req.param("id");
  const stepName = c.req.param("stepName");
  const { prompt } = await c.req.json<{ prompt?: string }>();

  const trimmed = (prompt ?? "").trim();
  if (trimmed.length === 0) {
    return c.json({ error: "prompt is required" }, 400);
  }

  const [draft] = await db
    .select()
    .from(onboardingOptions)
    .where(eq(onboardingOptions.id, id));
  if (!draft) return c.json({ error: "Draft not found" }, 404);

  const flow = draft.flowStructure as Array<{
    stepName: string;
    type: string;
    description: string;
  }>;
  const step = flow.find((s) => s.stepName === stepName);
  if (!step) return c.json({ error: "Step not found" }, 404);

  const mockupCode = (draft.mockupCode ?? {}) as Record<string, string>;
  const currentCode = mockupCode[stepName];
  if (!currentCode) {
    return c.json({ error: "No existing mockup for this step" }, 404);
  }

  try {
    const result = await regenerateScreen({
      stepName,
      stepDescription: step.description,
      currentCode,
      userPrompt: trimmed,
    });

    const newMockupCode = { ...mockupCode, [stepName]: result.mockupCode };
    const history = [
      ...((draft.customizeHistory ?? []) as Array<Record<string, unknown>>),
      {
        timestamp: new Date().toISOString(),
        type: "regenerate",
        stepName,
        prompt: trimmed,
      },
    ];

    await db
      .update(onboardingOptions)
      .set({ mockupCode: newMockupCode, customizeHistory: history })
      .where(eq(onboardingOptions.id, id));

    return c.json({ ok: true, mockupCode: result.mockupCode });
  } catch (err) {
    if (err instanceof GenerationFailedError) {
      return c.json(
        { error: "generation_failed", retryable: true, message: err.message },
        502
      );
    }
    throw err;
  }
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && npx vitest run tests/routes/customize.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/customize.ts apps/api/tests/routes/customize.test.ts
git commit -m "feat(api): add regenerate screen endpoint with retryable failure surface"
```

---

## Task 10: Add POST /api/customize/:id/screens/:stepName/swap

**Files:**
- Modify: `apps/api/src/routes/customize.ts`
- Modify: `apps/api/tests/routes/customize.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `apps/api/tests/routes/customize.test.ts`:

```typescript
describe("POST /api/customize/:id/screens/:stepName/swap", () => {
  beforeEach(() => {
    selectMock.mockReset();
    updateMock.mockReset();
  });

  it("copies matching step from source option", async () => {
    selectMock
      .mockReturnValueOnce({
        from: () => ({
          where: () =>
            Promise.resolve([
              {
                id: "draft-1",
                projectId: "proj-1",
                flowStructure: [
                  { stepName: "welcome", type: "form", description: "d" },
                ],
                mockupCode: { welcome: "<Old/>" },
                customizeHistory: [],
              },
            ]),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () =>
            Promise.resolve([
              {
                id: "sib-2",
                projectId: "proj-1",
                mockupCode: { welcome: "<FromTour/>" },
              },
            ]),
        }),
      });

    let captured: any = null;
    updateMock.mockReturnValue({
      set: (data: any) => {
        captured = data;
        return { where: () => Promise.resolve(undefined) };
      },
    });

    const { default: app } = await import("../../src/index.js");
    const res = await app.request(
      "/api/customize/draft-1/screens/welcome/swap",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceOptionId: "sib-2" }),
      }
    );
    expect(res.status).toBe(200);
    expect(captured.mockupCode.welcome).toBe("<FromTour/>");
    expect(captured.customizeHistory[0].type).toBe("swap");
    expect(captured.customizeHistory[0].sourceOptionId).toBe("sib-2");
  });

  it("returns 400 when source is missing the step", async () => {
    selectMock
      .mockReturnValueOnce({
        from: () => ({
          where: () =>
            Promise.resolve([
              {
                id: "draft-1",
                projectId: "proj-1",
                flowStructure: [
                  { stepName: "welcome", type: "form", description: "d" },
                ],
                mockupCode: { welcome: "<Old/>" },
                customizeHistory: [],
              },
            ]),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () =>
            Promise.resolve([
              { id: "sib-2", projectId: "proj-1", mockupCode: {} },
            ]),
        }),
      });

    const { default: app } = await import("../../src/index.js");
    const res = await app.request(
      "/api/customize/draft-1/screens/welcome/swap",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceOptionId: "sib-2" }),
      }
    );
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx vitest run tests/routes/customize.test.ts`
Expected: New swap tests FAIL.

- [ ] **Step 3: Add the swap handler**

In `apps/api/src/routes/customize.ts`, before `export default`, add:

```typescript
customize.post("/:id/screens/:stepName/swap", async (c) => {
  const id = c.req.param("id");
  const stepName = c.req.param("stepName");
  const { sourceOptionId } = await c.req.json<{ sourceOptionId?: string }>();
  if (!sourceOptionId) {
    return c.json({ error: "sourceOptionId is required" }, 400);
  }

  const [draft] = await db
    .select()
    .from(onboardingOptions)
    .where(eq(onboardingOptions.id, id));
  if (!draft) return c.json({ error: "Draft not found" }, 404);

  const flow = draft.flowStructure as Array<{ stepName: string }>;
  if (!flow.some((s) => s.stepName === stepName)) {
    return c.json({ error: "Step not found in draft" }, 404);
  }

  const [source] = await db
    .select()
    .from(onboardingOptions)
    .where(eq(onboardingOptions.id, sourceOptionId));
  if (!source || source.projectId !== draft.projectId) {
    return c.json({ error: "Source option not found" }, 404);
  }

  const sourceMockups = (source.mockupCode ?? {}) as Record<string, string>;
  const sourceCode = sourceMockups[stepName];
  if (!sourceCode) {
    return c.json(
      { error: `Source option has no mockup for step "${stepName}"` },
      400
    );
  }

  const newMockupCode = {
    ...((draft.mockupCode ?? {}) as Record<string, string>),
    [stepName]: sourceCode,
  };
  const history = [
    ...((draft.customizeHistory ?? []) as Array<Record<string, unknown>>),
    {
      timestamp: new Date().toISOString(),
      type: "swap",
      stepName,
      sourceOptionId,
    },
  ];

  await db
    .update(onboardingOptions)
    .set({ mockupCode: newMockupCode, customizeHistory: history })
    .where(eq(onboardingOptions.id, id));

  return c.json({ ok: true, mockupCode: sourceCode });
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && npx vitest run tests/routes/customize.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/customize.ts apps/api/tests/routes/customize.test.ts
git commit -m "feat(api): add swap screen endpoint copying from sibling options"
```

---

## Task 11: Add POST /api/customize/:id/finalize

**Files:**
- Modify: `apps/api/src/routes/customize.ts`
- Modify: `apps/api/tests/routes/customize.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `apps/api/tests/routes/customize.test.ts`:

```typescript
describe("POST /api/customize/:id/finalize", () => {
  beforeEach(() => {
    selectMock.mockReset();
    updateMock.mockReset();
  });

  it("filters skipped steps and flips status to ready", async () => {
    selectMock.mockReturnValueOnce({
      from: () => ({
        where: () =>
          Promise.resolve([
            {
              id: "draft-1",
              status: "customizing",
              flowStructure: [
                { stepName: "a", type: "form", description: "d" },
                { stepName: "b", type: "form", description: "d" },
              ],
              mockupCode: { a: "<A/>", b: "<B/>" },
              skippedSteps: ["b"],
              customizeHistory: [{ type: "swap" }],
            },
          ]),
      }),
    });

    let captured: any = null;
    updateMock.mockReturnValue({
      set: (data: any) => {
        captured = data;
        return { where: () => Promise.resolve(undefined) };
      },
    });

    const { default: app } = await import("../../src/index.js");
    const res = await app.request("/api/customize/draft-1/finalize", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(captured.status).toBe("ready");
    expect(captured.flowStructure).toHaveLength(1);
    expect(captured.flowStructure[0].stepName).toBe("a");
    expect(Object.keys(captured.mockupCode)).toEqual(["a"]);
  });

  it("rejects unchanged draft", async () => {
    selectMock.mockReturnValueOnce({
      from: () => ({
        where: () =>
          Promise.resolve([
            {
              id: "draft-1",
              status: "customizing",
              flowStructure: [{ stepName: "a", type: "form", description: "d" }],
              mockupCode: { a: "<A/>" },
              skippedSteps: [],
              customizeHistory: [],
            },
          ]),
      }),
    });

    const { default: app } = await import("../../src/index.js");
    const res = await app.request("/api/customize/draft-1/finalize", {
      method: "POST",
    });
    expect(res.status).toBe(400);
  });

  it("is idempotent for already-ready drafts", async () => {
    selectMock.mockReturnValueOnce({
      from: () => ({
        where: () =>
          Promise.resolve([
            {
              id: "draft-1",
              status: "ready",
              flowStructure: [{ stepName: "a", type: "form", description: "d" }],
              mockupCode: { a: "<A/>" },
              skippedSteps: [],
              customizeHistory: [{ type: "swap" }],
            },
          ]),
      }),
    });

    const { default: app } = await import("../../src/index.js");
    const res = await app.request("/api/customize/draft-1/finalize", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx vitest run tests/routes/customize.test.ts`
Expected: New finalize tests FAIL.

- [ ] **Step 3: Add the finalize handler**

In `apps/api/src/routes/customize.ts`, before `export default`:

```typescript
customize.post("/:id/finalize", async (c) => {
  const id = c.req.param("id");
  const [draft] = await db
    .select()
    .from(onboardingOptions)
    .where(eq(onboardingOptions.id, id));
  if (!draft) return c.json({ error: "Draft not found" }, 404);

  // Idempotent: already-ready drafts return unchanged
  if (draft.status === "ready") {
    return c.json(draft);
  }
  if (draft.status !== "customizing") {
    return c.json(
      { error: `Cannot finalize draft with status "${draft.status}"` },
      400
    );
  }

  const skipped = (draft.skippedSteps ?? []) as string[];
  const history = (draft.customizeHistory ?? []) as unknown[];
  if (history.length === 0 && skipped.length === 0) {
    return c.json({ error: "No changes made" }, 400);
  }

  const flow = draft.flowStructure as Array<{
    stepName: string;
    type: string;
    description: string;
  }>;
  const filteredFlow = flow.filter((s) => !skipped.includes(s.stepName));
  const mockups = (draft.mockupCode ?? {}) as Record<string, string>;
  const filteredMockups = Object.fromEntries(
    Object.entries(mockups).filter(([k]) => !skipped.includes(k))
  );

  await db
    .update(onboardingOptions)
    .set({
      status: "ready",
      flowStructure: filteredFlow,
      mockupCode: filteredMockups,
      skippedSteps: [],
    })
    .where(eq(onboardingOptions.id, id));

  return c.json({
    ...draft,
    status: "ready",
    flowStructure: filteredFlow,
    mockupCode: filteredMockups,
    skippedSteps: [],
  });
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && npx vitest run tests/routes/customize.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Run the full API suite as a checkpoint**

Run: `cd apps/api && npx vitest run`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/customize.ts apps/api/tests/routes/customize.test.ts
git commit -m "feat(api): add finalize endpoint with skip filtering and idempotency"
```

---

## Task 12: Add frontend API types and fetchers

**Files:**
- Modify: `apps/web/src/lib/api.ts`

- [ ] **Step 1: Append CustomizeDraft type and fetcher functions**

Open `apps/web/src/lib/api.ts`. At the end of the file (after `buildOption`), append:

```typescript
export interface CustomizeDraft {
  id: string;
  projectId: string;
  name: string;
  rationale: string;
  flowStructure: Array<{
    stepName: string;
    type: "form" | "tour" | "tooltip" | "checklist" | "contextual";
    description: string;
  }>;
  mockupCode: Record<string, string>;
  status: "storyboard" | "customizing" | "ready" | "built";
  baseOptionId: string | null;
  skippedSteps: string[];
}

export interface CustomizeGetResponse {
  draft: CustomizeDraft;
  siblings: StoryboardOption[];
}

export const createCustomizeDraft = (baseOptionId: string) =>
  request<CustomizeDraft>("/api/customize", {
    method: "POST",
    body: JSON.stringify({ baseOptionId }),
  });

export const getCustomizeDraft = (id: string) =>
  request<CustomizeGetResponse>(`/api/customize/${id}`);

export const updateCustomizeSkips = (id: string, skippedSteps: string[]) =>
  request<{ ok: true }>(`/api/customize/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ skippedSteps }),
  });

export const regenerateCustomizeScreen = (
  id: string,
  stepName: string,
  prompt: string
) =>
  request<{ ok: true; mockupCode: string }>(
    `/api/customize/${id}/screens/${encodeURIComponent(stepName)}/regenerate`,
    {
      method: "POST",
      body: JSON.stringify({ prompt }),
    }
  );

export const swapCustomizeScreen = (
  id: string,
  stepName: string,
  sourceOptionId: string
) =>
  request<{ ok: true; mockupCode: string }>(
    `/api/customize/${id}/screens/${encodeURIComponent(stepName)}/swap`,
    {
      method: "POST",
      body: JSON.stringify({ sourceOptionId }),
    }
  );

export const finalizeCustomizeDraft = (id: string) =>
  request<CustomizeDraft>(`/api/customize/${id}/finalize`, {
    method: "POST",
  });
```

- [ ] **Step 2: Verify type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/api.ts
git commit -m "feat(web): add customize draft types and fetcher functions"
```

---

## Task 13: Extend StoryboardFullscreen to support single-panel + Close mode

**Files:**
- Modify: `apps/web/src/components/storyboard-fullscreen.tsx`

- [ ] **Step 1: Add optional props and conditional rendering**

Open `apps/web/src/components/storyboard-fullscreen.tsx`. Extend the `Props` interface and the component so:
- `onPick` and `picking` are now optional
- New prop `showPickButton?: boolean` (default true)
- When `showPickButton === false`, the Pick button is not rendered; only × Close remains in the header

Replace the `Props` interface:

```typescript
interface Props {
  option: StoryboardOption;
  authMockup: { login: string; signup: string };
  onClose: () => void;
  onPick?: () => void;
  picking?: boolean;
  showPickButton?: boolean;
}
```

Replace the default export signature:

```typescript
export default function StoryboardFullscreen({
  option,
  authMockup,
  onClose,
  onPick,
  picking = false,
  showPickButton = true,
}: Props) {
```

In the header section, replace the Pick button block with:

```typescript
{showPickButton && onPick && (
  <button
    type="button"
    onClick={onPick}
    disabled={picking || panels.length === 0}
    className="px-4 py-1.5 bg-white text-gray-900 text-sm font-medium rounded-lg hover:bg-gray-100 disabled:opacity-50"
  >
    {picking ? "Building…" : "Pick this flow"}
  </button>
)}
```

- [ ] **Step 2: Verify existing usage still compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors. (storyboard-strip.tsx passes `onPick` and `picking`; leaves `showPickButton` unset → defaults to true, same behavior as before.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/storyboard-fullscreen.tsx
git commit -m "feat(web): add showPickButton prop to StoryboardFullscreen for preview-only mode"
```

---

## Task 14: Wire Customize button into StoryboardStrip + StoryboardView

**Files:**
- Modify: `apps/web/src/components/storyboard-strip.tsx`
- Modify: `apps/web/src/components/storyboard-view.tsx`
- Modify: `apps/web/src/app/preview/page.tsx`

- [ ] **Step 1: Add onCustomize prop to StoryboardStrip**

Open `apps/web/src/components/storyboard-strip.tsx`. Extend `Props`:

```typescript
interface Props {
  option: StoryboardOption;
  authMockup: { login: string; signup: string };
  onPick: () => void;
  onCustomize: () => void;
  picking: boolean;
  customizing: boolean;
}
```

Update the function signature to destructure `onCustomize` and `customizing`. In the header's button group (between the Expand and Pick buttons), add a Customize button:

```tsx
<button
  type="button"
  onClick={onCustomize}
  disabled={customizing}
  aria-label={`Customize ${option.name}`}
  className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
>
  {customizing ? "Opening…" : "Customize"}
</button>
```

- [ ] **Step 2: Pass onCustomize through StoryboardView**

Open `apps/web/src/components/storyboard-view.tsx`. Extend `Props`:

```typescript
interface Props {
  options: StoryboardOption[];
  authMockup: { login: string; signup: string };
  appName: string;
  onPick: (optionId: string) => Promise<void>;
  onCustomize: (optionId: string) => Promise<void>;
}
```

Destructure `onCustomize` in the component signature. Replace the state to track both picking and customizing:

```typescript
const [pickingId, setPickingId] = useState<string | null>(null);
const [customizingId, setCustomizingId] = useState<string | null>(null);

async function handlePick(optionId: string) {
  setPickingId(optionId);
  try { await onPick(optionId); } finally { setPickingId(null); }
}

async function handleCustomize(optionId: string) {
  setCustomizingId(optionId);
  try { await onCustomize(optionId); } finally { setCustomizingId(null); }
}
```

Update the `<StoryboardStrip>` call inside the map to pass both new props:

```tsx
<StoryboardStrip
  key={option.id}
  option={option}
  authMockup={authMockup}
  onPick={() => handlePick(option.id)}
  onCustomize={() => handleCustomize(option.id)}
  picking={pickingId === option.id}
  customizing={customizingId === option.id}
/>
```

- [ ] **Step 3: Wire the handler in preview page**

Open `apps/web/src/app/preview/page.tsx`. Add the import at the top:

```typescript
import { createCustomizeDraft } from "@/lib/api";
```

Inside the `PreviewPage` component, add a handler next to `handlePick`:

```typescript
async function handleCustomize(optionId: string) {
  setBuildError(null);
  try {
    const draft = await createCustomizeDraft(optionId);
    router.push(`/customize/${draft.id}`);
  } catch (err) {
    setBuildError(err instanceof Error ? err.message : "Customize failed");
  }
}
```

Pass it to `<StoryboardView>`:

```tsx
<StoryboardView
  options={session.storyboardOptions}
  authMockup={session.authMockup}
  appName={session.appProfile.name}
  onPick={handlePick}
  onCustomize={handleCustomize}
/>
```

- [ ] **Step 4: Verify type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/storyboard-strip.tsx apps/web/src/components/storyboard-view.tsx apps/web/src/app/preview/page.tsx
git commit -m "feat(web): add Customize button to storyboard strip wired to draft creation"
```

---

## Task 15: Create CustomizeScreenCard component

**Files:**
- Create: `apps/web/src/components/customize-screen-card.tsx`

- [ ] **Step 1: Create the component**

Create `apps/web/src/components/customize-screen-card.tsx`:

```typescript
"use client";

import { useMemo, useState } from "react";
import { buildSingleScreenHtml } from "@/lib/single-screen-bundler";

type Status = "ready" | "regenerating" | "failed" | "swapped";

interface SiblingOption {
  id: string;
  name: string;
  mockupCode: Record<string, string>;
}

interface Props {
  stepName: string;
  stepDescription: string;
  currentCode: string;
  skipped: boolean;
  siblings: SiblingOption[];
  onToggleSkip: (skipped: boolean) => void;
  onRegenerate: (prompt: string) => Promise<void>;
  onSwap: (sourceOptionId: string) => Promise<void>;
  onExpand: () => void;
}

export default function CustomizeScreenCard({
  stepName,
  stepDescription,
  currentCode,
  skipped,
  siblings,
  onToggleSkip,
  onRegenerate,
  onSwap,
  onExpand,
}: Props) {
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<Status>("ready");
  const [swappedFrom, setSwappedFrom] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [iframeKey, setIframeKey] = useState(0);

  const html = useMemo(
    () => buildSingleScreenHtml(currentCode, stepName),
    [currentCode, stepName]
  );

  async function handleRegenerate() {
    const trimmed = prompt.trim();
    if (trimmed.length === 0) return;
    setStatus("regenerating");
    setErrorMsg(null);
    try {
      await onRegenerate(trimmed);
      setStatus("ready");
      setSwappedFrom(null);
      setPrompt("");
      setIframeKey((k) => k + 1);
    } catch (err) {
      setStatus("failed");
      setErrorMsg(err instanceof Error ? err.message : "Regeneration failed");
    }
  }

  async function handleSwap(sib: SiblingOption) {
    setStatus("regenerating");
    setErrorMsg(null);
    try {
      await onSwap(sib.id);
      setStatus("swapped");
      setSwappedFrom(sib.name);
      setIframeKey((k) => k + 1);
    } catch (err) {
      setStatus("failed");
      setErrorMsg(err instanceof Error ? err.message : "Swap failed");
    }
  }

  const regenerating = status === "regenerating";
  const disabled = prompt.trim().length === 0 || regenerating;

  return (
    <section
      className={`bg-white rounded-xl border border-gray-200 p-5 space-y-4 transition-opacity ${
        skipped ? "opacity-40" : ""
      }`}
    >
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold text-gray-900">{stepName}</h3>
          <label className="flex items-center gap-1.5 text-sm text-gray-500">
            <input
              type="checkbox"
              checked={skipped}
              onChange={(e) => onToggleSkip(e.target.checked)}
            />
            Skip this step
          </label>
        </div>
        <button
          type="button"
          onClick={onExpand}
          aria-label={`Expand ${stepName} to fullscreen`}
          className="px-3 py-1.5 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          <span aria-hidden="true">⤢</span> Expand
        </button>
      </header>

      <div className="rounded-lg overflow-hidden border border-gray-200 bg-white">
        <iframe
          key={iframeKey}
          srcDoc={html}
          className="w-full h-[320px] border-0 block"
          sandbox="allow-scripts"
          title={`${stepName} mockup`}
        />
      </div>

      <div className="space-y-2">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe a change (e.g., make the CTA green and bolder)"
          className="w-full min-h-[72px] p-3 text-sm border border-gray-300 rounded-lg resize-y"
          disabled={regenerating || skipped}
        />
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={disabled || skipped}
            className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
          >
            {regenerating ? "Regenerating…" : "Regenerate"}
          </button>
          {siblings.length > 0 && !skipped && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-500">Swap from:</span>
              {siblings.map((sib) => {
                const hasStep = Boolean(sib.mockupCode[stepName]);
                return (
                  <button
                    key={sib.id}
                    type="button"
                    onClick={() => handleSwap(sib)}
                    disabled={!hasStep || regenerating}
                    className="px-3 py-1.5 text-xs text-gray-700 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    title={hasStep ? "" : "Source option has no matching step"}
                  >
                    {sib.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="text-xs">
        {status === "ready" && <span className="text-gray-500">Ready</span>}
        {status === "regenerating" && <span className="text-gray-500">Regenerating…</span>}
        {status === "swapped" && swappedFrom && (
          <span className="text-gray-600">Swapped from {swappedFrom}</span>
        )}
        {status === "failed" && (
          <span className="text-red-600">
            Failed — {errorMsg || "retry"}
            <button
              type="button"
              onClick={handleRegenerate}
              className="ml-2 underline"
            >
              Retry
            </button>
          </span>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Verify type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/customize-screen-card.tsx
git commit -m "feat(web): add CustomizeScreenCard with prompt, regen, swap, and skip"
```

---

## Task 16: Create customize page route + view orchestrator

**Files:**
- Create: `apps/web/src/app/customize/[id]/page.tsx`
- Create: `apps/web/src/app/customize/[id]/customize-view.tsx`

- [ ] **Step 1: Create the page wrapper**

Create `apps/web/src/app/customize/[id]/page.tsx`:

```typescript
import CustomizeView from "./customize-view";

export default async function CustomizePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CustomizeView draftId={id} />;
}
```

- [ ] **Step 2: Create the client orchestrator**

Create `apps/web/src/app/customize/[id]/customize-view.tsx`:

```typescript
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import CustomizeScreenCard from "@/components/customize-screen-card";
import StoryboardFullscreen from "@/components/storyboard-fullscreen";
import {
  getCustomizeDraft,
  updateCustomizeSkips,
  regenerateCustomizeScreen,
  swapCustomizeScreen,
  finalizeCustomizeDraft,
  buildOption,
  type CustomizeDraft,
  type StoryboardOption,
  type OnboardingOption,
} from "@/lib/api";

interface Props {
  draftId: string;
}

export default function CustomizeView({ draftId }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState<CustomizeDraft | null>(null);
  const [siblings, setSiblings] = useState<StoryboardOption[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCustomizeDraft(draftId)
      .then((res) => {
        if (cancelled) return;
        setDraft(res.draft);
        setSiblings(res.siblings.filter((s) => s.id !== res.draft.baseOptionId && s.id !== res.draft.id));
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Failed to load draft");
      });
    return () => {
      cancelled = true;
    };
  }, [draftId]);

  const isDirty = useMemo(() => {
    if (!draft) return false;
    return (draft.skippedSteps?.length ?? 0) > 0;
    // Note: regen/swap edits also mark dirty server-side via customizeHistory;
    // client just reflects skip state here. The finalize endpoint is the
    // source of truth — it checks history length too.
  }, [draft]);

  async function handleToggleSkip(stepName: string, skipped: boolean) {
    if (!draft) return;
    const next = skipped
      ? [...draft.skippedSteps, stepName]
      : draft.skippedSteps.filter((s) => s !== stepName);
    setDraft({ ...draft, skippedSteps: next });
    try {
      await updateCustomizeSkips(draftId, next);
    } catch (err) {
      // Revert on failure
      setDraft({ ...draft });
    }
  }

  async function handleRegenerate(stepName: string, prompt: string) {
    if (!draft) return;
    const result = await regenerateCustomizeScreen(draftId, stepName, prompt);
    setDraft({
      ...draft,
      mockupCode: { ...draft.mockupCode, [stepName]: result.mockupCode },
    });
  }

  async function handleSwap(stepName: string, sourceOptionId: string) {
    if (!draft) return;
    const result = await swapCustomizeScreen(draftId, stepName, sourceOptionId);
    setDraft({
      ...draft,
      mockupCode: { ...draft.mockupCode, [stepName]: result.mockupCode },
    });
  }

  async function handleFinalize() {
    if (!draft) return;
    setFinalizing(true);
    setFinalizeError(null);
    try {
      const finalized = await finalizeCustomizeDraft(draftId);
      const built = await buildOption(finalized.projectId, finalized.id);

      // Push built option into sessionStorage so /preview can render it
      const stored = sessionStorage.getItem("onboarder_session");
      if (stored) {
        const session = JSON.parse(stored);
        const builtOption: OnboardingOption = {
          id: built.id,
          name: finalized.name,
          rationale: finalized.rationale,
          flowStructure: finalized.flowStructure,
          componentCode: built.componentCode,
          authCode: built.authCode,
        };
        sessionStorage.setItem(
          "onboarder_session",
          JSON.stringify({ ...session, builtOption })
        );
      }
      router.push("/preview");
    } catch (err) {
      setFinalizing(false);
      setFinalizeError(err instanceof Error ? err.message : "Finalize failed");
    }
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-700">
        <div className="max-w-md text-center space-y-3">
          <p>{loadError}</p>
          <button
            type="button"
            onClick={() => router.push("/preview")}
            className="underline text-sm"
          >
            Back to storyboards
          </button>
        </div>
      </div>
    );
  }

  if (!draft) return null;

  const expandedPanelCode = expandedStep ? draft.mockupCode[expandedStep] : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <button
            type="button"
            onClick={() => router.push("/preview")}
            className="text-sm text-gray-500 hover:text-gray-900"
          >
            ← Back
          </button>
          <h1 className="text-xl font-bold text-gray-900 mt-1">{draft.name}</h1>
          <p className="text-sm text-gray-500">{draft.rationale}</p>
        </div>
        <div className="flex items-center gap-3">
          {finalizeError && (
            <span className="text-sm text-red-600">{finalizeError}</span>
          )}
          <button
            type="button"
            onClick={handleFinalize}
            disabled={finalizing}
            className="px-5 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50"
            title={isDirty ? "" : "Regenerate or skip at least one step to finalize"}
          >
            {finalizing ? "Finalizing…" : "Finalize"}
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-6 space-y-5">
        {draft.flowStructure.map((step) => {
          const code = draft.mockupCode[step.stepName];
          if (!code) return null;
          return (
            <CustomizeScreenCard
              key={step.stepName}
              stepName={step.stepName}
              stepDescription={step.description}
              currentCode={code}
              skipped={draft.skippedSteps.includes(step.stepName)}
              siblings={siblings}
              onToggleSkip={(skipped) => handleToggleSkip(step.stepName, skipped)}
              onRegenerate={(prompt) => handleRegenerate(step.stepName, prompt)}
              onSwap={(sourceOptionId) => handleSwap(step.stepName, sourceOptionId)}
              onExpand={() => setExpandedStep(step.stepName)}
            />
          );
        })}
      </div>

      {expandedStep && expandedPanelCode && (
        <StoryboardFullscreen
          option={{
            id: draft.id,
            name: `${draft.name} — ${expandedStep}`,
            rationale: draft.rationale,
            flowStructure: [draft.flowStructure.find((s) => s.stepName === expandedStep)!],
            mockupCode: { [expandedStep]: expandedPanelCode },
          }}
          authMockup={{ login: "", signup: "" }}
          onClose={() => setExpandedStep(null)}
          showPickButton={false}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/customize/
git commit -m "feat(web): add customize page route and view orchestrator"
```

---

## Task 17: Manual end-to-end verification

**Files:** None (runtime verification only).

- [ ] **Step 1: Start the dev environment**

Ensure `ANTHROPIC_API_KEY` is set with credits. In separate terminals:

Run (repo root): `npm run dev`
Expected: Both `@onboarder/api` (port 3011) and `@onboarder/web` (port 3012) boot without errors.

- [ ] **Step 2: Analyze a project and reach the pick page**

In a browser at `http://localhost:3012`, drop or upload a Next.js project folder. Wait through analyze → storyboarding.

Expected: Land on pick page with 3 storyboard strips, each showing a `[Customize]` button.

- [ ] **Step 3: Click Customize on Option 2**

Expected: Lands on `/customize/<uuid>`. Cards render for each flow step of Option 2. Auth screens are NOT shown as cards (correct — they're project-level default).

- [ ] **Step 4: Regenerate a single screen**

Type "make the primary button larger and use red" into one card's prompt. Click Regenerate.

Expected: Status flips to "Regenerating…", then back to "Ready" with a visibly updated iframe.

- [ ] **Step 5: Skip a step**

Check the "Skip this step" box on a different card.

Expected: Card dims to ~40% opacity. Finalize button becomes enabled (if not already).

- [ ] **Step 6: Swap a screen from another option**

Click a "Swap from: Option N" button on a third card.

Expected: Iframe updates to the other option's matching mockup. Status line shows "Swapped from …".

- [ ] **Step 7: Expand a screen to fullscreen**

Click ⤢ Expand on a card.

Expected: Existing fullscreen modal opens. Only Close (×) is visible in the header — no "Pick this flow" button. Esc closes it.

- [ ] **Step 8: Try to finalize an unchanged draft**

Open a new customize draft (go back, pick a different option, click Customize). Don't make any changes. Click Finalize.

Expected: Error surfaces: "No changes made" (or similar).

- [ ] **Step 9: Finalize a valid draft**

Return to a draft with at least one regen/swap/skip. Click Finalize.

Expected: Status flips to "Finalizing…", then the app builds the remix and navigates to `/preview` showing the full built preview.

- [ ] **Step 10: Verify the remix persists as a sibling**

Refresh the browser at `/preview`. The session clears — start over (drop the project again).

Expected: On the new pick page, the remix is NOT shown as a sibling (because sessionStorage is empty and we don't re-fetch all options from server). This is expected behavior for v1.

- [ ] **Step 11: Check database directly for the finalized row**

Run a quick psql query (or temp script) against the DB:

```sql
SELECT id, name, status, base_option_id, skipped_steps, jsonb_object_keys(mockup_code) AS steps
FROM onboarding_options
WHERE status IN ('ready', 'built')
ORDER BY created_at DESC
LIMIT 5;
```

Expected: The finalized remix row exists with `status = 'built'`, a non-null `base_option_id`, and `mockup_code` keys that exclude any skipped steps.

- [ ] **Step 12: Run the full test suite as a final checkpoint**

Run (repo root): `npm test`
Expected: All tests PASS.

- [ ] **Step 13: If any step failed, iterate and re-commit fixes**

Document issues. Fix root causes (per systematic-debugging skill). Commit each fix separately.

- [ ] **Step 14: Final smoke commit if any housekeeping was needed**

If no code changes were required in verification, skip the commit. Otherwise:

```bash
git add <files>
git commit -m "fix(remix): resolve <issue> surfaced in manual E2E"
```

---

## Self-Review (to run after all tasks are drafted, before handing off)

**1. Spec coverage checklist:**
- Pick page has Customize button → Task 14 ✓
- `/customize/[id]` page with stacked cards → Tasks 15, 16 ✓
- Per-screen regenerate → Tasks 5, 9, 15, 16 ✓
- Per-screen swap → Tasks 10, 15, 16 ✓
- Skip toggle → Tasks 8, 15, 16 ✓
- Fullscreen expand with Close (no Pick) → Tasks 13, 16 ✓
- Finalize creates sibling row → Tasks 11, 16 ✓
- Originals never mutated → enforced by Task 6 clone pattern + Task 11 updating only the draft row ✓
- Draft idempotency → Task 6 ✓
- Finalize idempotency → Task 11 ✓
- Failed regen preserves prompt → Task 15 (`handleRegenerate` only clears prompt on success) ✓
- Schema migration → Tasks 2, 3 ✓
- API test failures pre-req → Task 1 ✓

**2. Placeholder scan:** None found.

**3. Type consistency:** `StoryboardOption`, `CustomizeDraft`, `OnboardingOption` used consistently. `onCustomize`/`onPick` propagated identically through strip → view → preview page.

**4. Naming consistency:** `GenerationFailedError`, `regenerateScreen`, `createCustomizeDraft`, `finalizeCustomizeDraft` are referenced with the same names across backend + frontend tasks.
