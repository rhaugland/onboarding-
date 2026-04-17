import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { db, reactions } from "@onboarder/db";

const reactionsRoute = new Hono();

// GET /api/reactions/:projectId — all reactions for a project
reactionsRoute.get("/:projectId", async (c) => {
  const projectId = c.req.param("projectId");
  const rows = await db
    .select()
    .from(reactions)
    .where(eq(reactions.projectId, projectId));

  return c.json({ reactions: rows });
});

// POST /api/reactions — upsert a reaction (toggle: same type removes it, different type switches it)
reactionsRoute.post("/", async (c) => {
  const body = await c.req.json<{
    projectId: string;
    optionId: string;
    voterName: string;
    type: "up" | "down";
  }>();

  if (!body.projectId || !body.optionId || !body.voterName?.trim() || !body.type) {
    return c.json({ error: "projectId, optionId, voterName, and type are required" }, 400);
  }

  const voterName = body.voterName.trim();

  // Check for existing reaction from this voter on this option
  const [existing] = await db
    .select()
    .from(reactions)
    .where(
      and(
        eq(reactions.optionId, body.optionId),
        eq(reactions.voterName, voterName),
      ),
    );

  if (existing) {
    if (existing.type === body.type) {
      // Same type — toggle off (remove)
      await db.delete(reactions).where(eq(reactions.id, existing.id));
      return c.json({ action: "removed" });
    }
    // Different type — switch
    const [updated] = await db
      .update(reactions)
      .set({ type: body.type })
      .where(eq(reactions.id, existing.id))
      .returning();
    return c.json({ action: "switched", reaction: updated });
  }

  // New reaction
  const [row] = await db
    .insert(reactions)
    .values({
      projectId: body.projectId,
      optionId: body.optionId,
      voterName,
      type: body.type,
    })
    .returning();

  return c.json({ action: "created", reaction: row }, 201);
});

export default reactionsRoute;
