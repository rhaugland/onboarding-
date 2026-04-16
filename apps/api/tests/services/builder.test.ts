import { describe, it, expect, vi } from "vitest";
import { sendPrompt } from "../../src/services/claude.js";
import { buildOption } from "../../src/services/builder.js";

vi.mock("../../src/services/claude.js", () => ({
  sendPrompt: vi.fn(),
}));

describe("builder service", () => {
  it("builds interactive code from an approved option", async () => {
    vi.mocked(sendPrompt).mockResolvedValueOnce({
      authCode: {
        login: "export default function Login({ onNext }) {}",
        signup: "export default function Signup({ onNext }) {}",
      },
      componentCode: {
        welcome: "export default function Welcome({ onNext }) {}",
      },
    });

    const result = await buildOption({
      appProfile: {
        name: "Test",
        designReferences: { tailwindConfig: "", globalsCss: "", samplePages: {} },
      },
      option: {
        name: "Wizard",
        rationale: "r",
        flowStructure: [
          { stepName: "welcome", type: "form", description: "d" },
        ],
        mockupCode: { welcome: "function WelcomeMock() {}" },
      },
      authMockup: {
        login: "function LoginMock() {}",
        signup: "function SignupMock() {}",
      },
    });

    expect(result.authCode.login).toContain("Login");
    expect(result.authCode.signup).toContain("Signup");
    expect(result.componentCode.welcome).toContain("Welcome");
  });

  it("throws if response is malformed", async () => {
    vi.mocked(sendPrompt).mockResolvedValueOnce({ foo: "bar" } as unknown as never);
    await expect(
      buildOption({
        appProfile: {},
        option: { name: "x", rationale: "y", flowStructure: [], mockupCode: {} },
        authMockup: { login: "", signup: "" },
      })
    ).rejects.toThrow(/invalid/i);
  });
});
