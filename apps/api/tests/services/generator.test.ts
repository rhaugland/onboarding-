import { describe, it, expect, vi } from "vitest";

vi.mock("../../src/services/claude.js", () => {
  const mockSendPrompt = vi.fn();

  // First call: plan response
  mockSendPrompt.mockResolvedValueOnce({
    authCode: {
      login: "<LoginComponent />",
      signup: "<SignupComponent />",
    },
    options: [
      {
        name: "Wizard Flow",
        rationale: "App requires setup before use",
        flowStructure: [
          { stepName: "welcome", type: "form", description: "Welcome screen" },
        ],
      },
      {
        name: "Guided Tour",
        rationale: "Interface is the product",
        flowStructure: [
          { stepName: "tour-start", type: "tour", description: "Tour intro" },
        ],
      },
    ],
  });

  // Per-option calls: componentCode response
  mockSendPrompt.mockResolvedValueOnce({
    componentCode: { welcome: "<WelcomeStep />" },
  });
  mockSendPrompt.mockResolvedValueOnce({
    componentCode: { "tour-start": "<TourStart />" },
  });

  return {
    sendPrompt: mockSendPrompt,
  };
});

describe("generator service", () => {
  it("generates onboarding options from app profile", async () => {
    const { generateOnboarding } = await import(
      "../../src/services/generator.js"
    );

    const appProfile = {
      name: "Test App",
      purpose: "A test app",
      features: ["dashboard", "settings"],
      setupRequirements: ["profile"],
      tourWorthyFeatures: ["dashboard"],
      existingAuth: false,
      stylingApproach: { framework: "tailwind", colors: {} },
      routerType: "app",
    };

    const result = await generateOnboarding(appProfile);

    expect(result.authCode.login).toBeDefined();
    expect(result.authCode.signup).toBeDefined();
    expect(result.options).toHaveLength(2);
    expect(result.options[0].name).toBe("Wizard Flow");
    expect(result.options[1].name).toBe("Guided Tour");
  });
});
