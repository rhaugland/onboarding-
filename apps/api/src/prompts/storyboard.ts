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
