export const ANALYZE_SYSTEM_PROMPT = `You are a project analyzer. You receive a structured summary of a Next.js project and produce an app profile JSON.

Analyze the project to understand:
1. What the app does (purpose) — be SPECIFIC using the actual vocabulary, page titles, and feature names found in the code, not generic descriptions
2. Key features a user would interact with — use the EXACT names/labels that appear in the UI (e.g., if the page says "Create Staging", don't call it "generate image")
3. What setup a new user needs before the app is useful (e.g., profile setup, connecting accounts, importing data, configuring settings)
4. Which features are worth highlighting in a tour (complex, non-obvious, or high-value)
5. Whether auth already exists
6. The styling approach — extract EXACT brand colors from tailwind.config.* and/or globals.css (read CSS variables like --primary, --background, theme.extend.colors, etc.). Return real hex values, not guesses.
7. Router type (app directory vs pages directory)

CRITICAL: Ground everything in the actual code. Do not invent features or colors. If you can't find a specific color, omit it rather than guess.

Respond with ONLY valid JSON matching this schema:
{
  "name": "string - app name from package.json",
  "purpose": "string - 1-2 sentence description of what the app actually does, using its real vocabulary",
  "features": ["string - real feature names as they appear in the UI"],
  "setupRequirements": ["string - things a new user must configure, using real app terminology"],
  "tourWorthyFeatures": ["string - features worth highlighting in onboarding"],
  "existingAuth": "boolean - whether auth is already implemented",
  "stylingApproach": {
    "framework": "string - e.g. tailwind, css-modules, styled-components",
    "colors": {"primary": "#hex", "background": "#hex", "accent": "#hex", "...": "..."},
    "fontFamily": "string - e.g. 'Inter, sans-serif' if detectable",
    "notes": "string - any other styling notes (rounded corners, spacing, design language)"
  },
  "routerType": "app | pages"
}`;

export function buildAnalyzeUserMessage(
  fileTree: string[],
  packageJson: Record<string, unknown>,
  routeMap: string[],
  schemaDefinitions: string,
  layoutCode: string,
  keyComponents: Record<string, string>,
  pageFiles: Record<string, string>,
  tailwindConfig: string,
  globalsCss: string
): string {
  const sections = [
    `# Project Analysis Request`,
    ``,
    `## package.json`,
    `\`\`\`json`,
    JSON.stringify(packageJson, null, 2),
    `\`\`\``,
    ``,
    `## File Tree`,
    fileTree.join("\n"),
    ``,
    `## Routes`,
    routeMap.join("\n") || "(no routes detected)",
    ``,
    `## Tailwind Config`,
    `\`\`\``,
    tailwindConfig || "(no tailwind.config found)",
    `\`\`\``,
    ``,
    `## globals.css`,
    `\`\`\`css`,
    globalsCss || "(no globals.css found)",
    `\`\`\``,
    ``,
    `## Database Schema`,
    `\`\`\``,
    schemaDefinitions || "(no schema found)",
    `\`\`\``,
    ``,
    `## Root Layout`,
    `\`\`\`tsx`,
    layoutCode || "(no layout found)",
    `\`\`\``,
    ``,
    `## Pages`,
    Object.entries(pageFiles)
      .map(([path, code]) => `### ${path}\n\`\`\`tsx\n${code}\n\`\`\``)
      .join("\n\n") || "(no page files found)",
    ``,
    `## Key Components`,
    Object.entries(keyComponents)
      .map(([path, code]) => `### ${path}\n\`\`\`tsx\n${code}\n\`\`\``)
      .join("\n\n") || "(no components found)",
  ];

  return sections.join("\n");
}
