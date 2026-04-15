import { describe, it, expect } from "vitest";
import { buildContextPayload } from "../../src/services/analyzer.js";

describe("analyzer service", () => {
  it("extracts file tree from file map", () => {
    const files: Record<string, string> = {
      "package.json": '{"name":"test-app"}',
      "src/app/page.tsx": "export default function Home() {}",
      "src/app/layout.tsx": "<html><body>{children}</body></html>",
      "src/app/dashboard/page.tsx": "export default function Dashboard() {}",
    };

    const result = buildContextPayload(files);

    expect(result.fileTree).toContain("package.json");
    expect(result.fileTree).toContain("src/app/page.tsx");
    expect(result.packageJson).toEqual({ name: "test-app" });
    expect(result.routeMap).toContain("/");
    expect(result.routeMap).toContain("/dashboard");
    expect(result.layoutCode).toContain("{children}");
  });

  it("detects app router vs pages router", () => {
    const appRouterFiles: Record<string, string> = {
      "package.json": '{"name":"test"}',
      "src/app/page.tsx": "export default function Home() {}",
    };

    const pagesRouterFiles: Record<string, string> = {
      "package.json": '{"name":"test"}',
      "pages/index.tsx": "export default function Home() {}",
    };

    const appResult = buildContextPayload(appRouterFiles);
    expect(appResult.routerType).toBe("app");

    const pagesResult = buildContextPayload(pagesRouterFiles);
    expect(pagesResult.routerType).toBe("pages");
  });

  it("extracts schema definitions if present", () => {
    const files: Record<string, string> = {
      "package.json": '{"name":"test"}',
      "src/db/schema.ts": 'export const users = pgTable("users", { id: uuid("id") });',
    };

    const result = buildContextPayload(files);
    expect(result.schemaDefinitions).toContain("pgTable");
  });
});
