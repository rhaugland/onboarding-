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

export default customize;
