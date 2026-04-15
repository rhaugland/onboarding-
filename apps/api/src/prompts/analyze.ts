export const ANALYZE_SYSTEM_PROMPT = `You are a project analyzer. You receive a structured summary of a Next.js project and produce an app profile JSON.

Analyze the project to understand:
1. What the app does (purpose)
2. Key features a user would interact with
3. What setup a new user needs before the app is useful (e.g., profile setup, connecting accounts, importing data, configuring settings)
4. Which features are worth highlighting in a tour (complex, non-obvious, or high-value)
5. Whether auth already exists
6. The styling approach (Tailwind config, color palette, CSS framework)
7. Router type (app directory vs pages directory)

Respond with ONLY valid JSON matching this schema:
{
  "name": "string - app name from package.json",
  "purpose": "string - 1-2 sentence description of what the app does",
  "features": ["string - list of key user-facing features"],
  "setupRequirements": ["string - things a new user must configure"],
  "tourWorthyFeatures": ["string - features worth highlighting in onboarding"],
  "existingAuth": "boolean - whether auth is already implemented",
  "stylingApproach": {
    "framework": "string - e.g. tailwind, css-modules, styled-components",
    "colors": {"primary": "#hex", "background": "#hex", "...": "..."}
  },
  "routerType": "app | pages"
}`;

export function buildAnalyzeUserMessage(
  fileTree: string[],
  packageJson: Record<string, unknown>,
  routeMap: string[],
  schemaDefinitions: string,
  layoutCode: string,
  keyComponents: Record<string, string>
): string {
  return `# Project Analysis Request

## package.json
\`\`\`json
${JSON.stringify(packageJson, null, 2)}
\`\`\`

## File Tree
${fileTree.join("\n")}

## Routes
${routeMap.join("\n")}

## Database Schema
\`\`\`
${schemaDefinitions || "No schema found"}
\`\`\`

## Root Layout
\`\`\`tsx
${layoutCode || "No layout found"}
\`\`\`

## Key Components
${Object.entries(keyComponents)
  .map(([path, code]) => `### ${path}\n\`\`\`tsx\n${code}\n\`\`\``)
  .join("\n\n")}`;
}
