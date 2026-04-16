import { sendPrompt } from "./claude.js";
import {
  GENERATE_PLAN_SYSTEM_PROMPT,
  GENERATE_OPTION_CODE_SYSTEM_PROMPT,
  buildGeneratePlanUserMessage,
  buildGenerateOptionCodeUserMessage,
} from "../prompts/generate.js";
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
  authCode: {
    login: string;
    signup: string;
  };
  options: OptionPlan[];
}

interface OptionCodeResult {
  componentCode: Record<string, string>;
}

interface GeneratedOption extends OptionPlan {
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
  // Step 1: plan call — get option metadata + auth code
  const planMessage = buildGeneratePlanUserMessage(appProfile);
  const plan = (await sendPrompt(GENERATE_PLAN_SYSTEM_PROMPT, planMessage)) as PlanResult;

  if (
    !plan ||
    typeof plan !== "object" ||
    !Array.isArray(plan.options) ||
    !plan.authCode
  ) {
    console.error(
      "[generator] plan response shape invalid:",
      JSON.stringify(plan).slice(0, 500)
    );
    throw new Error("Plan response missing 'options' array or 'authCode'");
  }

  // Trim design references for per-option calls — keep brand sources
  // (tailwind, globals.css) and a single sample page for vocabulary,
  // drop layout and extra sample pages to keep per-option token budget down.
  const trimmedAppProfile = trimDesignReferences(appProfile);

  // Step 2: fan out component code generation per option, in parallel
  const optionResults = await Promise.all(
    plan.options.map(async (option): Promise<GeneratedOption> => {
      const optionMessage = buildGenerateOptionCodeUserMessage(trimmedAppProfile, option);
      const result = (await sendPrompt(
        GENERATE_OPTION_CODE_SYSTEM_PROMPT,
        optionMessage
      )) as OptionCodeResult;

      if (
        !result ||
        typeof result !== "object" ||
        !result.componentCode ||
        typeof result.componentCode !== "object"
      ) {
        console.error(
          `[generator] option "${option.name}" code response invalid:`,
          JSON.stringify(result).slice(0, 500)
        );
        throw new Error(`Option "${option.name}" code response missing componentCode`);
      }

      return {
        ...option,
        componentCode: result.componentCode,
      };
    })
  );

  return {
    authCode: plan.authCode,
    options: optionResults,
  };
}
