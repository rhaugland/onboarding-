import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { db, onboardingOptions } from "@onboarder/db";

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
  const body = (await c.req.json()) as Record<string, unknown>;
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

export default customize;
