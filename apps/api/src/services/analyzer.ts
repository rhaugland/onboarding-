import { sendPrompt } from "./claude.js";
import {
  ANALYZE_SYSTEM_PROMPT,
  buildAnalyzeUserMessage,
} from "../prompts/analyze.js";

interface ContextPayload {
  fileTree: string[];
  packageJson: Record<string, unknown>;
  routeMap: string[];
  routerType: "app" | "pages";
  schemaDefinitions: string;
  layoutCode: string;
  keyComponents: Record<string, string>;
}

export function buildContextPayload(
  files: Record<string, string>
): ContextPayload {
  const fileTree = Object.keys(files).sort();

  let packageJson: Record<string, unknown> = {};
  if (files["package.json"]) {
    try {
      packageJson = JSON.parse(files["package.json"]);
    } catch {
      packageJson = {};
    }
  }

  const isAppRouter = fileTree.some(
    (f) => f.startsWith("src/app/") || f.startsWith("app/")
  );
  const routerType: "app" | "pages" = isAppRouter ? "app" : "pages";

  const routeMap: string[] = [];
  for (const filePath of fileTree) {
    let route: string | null = null;

    if (routerType === "app") {
      const match = filePath.match(
        /^(?:src\/)?app(\/.*?)?\/?page\.tsx?$/
      );
      if (match) {
        route = match[1] || "/";
      }
    } else {
      const match = filePath.match(
        /^pages(\/.*?)?\/?(?:index)?\.tsx?$/
      );
      if (match) {
        route = match[1] || "/";
      }
    }

    if (route) {
      routeMap.push(route);
    }
  }

  const layoutFile = fileTree.find(
    (f) =>
      f.endsWith("layout.tsx") || f.endsWith("layout.ts") || f.endsWith("_app.tsx")
  );
  const layoutCode = layoutFile ? files[layoutFile] : "";

  const schemaFile = fileTree.find(
    (f) => f.includes("schema.ts") || f.includes("schema.js")
  );
  const schemaDefinitions = schemaFile ? files[schemaFile] : "";

  const keyComponents: Record<string, string> = {};
  const componentExtensions = [".tsx", ".ts", ".jsx"];
  for (const [path, content] of Object.entries(files)) {
    if (
      componentExtensions.some((ext) => path.endsWith(ext)) &&
      !path.includes("node_modules") &&
      !path.endsWith("layout.tsx") &&
      !path.endsWith("page.tsx") &&
      path.includes("components/")
    ) {
      keyComponents[path] = content;
    }
  }

  return {
    fileTree,
    packageJson,
    routeMap,
    routerType,
    schemaDefinitions,
    layoutCode,
    keyComponents,
  };
}

export async function analyzeProject(
  files: Record<string, string>
): Promise<Record<string, unknown>> {
  const payload = buildContextPayload(files);

  const userMessage = buildAnalyzeUserMessage(
    payload.fileTree,
    payload.packageJson,
    payload.routeMap,
    payload.schemaDefinitions,
    payload.layoutCode,
    payload.keyComponents
  );

  const appProfile = await sendPrompt(ANALYZE_SYSTEM_PROMPT, userMessage);
  return appProfile as Record<string, unknown>;
}
