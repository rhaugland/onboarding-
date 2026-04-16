import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { db, onboardingOptions } from "@onboarder/db";
import {
  regenerateScreen,
  GenerationFailedError,
} from "../services/screen-regenerator.js";

const customize = new Hono();

customize.post("/", async (c) => {
  const { baseOptionId } = await c.req.json<{ baseOptionId?: string }>();
  if (!baseOptionId) {
    return c.json({ error: "baseOptionId is required" }, 400);
  }

  const [base] = await db
    .select()
    .from(onboardingOptions)
    .where(eq(onboardingOptions.id, baseOptionId));

  if (!base) {
    return c.json({ error: "Base option not found" }, 404);
  }

  // Idempotency: return existing draft for (project, base) if one is active
  const existing = await db
    .select()
    .from(onboardingOptions)
    .where(
      and(
        eq(onboardingOptions.projectId, base.projectId),
        eq(onboardingOptions.baseOptionId, baseOptionId),
        eq(onboardingOptions.status, "customizing")
      )
    );

  if (existing.length > 0) {
    return c.json(existing[0]);
  }

  const [draft] = await db
    .insert(onboardingOptions)
    .values({
      projectId: base.projectId,
      name: `${base.name} — Remix`,
      rationale: base.rationale,
      flowStructure: base.flowStructure,
      mockupCode: base.mockupCode,
      status: "customizing",
      baseOptionId,
      skippedSteps: [],
      customizeHistory: [],
    })
    .returning();

  return c.json(draft);
});

customize.get("/:id", async (c) => {
  const id = c.req.param("id");
  const [draft] = await db
    .select()
    .from(onboardingOptions)
    .where(eq(onboardingOptions.id, id));

  if (!draft) {
    return c.json({ error: "Draft not found" }, 404);
  }

  const siblings = await db
    .select()
    .from(onboardingOptions)
    .where(
      and(
        eq(onboardingOptions.projectId, draft.projectId),
        eq(onboardingOptions.status, "storyboard")
      )
    );

  return c.json({ draft, siblings });
});

customize.patch("/:id", async (c) => {
  const id = c.req.param("id");
  let body: Record<string, unknown>;
  try {
    const raw = await c.req.json();
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      return c.json({ error: "Body must be a JSON object" }, 400);
    }
    body = raw as Record<string, unknown>;
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const keys = Object.keys(body);

  if (keys.length !== 1 || keys[0] !== "skippedSteps") {
    return c.json(
      { error: "Only skippedSteps may be updated via PATCH" },
      400
    );
  }

  const skippedSteps = body.skippedSteps;
  if (
    !Array.isArray(skippedSteps) ||
    !skippedSteps.every((s) => typeof s === "string")
  ) {
    return c.json({ error: "skippedSteps must be string[]" }, 400);
  }

  const [draft] = await db
    .select()
    .from(onboardingOptions)
    .where(eq(onboardingOptions.id, id));
  if (!draft) return c.json({ error: "Draft not found" }, 404);

  const validSteps = new Set(
    (draft.flowStructure as Array<{ stepName: string }>).map((s) => s.stepName)
  );
  const unknown = skippedSteps.filter((s: string) => !validSteps.has(s));
  if (unknown.length > 0) {
    return c.json(
      { error: `Unknown step names: ${unknown.join(", ")}` },
      400
    );
  }

  await db
    .update(onboardingOptions)
    .set({ skippedSteps: skippedSteps as string[] })
    .where(eq(onboardingOptions.id, id));

  return c.json({ ok: true });
});

customize.post("/:id/screens/:stepName/regenerate", async (c) => {
  const id = c.req.param("id");
  const stepName = c.req.param("stepName");
  const { prompt } = await c.req.json<{ prompt?: string }>();

  const trimmed = (prompt ?? "").trim();
  if (trimmed.length === 0) {
    return c.json({ error: "prompt is required" }, 400);
  }
  if (trimmed.length > 2000) {
    return c.json({ error: "prompt too long (max 2000 chars)" }, 400);
  }

  const [draft] = await db
    .select()
    .from(onboardingOptions)
    .where(eq(onboardingOptions.id, id));
  if (!draft) return c.json({ error: "Draft not found" }, 404);

  const flow = draft.flowStructure as Array<{
    stepName: string;
    type: string;
    description: string;
  }>;
  const step = flow.find((s) => s.stepName === stepName);
  if (!step) return c.json({ error: "Step not found" }, 404);

  const mockupCode = (draft.mockupCode ?? {}) as Record<string, string>;
  const currentCode = mockupCode[stepName];
  if (!currentCode) {
    return c.json({ error: "No existing mockup for this step" }, 404);
  }

  try {
    const result = await regenerateScreen({
      stepName,
      stepDescription: step.description,
      currentCode,
      userPrompt: trimmed,
    });

    const newMockupCode = { ...mockupCode, [stepName]: result.mockupCode };
    const history = [
      ...((draft.customizeHistory ?? []) as Array<Record<string, unknown>>),
      {
        timestamp: new Date().toISOString(),
        type: "regenerate",
        stepName,
        prompt: trimmed,
      },
    ];

    await db
      .update(onboardingOptions)
      .set({ mockupCode: newMockupCode, customizeHistory: history })
      .where(eq(onboardingOptions.id, id));

    return c.json({ ok: true, mockupCode: result.mockupCode });
  } catch (err) {
    if (err instanceof GenerationFailedError) {
      return c.json(
        { error: "generation_failed", retryable: true, message: err.message },
        502
      );
    }
    throw err;
  }
});

export default customize;
