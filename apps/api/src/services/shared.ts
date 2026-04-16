/**
 * Trim design references for per-option Claude calls.
 *
 * Keeps the brand sources that materially change output — Tailwind config,
 * globals.css, and a single representative sample page — while dropping
 * layout code and extra sample pages that bloat token usage without
 * improving per-option fidelity.
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
      samplePages: Object.fromEntries(samplePagesEntries.slice(0, 1)),
    },
  };
}
