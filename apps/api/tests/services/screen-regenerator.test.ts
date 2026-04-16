import { describe, it, expect, vi, beforeEach } from "vitest";

const sendPromptMock = vi.fn();
vi.mock("../../src/services/claude.js", () => ({
  sendPrompt: sendPromptMock,
}));

describe("screen regenerator", () => {
  beforeEach(() => sendPromptMock.mockReset());

  it("returns updated mockupCode on happy path", async () => {
    sendPromptMock.mockResolvedValue({
      mockupCode: "function Welcome(){return <div>new</div>}",
    });
    const { regenerateScreen } = await import(
      "../../src/services/screen-regenerator.js"
    );
    const result = await regenerateScreen({
      stepName: "welcome",
      stepDescription: "greeting screen",
      currentCode: "function Welcome(){return <div>old</div>}",
      userPrompt: "change the text",
    });
    expect(result).toEqual({
      mockupCode: "function Welcome(){return <div>new</div>}",
    });
    expect(sendPromptMock).toHaveBeenCalledTimes(1);
  });

  it("throws GenerationFailedError when response lacks mockupCode", async () => {
    sendPromptMock.mockResolvedValue({ foo: "bar" });
    const { regenerateScreen, GenerationFailedError } = await import(
      "../../src/services/screen-regenerator.js"
    );
    await expect(
      regenerateScreen({
        stepName: "welcome",
        stepDescription: "d",
        currentCode: "x",
        userPrompt: "y",
      })
    ).rejects.toBeInstanceOf(GenerationFailedError);
  });

  it("throws GenerationFailedError when response.mockupCode is not a string", async () => {
    sendPromptMock.mockResolvedValue({ mockupCode: { notAString: true } });
    const { regenerateScreen, GenerationFailedError } = await import(
      "../../src/services/screen-regenerator.js"
    );
    await expect(
      regenerateScreen({
        stepName: "welcome",
        stepDescription: "d",
        currentCode: "x",
        userPrompt: "y",
      })
    ).rejects.toBeInstanceOf(GenerationFailedError);
  });
});
