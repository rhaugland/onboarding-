import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { db, projects, onboardingOptions, inArray } from "@onboarder/db";

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
