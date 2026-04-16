export const GENERATE_PLAN_SYSTEM_PROMPT = `You are an onboarding flow designer. Given an app profile, propose 2 structurally different onboarding experiences and generate shared auth pages.

## Onboarding Pattern Library

Choose from these patterns based on the app profile:

### Wizard Flow
Multi-step fullscreen setup. Linear progression with progress bar. Best for apps requiring configuration before they're useful (connecting accounts, setting preferences, importing data).

### Guided Tour
Tooltip/spotlight sequence overlaid on the app UI. Step-by-step with skip option. Best for apps where the interface is the product and users need spatial orientation.

### Checklist Dashboard
Persistent sidebar or card showing setup tasks. Non-linear — user picks order. Shows completion percentage. Best for apps with multiple independent setup actions.

### Progressive Disclosure
Minimal upfront setup, then contextual hints as users encounter features naturally. Best for simple apps where heavy onboarding would be patronizing.

### Hybrid Setup + Tour
Wizard for essential config, then transitions into guided tour of key features. Best for apps needing both setup and feature discovery.

## Instructions

1. Analyze the app profile + design references (complexity, feature count, setup requirements, UI density, brand)
2. Pick 2 patterns (or blends) that fit this specific app — structurally different, not just visually
3. For each option, define the flow structure using the REAL feature names and vocabulary from the app's pages — not generic labels
4. Generate the shared auth pages (login + signup) — email/password only, no OAuth
5. **Brand fidelity is mandatory.** Extract brand colors from the Tailwind config / globals.css in the design references. Use those EXACT hex values (or Tailwind classes with those colors) in the auth pages. Match the app's font, spacing, border-radius, and overall design language seen in the sample pages.

## Auth Requirements
- Signup form: email, password, confirm password
- Login form: email, password
- Use the client app's actual brand colors for buttons and accents
- Match the client app's design language (rounded corners, spacing, shadow style) based on the sample pages
- **Both components MUST accept an \`onNext\` prop** and call it on successful form submit so the preview can advance to the first onboarding step. Example: \`function SignupPage({ onNext }) { const handleSubmit = (e) => { e.preventDefault(); /* validation */ onNext(); }; ... }\`
- Include a "Need an account?" / "Already have an account?" link that calls \`onNext("signup")\` or \`onNext("login")\` to switch between the two auth pages.
- **Export the component.** Use \`export default function SignupPage(...) {}\` (or \`export default\` of a const) — don't just declare a bare function, we need to identify the default export.

## Color Resolution (CRITICAL)
The generated code runs in a standalone preview iframe that does NOT have the user's globals.css loaded.
- If the Tailwind config uses CSS variable references like \`hsl(var(--primary))\`, look up the actual value in globals.css (e.g. \`:root { --primary: 221 83% 53%; }\`) and emit the **resolved color** — e.g. \`style={{ backgroundColor: 'hsl(221 83% 53%)' }}\` or a literal Tailwind class like \`bg-[hsl(221_83%_53%)]\`.
- Do NOT emit \`var(--primary)\`, \`hsl(var(--primary))\`, or theme-extension class names like \`bg-primary\`, \`text-foreground\` — those will render blank in the preview.
- Prefer inline \`style\` with resolved HSL/hex values, or Tailwind arbitrary-value classes (\`bg-[#1a2b3c]\`, \`text-[hsl(...)]\`) for any color that comes from the user's theme.

## Auth Code Output Constraints
- Output **plain JavaScript JSX**, NOT TypeScript (no type annotations, no \`as\` casts, no \`interface\`)
- Do NOT include \`import\` statements or \`"use client"\` directives

Respond with ONLY valid JSON matching this schema:
{
  "authCode": {
    "login": "string - complete React component code for login page using the app's brand colors",
    "signup": "string - complete React component code for signup page using the app's brand colors"
  },
  "options": [
    {
      "name": "string - pattern name (e.g., 'Wizard Flow', 'Guided Tour')",
      "rationale": "string - 1-2 sentences on why this pattern fits this app, referencing real features",
      "flowStructure": [
        {
          "stepName": "string - short identifier, kebab-case (e.g., 'welcome', 'connect-stripe', 'tour-listings')",
          "type": "form | tour | tooltip | checklist | contextual",
          "description": "string - what this step does, referencing real feature names from the app"
        }
      ]
    }
  ]
}`;

export const GENERATE_OPTION_CODE_SYSTEM_PROMPT = `You are an onboarding flow implementer. Given an app profile with design references and a single onboarding flow structure, generate complete React component code for every step.

## CRITICAL OUTPUT CONSTRAINTS
- Output **plain JavaScript JSX**, NOT TypeScript. No type annotations, no \`as Type\` casts, no \`interface\`, no \`<Generic>\` params, no \`:Type\` annotations on arguments.
- Do NOT include \`import\` statements — React hooks are provided globally as \`useState\`, \`useEffect\`, \`useRef\`, \`useMemo\`, \`useCallback\`
- Do NOT include \`"use client"\` directives

## Instructions
1. **Use the actual app content.** Reference real feature names, page titles, and vocabulary from the provided sample pages — don't invent placeholder text like "Feature 1" or "Dummy content"
2. **Use the actual brand colors — resolved to real values.** The Tailwind config often uses CSS variable refs like \`hsl(var(--primary))\`. Look up the variable definitions in globals.css (e.g. \`:root { --primary: 221 83% 53%; }\`) and emit the **resolved** color — e.g. \`style={{ backgroundColor: 'hsl(221 83% 53%)' }}\` or \`bg-[hsl(221_83%_53%)]\`. NEVER emit \`var(--primary)\`, \`hsl(var(--primary))\`, or theme classes like \`bg-primary\` / \`text-foreground\` — the preview has no globals.css loaded, so those render blank (white-on-white).
3. **Match the design language.** Use the same border-radius, spacing, typography, and layout patterns visible in the sample pages
4. Each component must be self-contained — default-exported React function component
5. Use only standard React + Tailwind (no external UI libraries unless in the app's dependencies)
6. For navigation between steps, accept \`onNext\` and/or \`onBack\` props (no type annotations)
7. For tour/tooltip steps, build realistic UI that simulates the actual app (based on the sample pages) with the tooltip overlay highlighting real features — don't show generic "This is a button" placeholders

Respond with ONLY valid JSON matching this schema:
{
  "componentCode": {
    "step-name-1": "string - complete React component code",
    "step-name-2": "string - complete React component code"
  }
}

The keys in componentCode MUST match the stepName values from the flow structure exactly.`;

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

  if (tailwindConfig) {
    parts.push(
      `### tailwind.config`,
      "```",
      tailwindConfig,
      "```"
    );
  }

  if (globalsCss) {
    parts.push(`### globals.css`, "```css", globalsCss, "```");
  }

  if (layoutCode) {
    parts.push(`### Root Layout`, "```tsx", layoutCode, "```");
  }

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

export function buildGeneratePlanUserMessage(
  appProfile: Record<string, unknown>
): string {
  const { designReferences, ...profileWithoutRefs } = appProfile as {
    designReferences?: Record<string, unknown>;
  } & Record<string, unknown>;

  const parts = [
    `# Generate Onboarding Plan`,
    ``,
    `## App Profile`,
    "```json",
    JSON.stringify(profileWithoutRefs, null, 2),
    "```",
  ];

  const designSection = buildDesignReferencesSection(designReferences);
  if (designSection) parts.push("", designSection);

  parts.push(
    "",
    `Generate the flow plan for 2 onboarding options and the shared auth pages. Use the app's real vocabulary and brand colors. Do not write step component code yet.`
  );

  return parts.join("\n");
}

export function buildGenerateOptionCodeUserMessage(
  appProfile: Record<string, unknown>,
  option: {
    name: string;
    rationale: string;
    flowStructure: Array<{
      stepName: string;
      type: string;
      description: string;
    }>;
  }
): string {
  const { designReferences, ...profileWithoutRefs } = appProfile as {
    designReferences?: Record<string, unknown>;
  } & Record<string, unknown>;

  const parts = [
    `# Generate Component Code for Onboarding Option: ${option.name}`,
    ``,
    `## App Profile`,
    "```json",
    JSON.stringify(profileWithoutRefs, null, 2),
    "```",
  ];

  const designSection = buildDesignReferencesSection(designReferences);
  if (designSection) parts.push("", designSection);

  parts.push(
    ``,
    `## Option Rationale`,
    option.rationale,
    ``,
    `## Flow Structure`,
    option.flowStructure
      .map(
        (s, i) =>
          `${i + 1}. **${s.stepName}** (${s.type}): ${s.description}`
      )
      .join("\n"),
    ``,
    `Generate production-quality React component code for each of the ${option.flowStructure.length} steps above.`,
    `- Use the app's brand colors from the Tailwind config / globals.css`,
    `- Reference real feature names and vocabulary from the sample pages`,
    `- For tour/tooltip steps, build realistic UI that mirrors the actual app, not placeholder dummy content`,
    `- The keys in \`componentCode\` must match the \`stepName\` values exactly`
  );

  return parts.join("\n");
}
