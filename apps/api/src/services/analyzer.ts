import { sendPrompt } from "./claude.js";
import {
  ANALYZE_SYSTEM_PROMPT,
  buildAnalyzeUserMessage,
} from "../prompts/analyze.js";

// ~4 chars per token, leave room for system prompt + output
const MAX_INPUT_CHARS = 80000; // ~20K tokens
const MAX_FILE_LINES = 150;

function truncateFile(content: string): string {
  const lines = content.split("\n");
  if (lines.length <= MAX_FILE_LINES) return content;
  return (
    lines.slice(0, MAX_FILE_LINES).join("\n") +
    `\n// ... truncated (${lines.length - MAX_FILE_LINES} more lines)`
  );
}

interface ContextPayload {
  fileTree: string[];
  packageJson: Record<string, unknown>;
  routeMap: string[];
  routerType: "app" | "pages";
  schemaDefinitions: string;
  layoutCode: string;
  keyComponents: Record<string, string>;
  pageFiles: Record<string, string>;
  tailwindConfig: string;
  globalsCss: string;
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
      const match = filePath.match(/^(?:src\/)?app(\/.*?)?\/?page\.tsx?$/);
      if (match) {
        route = match[1] || "/";
      }
    } else {
      const match = filePath.match(/^pages(\/.*?)?\/?(?:index)?\.tsx?$/);
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
      f.endsWith("layout.tsx") ||
      f.endsWith("layout.ts") ||
      f.endsWith("_app.tsx")
  );
  const layoutCode = layoutFile ? truncateFile(files[layoutFile]) : "";

  const schemaFile = fileTree.find(
    (f) => f.includes("schema.ts") || f.includes("schema.js")
  );
  const schemaDefinitions = schemaFile ? truncateFile(files[schemaFile]) : "";

  // Tailwind config — critical for brand colors
  const tailwindConfigFile = fileTree.find((f) =>
    /(?:^|\/)tailwind\.config\.(ts|js|cjs|mjs)$/.test(f)
  );
  const tailwindConfig = tailwindConfigFile
    ? truncateFile(files[tailwindConfigFile])
    : "";

  // globals.css — secondary source for brand colors (CSS variables).
  // Project structures vary wildly (Next.js, Vite, CRA, shadcn/ui), so we
  // fall back to content-sniffing: find any CSS file with Tailwind directives
  // or CSS variable theme tokens (--primary, --background, etc.).
  const cssFiles = fileTree.filter((f) => f.endsWith(".css"));
  const CONVENTIONAL_GLOBALS = [
    /(?:^|\/)app\/globals\.css$/,
    /(?:^|\/)src\/app\/globals\.css$/,
    /(?:^|\/)styles\/globals\.css$/,
    /(?:^|\/)globals\.css$/,
    /(?:^|\/)src\/index\.css$/,
    /(?:^|\/)client\/src\/index\.css$/,
    /(?:^|\/)src\/styles\.css$/,
  ];
  let globalsCssFile: string | undefined;
  for (const pattern of CONVENTIONAL_GLOBALS) {
    globalsCssFile = cssFiles.find((f) => pattern.test(f));
    if (globalsCssFile) break;
  }
  if (!globalsCssFile) {
    // Content sniff — any CSS file with Tailwind directives or theme CSS vars
    globalsCssFile = cssFiles.find((f) => {
      const content = files[f] || "";
      return (
        /@tailwind\s+(base|components|utilities)/.test(content) ||
        /@theme\b/.test(content) ||
        /--(?:background|foreground|primary|accent)\s*:/.test(content)
      );
    });
  }
  const globalsCss = globalsCssFile ? truncateFile(files[globalsCssFile]) : "";

  // Page files — used by generator to mimic real UI vocabulary.
  // Handle multiple conventions:
  //   - Next.js App Router: `app/**/page.tsx`
  //   - Next.js Pages Router + Vite/React Router: `pages/**/*.tsx`
  //   - Vite monorepos (e.g. rest-express): `client/src/pages/**/*.tsx`
  //   - React Router views: `**/(routes|views)/**/*.tsx`
  const pageFiles: Record<string, string> = {};
  for (const [path, content] of Object.entries(files)) {
    if (path.includes("node_modules")) continue;
    const isAppRouterPage = /(?:^|\/)page\.(tsx?|jsx?)$/.test(path);
    const isInPagesDir =
      /(?:^|\/)pages\/.+\.(tsx|jsx)$/.test(path) &&
      !/\/_app\.(tsx|jsx)$/.test(path) &&
      !/\/_document\.(tsx|jsx)$/.test(path);
    const isInRoutesOrViewsDir =
      /(?:^|\/)(routes|views)\/.+\.(tsx|jsx)$/.test(path);
    if (isAppRouterPage || isInPagesDir || isInRoutesOrViewsDir) {
      pageFiles[path] = truncateFile(content);
    }
  }

  const keyComponents: Record<string, string> = {};
  let componentChars = 0;
  const fixedContentSize =
    JSON.stringify(packageJson).length +
    fileTree.join("\n").length +
    layoutCode.length +
    schemaDefinitions.length +
    tailwindConfig.length +
    globalsCss.length +
    Object.values(pageFiles).join("").length;
  const componentBudget = MAX_INPUT_CHARS - fixedContentSize;

  const componentExtensions = [".tsx", ".ts", ".jsx"];
  for (const [path, content] of Object.entries(files)) {
    if (
      componentExtensions.some((ext) => path.endsWith(ext)) &&
      !path.includes("node_modules") &&
      !path.endsWith("layout.tsx") &&
      !path.endsWith("page.tsx") &&
      path.includes("components/")
    ) {
      const truncated = truncateFile(content);
      if (componentChars + truncated.length > componentBudget) break;
      keyComponents[path] = truncated;
      componentChars += truncated.length;
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
    pageFiles,
    tailwindConfig,
    globalsCss,
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
    payload.keyComponents,
    payload.pageFiles,
    payload.tailwindConfig,
    payload.globalsCss
  );

  const appProfile = (await sendPrompt(
    ANALYZE_SYSTEM_PROMPT,
    userMessage
  )) as Record<string, unknown>;

  // Attach raw design references so the generator can reproduce real branding + UI.
  // Claude doesn't need to echo these back — we carry them through directly.
  const pageFileEntries = Object.entries(payload.pageFiles);
  const samplePages = Object.fromEntries(pageFileEntries.slice(0, 3));

  return {
    ...appProfile,
    designReferences: {
      tailwindConfig: payload.tailwindConfig,
      globalsCss: payload.globalsCss,
      samplePages,
      layoutCode: payload.layoutCode,
    },
  };
}
