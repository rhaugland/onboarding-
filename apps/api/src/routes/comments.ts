import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db, comments } from "@onboarder/db";

const commentsRoute = new Hono();

// GET /api/comments/:projectId — all comments for a project
commentsRoute.get("/:projectId", async (c) => {
  const projectId = c.req.param("projectId");
  const rows = await db
    .select()
    .from(comments)
    .where(eq(comments.projectId, projectId))
    .orderBy(comments.createdAt);

  return c.json({ comments: rows });
});

// POST /api/comments — create a comment
commentsRoute.post("/", async (c) => {
  const body = await c.req.json<{
    projectId: string;
    optionId: string;
    authorName: string;
    content: string;
  }>();

  if (!body.projectId || !body.optionId || !body.authorName?.trim() || !body.content?.trim()) {
    return c.json({ error: "projectId, optionId, authorName, and content are required" }, 400);
  }

  const [row] = await db
    .insert(comments)
    .values({
      projectId: body.projectId,
      optionId: body.optionId,
      authorName: body.authorName.trim(),
      content: body.content.trim(),
    })
    .returning();

  return c.json(row, 201);
});

export default commentsRoute;
