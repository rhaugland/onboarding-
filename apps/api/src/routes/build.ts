import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { buildOption } from "../services/builder.js";
import { db, projects, onboardingOptions } from "@onboarder/db";

const build = new Hono();

build.post("/", async (c) => {
  const { projectId, optionId } = await c.req.json<{
    projectId: string;
    optionId: string;
  }>();

  if (!projectId || !optionId) {
    return c.json({ error: "projectId and optionId are required" }, 400);
  }

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId));
  if (!project) return c.json({ error: "Project not found" }, 404);

  const [option] = await db
    .select()
    .from(onboardingOptions)
    .where(eq(onboardingOptions.id, optionId));
  if (!option || option.projectId !== projectId) {
    return c.json({ error: "Option not found" }, 404);
  }

  if (
    option.status === "built" &&
    option.componentCode &&
    option.authCode
  ) {
    await db
      .update(onboardingOptions)
      .set({ selected: false })
      .where(eq(onboardingOptions.projectId, projectId));
    await db
      .update(onboardingOptions)
      .set({ selected: true })
      .where(eq(onboardingOptions.id, optionId));

    return c.json({
      id: option.id,
      componentCode: option.componentCode,
      authCode: option.authCode,
    });
  }

  const authMockup = (project.authMockup ?? { login: "", signup: "" }) as {
    login: string;
    signup: string;
  };

  const result = await buildOption({
    appProfile: project.appProfile as Record<string, unknown>,
    option: {
      name: option.name,
      rationale: option.rationale,
      flowStructure: option.flowStructure as Array<{
        stepName: string;
        type: string;
        description: string;
      }>,
      mockupCode: (option.mockupCode ?? {}) as Record<string, string>,
    },
    authMockup,
  });

  await db
    .update(onboardingOptions)
    .set({ selected: false })
    .where(eq(onboardingOptions.projectId, projectId));
  await db
    .update(onboardingOptions)
    .set({
      componentCode: result.componentCode,
      authCode: result.authCode,
      status: "built",
      selected: true,
    })
    .where(eq(onboardingOptions.id, optionId));

  return c.json({
    id: optionId,
    componentCode: result.componentCode,
    authCode: result.authCode,
  });
});

export default build;
