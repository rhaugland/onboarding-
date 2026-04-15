import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { generateIntegration } from "../services/integrator.js";
import {
  db,
  projects,
  onboardingOptions,
  integrations,
} from "@onboarder/db";

const integrate = new Hono();

integrate.post("/", async (c) => {
  const { projectId, optionId } = await c.req.json<{
    projectId: string;
    optionId: string;
  }>();

  if (!projectId || !optionId) {
    return c.json({ error: "projectId and optionId are required" }, 400);
  }

  const [option] = await db
    .select()
    .from(onboardingOptions)
    .where(eq(onboardingOptions.id, optionId));

  if (!option) {
    return c.json({ error: "Option not found" }, 404);
  }

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId));

  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  const codebaseSnippets: Record<string, string> = {};

  const result = await generateIntegration(
    {
      name: option.name,
      rationale: option.rationale,
      flowStructure: option.flowStructure,
      componentCode: option.componentCode,
      authCode: option.authCode,
    },
    project.appProfile as Record<string, unknown>,
    codebaseSnippets
  );

  await db.insert(integrations).values({
    projectId,
    optionId,
    changeset: result,
    status: "pending",
  });

  await db
    .update(onboardingOptions)
    .set({ selected: true })
    .where(eq(onboardingOptions.id, optionId));

  return c.json(result);
});

export default integrate;
