import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { generateOnboarding } from "../services/generator.js";
import { db, projects, onboardingOptions } from "@onboarder/db";

const generate = new Hono();

generate.post("/", async (c) => {
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

  const result = await generateOnboarding(
    project.appProfile as Record<string, unknown>
  );

  const savedOptions = [];
  for (const option of result.options) {
    const [saved] = await db
      .insert(onboardingOptions)
      .values({
        projectId,
        name: option.name,
        rationale: option.rationale,
        flowStructure: option.flowStructure,
        componentCode: option.componentCode,
        authCode: result.authCode,
        selected: false,
      })
      .returning();
    savedOptions.push({ ...option, id: saved.id, authCode: result.authCode });
  }

  return c.json({ options: savedOptions });
});

export default generate;
