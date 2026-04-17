# Shareable Preview URLs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `sessionStorage`-based state with URL-based, DB-backed pages so any project preview can be shared via its URL.

**Architecture:** One new API endpoint (`GET /api/projects/:id`) returns all data the preview page needs. Frontend pages switch from reading `sessionStorage` to fetching from this endpoint using a project ID in the URL. `sessionStorage` is eliminated entirely.

**Tech Stack:** Hono API, Drizzle ORM, Next.js 15 App Router, React 19, TypeScript

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `apps/api/src/routes/projects.ts` | Create | `GET /` endpoint returning project + options + builtOption |
| `apps/api/src/index.ts` | Modify | Mount projects route at `/api/projects` |
| `apps/api/tests/routes/projects.test.ts` | Create | Tests for `GET /api/projects/:id` |
| `apps/web/src/lib/api.ts` | Modify | Add `getProject` fetcher + `ProjectResponse` type |
| `apps/web/src/app/page.tsx` | Modify | Remove `sessionStorage` writes, redirect to `/preview/[projectId]` |
| `apps/web/src/app/preview/[projectId]/page.tsx` | Create | Server component wrapper extracting `projectId` |
| `apps/web/src/app/preview/[projectId]/preview-view.tsx` | Create | Client component fetching from API (replaces old preview page) |
| `apps/web/src/app/preview/page.tsx` | Delete | Replaced by `[projectId]` route |
| `apps/web/src/app/integrate/[projectId]/page.tsx` | Create | Server component wrapper extracting `projectId` |
| `apps/web/src/app/integrate/[projectId]/integrate-view.tsx` | Create | Client component fetching from API (replaces old integrate page) |
| `apps/web/src/app/integrate/page.tsx` | Delete | Replaced by `[projectId]` route |
| `apps/web/src/app/customize/[id]/customize-view.tsx` | Modify | Remove `sessionStorage` writes, navigate to `/preview/[projectId]` |

---

### Task 1: GET /api/projects/:id — Tests

**Files:**
- Create: `apps/api/tests/routes/projects.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/api/tests/routes/projects.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const selectMock = vi.fn();

vi.mock("@onboarder/db", () => ({
  db: {
    select: (...args: any[]) => selectMock(...args),
  },
  projects: { id: "id" },
  onboardingOptions: { id: "id", projectId: "projectId", status: "status" },
  eq: vi.fn((col, val) => ({ __eq: [col, val] })),
  and: vi.fn((...args) => ({ __and: args })),
  inArray: vi.fn((col, vals) => ({ __inArray: [col, vals] })),
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
    // First select: project lookup
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

    // Second select: options lookup
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

    // The handler filters by status in the query, so the DB would not return
    // customizing rows. We verify by returning only storyboard rows.
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx vitest run tests/routes/projects.test.ts`
Expected: FAIL — route not implemented yet, 404 on all requests

- [ ] **Step 3: Commit test file**

```bash
git add apps/api/tests/routes/projects.test.ts
git commit -m "test: add GET /api/projects/:id tests"
```

---

### Task 2: GET /api/projects/:id — Implementation

**Files:**
- Create: `apps/api/src/routes/projects.ts`
- Modify: `apps/api/src/index.ts:11,27`

- [ ] **Step 1: Create the route handler**

Create `apps/api/src/routes/projects.ts`:

```typescript
import { Hono } from "hono";
import { eq, and, inArray } from "drizzle-orm";
import { db, projects, onboardingOptions } from "@onboarder/db";

const projectsRoute = new Hono();

projectsRoute.get("/:id", async (c) => {
  const id = c.req.param("id");

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, id));

  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  const options = await db
    .select()
    .from(onboardingOptions)
    .where(
      and(
        eq(onboardingOptions.projectId, id),
        inArray(onboardingOptions.status, ["storyboard", "ready", "built"])
      )
    );

  const builtRow = options.find((o) => o.status === "built") ?? null;
  const builtOption = builtRow
    ? {
        id: builtRow.id,
        name: builtRow.name,
        rationale: builtRow.rationale,
        flowStructure: builtRow.flowStructure,
        componentCode: builtRow.componentCode,
        authCode: builtRow.authCode,
      }
    : null;

  return c.json({
    project: {
      id: project.id,
      name: project.name,
      appProfile: project.appProfile,
      authMockup: project.authMockup,
    },
    options: options.map((o) => ({
      id: o.id,
      name: o.name,
      rationale: o.rationale,
      flowStructure: o.flowStructure,
      mockupCode: o.mockupCode,
      status: o.status,
    })),
    builtOption,
  });
});

export default projectsRoute;
```

- [ ] **Step 2: Mount the route in the API**

In `apps/api/src/index.ts`, add the import and route:

Add import after line 11:
```typescript
import projectsRoute from "./routes/projects.js";
```

Add route after line 27:
```typescript
app.route("/api/projects", projectsRoute);
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `cd apps/api && npx vitest run tests/routes/projects.test.ts`
Expected: 4 passing tests

- [ ] **Step 4: Run full API test suite**

Run: `cd apps/api && npx vitest run`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/projects.ts apps/api/src/index.ts
git commit -m "feat: add GET /api/projects/:id endpoint"
```

---

### Task 3: Frontend API types + fetcher

**Files:**
- Modify: `apps/web/src/lib/api.ts`

- [ ] **Step 1: Add ProjectResponse type and getProject fetcher**

Add at the end of `apps/web/src/lib/api.ts`:

```typescript
export interface ProjectResponse {
  project: {
    id: string;
    name: string;
    appProfile: AppProfile;
    authMockup: { login: string; signup: string };
  };
  options: Array<StoryboardOption & { status: string }>;
  builtOption: {
    id: string;
    name: string;
    rationale: string;
    flowStructure: Array<{
      stepName: string;
      type: "form" | "tour" | "tooltip" | "checklist" | "contextual";
      description: string;
    }>;
    componentCode: Record<string, string>;
    authCode: { login: string; signup: string };
  } | null;
}

export const getProject = (projectId: string) =>
  request<ProjectResponse>(`/api/projects/${projectId}`);
```

- [ ] **Step 2: Run typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/api.ts
git commit -m "feat: add getProject fetcher and ProjectResponse type"
```

---

### Task 4: Preview page — new dynamic route

**Files:**
- Create: `apps/web/src/app/preview/[projectId]/page.tsx`
- Create: `apps/web/src/app/preview/[projectId]/preview-view.tsx`
- Delete: `apps/web/src/app/preview/page.tsx`

- [ ] **Step 1: Create server component wrapper**

Create `apps/web/src/app/preview/[projectId]/page.tsx`:

```typescript
import PreviewView from "./preview-view";

export default async function PreviewPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <PreviewView projectId={projectId} />;
}
```

- [ ] **Step 2: Create client component**

Create `apps/web/src/app/preview/[projectId]/preview-view.tsx`:

```typescript
"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import OptionCard from "@/components/option-card";
import PreviewFrame from "@/components/preview-frame";
import ViewportToggle from "@/components/viewport-toggle";
import FlowBreakdown from "@/components/flow-breakdown";
import StoryboardView from "@/components/storyboard-view";
import { buildPreviewHtml } from "@/lib/preview-bundler";
import {
  getProject,
  buildOption,
  createCustomizeDraft,
  type ProjectResponse,
  type OnboardingOption,
} from "@/lib/api";

type Viewport = "phone" | "tablet" | "desktop";

interface Props {
  projectId: string;
}

export default function PreviewView({ projectId }: Props) {
  const router = useRouter();
  const [data, setData] = useState<ProjectResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [buildError, setBuildError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getProject(projectId)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled)
          setLoadError(err instanceof Error ? err.message : "Failed to load project");
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const mode = data?.builtOption ? "full" : "storyboard";

  const previewHtml = useMemo(() => {
    if (!data?.builtOption) return "";
    const built: OnboardingOption = {
      id: data.builtOption.id,
      name: data.builtOption.name,
      rationale: data.builtOption.rationale,
      flowStructure: data.builtOption.flowStructure,
      componentCode: data.builtOption.componentCode,
      authCode: data.builtOption.authCode,
    };
    return buildPreviewHtml(built);
  }, [data]);

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-700">
        <p>{loadError}</p>
      </div>
    );
  }

  if (!data) return null;

  async function handlePick(optionId: string) {
    setBuildError(null);
    try {
      await buildOption(projectId, optionId);
      const refreshed = await getProject(projectId);
      setData(refreshed);
    } catch (err) {
      setBuildError(err instanceof Error ? err.message : "Build failed");
    }
  }

  async function handleCustomize(optionId: string) {
    setBuildError(null);
    try {
      const draft = await createCustomizeDraft(optionId);
      router.push(`/customize/${draft.id}`);
    } catch (err) {
      setBuildError(err instanceof Error ? err.message : "Customize failed");
    }
  }

  function handleBackToStoryboards() {
    // Re-fetch to get fresh data without builtOption
    // (The DB still has the built option, so this just re-renders in storyboard mode)
    setData({ ...data!, builtOption: null });
  }

  function handleIntegrate() {
    router.push(`/integrate/${projectId}`);
  }

  if (mode === "storyboard") {
    return (
      <>
        {buildError && (
          <div className="bg-red-50 border-b border-red-200 text-red-800 text-sm px-6 py-3">
            Build failed: {buildError}
          </div>
        )}
        <StoryboardView
          options={data.options}
          authMockup={data.project.authMockup}
          appName={(data.project.appProfile as { name: string }).name}
          onPick={handlePick}
          onCustomize={handleCustomize}
        />
      </>
    );
  }

  const built = data.builtOption!;
  const builtAsOption: OnboardingOption = {
    id: built.id,
    name: built.name,
    rationale: built.rationale,
    flowStructure: built.flowStructure,
    componentCode: built.componentCode,
    authCode: built.authCode,
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Onboarder</h1>
          <p className="text-sm text-gray-500">Built: {built.name}</p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={handleBackToStoryboards}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
          >
            ← Back to storyboards
          </button>
          <ViewportToggle viewport={viewport} onChange={setViewport} />
          <button
            onClick={handleIntegrate}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            Use this flow
          </button>
        </div>
      </header>

      <div className="flex h-[calc(100vh-73px)]">
        <aside className="w-80 bg-white border-r p-4 space-y-3 overflow-y-auto">
          <OptionCard option={builtAsOption} isSelected={true} onSelect={() => {}} />
          <div className="pt-4 border-t">
            <FlowBreakdown steps={builtAsOption.flowStructure} />
          </div>
        </aside>

        <main className="flex-1 p-6 overflow-y-auto">
          <PreviewFrame html={previewHtml} viewport={viewport} />
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Delete old preview page**

Delete `apps/web/src/app/preview/page.tsx`.

- [ ] **Step 4: Run typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors (there may be errors from other pages still referencing old routes — those are fixed in subsequent tasks)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/preview/
git commit -m "feat: replace /preview with /preview/[projectId] dynamic route"
```

---

### Task 5: Integrate page — new dynamic route

**Files:**
- Create: `apps/web/src/app/integrate/[projectId]/page.tsx`
- Create: `apps/web/src/app/integrate/[projectId]/integrate-view.tsx`
- Delete: `apps/web/src/app/integrate/page.tsx`

- [ ] **Step 1: Create server component wrapper**

Create `apps/web/src/app/integrate/[projectId]/page.tsx`:

```typescript
import IntegrateView from "./integrate-view";

export default async function IntegratePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <IntegrateView projectId={projectId} />;
}
```

- [ ] **Step 2: Create client component**

Create `apps/web/src/app/integrate/[projectId]/integrate-view.tsx`:

```typescript
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import ChangesetViewer from "@/components/changeset-viewer";
import { getProject, integrateOption } from "@/lib/api";
import type { IntegrateResponse } from "@/lib/api";

interface Props {
  projectId: string;
}

export default function IntegrateView({ projectId }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<
    "loading" | "review" | "writing" | "done" | "error"
  >("loading");
  const [changeset, setChangeset] = useState<IntegrateResponse | null>(null);
  const [error, setError] = useState<string>();
  const [fromZip, setFromZip] = useState(false);

  useEffect(() => {
    let cancelled = false;

    getProject(projectId)
      .then(async (data) => {
        if (cancelled) return;

        if (!data.builtOption) {
          router.push(`/preview/${projectId}`);
          return;
        }

        const result = await integrateOption(projectId, data.builtOption.id);
        if (cancelled) return;
        setChangeset(result);
        setStatus("review");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Integration failed");
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, router]);

  async function handleConfirm() {
    if (!changeset) return;

    // Check if dirHandle is available (folder upload) or need zip download
    const dirHandle = (window as unknown as Record<string, unknown>)
      .__onboarderDirHandle as FileSystemDirectoryHandle | undefined;
    const useZip = !dirHandle;

    if (useZip) {
      setStatus("writing");
      try {
        const JSZip = (await import("jszip")).default;
        const zip = new JSZip();
        for (const file of changeset.files) {
          zip.file(file.path, file.content);
        }
        const blob = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "onboarding-integration.zip";
        a.click();
        URL.revokeObjectURL(url);
        setStatus("done");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create zip");
        setStatus("error");
      }
      return;
    }

    setStatus("writing");
    try {
      const { writeProjectFiles } = await import("@/lib/file-reader");
      await writeProjectFiles(
        dirHandle,
        changeset.files.map((f) => ({ path: f.path, content: f.content }))
      );
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to write files");
      setStatus("error");
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Onboarder</h1>
          <p className="text-sm text-gray-500">Review & integrate</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => router.push(`/preview/${projectId}`)}
            className="px-4 py-2 text-gray-600 border rounded-lg hover:bg-gray-50"
          >
            Back
          </button>
          {status === "review" && (
            <button
              onClick={handleConfirm}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              {(window as unknown as Record<string, unknown>).__onboarderDirHandle
                ? "Write Files to Project"
                : "Download Integration Zip"}
            </button>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-8">
        {status === "loading" && (
          <div className="flex items-center gap-3 justify-center py-20">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-gray-600">
              Generating integration code...
            </span>
          </div>
        )}

        {status === "error" && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <p className="text-red-600">{error}</p>
            <button
              onClick={() => router.push("/")}
              className="mt-4 text-sm text-red-500 underline"
            >
              Start over
            </button>
          </div>
        )}

        {(status === "review" || status === "writing") && changeset && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              Review Changes
            </h2>
            <p className="text-gray-500 mb-8">
              These files will be added or modified in your project. Review them
              before confirming.
            </p>
            <ChangesetViewer
              files={changeset.files}
              commands={changeset.commands}
              envVars={changeset.envVars}
            />
            {status === "writing" && (
              <div className="mt-6 flex items-center gap-3 justify-center">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-gray-600">Writing files...</span>
              </div>
            )}
          </div>
        )}

        {status === "done" && changeset && (
          <div className="text-center py-20 space-y-4">
            <div className="text-6xl">&#10003;</div>
            <h2 className="text-3xl font-bold text-gray-900">
              Integration Complete
            </h2>
            <p className="text-gray-500 max-w-md mx-auto">
              Onboarding has been written to your project. Run the following
              commands to finish setup:
            </p>
            {changeset.commands.length > 0 && (
              <div className="bg-gray-900 rounded-lg p-4 max-w-lg mx-auto text-left">
                {changeset.commands.map((cmd, i) => (
                  <div key={i} className="font-mono text-sm text-green-400">
                    $ {cmd}
                  </div>
                ))}
              </div>
            )}
            {changeset.envVars.length > 0 && (
              <div className="mt-4">
                <p className="text-sm text-gray-500 mb-2">
                  Add these to your .env:
                </p>
                <div className="bg-gray-900 rounded-lg p-4 max-w-lg mx-auto text-left">
                  {changeset.envVars.map((v, i) => (
                    <div
                      key={i}
                      className="font-mono text-sm text-yellow-400"
                    >
                      {v}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <button
              onClick={() => router.push("/")}
              className="mt-6 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Start New Project
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Delete old integrate page**

Delete `apps/web/src/app/integrate/page.tsx`.

- [ ] **Step 4: Run typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: May still have errors in `page.tsx` and `customize-view.tsx` (fixed in subsequent tasks)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/integrate/
git commit -m "feat: replace /integrate with /integrate/[projectId] dynamic route"
```

---

### Task 6: Update home page — remove sessionStorage, redirect to /preview/[projectId]

**Files:**
- Modify: `apps/web/src/app/page.tsx`

- [ ] **Step 1: Update the handleFilesReady function**

In `apps/web/src/app/page.tsx`, replace the entire `handleFilesReady` function body. Remove the `sessionStorage.setItem` call and change the redirect from `router.push("/preview")` to `router.push(\`/preview/${projectId}\`)`.

Replace lines 16-61:

```typescript
  async function handleFilesReady(
    files: Record<string, string>,
    dirHandle: FileSystemDirectoryHandle | null,
    projectName: string
  ) {
    try {
      setStatus("reading");
      setError(undefined);

      // Store dirHandle for later integration (null for zip uploads)
      if (dirHandle) {
        (window as unknown as Record<string, unknown>).__onboarderDirHandle = dirHandle;
      }

      const fileCount = Object.keys(files).length;
      const payloadSize = JSON.stringify(files).length;
      console.log(`[onboarder] ${fileCount} files, ~${(payloadSize / 1024).toFixed(0)}KB payload`);

      setStatus("analyzing");
      const { projectId } = await analyzeProject(files, projectName);

      setStatus("storyboarding");
      await generateStoryboard(projectId);

      setStatus("done");
      router.push(`/preview/${projectId}`);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }
```

Note: We no longer need `appProfile` from the analyze response or `options`/`authMockup` from storyboard — the preview page fetches those itself.

- [ ] **Step 2: Clean up unused imports**

In `apps/web/src/app/page.tsx`, the import of `generateStoryboard` is still needed (we still call it to trigger generation), but `analyzeProject` return type no longer needs destructuring of `appProfile`. Update the import line — no changes needed since both are still used.

- [ ] **Step 3: Run typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors (or only errors from customize-view.tsx which is fixed next)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/page.tsx
git commit -m "feat: remove sessionStorage from home page, redirect to /preview/[projectId]"
```

---

### Task 7: Update customize-view — remove sessionStorage, navigate to /preview/[projectId]

**Files:**
- Modify: `apps/web/src/app/customize/[id]/customize-view.tsx`

- [ ] **Step 1: Remove sessionStorage writes from handleFinalize**

In `apps/web/src/app/customize/[id]/customize-view.tsx`, replace the `handleFinalize` function (lines 93-123):

```typescript
  async function handleFinalize() {
    if (!draft) return;
    setFinalizing(true);
    setFinalizeError(null);
    try {
      const finalized = await finalizeCustomizeDraft(draftId);
      await buildOption(finalized.projectId, finalized.id);
      router.push(`/preview/${finalized.projectId}`);
    } catch (err) {
      setFinalizing(false);
      setFinalizeError(err instanceof Error ? err.message : "Finalize failed");
    }
  }
```

- [ ] **Step 2: Update Back button navigation**

In the same file, the "Back" button (line 152) and error state "Back to storyboards" (line 132) both navigate to `/preview`. These need the `projectId`, which is available from `draft.projectId`.

Replace line 132:
```typescript
            onClick={() => router.push(`/preview/${draft?.projectId ?? ""}`)}
```

Replace line 152:
```typescript
            onClick={() => router.push(`/preview/${draft.projectId}`)}
```

- [ ] **Step 3: Remove unused OnboardingOption import**

In the imports (line 15), remove `type OnboardingOption` since it's no longer used in the finalize handler.

```typescript
import {
  getCustomizeDraft,
  updateCustomizeSkips,
  regenerateCustomizeScreen,
  swapCustomizeScreen,
  finalizeCustomizeDraft,
  buildOption,
  type CustomizeDraft,
  type StoryboardOption,
} from "@/lib/api";
```

- [ ] **Step 4: Run typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/customize/[id]/customize-view.tsx
git commit -m "feat: remove sessionStorage from customize-view, navigate to /preview/[projectId]"
```

---

### Task 8: Verify — full typecheck + API tests

**Files:** None (verification only)

- [ ] **Step 1: Run web typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Run API tests**

Run: `cd apps/api && npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Search for any remaining sessionStorage references**

Run: `grep -r "sessionStorage" apps/web/src/ --include="*.ts" --include="*.tsx"`
Expected: No results. If any remain, they are bugs — remove them.

- [ ] **Step 4: Search for any remaining hardcoded /preview or /integrate routes without [projectId]**

Run: `grep -rn '"/preview"' apps/web/src/ --include="*.ts" --include="*.tsx"`
Run: `grep -rn '"/integrate"' apps/web/src/ --include="*.ts" --include="*.tsx"`
Expected: No results. All routes should use the dynamic `/preview/${projectId}` or `/integrate/${projectId}` pattern.

- [ ] **Step 5: Commit any remaining fixes**

If any fixes were needed, commit them:
```bash
git add -A
git commit -m "fix: remove remaining sessionStorage and hardcoded route references"
```

---

### Task 9: Manual E2E verification

**No files — manual testing only.**

- [ ] **Step 1: Start dev environment**

Run: `npm run dev` (starts both API on :3011 and web on :3012)

- [ ] **Step 2: Verify analyze → preview flow**

1. Open `http://localhost:3012`
2. Drop a Next.js project folder
3. Wait for analysis + storyboard generation
4. Confirm redirect goes to `http://localhost:3012/preview/<uuid>` (not `/preview`)

- [ ] **Step 3: Verify shareable URL**

1. Copy the preview URL from step 2
2. Open a new incognito/private window
3. Paste the URL
4. Confirm the same storyboards load (no "redirect to /" or blank page)

- [ ] **Step 4: Verify pick → build → integrate flow**

1. Pick an option (click "Pick this flow")
2. Confirm the built preview renders
3. Click "Use this flow"
4. Confirm redirect goes to `http://localhost:3012/integrate/<uuid>` (not `/integrate`)

- [ ] **Step 5: Verify customize flow**

1. Go back to storyboards
2. Click "Customize" on an option
3. Confirm redirect goes to `/customize/<draft-uuid>`
4. Make a change (skip a step or regenerate)
5. Click "Finalize"
6. Confirm redirect goes to `/preview/<project-uuid>` (not `/preview`)

- [ ] **Step 6: Verify no sessionStorage usage**

1. Open browser DevTools → Application → Session Storage
2. Confirm no `onboarder_session` or `onboarder_chosen` keys exist
