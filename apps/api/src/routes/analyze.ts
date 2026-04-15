import { Hono } from "hono";
import { analyzeProject } from "../services/analyzer.js";
import { db, projects } from "@onboarder/db";

const analyze = new Hono();

analyze.post("/", async (c) => {
  const { files, folderPath } = await c.req.json<{
    files: Record<string, string>;
    folderPath: string;
  }>();

  if (!files || !folderPath) {
    return c.json({ error: "files and folderPath are required" }, 400);
  }

  const appProfile = await analyzeProject(files);

  const [project] = await db
    .insert(projects)
    .values({
      name: (appProfile as any).name || "Unknown Project",
      folderPath,
      appProfile,
      stackInfo: {
        routerType: (appProfile as any).routerType,
        stylingApproach: (appProfile as any).stylingApproach,
      },
    })
    .returning();

  return c.json({ projectId: project.id, appProfile });
});

export default analyze;
