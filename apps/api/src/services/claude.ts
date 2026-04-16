import Anthropic from "@anthropic-ai/sdk";
import { RateLimitError } from "@anthropic-ai/sdk/error";

function getClient(): Anthropic {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 5000;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendPrompt(
  systemPrompt: string,
  userMessage: string,
  model: string = "claude-sonnet-4-6"
): Promise<unknown> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // Use streaming to avoid the SDK's non-streaming timeout limit at high max_tokens
      const stream = getClient().messages.stream({
        model,
        max_tokens: 64000,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      });

      const response = await stream.finalMessage();

      let text =
        response.content[0]?.type === "text" ? response.content[0].text : "";

      if (response.stop_reason === "max_tokens") {
        throw new Error(
          "Claude response was cut off (hit max_tokens). The prompt is asking for too much output — reduce scope or split into multiple calls."
        );
      }

      // Strip markdown code fences if present (```json ... ``` or ``` ... ```)
      const fenceMatch = text.match(/^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/);
      if (fenceMatch) {
        text = fenceMatch[1];
      }

      try {
        return JSON.parse(text);
      } catch (parseErr) {
        // If it looks like JSON but failed to parse, surface that — don't silently return a string
        const trimmed = text.trim();
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
          console.error("[claude] JSON parse failed. First 500 chars:", trimmed.slice(0, 500));
          console.error("[claude] Last 500 chars:", trimmed.slice(-500));
          throw new Error(
            `Claude returned malformed JSON: ${parseErr instanceof Error ? parseErr.message : "parse error"}`
          );
        }
        return text;
      }
    } catch (err) {
      lastError = err;

      if (err instanceof RateLimitError && attempt < MAX_RETRIES - 1) {
        const retryAfter = err.headers?.["retry-after"];
        const delayMs = retryAfter
          ? Math.min(Number(retryAfter) * 1000, 60000)
          : BASE_DELAY_MS * Math.pow(2, attempt);

        console.warn(
          `[claude] Rate limited (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in ${(delayMs / 1000).toFixed(0)}s...`
        );
        await sleep(delayMs);
        continue;
      }

      throw err;
    }
  }

  throw lastError;
}
