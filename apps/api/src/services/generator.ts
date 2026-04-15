import { sendPrompt } from "./claude.js";
import {
  GENERATE_SYSTEM_PROMPT,
  buildGenerateUserMessage,
} from "../prompts/generate.js";

interface FlowStep {
  stepName: string;
  type: "form" | "tour" | "tooltip" | "checklist" | "contextual";
  description: string;
}

interface GeneratedOption {
  name: string;
  rationale: string;
  flowStructure: FlowStep[];
  componentCode: Record<string, string>;
}

interface GenerateResult {
  authCode: {
    login: string;
    signup: string;
  };
  options: GeneratedOption[];
}

export async function generateOnboarding(
  appProfile: Record<string, unknown>
): Promise<GenerateResult> {
  const userMessage = buildGenerateUserMessage(appProfile);
  const result = await sendPrompt(GENERATE_SYSTEM_PROMPT, userMessage);
  return result as GenerateResult;
}
