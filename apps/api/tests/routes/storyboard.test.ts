import { describe, it, expect, vi } from "vitest";

const mockAppProfile = { name: "Test", designReferences: {} };

vi.mock("../../src/services/storyboarder.js", () => ({
  generateStoryboard: vi.fn().mockResolvedValue({
    authMockup: { login: "<Login/>", signup: "<Signup/>" },
    options: [
      {
        name: "Wizard",
        rationale: "r1",
        flowStructure: [{ stepName: "welcome", type: "form", description: "d" }],
        mockupCode: { welcome: "<Welcome/>" },
      },
      {
        name: "Tour",
        rationale: "r2",
        flowStructure: [{ stepName: "tour", type: "tour", description: "d" }],
        mockupCode: { tour: "<Tour/>" },
      },
      {
        name: "Checklist",
        rationale: "r3",
        flowStructure: [{ stepName: "check", type: "checklist", description: "d" }],
        mockupCode: { check: "<Check/>" },
      },
    ],
  }),
}));

let capturedUpdate: any = null;
vi.mock("@onboarder/db", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ id: "proj-1", appProfile: mockAppProfile }]),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockImplementation(async () => [
          { id: `opt-${Math.random().toString(36).slice(2, 7)}` },
        ]),
      }),
    }),
    update: vi.fn().mockImplementation(() => ({
      set: vi.fn().mockImplementation((data) => {
        capturedUpdate = data;
        return {
          where: vi.fn().mockResolvedValue(undefined),
        };
      }),
    })),
  },
  projects: {},
  onboardingOptions: {},
  eq: vi.fn(),
}));

describe("POST /api/storyboard", () => {
  it("generates 3 options and saves them with authMockup on project", async () => {
    const { default: app } = await import("../../src/index.js");
    const res = await app.request("/api/storyboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: "proj-1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.options).toHaveLength(3);
    expect(body.options[0].name).toBe("Wizard");
    expect(body.options[0].mockupCode.welcome).toBeDefined();
    expect(body.authMockup.login).toBeDefined();
    expect(capturedUpdate?.authMockup).toEqual({
      login: "<Login/>",
      signup: "<Signup/>",
    });
  });

  it("rejects without projectId", async () => {
    const { default: app } = await import("../../src/index.js");
    const res = await app.request("/api/storyboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});
