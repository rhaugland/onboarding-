import { describe, it, expect, vi } from "vitest";

const mockOption = {
  id: "opt-1",
  projectId: "proj-1",
  name: "Wizard",
  rationale: "Needs setup",
  flowStructure: [],
  componentCode: { welcome: "<Welcome />" },
  authCode: { login: "<Login />", signup: "<Signup />" },
  selected: false,
};

const mockProject = {
  id: "proj-1",
  appProfile: { name: "Test", routerType: "app" },
};

vi.mock("../../src/services/integrator.js", () => ({
  generateIntegration: vi.fn().mockResolvedValue({
    files: [
      { path: "src/auth/login.tsx", content: "<Login />", action: "create" },
    ],
    commands: ["npm install bcrypt"],
    envVars: ["SESSION_SECRET=random string"],
  }),
}));

vi.mock("@onboarder/db", () => {
  const eq = vi.fn();
  return {
    db: {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn()
            .mockResolvedValueOnce([mockOption])
            .mockResolvedValueOnce([mockProject]),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "int-1" }]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
    },
    projects: { id: "id" },
    onboardingOptions: { id: "id" },
    integrations: {},
    eq,
  };
});

describe("POST /api/integrate", () => {
  it("generates integration and stores changeset", async () => {
    const { default: app } = await import("../../src/index.js");
    const res = await app.request("/api/integrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: "proj-1", optionId: "opt-1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.files).toHaveLength(1);
    expect(body.commands).toContain("npm install bcrypt");
  });
});
