# Storyboard-First Onboarding Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the onboarding generator from up-front full-code generation (2 options) to a two-stage flow: generate 3 static storyboard mockups → user picks one → build the selected option as interactive code.

**Architecture:** Introduce two new API endpoints (`/api/storyboard` and `/api/build`) that run alongside the existing `/api/generate`. The storyboard endpoint produces lightweight static JSX mockups; the build endpoint regenerates the picked option as full interactive code, using the approved mockups as a visual reference. DB schema gains a `mockupCode` column and a `status` field on options, plus an `authMockup` column on projects. The web preview page gains two modes (`storyboard` and `full`) driven by option status.

**Tech Stack:** Hono (API), Drizzle ORM + Postgres, React/Next.js 15 (web), Vitest (tests), Anthropic SDK (Claude Sonnet 4.6), Babel standalone (preview rendering).

**Spec:** `docs/superpowers/specs/2026-04-16-storyboard-first-flow-design.md`

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `packages/db/drizzle/0001_storyboard_columns.sql` | Migration: adds `mockup_code`, `status` to `onboarding_options`; `auth_mockup` to `projects`; makes `component_code` and `auth_code` nullable. |
| `apps/api/src/prompts/storyboard.ts` | System prompts + user message builders for storyboard plan, storyboard mockups, and build-selected-option. |
| `apps/api/src/services/storyboarder.ts` | `generateStoryboard(appProfile)` — plan call + parallel per-option mockup calls. |
| `apps/api/src/services/builder.ts` | `buildOption({ appProfile, option, authMockup })` — single Claude call to produce full interactive code for the chosen option. |
| `apps/api/src/routes/storyboard.ts` | `POST /api/storyboard` — runs storyboarder, persists options with `status="storyboard"`, saves `authMockup` on project. |
| `apps/api/src/routes/build.ts` | `POST /api/build` — runs builder, updates picked option with `componentCode`/`authCode`/`status="built"`, flips `selected`. |
| `apps/api/tests/services/storyboarder.test.ts` | Unit test for storyboarder service. |
| `apps/api/tests/services/builder.test.ts` | Unit test for builder service. |
| `apps/api/tests/routes/storyboard.test.ts` | Route test with mocked service + DB. |
| `apps/api/tests/routes/build.test.ts` | Route test with mocked service + DB. |
| `apps/web/src/lib/storyboard-bundler.ts` | Pure function `buildStoryboardStripHtml(option, authMockup)` — returns iframe HTML showing a horizontal strip of scaled, static screens. |
| `apps/web/src/components/storyboard-strip.tsx` | React component rendering one option's strip in an iframe, with "Pick this flow" CTA. |
| `apps/web/src/components/storyboard-view.tsx` | React component stacking 3 strips vertically. |

### Modified files

| Path | Change |
|---|---|
| `packages/db/src/schema.ts` | Add `mockupCode`, `status` to `onboardingOptions`; `authMockup` to `projects`; make `componentCode` and `authCode` nullable. |
| `apps/api/src/index.ts` | Mount `/api/storyboard` and `/api/build` routes. |
| `apps/web/src/lib/api.ts` | Add types (`StoryboardOption`, `StoryboardResponse`, `BuildResponse`) and fetch helpers (`generateStoryboard`, `buildOption`). |
| `apps/web/src/app/page.tsx` | Switch from `generateOnboarding` to `generateStoryboard`; update status state machine. |
| `apps/web/src/app/preview/page.tsx` | Add mode detection (storyboard vs full); render `<StoryboardView>` in storyboard mode and the existing preview in full mode; wire pick → build transition. |

---

## Task 1: DB schema — add storyboard columns

**Files:**
- Modify: `packages/db/src/schema.ts`
- Create: `packages/db/drizzle/0001_storyboard_columns.sql` (auto-generated)

- [ ] **Step 1: Edit the schema**

Modify `packages/db/src/schema.ts` — change the `projects` and `onboardingOptions` tables:

```ts
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  jsonb,
  boolean,
} from "drizzle-orm/pg-core";

export const integrationStatusEnum = pgEnum("integration_status", [
  "pending",
  "completed",
  "rolled_back",
]);

export const optionStatusEnum = pgEnum("option_status", [
  "storyboard",
  "built",
]);

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  folderPath: text("folder_path").notNull(),
  appProfile: jsonb("app_profile"),
  stackInfo: jsonb("stack_info"),
  authMockup: jsonb("auth_mockup"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const integrations = pgTable("integrations", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .references(() => projects.id)
    .notNull(),
  optionId: uuid("option_id")
    .references(() => onboardingOptions.id)
    .notNull(),
  changeset: jsonb("changeset").notNull(),
  status: integrationStatusEnum("status").default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

- [ ] **Step 2: Generate the migration**

Run:
```bash
cd packages/db && pnpm db:generate
```
Expected: new SQL file created at `packages/db/drizzle/0001_*.sql`. Rename it to `0001_storyboard_columns.sql` for clarity.

- [ ] **Step 3: Apply the migration**

Run:
```bash
cd packages/db && pnpm db:migrate
```
Expected: output shows columns added. Verify with psql:
```bash
psql postgresql://ryanhaugland@localhost:5432/onboarder -c "\d onboarding_options" | grep -E "mockup_code|status"
psql postgresql://ryanhaugland@localhost:5432/onboarder -c "\d projects" | grep auth_mockup
```
Expected: all three columns appear.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema.ts packages/db/drizzle/
git commit -m "feat(db): add storyboard columns to options and auth_mockup to projects"
```

---

## Task 2: Storyboard prompts

**Files:**
- Create: `apps/api/src/prompts/storyboard.ts`

- [ ] **Step 1: Write the prompts module**

Create `apps/api/src/prompts/storyboard.ts`:

```ts
// ============================================================================
// Plan call — picks 3 onboarding patterns, produces flow structures + a
// shared auth mockup. Low token cost: no per-step code at this stage.
// ============================================================================

export const GENERATE_STORYBOARD_PLAN_SYSTEM_PROMPT = `You are an onboarding flow designer. Given an app profile, propose 3 structurally different onboarding experiences and generate a shared static auth mockup.

## Onboarding Pattern Library

Choose from these patterns based on the app profile:

### Wizard Flow
Multi-step fullscreen setup. Linear progression with progress bar. Best for apps requiring configuration before they're useful.

### Guided Tour
Tooltip/spotlight sequence overlaid on the app UI. Step-by-step with skip option. Best for apps where the interface is the product.

### Checklist Dashboard
Persistent sidebar or card showing setup tasks. Non-linear — user picks order. Best for apps with multiple independent setup actions.

### Progressive Disclosure
Minimal upfront setup, then contextual hints as users encounter features naturally. Best for simple apps.

### Hybrid Setup + Tour
Wizard for essential config, then transitions into guided tour. Best for apps needing both setup and feature discovery.

## Instructions

1. Analyze the app profile + design references (complexity, features, UI density, brand)
2. Pick 3 structurally different patterns (or blends) that fit this app
3. Define each flow structure using REAL feature names and vocabulary from the app's pages
4. Generate one static auth mockup (login + signup) — email/password only, no OAuth
5. **Brand fidelity is mandatory.** Resolve CSS variable refs (e.g. \`hsl(var(--primary))\`) to their actual values using globals.css.

## Color Resolution (CRITICAL)
The generated code runs in a standalone preview iframe that does NOT have the user's globals.css loaded.
- Look up CSS variable values in globals.css and emit **resolved** colors — e.g. \`style={{ backgroundColor: 'hsl(221 83% 53%)' }}\` or \`bg-[hsl(221_83%_53%)]\`.
- NEVER emit \`var(--primary)\`, \`hsl(var(--primary))\`, or theme classes like \`bg-primary\` / \`text-foreground\`.

## Auth Mockup Output Constraints
- Output **plain JavaScript JSX**, NOT TypeScript
- Static visual only — NO state, NO hooks, NO event handlers, NO onNext/onSubmit
- No \`import\` statements or \`"use client"\` directives
- Each component is a zero-argument function returning JSX

Respond with ONLY valid JSON matching this schema:
{
  "authMockup": {
    "login": "string - static JSX mockup of login page with real brand colors",
    "signup": "string - static JSX mockup of signup page with real brand colors"
  },
  "options": [
    {
      "name": "string - pattern name",
      "rationale": "string - 1-2 sentences on why this pattern fits",
      "flowStructure": [
        { "stepName": "string - kebab-case id", "type": "form | tour | tooltip | checklist | contextual", "description": "string - uses real feature names" }
      ]
    }
  ]
}`;

// ============================================================================
// Per-option mockup call — one parallel call per option, generates static
// JSX mockups for every step. Cheaper than full code (no state/hooks).
// ============================================================================

export const GENERATE_STORYBOARD_MOCKUP_SYSTEM_PROMPT = `You are generating static visual mockups for an onboarding flow. Given an app profile and a flow structure, produce static JSX for each step.

## CRITICAL: Static Only
- NO \`useState\`, \`useEffect\`, or any hooks
- NO event handlers (\`onClick\`, \`onSubmit\`, \`onChange\`)
- NO props — each component is a zero-argument function
- Pure visual layout only — looks like a screenshot, not interactive

## Content Rules
1. Use the app's real vocabulary from the sample pages — don't invent placeholder text
2. Resolve brand colors: look up CSS variable values in globals.css and emit resolved colors (\`bg-[hsl(221_83%_53%)]\`, \`style={{ color: '#0C173D' }}\`). NEVER emit \`var(--primary)\`, \`bg-primary\`, \`text-foreground\`.
3. Match the design language: spacing, border-radius, typography visible in sample pages
4. For tour/tooltip steps, draw realistic app-like UI behind the tooltip overlay

## Output Constraints
- Plain JavaScript JSX, NOT TypeScript
- No \`import\` statements, no \`"use client"\`
- Each step is a default-exported zero-argument function returning JSX
- Keep mockups short and focused — visual communication, not business logic

Respond with ONLY valid JSON:
{
  "mockupCode": {
    "step-name-1": "string - static JSX mockup",
    "step-name-2": "string - static JSX mockup"
  }
}

Keys in \`mockupCode\` MUST match the \`stepName\` values from the flow structure exactly.`;

// ============================================================================
// Build call — takes the user's approved storyboard option and generates
// FULL interactive code. The mockups are passed in as a visual reference.
// ============================================================================

export const BUILD_OPTION_SYSTEM_PROMPT = `You are building the full interactive version of an approved onboarding storyboard. You receive the static mockups that the user already approved. Your job: keep the layout and content faithful, add real interactivity.

## CRITICAL OUTPUT CONSTRAINTS
- Output **plain JavaScript JSX**, NOT TypeScript
- Do NOT include \`import\` statements — React hooks are provided globally as \`useState\`, \`useEffect\`, \`useRef\`, \`useMemo\`, \`useCallback\`
- Do NOT include \`"use client"\` directives

## Color Resolution
The preview iframe has no globals.css loaded. Resolve all CSS variable refs to their actual HSL/hex values from globals.css. Never emit \`var(--primary)\`, \`hsl(var(--primary))\`, \`bg-primary\`, \`text-foreground\`, etc.

## Faithful-to-Mockup Rules
1. Preserve the visual layout, spacing, colors, and content from the approved mockup
2. Preserve the copy — don't rewrite the text shown in the mockup
3. ADD: \`useState\` for form fields, validation, submit handlers, \`onNext\`/\`onBack\` navigation
4. Accept \`onNext\` and/or \`onBack\` props on every step component
5. Auth components MUST call \`onNext()\` on successful submit and support \`onNext("signup")\` / \`onNext("login")\` for switching between them

## Output Shape
- Each step is a default-exported React function component (\`export default function StepName({ onNext, onBack }) {...}\`)
- Auth components also default-exported with \`onNext\` prop

Respond with ONLY valid JSON:
{
  "authCode": {
    "login": "string - full React component for login",
    "signup": "string - full React component for signup"
  },
  "componentCode": {
    "step-name-1": "string - full React component",
    "step-name-2": "string - full React component"
  }
}

Keys in \`componentCode\` MUST match the \`stepName\` values exactly.`;

// ============================================================================
// User message builders
// ============================================================================

function buildDesignReferencesSection(
  designReferences: Record<string, unknown> | undefined
): string {
  if (!designReferences) return "";
  const { tailwindConfig, globalsCss, samplePages, layoutCode } =
    designReferences as {
      tailwindConfig?: string;
      globalsCss?: string;
      samplePages?: Record<string, string>;
      layoutCode?: string;
    };

  const parts: string[] = [`## Design References (ground truth for branding + UI)`];
  if (tailwindConfig) parts.push(`### tailwind.config`, "```", tailwindConfig, "```");
  if (globalsCss) parts.push(`### globals.css`, "```css", globalsCss, "```");
  if (layoutCode) parts.push(`### Root Layout`, "```tsx", layoutCode, "```");
  if (samplePages && Object.keys(samplePages).length > 0) {
    parts.push(
      `### Sample Pages (use this vocabulary + UI patterns)`,
      ...Object.entries(samplePages).map(
        ([path, code]) => `#### ${path}\n\`\`\`tsx\n${code}\n\`\`\``
      )
    );
  }
  return parts.join("\n\n");
}

export function buildStoryboardPlanUserMessage(
  appProfile: Record<string, unknown>
): string {
  const { designReferences, ...profileWithoutRefs } = appProfile as {
    designReferences?: Record<string, unknown>;
  } & Record<string, unknown>;

  const parts = [
    `# Generate Storyboard Plan`,
    ``,
    `## App Profile`,
    "```json",
    JSON.stringify(profileWithoutRefs, null, 2),
    "```",
  ];
  const design = buildDesignReferencesSection(designReferences);
  if (design) parts.push("", design);
  parts.push(
    "",
    `Generate 3 structurally different onboarding options and one shared static auth mockup. Use the app's real vocabulary and brand colors. Static JSX only — no hooks, no handlers.`
  );
  return parts.join("\n");
}

export function buildStoryboardMockupUserMessage(
  appProfile: Record<string, unknown>,
  option: {
    name: string;
    rationale: string;
    flowStructure: Array<{ stepName: string; type: string; description: string }>;
  }
): string {
  const { designReferences, ...profileWithoutRefs } = appProfile as {
    designReferences?: Record<string, unknown>;
  } & Record<string, unknown>;

  const parts = [
    `# Generate Storyboard Mockups for Option: ${option.name}`,
    ``,
    `## App Profile`,
    "```json",
    JSON.stringify(profileWithoutRefs, null, 2),
    "```",
  ];
  const design = buildDesignReferencesSection(designReferences);
  if (design) parts.push("", design);
  parts.push(
    ``,
    `## Option Rationale`,
    option.rationale,
    ``,
    `## Flow Structure`,
    option.flowStructure
      .map((s, i) => `${i + 1}. **${s.stepName}** (${s.type}): ${s.description}`)
      .join("\n"),
    ``,
    `Generate a static JSX mockup for each of the ${option.flowStructure.length} steps. Pure visual — no state, no hooks, no handlers. The keys in \`mockupCode\` must match the \`stepName\` values exactly.`
  );
  return parts.join("\n");
}

export function buildBuildOptionUserMessage(
  appProfile: Record<string, unknown>,
  option: {
    name: string;
    rationale: string;
    flowStructure: Array<{ stepName: string; type: string; description: string }>;
    mockupCode: Record<string, string>;
  },
  authMockup: { login: string; signup: string }
): string {
  const { designReferences, ...profileWithoutRefs } = appProfile as {
    designReferences?: Record<string, unknown>;
  } & Record<string, unknown>;

  const parts = [
    `# Build Approved Onboarding Option: ${option.name}`,
    ``,
    `## App Profile`,
    "```json",
    JSON.stringify(profileWithoutRefs, null, 2),
    "```",
  ];
  const design = buildDesignReferencesSection(designReferences);
  if (design) parts.push("", design);
  parts.push(
    ``,
    `## Option Rationale`,
    option.rationale,
    ``,
    `## Approved Mockups (stay faithful to these)`,
    `### Auth — Login`,
    "```jsx",
    authMockup.login,
    "```",
    `### Auth — Signup`,
    "```jsx",
    authMockup.signup,
    "```",
    ...option.flowStructure.flatMap((s) => [
      `### Step: ${s.stepName}`,
      "```jsx",
      option.mockupCode[s.stepName] ?? "(mockup missing)",
      "```",
    ]),
    ``,
    `Build the full interactive version. Preserve the layout/content from each mockup and add state, validation, onNext/onBack navigation. Auth components take \`onNext\` and must support \`onNext("signup")\`/\`onNext("login")\` for switching.`
  );
  return parts.join("\n");
}
```

- [ ] **Step 2: Verify module compiles**

Run:
```bash
cd apps/api && pnpm tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/prompts/storyboard.ts
git commit -m "feat(api): add storyboard and build prompts"
```

---

## Task 3: Storyboarder service + test

**Files:**
- Create: `apps/api/src/services/storyboarder.ts`
- Create: `apps/api/tests/services/storyboarder.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/services/storyboarder.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("../../src/services/claude.js", () => ({
  sendPrompt: vi
    .fn()
    // First call: plan
    .mockResolvedValueOnce({
      authMockup: {
        login: "function LoginMock() { return <div>Login</div>; }",
        signup: "function SignupMock() { return <div>Signup</div>; }",
      },
      options: [
        {
          name: "Wizard",
          rationale: "Needs setup",
          flowStructure: [
            { stepName: "welcome", type: "form", description: "Welcome" },
          ],
        },
        {
          name: "Tour",
          rationale: "Feature-rich",
          flowStructure: [
            { stepName: "tour-intro", type: "tour", description: "Tour" },
          ],
        },
        {
          name: "Checklist",
          rationale: "Multi-task setup",
          flowStructure: [
            { stepName: "connect", type: "checklist", description: "Connect" },
          ],
        },
      ],
    })
    // Three per-option mockup calls
    .mockResolvedValueOnce({
      mockupCode: { welcome: "function Welcome() { return <div>Welcome</div>; }" },
    })
    .mockResolvedValueOnce({
      mockupCode: { "tour-intro": "function TourIntro() { return <div>Tour</div>; }" },
    })
    .mockResolvedValueOnce({
      mockupCode: { connect: "function Connect() { return <div>Connect</div>; }" },
    }),
}));

describe("storyboarder service", () => {
  it("generates 3 options with mockup code plus a shared auth mockup", async () => {
    const { generateStoryboard } = await import(
      "../../src/services/storyboarder.js"
    );
    const result = await generateStoryboard({
      name: "Test App",
      designReferences: { tailwindConfig: "", globalsCss: "", samplePages: {} },
    });

    expect(result.authMockup.login).toContain("Login");
    expect(result.authMockup.signup).toContain("Signup");
    expect(result.options).toHaveLength(3);
    expect(result.options[0].name).toBe("Wizard");
    expect(result.options[0].mockupCode.welcome).toContain("Welcome");
    expect(result.options[1].mockupCode["tour-intro"]).toContain("Tour");
    expect(result.options[2].mockupCode.connect).toContain("Connect");
  });

  it("throws if plan response is malformed", async () => {
    vi.resetModules();
    vi.doMock("../../src/services/claude.js", () => ({
      sendPrompt: vi.fn().mockResolvedValue({ foo: "bar" }),
    }));
    const { generateStoryboard } = await import(
      "../../src/services/storyboarder.js"
    );
    await expect(generateStoryboard({})).rejects.toThrow(/invalid/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd apps/api && pnpm vitest run tests/services/storyboarder.test.ts
```
Expected: FAIL with "Cannot find module '../../src/services/storyboarder.js'".

- [ ] **Step 3: Write the service**

Create `apps/api/src/services/storyboarder.ts`:

```ts
import { sendPrompt } from "./claude.js";
import {
  GENERATE_STORYBOARD_PLAN_SYSTEM_PROMPT,
  GENERATE_STORYBOARD_MOCKUP_SYSTEM_PROMPT,
  buildStoryboardPlanUserMessage,
  buildStoryboardMockupUserMessage,
} from "../prompts/storyboard.js";

interface FlowStep {
  stepName: string;
  type: "form" | "tour" | "tooltip" | "checklist" | "contextual";
  description: string;
}

interface OptionPlan {
  name: string;
  rationale: string;
  flowStructure: FlowStep[];
}

interface PlanResult {
  authMockup: { login: string; signup: string };
  options: OptionPlan[];
}

interface MockupResult {
  mockupCode: Record<string, string>;
}

export interface StoryboardOption extends OptionPlan {
  mockupCode: Record<string, string>;
}

export interface StoryboardResult {
  authMockup: { login: string; signup: string };
  options: StoryboardOption[];
}

function trimDesignReferences(
  appProfile: Record<string, unknown>
): Record<string, unknown> {
  const designReferences = (appProfile.designReferences ?? {}) as {
    tailwindConfig?: string;
    globalsCss?: string;
    samplePages?: Record<string, string>;
    layoutCode?: string;
  };
  const samplePagesEntries = Object.entries(designReferences.samplePages ?? {});
  return {
    ...appProfile,
    designReferences: {
      tailwindConfig: designReferences.tailwindConfig,
      globalsCss: designReferences.globalsCss,
      samplePages: Object.fromEntries(samplePagesEntries.slice(0, 1)),
    },
  };
}

export async function generateStoryboard(
  appProfile: Record<string, unknown>
): Promise<StoryboardResult> {
  const planMsg = buildStoryboardPlanUserMessage(appProfile);
  const plan = (await sendPrompt(
    GENERATE_STORYBOARD_PLAN_SYSTEM_PROMPT,
    planMsg
  )) as PlanResult;

  if (
    !plan ||
    typeof plan !== "object" ||
    !Array.isArray(plan.options) ||
    !plan.authMockup ||
    typeof plan.authMockup.login !== "string" ||
    typeof plan.authMockup.signup !== "string"
  ) {
    console.error(
      "[storyboarder] plan response invalid:",
      JSON.stringify(plan).slice(0, 500)
    );
    throw new Error("Storyboard plan response invalid");
  }

  const trimmedProfile = trimDesignReferences(appProfile);

  const optionResults = await Promise.all(
    plan.options.map(async (option): Promise<StoryboardOption> => {
      const msg = buildStoryboardMockupUserMessage(trimmedProfile, option);
      const result = (await sendPrompt(
        GENERATE_STORYBOARD_MOCKUP_SYSTEM_PROMPT,
        msg
      )) as MockupResult;

      if (!result || typeof result.mockupCode !== "object" || result.mockupCode === null) {
        console.error(
          `[storyboarder] option "${option.name}" mockup invalid:`,
          JSON.stringify(result).slice(0, 500)
        );
        throw new Error(`Option "${option.name}" mockup response invalid`);
      }

      return { ...option, mockupCode: result.mockupCode };
    })
  );

  return {
    authMockup: plan.authMockup,
    options: optionResults,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
cd apps/api && pnpm vitest run tests/services/storyboarder.test.ts
```
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/storyboarder.ts apps/api/tests/services/storyboarder.test.ts
git commit -m "feat(api): add storyboarder service"
```

---

## Task 4: Storyboard route + test

**Files:**
- Create: `apps/api/src/routes/storyboard.ts`
- Create: `apps/api/tests/routes/storyboard.test.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/routes/storyboard.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

const mockAppProfile = { name: "Test", designReferences: {} };

vi.mock("../../src/services/storyboarder.js", () => ({
  generateStoryboard: vi.fn().mockResolvedValue({
    authMockup: { login: "<Login/>", signup: "<Signup/>" },
    options: [
      {
        name: "Wizard",
        rationale: "r1",
        flowStructure: [{ stepName: "welcome", type: "form", description: "d" }],
        mockupCode: { welcome: "<Welcome/>" },
      },
      {
        name: "Tour",
        rationale: "r2",
        flowStructure: [{ stepName: "tour", type: "tour", description: "d" }],
        mockupCode: { tour: "<Tour/>" },
      },
      {
        name: "Checklist",
        rationale: "r3",
        flowStructure: [{ stepName: "check", type: "checklist", description: "d" }],
        mockupCode: { check: "<Check/>" },
      },
    ],
  }),
}));

let capturedUpdate: any = null;
vi.mock("@onboarder/db", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ id: "proj-1", appProfile: mockAppProfile }]),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockImplementation(async () => [
          { id: `opt-${Math.random().toString(36).slice(2, 7)}` },
        ]),
      }),
    }),
    update: vi.fn().mockImplementation(() => ({
      set: vi.fn().mockImplementation((data) => {
        capturedUpdate = data;
        return {
          where: vi.fn().mockResolvedValue(undefined),
        };
      }),
    })),
  },
  projects: {},
  onboardingOptions: {},
  eq: vi.fn(),
}));

describe("POST /api/storyboard", () => {
  it("generates 3 options and saves them with authMockup on project", async () => {
    const { default: app } = await import("../../src/index.js");
    const res = await app.request("/api/storyboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: "proj-1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.options).toHaveLength(3);
    expect(body.options[0].name).toBe("Wizard");
    expect(body.options[0].mockupCode.welcome).toBeDefined();
    expect(body.authMockup.login).toBeDefined();
    expect(capturedUpdate?.authMockup).toEqual({
      login: "<Login/>",
      signup: "<Signup/>",
    });
  });

  it("rejects without projectId", async () => {
    const { default: app } = await import("../../src/index.js");
    const res = await app.request("/api/storyboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd apps/api && pnpm vitest run tests/routes/storyboard.test.ts
```
Expected: FAIL (404 on unknown route, or module not found).

- [ ] **Step 3: Write the route**

Create `apps/api/src/routes/storyboard.ts`:

```ts
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { generateStoryboard } from "../services/storyboarder.js";
import { db, projects, onboardingOptions } from "@onboarder/db";

const storyboard = new Hono();

storyboard.post("/", async (c) => {
  const { projectId } = await c.req.json<{ projectId: string }>();

  if (!projectId) {
    return c.json({ error: "projectId is required" }, 400);
  }

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId));

  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  const result = await generateStoryboard(
    project.appProfile as Record<string, unknown>
  );

  // Store shared authMockup on the project
  await db
    .update(projects)
    .set({ authMockup: result.authMockup })
    .where(eq(projects.id, projectId));

  // Insert each option with status="storyboard"
  const savedOptions = [];
  for (const option of result.options) {
    const [row] = await db
      .insert(onboardingOptions)
      .values({
        projectId,
        name: option.name,
        rationale: option.rationale,
        flowStructure: option.flowStructure,
        mockupCode: option.mockupCode,
        status: "storyboard",
        selected: false,
      })
      .returning();
    savedOptions.push({ ...option, id: row.id });
  }

  return c.json({
    options: savedOptions,
    authMockup: result.authMockup,
  });
});

export default storyboard;
```

- [ ] **Step 4: Mount the route**

Modify `apps/api/src/index.ts` — add import and mount:

```ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { errorHandler } from "./middleware/error.js";
import health from "./routes/health.js";
import analyze from "./routes/analyze.js";
import generate from "./routes/generate.js";
import storyboard from "./routes/storyboard.js";
import integrate from "./routes/integrate.js";

const app = new Hono();

app.use("*", cors({
  origin: process.env.APP_URL || "http://localhost:3012",
  credentials: true,
}));
app.use("*", errorHandler);

app.route("/health", health);
app.route("/api/analyze", analyze);
app.route("/api/generate", generate);
app.route("/api/storyboard", storyboard);
app.route("/api/integrate", integrate);

const port = Number(process.env.PORT) || 3011;

if (process.env.NODE_ENV !== "test") {
  console.log(`Onboarder API running on port ${port}`);
  serve({ fetch: app.fetch, port });
}

export default app;
```

- [ ] **Step 5: Run test to verify it passes**

Run:
```bash
cd apps/api && pnpm vitest run tests/routes/storyboard.test.ts
```
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/storyboard.ts apps/api/src/index.ts apps/api/tests/routes/storyboard.test.ts
git commit -m "feat(api): add POST /api/storyboard route"
```

---

## Task 5: Builder service + test

**Files:**
- Create: `apps/api/src/services/builder.ts`
- Create: `apps/api/tests/services/builder.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/services/builder.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("../../src/services/claude.js", () => ({
  sendPrompt: vi.fn().mockResolvedValue({
    authCode: {
      login: "export default function Login({ onNext }) {}",
      signup: "export default function Signup({ onNext }) {}",
    },
    componentCode: {
      welcome: "export default function Welcome({ onNext }) {}",
    },
  }),
}));

describe("builder service", () => {
  it("builds interactive code from an approved option", async () => {
    const { buildOption } = await import("../../src/services/builder.js");
    const result = await buildOption({
      appProfile: {
        name: "Test",
        designReferences: { tailwindConfig: "", globalsCss: "", samplePages: {} },
      },
      option: {
        name: "Wizard",
        rationale: "r",
        flowStructure: [
          { stepName: "welcome", type: "form", description: "d" },
        ],
        mockupCode: { welcome: "function WelcomeMock() {}" },
      },
      authMockup: {
        login: "function LoginMock() {}",
        signup: "function SignupMock() {}",
      },
    });

    expect(result.authCode.login).toContain("Login");
    expect(result.authCode.signup).toContain("Signup");
    expect(result.componentCode.welcome).toContain("Welcome");
  });

  it("throws if response is malformed", async () => {
    vi.resetModules();
    vi.doMock("../../src/services/claude.js", () => ({
      sendPrompt: vi.fn().mockResolvedValue({ foo: "bar" }),
    }));
    const { buildOption } = await import("../../src/services/builder.js");
    await expect(
      buildOption({
        appProfile: {},
        option: { name: "x", rationale: "y", flowStructure: [], mockupCode: {} },
        authMockup: { login: "", signup: "" },
      })
    ).rejects.toThrow(/invalid/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd apps/api && pnpm vitest run tests/services/builder.test.ts
```
Expected: FAIL with module not found.

- [ ] **Step 3: Write the service**

Create `apps/api/src/services/builder.ts`:

```ts
import { sendPrompt } from "./claude.js";
import {
  BUILD_OPTION_SYSTEM_PROMPT,
  buildBuildOptionUserMessage,
} from "../prompts/storyboard.js";

interface BuildInput {
  appProfile: Record<string, unknown>;
  option: {
    name: string;
    rationale: string;
    flowStructure: Array<{ stepName: string; type: string; description: string }>;
    mockupCode: Record<string, string>;
  };
  authMockup: { login: string; signup: string };
}

export interface BuildResult {
  componentCode: Record<string, string>;
  authCode: { login: string; signup: string };
}

function trimDesignReferences(
  appProfile: Record<string, unknown>
): Record<string, unknown> {
  const designReferences = (appProfile.designReferences ?? {}) as {
    tailwindConfig?: string;
    globalsCss?: string;
    samplePages?: Record<string, string>;
  };
  const samplePagesEntries = Object.entries(designReferences.samplePages ?? {});
  return {
    ...appProfile,
    designReferences: {
      tailwindConfig: designReferences.tailwindConfig,
      globalsCss: designReferences.globalsCss,
      samplePages: Object.fromEntries(samplePagesEntries.slice(0, 1)),
    },
  };
}

export async function buildOption(input: BuildInput): Promise<BuildResult> {
  const trimmed = trimDesignReferences(input.appProfile);
  const msg = buildBuildOptionUserMessage(trimmed, input.option, input.authMockup);
  const result = (await sendPrompt(BUILD_OPTION_SYSTEM_PROMPT, msg)) as BuildResult;

  if (
    !result ||
    typeof result !== "object" ||
    !result.componentCode ||
    typeof result.componentCode !== "object" ||
    !result.authCode ||
    typeof result.authCode.login !== "string" ||
    typeof result.authCode.signup !== "string"
  ) {
    console.error(
      "[builder] response invalid:",
      JSON.stringify(result).slice(0, 500)
    );
    throw new Error("Build response invalid");
  }

  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
cd apps/api && pnpm vitest run tests/services/builder.test.ts
```
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/builder.ts apps/api/tests/services/builder.test.ts
git commit -m "feat(api): add builder service"
```

---

## Task 6: Build route + test

**Files:**
- Create: `apps/api/src/routes/build.ts`
- Create: `apps/api/tests/routes/build.test.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/routes/build.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

const mockProject = {
  id: "proj-1",
  appProfile: { name: "Test", designReferences: {} },
  authMockup: { login: "<LoginMock/>", signup: "<SignupMock/>" },
};

const mockOption = {
  id: "opt-1",
  projectId: "proj-1",
  name: "Wizard",
  rationale: "r",
  flowStructure: [{ stepName: "welcome", type: "form", description: "d" }],
  mockupCode: { welcome: "<WelcomeMock/>" },
  status: "storyboard",
  componentCode: null,
  authCode: null,
};

vi.mock("../../src/services/builder.js", () => ({
  buildOption: vi.fn().mockResolvedValue({
    authCode: { login: "<LoginBuilt/>", signup: "<SignupBuilt/>" },
    componentCode: { welcome: "<WelcomeBuilt/>" },
  }),
}));

vi.mock("@onboarder/db", () => {
  const selectFromWhere = vi
    .fn()
    .mockResolvedValueOnce([mockProject])
    .mockResolvedValueOnce([mockOption]);
  return {
    db: {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({ where: selectFromWhere }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    },
    projects: {},
    onboardingOptions: {},
    eq: vi.fn(),
  };
});

describe("POST /api/build", () => {
  it("builds the selected option and returns built code", async () => {
    const { default: app } = await import("../../src/index.js");
    const res = await app.request("/api/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: "proj-1", optionId: "opt-1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.componentCode.welcome).toContain("WelcomeBuilt");
    expect(body.authCode.login).toContain("LoginBuilt");
  });

  it("rejects without projectId or optionId", async () => {
    const { default: app } = await import("../../src/index.js");
    const res = await app.request("/api/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: "proj-1" }),
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd apps/api && pnpm vitest run tests/routes/build.test.ts
```
Expected: FAIL (404 on unknown route).

- [ ] **Step 3: Write the route**

Create `apps/api/src/routes/build.ts`:

```ts
import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { buildOption } from "../services/builder.js";
import { db, projects, onboardingOptions } from "@onboarder/db";

const build = new Hono();

build.post("/", async (c) => {
  const { projectId, optionId } = await c.req.json<{
    projectId: string;
    optionId: string;
  }>();

  if (!projectId || !optionId) {
    return c.json({ error: "projectId and optionId are required" }, 400);
  }

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId));
  if (!project) return c.json({ error: "Project not found" }, 404);

  const [option] = await db
    .select()
    .from(onboardingOptions)
    .where(eq(onboardingOptions.id, optionId));
  if (!option || option.projectId !== projectId) {
    return c.json({ error: "Option not found" }, 404);
  }

  // Idempotent: if already built, return existing result
  if (
    option.status === "built" &&
    option.componentCode &&
    option.authCode
  ) {
    // Also flip selected flags (re-picking same option still marks it selected)
    await db
      .update(onboardingOptions)
      .set({ selected: false })
      .where(eq(onboardingOptions.projectId, projectId));
    await db
      .update(onboardingOptions)
      .set({ selected: true })
      .where(eq(onboardingOptions.id, optionId));

    return c.json({
      id: option.id,
      componentCode: option.componentCode,
      authCode: option.authCode,
    });
  }

  const authMockup = (project.authMockup ?? { login: "", signup: "" }) as {
    login: string;
    signup: string;
  };

  const result = await buildOption({
    appProfile: project.appProfile as Record<string, unknown>,
    option: {
      name: option.name,
      rationale: option.rationale,
      flowStructure: option.flowStructure as Array<{
        stepName: string;
        type: string;
        description: string;
      }>,
      mockupCode: (option.mockupCode ?? {}) as Record<string, string>,
    },
    authMockup,
  });

  // Flip selected: none in project selected, then this one
  await db
    .update(onboardingOptions)
    .set({ selected: false })
    .where(eq(onboardingOptions.projectId, projectId));
  await db
    .update(onboardingOptions)
    .set({
      componentCode: result.componentCode,
      authCode: result.authCode,
      status: "built",
      selected: true,
    })
    .where(eq(onboardingOptions.id, optionId));

  return c.json({
    id: optionId,
    componentCode: result.componentCode,
    authCode: result.authCode,
  });
});

export default build;
```

- [ ] **Step 4: Mount the route**

Modify `apps/api/src/index.ts` — add `build` import and `app.route("/api/build", build)` after the storyboard route:

```ts
import build from "./routes/build.js";
// ...
app.route("/api/storyboard", storyboard);
app.route("/api/build", build);
app.route("/api/integrate", integrate);
```

- [ ] **Step 5: Run test to verify it passes**

Run:
```bash
cd apps/api && pnpm vitest run tests/routes/build.test.ts
```
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/build.ts apps/api/src/index.ts apps/api/tests/routes/build.test.ts
git commit -m "feat(api): add POST /api/build route"
```

---

## Task 7: Web API client — add storyboard + build fetchers

**Files:**
- Modify: `apps/web/src/lib/api.ts`

- [ ] **Step 1: Edit api.ts**

Add types and fetch helpers to `apps/web/src/lib/api.ts`. Append after the existing `integrateOption` export:

```ts
export interface StoryboardOption {
  id: string;
  name: string;
  rationale: string;
  flowStructure: Array<{
    stepName: string;
    type: "form" | "tour" | "tooltip" | "checklist" | "contextual";
    description: string;
  }>;
  mockupCode: Record<string, string>;
}

export interface StoryboardResponse {
  options: StoryboardOption[];
  authMockup: { login: string; signup: string };
}

export interface BuildResponse {
  id: string;
  componentCode: Record<string, string>;
  authCode: { login: string; signup: string };
}

export const generateStoryboard = (projectId: string) =>
  request<StoryboardResponse>("/api/storyboard", {
    method: "POST",
    body: JSON.stringify({ projectId }),
  });

export const buildOption = (projectId: string, optionId: string) =>
  request<BuildResponse>("/api/build", {
    method: "POST",
    body: JSON.stringify({ projectId, optionId }),
  });
```

- [ ] **Step 2: Verify compilation**

Run:
```bash
cd apps/web && pnpm tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/api.ts
git commit -m "feat(web): add storyboard and build API client helpers"
```

---

## Task 8: Storyboard bundler — static iframe HTML per option

**Files:**
- Create: `apps/web/src/lib/storyboard-bundler.ts`

- [ ] **Step 1: Write the bundler**

Create `apps/web/src/lib/storyboard-bundler.ts`:

```ts
interface StoryboardStripInput {
  name: string;
  flowStructure: Array<{ stepName: string; type: string; description: string }>;
  mockupCode: Record<string, string>;
  authMockup: { login: string; signup: string };
}

interface ExtractedComponent {
  declaration: string;
  name: string;
}

/**
 * Build a single-iframe HTML document that renders one option's storyboard
 * strip: auth screens (signup + login) followed by each flow step, laid out
 * horizontally as scaled thumbnails. Pure static — no state, no handlers.
 */
export function buildStoryboardStripHtml(input: StoryboardStripInput): string {
  const screens: Array<{ slotName: string; label: string; comp: ExtractedComponent }> = [];

  if (input.authMockup.signup) {
    screens.push({
      slotName: "__screen_signup",
      label: "signup",
      comp: extractComponent(input.authMockup.signup, "signup"),
    });
  }
  if (input.authMockup.login) {
    screens.push({
      slotName: "__screen_login",
      label: "login",
      comp: extractComponent(input.authMockup.login, "login"),
    });
  }

  for (const step of input.flowStructure) {
    const code = input.mockupCode[step.stepName];
    if (!code) continue;
    screens.push({
      slotName: `__screen_${toIdentifier(step.stepName)}`,
      label: step.stepName,
      comp: extractComponent(code, step.stepName),
    });
  }

  const componentDeclarations = screens
    .map(
      ({ slotName, comp }) => `const ${slotName} = (function() {
${comp.declaration}
  return typeof ${comp.name} !== "undefined" ? ${comp.name} : null;
})();`
    )
    .join("\n\n");

  const panels = screens
    .map(
      ({ slotName, label }) => `
          <div class="panel">
            <div class="panel-label">${escapeHtml(label)}</div>
            <div class="panel-frame">
              <div class="panel-scale">
                ${"${" + `React.createElement(${slotName} || (() => React.createElement('div', {className: 'p-8 text-gray-400'}, 'missing')))` + "}"}
              </div>
            </div>
          </div>`
    )
    .join("");

  // Can't string-interpolate React.createElement inline in JSX — easier to
  // build the panel list as an array in React-land. Rewrite using JSX:
  const panelsJsx = screens
    .map(
      ({ slotName, label }) =>
        `<div className="panel"><div className="panel-label">${escapeHtml(
          label
        )}</div><div className="panel-frame"><div className="panel-scale">{${slotName} ? <${slotName}/> : <div className="p-8 text-gray-400">missing</div>}</div></div></div>`
    )
    .join("");

  const tsxSource = `
    ${componentDeclarations}

    function Strip() {
      return (
        <div className="strip">
          ${panelsJsx}
        </div>
      );
    }

    ReactDOM.createRoot(document.getElementById("root")).render(<Strip />);
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(input.name)} Storyboard</title>
  <script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin="anonymous"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin="anonymous"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js" crossorigin="anonymous"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    html, body, #root { margin: 0; height: 100%; background: #f9fafb; }
    .strip { display: flex; gap: 24px; padding: 24px; overflow-x: auto; height: 100%; align-items: flex-start; }
    .panel { flex: 0 0 auto; display: flex; flex-direction: column; gap: 8px; }
    .panel-label { font: 600 12px/1 -apple-system, sans-serif; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; padding-left: 4px; }
    .panel-frame { width: 400px; height: 280px; border: 1px solid #e5e7eb; border-radius: 8px; background: white; overflow: hidden; position: relative; }
    .panel-scale { transform: scale(0.35); transform-origin: top left; width: calc(100% / 0.35); height: calc(100% / 0.35); }
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
  <script id="storyboard-tsx-source" type="text/plain">${escapeForTextScript(tsxSource)}</script>
  <script>
    (function() {
      try {
        var source = document.getElementById("storyboard-tsx-source").textContent;
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

function extractComponent(code: string, stepName: string): ExtractedComponent {
  let cleaned = code;
  cleaned = cleaned.replace(/^```(?:jsx?|tsx?)?\s*\n/, "").replace(/\n?```\s*$/, "");
  cleaned = cleaned.replace(/^[ \t]*import[ \t][^\n]*;?\s*$/gm, "");
  cleaned = cleaned.replace(/^[ \t]*["']use client["'];?\s*$/gm, "");

  const safeName = toIdentifier(stepName);

  const exportFnMatch = cleaned.match(/export\s+default\s+function\s+([A-Za-z_]\w*)/);
  if (exportFnMatch) {
    cleaned = cleaned.replace(/export\s+default\s+/, "");
    return { declaration: cleaned, name: exportFnMatch[1] };
  }
  const exportNameMatch = cleaned.match(/export\s+default\s+([A-Za-z_]\w*)\s*;?\s*$/m);
  if (exportNameMatch) {
    cleaned = cleaned.replace(/export\s+default\s+[A-Za-z_]\w*\s*;?\s*$/m, "");
    return { declaration: cleaned, name: exportNameMatch[1] };
  }
  const exportArrowMatch = cleaned.match(/export\s+default\s+(?=\(|[A-Za-z_])/);
  if (exportArrowMatch) {
    cleaned = cleaned.replace(/export\s+default\s+/, `const ${safeName} = `);
    return { declaration: cleaned, name: safeName };
  }
  const bareFnMatch = cleaned.match(/^[ \t]*function\s+([A-Z]\w*)\s*\(/m);
  if (bareFnMatch) return { declaration: cleaned, name: bareFnMatch[1] };
  const bareConstMatch = cleaned.match(/^[ \t]*const\s+([A-Z]\w*)\s*=\s*(?:\(|async\s|[A-Za-z_])/m);
  if (bareConstMatch) return { declaration: cleaned, name: bareConstMatch[1] };

  return {
    declaration: `function ${safeName}() { return <div className="p-8 text-gray-500">Could not parse mockup for "${stepName}"</div>; }`,
    name: safeName,
  };
}

function toIdentifier(name: string): string {
  const safe = name.replace(/[^a-zA-Z0-9]/g, "_");
  return /^[0-9]/.test(safe) ? `_${safe}` : safe || "_Component";
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeForTextScript(str: string): string {
  return str.replace(/<\/script/gi, "<\\/script");
}
```

Note the `panels` variable at the top of `buildStoryboardStripHtml` is an early scratch attempt — leave only the `panelsJsx` version. Delete the `panels` variable and the template string referencing it before committing. The `tsxSource` should use only `panelsJsx`.

- [ ] **Step 2: Clean up the scratch panels variable**

Delete the entire `const panels = screens.map(...)` block and its template string (lines producing `React.createElement` strings). Keep only `panelsJsx` — it's what the final `tsxSource` references. After cleanup, `buildStoryboardStripHtml` should flow: declare `screens` → build `componentDeclarations` → build `panelsJsx` → build `tsxSource` → return HTML.

- [ ] **Step 3: Verify compilation**

Run:
```bash
cd apps/web && pnpm tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/storyboard-bundler.ts
git commit -m "feat(web): add storyboard-bundler for static strip iframes"
```

---

## Task 9: Storyboard UI components

**Files:**
- Create: `apps/web/src/components/storyboard-strip.tsx`
- Create: `apps/web/src/components/storyboard-view.tsx`

- [ ] **Step 1: Create StoryboardStrip**

Create `apps/web/src/components/storyboard-strip.tsx`:

```tsx
"use client";

import { useMemo } from "react";
import { buildStoryboardStripHtml } from "@/lib/storyboard-bundler";
import type { StoryboardOption } from "@/lib/api";

interface Props {
  option: StoryboardOption;
  authMockup: { login: string; signup: string };
  onPick: () => void;
  picking: boolean;
}

export default function StoryboardStrip({ option, authMockup, onPick, picking }: Props) {
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
    <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <header className="flex items-start justify-between p-5 border-b border-gray-100">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{option.name}</h3>
          <p className="text-sm text-gray-500 mt-1 max-w-2xl">{option.rationale}</p>
        </div>
        <button
          onClick={onPick}
          disabled={picking}
          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50"
        >
          {picking ? "Building…" : "Pick this flow"}
        </button>
      </header>
      <iframe
        srcDoc={html}
        className="w-full h-[340px] border-0 block"
        sandbox="allow-scripts"
        title={`${option.name} storyboard`}
      />
    </section>
  );
}
```

- [ ] **Step 2: Create StoryboardView**

Create `apps/web/src/components/storyboard-view.tsx`:

```tsx
"use client";

import { useState } from "react";
import StoryboardStrip from "./storyboard-strip";
import type { StoryboardOption } from "@/lib/api";

interface Props {
  options: StoryboardOption[];
  authMockup: { login: string; signup: string };
  appName: string;
  onPick: (optionId: string) => Promise<void>;
}

export default function StoryboardView({ options, authMockup, appName, onPick }: Props) {
  const [pickingId, setPickingId] = useState<string | null>(null);

  async function handlePick(optionId: string) {
    setPickingId(optionId);
    try {
      await onPick(optionId);
    } finally {
      setPickingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900">Pick a storyboard</h1>
        <p className="text-sm text-gray-500">For {appName}</p>
      </header>
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        {options.map((option) => (
          <StoryboardStrip
            key={option.id}
            option={option}
            authMockup={authMockup}
            onPick={() => handlePick(option.id)}
            picking={pickingId === option.id}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify compilation**

Run:
```bash
cd apps/web && pnpm tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/storyboard-strip.tsx apps/web/src/components/storyboard-view.tsx
git commit -m "feat(web): add storyboard strip and view components"
```

---

## Task 10: Upload page — switch to storyboard endpoint

**Files:**
- Modify: `apps/web/src/app/page.tsx`

- [ ] **Step 1: Rewrite handleFilesReady**

Modify `apps/web/src/app/page.tsx` — change the `generateOnboarding` call to `generateStoryboard`, and rename the "generating" status to "storyboarding":

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import DropZone from "@/components/drop-zone";
import AnalysisStatus from "@/components/analysis-status";
import { analyzeProject, generateStoryboard } from "@/lib/api";

type Status = "idle" | "reading" | "analyzing" | "storyboarding" | "done" | "error";

export default function Home() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string>();

  async function handleFilesReady(
    files: Record<string, string>,
    dirHandle: FileSystemDirectoryHandle | null,
    projectName: string
  ) {
    try {
      setStatus("reading");
      setError(undefined);

      if (dirHandle) {
        (window as unknown as Record<string, unknown>).__onboarderDirHandle = dirHandle;
      }

      const fileCount = Object.keys(files).length;
      const payloadSize = JSON.stringify(files).length;
      console.log(`[onboarder] ${fileCount} files, ~${(payloadSize / 1024).toFixed(0)}KB payload`);

      setStatus("analyzing");
      const { projectId, appProfile } = await analyzeProject(files, projectName);

      setStatus("storyboarding");
      const { options, authMockup } = await generateStoryboard(projectId);

      setStatus("done");

      sessionStorage.setItem(
        "onboarder_session",
        JSON.stringify({
          projectId,
          appProfile,
          storyboardOptions: options,
          authMockup,
          fromZip: !dirHandle,
        })
      );

      router.push("/preview");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900">Onboarder</h1>
        <p className="text-lg text-gray-500 mt-2">
          AI-powered onboarding for your Next.js apps
        </p>
      </div>

      <DropZone
        onFilesReady={handleFilesReady}
        disabled={status !== "idle" && status !== "error"}
      />

      <AnalysisStatus status={status} error={error} />
    </main>
  );
}
```

- [ ] **Step 2: Check AnalysisStatus handles "storyboarding"**

Look at `apps/web/src/components/analysis-status.tsx`. If it has a hardcoded status map like `{ generating: "Generating onboarding..." }`, rename to `storyboarding: "Generating storyboards..."`. If it uses free-form strings, no change needed.

- [ ] **Step 3: Verify compilation**

Run:
```bash
cd apps/web && pnpm tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/page.tsx apps/web/src/components/analysis-status.tsx
git commit -m "feat(web): switch upload page to storyboard flow"
```

---

## Task 11: Preview page — add storyboard mode + build transition

**Files:**
- Modify: `apps/web/src/app/preview/page.tsx`

- [ ] **Step 1: Rewrite the preview page**

Replace the contents of `apps/web/src/app/preview/page.tsx`:

```tsx
"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import OptionCard from "@/components/option-card";
import PreviewFrame from "@/components/preview-frame";
import ViewportToggle from "@/components/viewport-toggle";
import FlowBreakdown from "@/components/flow-breakdown";
import StoryboardView from "@/components/storyboard-view";
import { buildPreviewHtml } from "@/lib/preview-bundler";
import { buildOption, StoryboardOption, OnboardingOption } from "@/lib/api";

type Viewport = "phone" | "tablet" | "desktop";
type Mode = "storyboard" | "full";

interface SessionData {
  projectId: string;
  appProfile: { name: string };
  storyboardOptions: StoryboardOption[];
  authMockup: { login: string; signup: string };
  builtOption?: OnboardingOption;
  fromZip?: boolean;
}

export default function PreviewPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionData | null>(null);
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [buildError, setBuildError] = useState<string | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("onboarder_session");
    if (!stored) {
      router.push("/");
      return;
    }
    setSession(JSON.parse(stored));
  }, [router]);

  const mode: Mode = session?.builtOption ? "full" : "storyboard";

  const previewHtml = useMemo(() => {
    if (!session?.builtOption) return "";
    return buildPreviewHtml(session.builtOption);
  }, [session]);

  if (!session) return null;

  async function handlePick(optionId: string) {
    setBuildError(null);
    try {
      const result = await buildOption(session!.projectId, optionId);
      const pickedMeta = session!.storyboardOptions.find((o) => o.id === optionId);
      if (!pickedMeta) throw new Error("Picked option missing from session");
      const builtOption: OnboardingOption = {
        id: result.id,
        name: pickedMeta.name,
        rationale: pickedMeta.rationale,
        flowStructure: pickedMeta.flowStructure,
        componentCode: result.componentCode,
        authCode: result.authCode,
      };
      const updated = { ...session!, builtOption };
      sessionStorage.setItem("onboarder_session", JSON.stringify(updated));
      setSession(updated);
    } catch (err) {
      setBuildError(err instanceof Error ? err.message : "Build failed");
    }
  }

  function handleBackToStoryboards() {
    const updated = { ...session! };
    delete updated.builtOption;
    sessionStorage.setItem("onboarder_session", JSON.stringify(updated));
    setSession(updated);
  }

  function handleIntegrate() {
    if (!session!.builtOption) return;
    sessionStorage.setItem(
      "onboarder_chosen",
      JSON.stringify({
        projectId: session!.projectId,
        optionId: session!.builtOption.id,
      })
    );
    router.push("/integrate");
  }

  if (mode === "storyboard") {
    return (
      <>
        {buildError && (
          <div className="bg-red-50 border-b border-red-200 text-red-800 text-sm px-6 py-3">
            Build failed: {buildError}
          </div>
        )}
        <StoryboardView
          options={session.storyboardOptions}
          authMockup={session.authMockup}
          appName={session.appProfile.name}
          onPick={handlePick}
        />
      </>
    );
  }

  const built = session.builtOption!;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Onboarder</h1>
          <p className="text-sm text-gray-500">Built: {built.name}</p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={handleBackToStoryboards}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
          >
            ← Back to storyboards
          </button>
          <ViewportToggle viewport={viewport} onChange={setViewport} />
          <button
            onClick={handleIntegrate}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            Use this flow
          </button>
        </div>
      </header>

      <div className="flex h-[calc(100vh-73px)]">
        <aside className="w-80 bg-white border-r p-4 space-y-3 overflow-y-auto">
          <OptionCard option={built} isSelected={true} onSelect={() => {}} />
          <div className="pt-4 border-t">
            <FlowBreakdown steps={built.flowStructure} />
          </div>
        </aside>

        <main className="flex-1 p-6 overflow-y-auto">
          <PreviewFrame html={previewHtml} viewport={viewport} />
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify compilation**

Run:
```bash
cd apps/web && pnpm tsc --noEmit
```
Expected: no errors. If `OptionCard` or `FlowBreakdown` prop types don't match the simplified usage above, adjust their imports or prop shapes (only the selected built option is shown in the sidebar).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/preview/page.tsx
git commit -m "feat(web): add storyboard mode and build transition to preview page"
```

---

## Task 12: Full test suite + manual E2E verification

**Files:** none — validation only

- [ ] **Step 1: Run the full API test suite**

Run:
```bash
cd apps/api && pnpm vitest run
```
Expected: all tests pass (existing + 4 new). If `generate.test.ts` now breaks because of schema nullability changes, update its mocks to match (componentCode/authCode may be null) — but it should still pass since it mocks the service layer.

- [ ] **Step 2: Web typecheck**

Run:
```bash
cd apps/web && pnpm tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Start both dev servers**

Run (in separate terminals):
```bash
cd apps/api && pnpm dev
cd apps/web && pnpm dev
```
Expected: API on port 3011, web on port 3012.

- [ ] **Step 4: End-to-end walk**

1. Open http://localhost:3012
2. Upload a Next.js or Vite project (e.g., the rest-express project from earlier testing)
3. Verify the status advances: `reading` → `analyzing` → `storyboarding` → redirect to `/preview`
4. On `/preview`, verify 3 storyboard strips render with the app's actual brand colors and content
5. Click "Pick this flow" on one strip
6. Verify the "Building…" state shows on the picked strip
7. After build completes, verify the page switches to the full preview mode with the built option's interactive components
8. Click "← Back to storyboards", verify the storyboard view returns without re-running any API calls
9. Pick a different option, verify it builds and switches
10. Click "Use this flow", verify `/integrate` opens

- [ ] **Step 5: Commit the end-to-end verification notes**

No code change — just confirm the plan is complete and paste a note into the commit message if anything needed follow-up:

```bash
git commit --allow-empty -m "chore: verify storyboard-first flow end-to-end"
```

---

## Self-review notes

- **Spec coverage:** All 8 spec sections mapped — user journey (tasks 10-11), API/DB architecture (tasks 1-6), storyboard rendering (tasks 8-9), build stage (task 6), error handling (task 6 + task 11), token budget (informational, no task needed), migration path (task 1 covers DB; feature-flag path omitted for YAGNI since /generate stays mounted alongside).
- **Re-pick behavior** is handled in task 11 (`handleBackToStoryboards` + idempotent `/build` in task 6).
- **Partial storyboard failure UI** is out of scope for this plan — if storyboarder throws, the existing error handler surfaces the error on the upload page. Graceful single-option retry can be added in a follow-up; the spec's stated behavior ("render the 2 that succeeded + retry slot") requires meaningful extra UI, so skipping per YAGNI until we see real failures.
- The legacy `/api/generate` endpoint and its test remain mounted. Removal is a follow-up once the new flow is verified in prod.
