import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { generateStoryboard } from "../services/storyboarder.js";
import { db, projects, onboardingOptions } from "@onboarder/db";

const storyboard = new Hono();

storyboard.post("/", async (c) => {
  const { projectId } = await c.req.json<{ projectId: string }>();

  if (!projectId) {
    return c.json({ error: "projectId is required" }, 400);
  }

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId));

  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  const result = await generateStoryboard(
    project.appProfile as Record<string, unknown>
  );

  await db
    .update(projects)
    .set({ authMockup: result.authMockup })
    .where(eq(projects.id, projectId));

  const savedOptions = [];
  for (const option of result.options) {
    const [row] = await db
      .insert(onboardingOptions)
      .values({
        projectId,
        name: option.name,
        rationale: option.rationale,
        flowStructure: option.flowStructure,
        mockupCode: option.mockupCode,
        status: "storyboard",
        selected: false,
      })
      .returning();
    savedOptions.push({ ...option, id: row.id });
  }

  return c.json({
    options: savedOptions,
    authMockup: result.authMockup,
  });
});

export default storyboard;
