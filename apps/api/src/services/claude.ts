import Anthropic from "@anthropic-ai/sdk";

function getClient(): Anthropic {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
}

export async function sendPrompt(
  systemPrompt: string,
  userMessage: string,
  model: string = "claude-sonnet-4-6"
): Promise<unknown> {
  const response = await getClient().messages.create({
    model,
    max_tokens: 16000,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
