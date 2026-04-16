import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the streaming SDK surface: messages.stream() returns an object with finalMessage()
const mockFinalMessage = vi.fn();
const mockStream = vi.fn(() => ({ finalMessage: mockFinalMessage }));

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        stream: mockStream,
      },
    })),
  };
});

describe("claude client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sendPrompt returns parsed JSON when response is valid JSON", async () => {
    mockFinalMessage.mockResolvedValue({
      content: [{ type: "text", text: '{"name":"Test App"}' }],
      stop_reason: "end_turn",
    });

    const { sendPrompt } = await import("../../src/services/claude.js");
    const result = await sendPrompt("system prompt", "user message");
    expect(result).toEqual({ name: "Test App" });
  });

  it("sendPrompt returns raw text when response is not JSON", async () => {
    mockFinalMessage.mockResolvedValue({
      content: [{ type: "text", text: "plain text response" }],
      stop_reason: "end_turn",
    });

    const { sendPrompt } = await import("../../src/services/claude.js");
    const result = await sendPrompt("system prompt", "user message");
    expect(result).toBe("plain text response");
  });
});
