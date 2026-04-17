import { describe, it, expect, vi, beforeEach } from "vitest";

const selectMock = vi.fn();

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ __eq: [col, val] })),
  and: vi.fn((...args) => ({ __and: args })),
  inArray: vi.fn((col, vals) => ({ __inArray: [col, vals] })),
}));

vi.mock("@onboarder/db", () => ({
  db: {
    select: (...args: any[]) => selectMock(...args),
  },
  projects: { id: "id" },
  onboardingOptions: { id: "id", projectId: "projectId", status: "status" },
}));

import app from "../../src/index.js";

describe("GET /api/projects/:id", () => {
  beforeEach(() => {
    selectMock.mockReset();
  });

  it("returns 404 for missing project", async () => {
    selectMock.mockReturnValueOnce({
      from: () => ({ where: () => Promise.resolve([]) }),
    });

    const res = await app.request("/api/projects/missing-id");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Project not found");
  });

  it("returns project with storyboard options and no builtOption", async () => {
    selectMock.mockReturnValueOnce({
      from: () => ({
        where: () =>
          Promise.resolve([
            {
              id: "proj-1",
              name: "My App",
              appProfile: { name: "My App" },
              authMockup: { login: "<Login/>", signup: "<Signup/>" },
            },
          ]),
      }),
    });

    selectMock.mockReturnValueOnce({
      from: () => ({
        where: () =>
          Promise.resolve([
            {
              id: "opt-1",
              name: "Wizard",
              rationale: "good",
              flowStructure: [],
              mockupCode: {},
              componentCode: null,
              authCode: null,
              status: "storyboard",
            },
            {
              id: "opt-2",
              name: "Checklist",
              rationale: "fast",
              flowStructure: [],
              mockupCode: {},
              componentCode: null,
              authCode: null,
              status: "storyboard",
            },
          ]),
      }),
    });

    const res = await app.request("/api/projects/proj-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.project.id).toBe("proj-1");
    expect(body.project.name).toBe("My App");
    expect(body.options).toHaveLength(2);
    expect(body.builtOption).toBeNull();
  });

  it("returns builtOption when a built option exists", async () => {
    selectMock.mockReturnValueOnce({
      from: () => ({
        where: () =>
          Promise.resolve([
            {
              id: "proj-1",
              name: "My App",
              appProfile: { name: "My App" },
              authMockup: { login: "<Login/>", signup: "<Signup/>" },
            },
          ]),
      }),
    });

    selectMock.mockReturnValueOnce({
      from: () => ({
        where: () =>
          Promise.resolve([
            {
              id: "opt-1",
              name: "Wizard",
              rationale: "good",
              flowStructure: [],
              mockupCode: {},
              componentCode: { "step-1": "<Step1/>" },
              authCode: { login: "<Login/>", signup: "<Signup/>" },
              status: "built",
            },
          ]),
      }),
    });

    const res = await app.request("/api/projects/proj-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.builtOption).not.toBeNull();
    expect(body.builtOption.id).toBe("opt-1");
    expect(body.builtOption.componentCode).toEqual({ "step-1": "<Step1/>" });
  });

  it("excludes customizing drafts from options", async () => {
    selectMock.mockReturnValueOnce({
      from: () => ({
        where: () =>
          Promise.resolve([
            {
              id: "proj-1",
              name: "My App",
              appProfile: { name: "My App" },
              authMockup: { login: "", signup: "" },
            },
          ]),
      }),
    });

    selectMock.mockReturnValueOnce({
      from: () => ({
        where: () =>
          Promise.resolve([
            {
              id: "opt-1",
              name: "Wizard",
              rationale: "good",
              flowStructure: [],
              mockupCode: {},
              componentCode: null,
              authCode: null,
              status: "storyboard",
            },
          ]),
      }),
    });

    const res = await app.request("/api/projects/proj-1");
    const body = await res.json();
    expect(body.options).toHaveLength(1);
    expect(body.options[0].status).toBe("storyboard");
  });
});
