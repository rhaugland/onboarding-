import { sendPrompt } from "./claude.js";
import { trimDesignReferences } from "./shared.js";
import {
  BUILD_OPTION_SYSTEM_PROMPT,
  buildBuildOptionUserMessage,
} from "../prompts/storyboard.js";

interface BuildInput {
  appProfile: Record<string, unknown>;
  option: {
    name: string;
    rationale: string;
    flowStructure: Array<{ stepName: string; type: string; description: string }>;
    mockupCode: Record<string, string>;
  };
  authMockup: { login: string; signup: string };
}

export interface BuildResult {
  componentCode: Record<string, string>;
  authCode: { login: string; signup: string };
}

export async function buildOption(input: BuildInput): Promise<BuildResult> {
  const trimmed = trimDesignReferences(input.appProfile);
  const msg = buildBuildOptionUserMessage(trimmed, input.option, input.authMockup);
  const result = (await sendPrompt(BUILD_OPTION_SYSTEM_PROMPT, msg)) as BuildResult;

  if (
    !result ||
    typeof result !== "object" ||
    !result.componentCode ||
    typeof result.componentCode !== "object" ||
    !result.authCode ||
    typeof result.authCode.login !== "string" ||
    typeof result.authCode.signup !== "string"
  ) {
    console.error(
      "[builder] response invalid:",
      JSON.stringify(result).slice(0, 500)
    );
    throw new Error("Build response invalid");
  }

  return result;
}
