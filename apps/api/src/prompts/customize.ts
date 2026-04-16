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
