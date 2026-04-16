import { sendPrompt } from "./claude.js";
import {
  GENERATE_STORYBOARD_PLAN_SYSTEM_PROMPT,
  GENERATE_STORYBOARD_MOCKUP_SYSTEM_PROMPT,
  buildStoryboardPlanUserMessage,
  buildStoryboardMockupUserMessage,
} from "../prompts/storyboard.js";
import { trimDesignReferences } from "./shared.js";

interface FlowStep {
  stepName: string;
  type: "form" | "tour" | "tooltip" | "checklist" | "contextual";
  description: string;
}

interface OptionPlan {
  name: string;
  rationale: string;
  flowStructure: FlowStep[];
}

interface PlanResult {
  authMockup: { login: string; signup: string };
  options: OptionPlan[];
}

interface MockupResult {
  mockupCode: Record<string, string>;
}

export interface StoryboardOption extends OptionPlan {
  mockupCode: Record<string, string>;
}

export interface StoryboardResult {
  authMockup: { login: string; signup: string };
  options: StoryboardOption[];
}

export async function generateStoryboard(
  appProfile: Record<string, unknown>
): Promise<StoryboardResult> {
  const planMsg = buildStoryboardPlanUserMessage(appProfile);
  const plan = (await sendPrompt(
    GENERATE_STORYBOARD_PLAN_SYSTEM_PROMPT,
    planMsg
  )) as PlanResult;

  if (
    !plan ||
    typeof plan !== "object" ||
    !Array.isArray(plan.options) ||
    !plan.authMockup ||
    typeof plan.authMockup.login !== "string" ||
    typeof plan.authMockup.signup !== "string"
  ) {
    console.error(
      "[storyboarder] plan response invalid:",
      JSON.stringify(plan).slice(0, 500)
    );
    throw new Error("Storyboard plan response invalid");
  }

  if (
    !plan.options.every(
      (o: any) => typeof o?.name === "string" && Array.isArray(o?.flowStructure)
    )
  ) {
    throw new Error(
      "Storyboard plan options malformed: each option requires name (string) and flowStructure (array)"
    );
  }

  const trimmedProfile = trimDesignReferences(appProfile);

  const optionResults = await Promise.all(
    plan.options.map(async (option): Promise<StoryboardOption> => {
      const msg = buildStoryboardMockupUserMessage(trimmedProfile, option);
      const result = (await sendPrompt(
        GENERATE_STORYBOARD_MOCKUP_SYSTEM_PROMPT,
        msg
      )) as MockupResult;

      if (!result || typeof result.mockupCode !== "object" || result.mockupCode === null) {
        console.error(
          `[storyboarder] option "${option.name}" mockup invalid:`,
          JSON.stringify(result).slice(0, 500)
        );
        throw new Error(`Option "${option.name}" mockup response invalid`);
      }

      return { ...option, mockupCode: result.mockupCode };
    })
  );

  return {
    authMockup: plan.authMockup,
    options: optionResults,
  };
}
