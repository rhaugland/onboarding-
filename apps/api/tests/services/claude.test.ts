import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: '{"name":"Test App"}' }],
      }),
    },
  })),
}));

describe("claude client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sendPrompt returns parsed JSON when response is valid JSON", async () => {
    const { sendPrompt } = await import("../../src/services/claude.js");
    const result = await sendPrompt("system prompt", "user message");
    expect(result).toEqual({ name: "Test App" });
  });

  it("sendPrompt returns raw text when response is not JSON", async () => {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    vi.mocked(Anthropic).mockImplementation(
      () =>
        ({
          messages: {
            create: vi.fn().mockResolvedValue({
              content: [{ type: "text", text: "plain text response" }],
            }),
          },
        }) as any
    );

    const { sendPrompt } = await import("../../src/services/claude.js");
    const result = await sendPrompt("system prompt", "user message");
    expect(result).toBe("plain text response");
  });
});
