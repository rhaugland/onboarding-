import { describe, it, expect, vi } from "vitest";

const mockProject = {
  id: "proj-1",
  appProfile: { name: "Test", designReferences: {} },
  authMockup: { login: "<LoginMock/>", signup: "<SignupMock/>" },
};

const mockOption = {
  id: "opt-1",
  projectId: "proj-1",
  name: "Wizard",
  rationale: "r",
  flowStructure: [{ stepName: "welcome", type: "form", description: "d" }],
  mockupCode: { welcome: "<WelcomeMock/>" },
  status: "storyboard",
  componentCode: null,
  authCode: null,
};

vi.mock("../../src/services/builder.js", () => ({
  buildOption: vi.fn().mockResolvedValue({
    authCode: { login: "<LoginBuilt/>", signup: "<SignupBuilt/>" },
    componentCode: { welcome: "<WelcomeBuilt/>" },
  }),
}));

vi.mock("@onboarder/db", () => {
  const selectFromWhere = vi
    .fn()
    .mockResolvedValueOnce([mockProject])
    .mockResolvedValueOnce([mockOption]);
  return {
    db: {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({ where: selectFromWhere }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    },
    projects: {},
    onboardingOptions: {},
    eq: vi.fn(),
  };
});

describe("POST /api/build", () => {
  it("builds the selected option and returns built code", async () => {
    const { default: app } = await import("../../src/index.js");
    const res = await app.request("/api/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: "proj-1", optionId: "opt-1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.componentCode.welcome).toContain("WelcomeBuilt");
    expect(body.authCode.login).toContain("LoginBuilt");
  });

  it("rejects without projectId or optionId", async () => {
    const { default: app } = await import("../../src/index.js");
    const res = await app.request("/api/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: "proj-1" }),
    });
    expect(res.status).toBe(400);
  });
});
