import { describe, it, expect, vi } from "vitest";

vi.mock("../../src/services/analyzer.js", () => ({
  analyzeProject: vi.fn().mockResolvedValue({
    name: "test-app",
    purpose: "A test application",
    features: ["dashboard"],
    setupRequirements: [],
    tourWorthyFeatures: ["dashboard"],
    existingAuth: false,
    stylingApproach: { framework: "tailwind", colors: {} },
    routerType: "app",
  }),
}));

vi.mock("@onboarder/db", () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          { id: "test-uuid", name: "test-app" },
        ]),
      }),
    }),
  },
  projects: {},
}));

describe("POST /api/analyze", () => {
  it("returns project ID and app profile", async () => {
    const { default: app } = await import("../../src/index.js");
    const res = await app.request("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        files: { "package.json": '{"name":"test-app"}' },
        folderPath: "/path/to/project",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.projectId).toBe("test-uuid");
    expect(body.appProfile.name).toBe("test-app");
  });
});
