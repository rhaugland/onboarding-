import { describe, it, expect, vi, beforeEach } from "vitest";

const mockProject = {
  id: "proj-1",
  appProfile: { name: "Test", designReferences: {} },
  authMockup: { login: "<LoginMock/>", signup: "<SignupMock/>" },
};

const mockStoryboardOption = {
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

const mockBuiltOption = {
  ...mockStoryboardOption,
  status: "built",
  componentCode: { welcome: "<WelcomeExisting/>" },
  authCode: { login: "<LoginExisting/>", signup: "<SignupExisting/>" },
};

// Captured state, reset in beforeEach
let selectResults: any[] = [];
let capturedUpdateSets: any[] = [];
let capturedUpdateWheres: any[] = [];
let updateCallCount = 0;
let buildOptionCalls: any[] = [];

vi.mock("../../src/services/builder.js", () => ({
  buildOption: vi.fn().mockImplementation(async (input) => {
    buildOptionCalls.push(input);
    return {
      authCode: { login: "<LoginBuilt/>", signup: "<SignupBuilt/>" },
      componentCode: { welcome: "<WelcomeBuilt/>" },
    };
  }),
}));

vi.mock("@onboarder/db", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(async () => {
          // Pull next queued result off the front of selectResults
          return selectResults.shift() ?? [];
        }),
      }),
    }),
    update: vi.fn().mockImplementation(() => {
      updateCallCount += 1;
      return {
        set: vi.fn().mockImplementation((data) => {
          capturedUpdateSets.push(data);
          return {
            where: vi.fn().mockImplementation((clause) => {
              capturedUpdateWheres.push(clause);
              return Promise.resolve(undefined);
            }),
          };
        }),
      };
    }),
  },
  projects: {},
  onboardingOptions: {},
  eq: vi.fn().mockImplementation((col, val) => ({ __eq: [col, val] })),
}));

describe("POST /api/build", () => {
  beforeEach(() => {
    selectResults = [];
    capturedUpdateSets = [];
    capturedUpdateWheres = [];
    updateCallCount = 0;
    buildOptionCalls = [];
  });

  it("builds the selected option, persists code + selected flag, and returns built code", async () => {
    selectResults = [[mockProject], [mockStoryboardOption]];

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

    // buildOption called with correct shape
    expect(buildOptionCalls).toHaveLength(1);
    expect(buildOptionCalls[0].option.name).toBe("Wizard");
    expect(buildOptionCalls[0].option.mockupCode.welcome).toBe("<WelcomeMock/>");
    expect(buildOptionCalls[0].authMockup.login).toBe("<LoginMock/>");

    // Two updates: sibling reset + target update
    expect(updateCallCount).toBe(2);
    expect(capturedUpdateSets[0]).toEqual({ selected: false });
    expect(capturedUpdateSets[1]).toMatchObject({
      componentCode: { welcome: "<WelcomeBuilt/>" },
      authCode: { login: "<LoginBuilt/>", signup: "<SignupBuilt/>" },
      status: "built",
      selected: true,
    });
    // Both updates scoped to a WHERE clause
    expect(capturedUpdateWheres.filter((c) => c).length).toBe(2);
  });

  it("is idempotent when option is already built — skips buildOption, flips selected, returns existing code", async () => {
    selectResults = [[mockProject], [mockBuiltOption]];

    const { default: app } = await import("../../src/index.js");
    const res = await app.request("/api/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: "proj-1", optionId: "opt-1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    // Returns the EXISTING code, not a fresh build
    expect(body.componentCode.welcome).toContain("WelcomeExisting");
    expect(body.authCode.login).toContain("LoginExisting");

    // buildOption was NOT called
    expect(buildOptionCalls).toHaveLength(0);

    // Two updates: sibling reset + selected=true
    expect(updateCallCount).toBe(2);
    expect(capturedUpdateSets[0]).toEqual({ selected: false });
    expect(capturedUpdateSets[1]).toEqual({ selected: true });
  });

  it("returns 404 when option belongs to a different project", async () => {
    selectResults = [
      [mockProject],
      [{ ...mockStoryboardOption, projectId: "other-proj" }],
    ];

    const { default: app } = await import("../../src/index.js");
    const res = await app.request("/api/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: "proj-1", optionId: "opt-1" }),
    });

    expect(res.status).toBe(404);
    // No updates or build calls
    expect(updateCallCount).toBe(0);
    expect(buildOptionCalls).toHaveLength(0);
  });

  it("rejects without projectId or optionId", async () => {
    const { default: app } = await import("../../src/index.js");
    const res = await app.request("/api/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: "proj-1" }),
    });
    expect(res.status).toBe(400);
    // Never hit DB
    expect(updateCallCount).toBe(0);
    expect(buildOptionCalls).toHaveLength(0);
  });
});
