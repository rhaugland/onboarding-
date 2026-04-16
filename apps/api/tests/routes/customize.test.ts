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

describe("GET /api/customize/:id", () => {
  beforeEach(() => {
    selectMock.mockReset();
  });

  it("returns draft with siblings", async () => {
    selectMock
      .mockReturnValueOnce({
        from: () => ({
          where: () =>
            Promise.resolve([
              {
                id: "draft-1",
                projectId: "proj-1",
                baseOptionId: "base-1",
                status: "customizing",
                flowStructure: [{ stepName: "welcome", type: "form", description: "d" }],
                mockupCode: { welcome: "<W/>" },
                name: "Wizard — Remix",
                rationale: "r",
                skippedSteps: [],
                customizeHistory: [],
              },
            ]),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () =>
            Promise.resolve([
              { id: "base-1", name: "Wizard", flowStructure: [], mockupCode: {}, status: "storyboard" },
              { id: "sib-2", name: "Tour", flowStructure: [], mockupCode: {}, status: "storyboard" },
            ]),
        }),
      });

    const { default: app } = await import("../../src/index.js");
    const res = await app.request("/api/customize/draft-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.draft.id).toBe("draft-1");
    expect(body.siblings).toHaveLength(2);
  });

  it("returns 404 when draft missing", async () => {
    selectMock.mockReturnValueOnce({
      from: () => ({ where: () => Promise.resolve([]) }),
    });
    const { default: app } = await import("../../src/index.js");
    const res = await app.request("/api/customize/missing");
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/customize/:id", () => {
  beforeEach(() => {
    selectMock.mockReset();
    updateMock.mockReset();
  });

  it("updates skippedSteps when all step names are valid", async () => {
    selectMock.mockReturnValueOnce({
      from: () => ({
        where: () =>
          Promise.resolve([
            {
              id: "draft-1",
              flowStructure: [
                { stepName: "welcome", type: "form", description: "d" },
                { stepName: "profile", type: "form", description: "d" },
              ],
            },
          ]),
      }),
    });

    let captured: any = null;
    updateMock.mockReturnValue({
      set: (data: any) => {
        captured = data;
        return { where: () => Promise.resolve(undefined) };
      },
    });

    const { default: app } = await import("../../src/index.js");
    const res = await app.request("/api/customize/draft-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skippedSteps: ["profile"] }),
    });

    expect(res.status).toBe(200);
    expect(captured.skippedSteps).toEqual(["profile"]);
  });

  it("rejects unknown step names", async () => {
    selectMock.mockReturnValueOnce({
      from: () => ({
        where: () =>
          Promise.resolve([
            {
              id: "draft-1",
              flowStructure: [{ stepName: "welcome", type: "form", description: "d" }],
            },
          ]),
      }),
    });

    const { default: app } = await import("../../src/index.js");
    const res = await app.request("/api/customize/draft-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skippedSteps: ["welcome", "bogus"] }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects fields other than skippedSteps", async () => {
    selectMock.mockReturnValueOnce({
      from: () => ({
        where: () =>
          Promise.resolve([{ id: "draft-1", flowStructure: [] }]),
      }),
    });

    const { default: app } = await import("../../src/index.js");
    const res = await app.request("/api/customize/draft-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "new name" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects malformed JSON with 400", async () => {
    const { default: app } = await import("../../src/index.js");
    const res = await app.request("/api/customize/draft-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
  });

  it("rejects null body with 400", async () => {
    const { default: app } = await import("../../src/index.js");
    const res = await app.request("/api/customize/draft-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "null",
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/customize/:id/screens/:stepName/regenerate", () => {
  beforeEach(() => {
    selectMock.mockReset();
    updateMock.mockReset();
  });

  it("regenerates and persists updated mockup for matching step", async () => {
    selectMock.mockReturnValueOnce({
      from: () => ({
        where: () =>
          Promise.resolve([
            {
              id: "draft-1",
              flowStructure: [
                { stepName: "welcome", type: "form", description: "greet" },
              ],
              mockupCode: { welcome: "<Old/>" },
              customizeHistory: [],
            },
          ]),
      }),
    });

    let captured: any = null;
    updateMock.mockReturnValue({
      set: (data: any) => {
        captured = data;
        return { where: () => Promise.resolve(undefined) };
      },
    });

    const { regenerateScreen } = await import(
      "../../src/services/screen-regenerator.js"
    );
    (regenerateScreen as any).mockResolvedValue({ mockupCode: "<New/>" });

    const { default: app } = await import("../../src/index.js");
    const res = await app.request(
      "/api/customize/draft-1/screens/welcome/regenerate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "make it green" }),
      }
    );

    expect(res.status).toBe(200);
    expect(captured.mockupCode.welcome).toBe("<New/>");
    expect(captured.customizeHistory).toHaveLength(1);
    expect(captured.customizeHistory[0].type).toBe("regenerate");
  });

  it("returns 404 when step not in flowStructure", async () => {
    selectMock.mockReturnValueOnce({
      from: () => ({
        where: () =>
          Promise.resolve([
            {
              id: "draft-1",
              flowStructure: [{ stepName: "welcome", type: "form", description: "d" }],
              mockupCode: { welcome: "<W/>" },
              customizeHistory: [],
            },
          ]),
      }),
    });

    const { default: app } = await import("../../src/index.js");
    const res = await app.request(
      "/api/customize/draft-1/screens/bogus/regenerate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "x" }),
      }
    );
    expect(res.status).toBe(404);
  });

  it("rejects empty prompt", async () => {
    const { default: app } = await import("../../src/index.js");
    const res = await app.request(
      "/api/customize/draft-1/screens/welcome/regenerate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "   " }),
      }
    );
    expect(res.status).toBe(400);
  });

  it("returns retryable error on GenerationFailedError", async () => {
    selectMock.mockReturnValueOnce({
      from: () => ({
        where: () =>
          Promise.resolve([
            {
              id: "draft-1",
              flowStructure: [{ stepName: "welcome", type: "form", description: "d" }],
              mockupCode: { welcome: "<W/>" },
              customizeHistory: [],
            },
          ]),
      }),
    });

    const { regenerateScreen, GenerationFailedError } = await import(
      "../../src/services/screen-regenerator.js"
    );
    (regenerateScreen as any).mockRejectedValue(
      new GenerationFailedError("bad")
    );

    const { default: app } = await import("../../src/index.js");
    const res = await app.request(
      "/api/customize/draft-1/screens/welcome/regenerate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "x" }),
      }
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("generation_failed");
    expect(body.retryable).toBe(true);
  });

  it("rejects malformed JSON with 400", async () => {
    const { default: app } = await import("../../src/index.js");
    const res = await app.request(
      "/api/customize/draft-1/screens/welcome/regenerate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      }
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/customize/:id/screens/:stepName/swap", () => {
  beforeEach(() => {
    selectMock.mockReset();
    updateMock.mockReset();
  });

  it("copies matching step from source option", async () => {
    selectMock
      .mockReturnValueOnce({
        from: () => ({
          where: () =>
            Promise.resolve([
              {
                id: "draft-1",
                projectId: "proj-1",
                flowStructure: [
                  { stepName: "welcome", type: "form", description: "d" },
                ],
                mockupCode: { welcome: "<Old/>" },
                customizeHistory: [],
              },
            ]),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () =>
            Promise.resolve([
              {
                id: "sib-2",
                projectId: "proj-1",
                status: "storyboard",
                mockupCode: { welcome: "<FromTour/>" },
              },
            ]),
        }),
      });

    let captured: any = null;
    updateMock.mockReturnValue({
      set: (data: any) => {
        captured = data;
        return { where: () => Promise.resolve(undefined) };
      },
    });

    const { default: app } = await import("../../src/index.js");
    const res = await app.request(
      "/api/customize/draft-1/screens/welcome/swap",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceOptionId: "sib-2" }),
      }
    );
    expect(res.status).toBe(200);
    expect(captured.mockupCode.welcome).toBe("<FromTour/>");
    expect(captured.customizeHistory[0].type).toBe("swap");
    expect(captured.customizeHistory[0].sourceOptionId).toBe("sib-2");
  });

  it("returns 400 when source is missing the step", async () => {
    selectMock
      .mockReturnValueOnce({
        from: () => ({
          where: () =>
            Promise.resolve([
              {
                id: "draft-1",
                projectId: "proj-1",
                flowStructure: [
                  { stepName: "welcome", type: "form", description: "d" },
                ],
                mockupCode: { welcome: "<Old/>" },
                customizeHistory: [],
              },
            ]),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () =>
            Promise.resolve([
              { id: "sib-2", projectId: "proj-1", status: "storyboard", mockupCode: {} },
            ]),
        }),
      });

    const { default: app } = await import("../../src/index.js");
    const res = await app.request(
      "/api/customize/draft-1/screens/welcome/swap",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceOptionId: "sib-2" }),
      }
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when source is in a different project", async () => {
    selectMock
      .mockReturnValueOnce({
        from: () => ({
          where: () =>
            Promise.resolve([
              {
                id: "draft-1",
                projectId: "proj-1",
                flowStructure: [
                  { stepName: "welcome", type: "form", description: "d" },
                ],
                mockupCode: { welcome: "<Old/>" },
                customizeHistory: [],
              },
            ]),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () =>
            Promise.resolve([
              {
                id: "sib-2",
                projectId: "proj-other",
                status: "storyboard",
                mockupCode: { welcome: "<Other/>" },
              },
            ]),
        }),
      });

    const { default: app } = await import("../../src/index.js");
    const res = await app.request(
      "/api/customize/draft-1/screens/welcome/swap",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceOptionId: "sib-2" }),
      }
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when source is not a storyboard original", async () => {
    selectMock
      .mockReturnValueOnce({
        from: () => ({
          where: () =>
            Promise.resolve([
              {
                id: "draft-1",
                projectId: "proj-1",
                flowStructure: [
                  { stepName: "welcome", type: "form", description: "d" },
                ],
                mockupCode: { welcome: "<Old/>" },
                customizeHistory: [],
              },
            ]),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () =>
            Promise.resolve([
              {
                id: "sib-2",
                projectId: "proj-1",
                status: "customizing",
                mockupCode: { welcome: "<OtherDraft/>" },
              },
            ]),
        }),
      });

    const { default: app } = await import("../../src/index.js");
    const res = await app.request(
      "/api/customize/draft-1/screens/welcome/swap",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceOptionId: "sib-2" }),
      }
    );
    expect(res.status).toBe(404);
  });
});

describe("POST /api/customize/:id/finalize", () => {
  beforeEach(() => {
    selectMock.mockReset();
    updateMock.mockReset();
  });

  it("filters skipped steps and flips status to ready", async () => {
    selectMock.mockReturnValueOnce({
      from: () => ({
        where: () =>
          Promise.resolve([
            {
              id: "draft-1",
              status: "customizing",
              flowStructure: [
                { stepName: "a", type: "form", description: "d" },
                { stepName: "b", type: "form", description: "d" },
              ],
              mockupCode: { a: "<A/>", b: "<B/>" },
              skippedSteps: ["b"],
              customizeHistory: [{ type: "swap" }],
            },
          ]),
      }),
    });

    let captured: any = null;
    updateMock.mockReturnValue({
      set: (data: any) => {
        captured = data;
        return { where: () => Promise.resolve(undefined) };
      },
    });

    const { default: app } = await import("../../src/index.js");
    const res = await app.request("/api/customize/draft-1/finalize", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(captured.status).toBe("ready");
    expect(captured.flowStructure).toHaveLength(1);
    expect(captured.flowStructure[0].stepName).toBe("a");
    expect(Object.keys(captured.mockupCode)).toEqual(["a"]);
  });

  it("rejects unchanged draft", async () => {
    selectMock.mockReturnValueOnce({
      from: () => ({
        where: () =>
          Promise.resolve([
            {
              id: "draft-1",
              status: "customizing",
              flowStructure: [{ stepName: "a", type: "form", description: "d" }],
              mockupCode: { a: "<A/>" },
              skippedSteps: [],
              customizeHistory: [],
            },
          ]),
      }),
    });

    const { default: app } = await import("../../src/index.js");
    const res = await app.request("/api/customize/draft-1/finalize", {
      method: "POST",
    });
    expect(res.status).toBe(400);
  });

  it("is idempotent for already-ready drafts", async () => {
    selectMock.mockReturnValueOnce({
      from: () => ({
        where: () =>
          Promise.resolve([
            {
              id: "draft-1",
              status: "ready",
              flowStructure: [{ stepName: "a", type: "form", description: "d" }],
              mockupCode: { a: "<A/>" },
              skippedSteps: [],
              customizeHistory: [{ type: "swap" }],
            },
          ]),
      }),
    });

    const { default: app } = await import("../../src/index.js");
    const res = await app.request("/api/customize/draft-1/finalize", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
