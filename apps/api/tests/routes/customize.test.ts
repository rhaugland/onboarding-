import { describe, it, expect, vi, beforeEach } from "vitest";

const selectMock = vi.fn();
const insertMock = vi.fn();
const updateMock = vi.fn();

vi.mock("@onboarder/db", () => ({
  db: {
    select: (...args: any[]) => selectMock(...args),
    insert: (...args: any[]) => insertMock(...args),
    update: (...args: any[]) => updateMock(...args),
  },
  onboardingOptions: { id: "id", projectId: "projectId", baseOptionId: "baseOptionId", status: "status" },
  projects: {},
  eq: vi.fn((col, val) => ({ __eq: [col, val] })),
  and: vi.fn((...args) => ({ __and: args })),
}));

vi.mock("../../src/services/screen-regenerator.js", () => ({
  regenerateScreen: vi.fn(),
  GenerationFailedError: class extends Error {},
}));

describe("POST /api/customize", () => {
  beforeEach(() => {
    selectMock.mockReset();
    insertMock.mockReset();
    updateMock.mockReset();
  });

  it("creates a draft cloned from base option", async () => {
    // First select: base option lookup. Second select: existing draft check (none).
    selectMock
      .mockReturnValueOnce({
        from: () => ({
          where: () =>
            Promise.resolve([
              {
                id: "base-1",
                projectId: "proj-1",
                name: "Wizard",
                rationale: "good for setup",
                flowStructure: [{ stepName: "welcome", type: "form", description: "d" }],
                mockupCode: { welcome: "<Welcome/>" },
                status: "storyboard",
              },
            ]),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({ where: () => Promise.resolve([]) }),
      });

    const inserted: any[] = [];
    insertMock.mockReturnValue({
      values: (v: any) => ({
        returning: () => {
          const row = { ...v, id: "draft-1" };
          inserted.push(row);
          return Promise.resolve([row]);
        },
      }),
    });

    const { default: app } = await import("../../src/index.js");
    const res = await app.request("/api/customize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseOptionId: "base-1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("draft-1");
    expect(body.status).toBe("customizing");
    expect(body.baseOptionId).toBe("base-1");
    expect(body.name).toContain("Remix");
    expect(inserted[0].mockupCode).toEqual({ welcome: "<Welcome/>" });
  });

  it("returns existing draft when one already exists for (project, base)", async () => {
    selectMock
      .mockReturnValueOnce({
        from: () => ({
          where: () =>
            Promise.resolve([
              {
                id: "base-1",
                projectId: "proj-1",
                name: "Wizard",
                rationale: "r",
                flowStructure: [],
                mockupCode: {},
                status: "storyboard",
              },
            ]),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () =>
            Promise.resolve([{ id: "existing-draft", status: "customizing" }]),
        }),
      });

    const { default: app } = await import("../../src/index.js");
    const res = await app.request("/api/customize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseOptionId: "base-1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("existing-draft");
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("rejects without baseOptionId", async () => {
    const { default: app } = await import("../../src/index.js");
    const res = await app.request("/api/customize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when base option does not exist", async () => {
    selectMock.mockReturnValueOnce({
      from: () => ({ where: () => Promise.resolve([]) }),
    });
    const { default: app } = await import("../../src/index.js");
    const res = await app.request("/api/customize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseOptionId: "missing" }),
    });
    expect(res.status).toBe(404);
  });
});
