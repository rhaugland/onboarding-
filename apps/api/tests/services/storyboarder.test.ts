import { describe, it, expect, vi } from "vitest";
import { sendPrompt } from "../../src/services/claude.js";
import { generateStoryboard } from "../../src/services/storyboarder.js";

vi.mock("../../src/services/claude.js", () => ({
  sendPrompt: vi
    .fn()
    // First call: plan
    .mockResolvedValueOnce({
      authMockup: {
        login: "function LoginMock() { return <div>Login</div>; }",
        signup: "function SignupMock() { return <div>Signup</div>; }",
      },
      options: [
        {
          name: "Wizard",
          rationale: "Needs setup",
          flowStructure: [
            { stepName: "welcome", type: "form", description: "Welcome" },
          ],
        },
        {
          name: "Tour",
          rationale: "Feature-rich",
          flowStructure: [
            { stepName: "tour-intro", type: "tour", description: "Tour" },
          ],
        },
        {
          name: "Checklist",
          rationale: "Multi-task setup",
          flowStructure: [
            { stepName: "connect", type: "checklist", description: "Connect" },
          ],
        },
      ],
    })
    // Three per-option mockup calls
    .mockResolvedValueOnce({
      mockupCode: { welcome: "function Welcome() { return <div>Welcome</div>; }" },
    })
    .mockResolvedValueOnce({
      mockupCode: { "tour-intro": "function TourIntro() { return <div>Tour</div>; }" },
    })
    .mockResolvedValueOnce({
      mockupCode: { connect: "function Connect() { return <div>Connect</div>; }" },
    }),
}));

describe("storyboarder service", () => {
  it("generates 3 options with mockup code plus a shared auth mockup", async () => {
    const result = await generateStoryboard({
      name: "Test App",
      designReferences: { tailwindConfig: "", globalsCss: "", samplePages: {} },
    });

    expect(result.authMockup.login).toContain("Login");
    expect(result.authMockup.signup).toContain("Signup");
    expect(result.options).toHaveLength(3);
    expect(result.options[0].name).toBe("Wizard");
    expect(result.options[0].mockupCode.welcome).toContain("Welcome");
    expect(result.options[1].mockupCode["tour-intro"]).toContain("Tour");
    expect(result.options[2].mockupCode.connect).toContain("Connect");
  });

  it("throws if plan response is malformed", async () => {
    vi.mocked(sendPrompt).mockResolvedValue({ foo: "bar" });
    await expect(generateStoryboard({})).rejects.toThrow(/invalid/i);
  });
});
