import { sendPrompt } from "./claude.js";
import {
  INTEGRATE_SYSTEM_PROMPT,
  buildIntegrateUserMessage,
} from "../prompts/integrate.js";

interface IntegrationFile {
  path: string;
  content: string;
  action: "create" | "modify";
  diff?: string;
}

interface IntegrationResult {
  files: IntegrationFile[];
  commands: string[];
  envVars: string[];
}

export async function generateIntegration(
  option: Record<string, unknown>,
  appProfile: Record<string, unknown>,
  codebaseSnippets: Record<string, string>
): Promise<IntegrationResult> {
  const userMessage = buildIntegrateUserMessage(
    option,
    appProfile,
    codebaseSnippets
  );

  const result = await sendPrompt(INTEGRATE_SYSTEM_PROMPT, userMessage);
  return result as IntegrationResult;
}
