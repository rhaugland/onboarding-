import { describe, it, expect, vi } from "vitest";

const mockAppProfile = {
  name: "Test App",
  purpose: "Testing",
  features: ["dashboard"],
  setupRequirements: [],
  tourWorthyFeatures: [],
  existingAuth: false,
  stylingApproach: { framework: "tailwind", colors: {} },
  routerType: "app",
};

vi.mock("../../src/services/generator.js", () => ({
  generateOnboarding: vi.fn().mockResolvedValue({
    authCode: { login: "<Login />", signup: "<Signup />" },
    options: [
      {
        name: "Wizard",
        rationale: "Needs setup",
        flowStructure: [{ stepName: "welcome", type: "form", description: "Welcome" }],
        componentCode: { welcome: "<Welcome />" },
      },
    ],
  }),
}));

vi.mock("@onboarder/db", () => {
  const eq = vi.fn();
  return {
    db: {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { id: "proj-1", appProfile: mockAppProfile },
          ]),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            { id: "opt-1", name: "Wizard" },
          ]),
        }),
      }),
    },
    projects: {},
    onboardingOptions: {},
    eq,
  };
});

describe("POST /api/generate", () => {
  it("generates options and stores them", async () => {
    const { default: app } = await import("../../src/index.js");
    const res = await app.request("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: "proj-1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.options).toHaveLength(1);
    expect(body.options[0].name).toBe("Wizard");
  });
});
