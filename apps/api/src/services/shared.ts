/**
 * Trim design references for per-option Claude calls.
 *
 * Keeps the brand/design vocabulary that materially changes output — Tailwind
 * config, globals.css, the app's layout code, and a single representative
 * sample page — while dropping extra sample pages that bloat token usage
 * without improving per-option fidelity.
 */
export function trimDesignReferences(
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
      layoutCode: designReferences.layoutCode,
      samplePages: Object.fromEntries(samplePagesEntries.slice(0, 1)),
    },
  };
}
