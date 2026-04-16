import { sendPrompt } from "./claude.js";
import {
  REGENERATE_SCREEN_SYSTEM_PROMPT,
  buildRegenerateScreenUserMessage,
} from "../prompts/customize.js";

export class GenerationFailedError extends Error {
  readonly retryable = true;
  constructor(message: string) {
    super(message);
    this.name = "GenerationFailedError";
  }
}

interface RegenerateInput {
  stepName: string;
  stepDescription: string;
  currentCode: string;
  userPrompt: string;
}

interface RegenerateResult {
  mockupCode: string;
}

export async function regenerateScreen(
  input: RegenerateInput
): Promise<RegenerateResult> {
  const userMsg = buildRegenerateScreenUserMessage(
    input.stepName,
    input.stepDescription,
    input.currentCode,
    input.userPrompt
  );

  const response = (await sendPrompt(
    REGENERATE_SCREEN_SYSTEM_PROMPT,
    userMsg
  )) as { mockupCode?: unknown };

  if (
    !response ||
    typeof response !== "object" ||
    typeof response.mockupCode !== "string" ||
    response.mockupCode.length === 0
  ) {
    throw new GenerationFailedError(
      `Regenerate response missing or malformed mockupCode for step "${input.stepName}"`
    );
  }

  return { mockupCode: response.mockupCode };
}
