import { describe, it, expect, vi } from "vitest";

vi.mock("../../src/services/claude.js", () => ({
  sendPrompt: vi.fn().mockResolvedValue({
    files: [
      {
        path: "src/app/auth/login/page.tsx",
        content: "<LoginPage />",
        action: "create",
      },
      {
        path: "src/app/auth/signup/page.tsx",
        content: "<SignupPage />",
        action: "create",
      },
    ],
    commands: ["npm install bcrypt", "npx drizzle-kit push"],
    envVars: ["SESSION_SECRET=a secure random string for cookie signing"],
  }),
}));

describe("integrator service", () => {
  it("generates integration files from option and profile", async () => {
    const { generateIntegration } = await import(
      "../../src/services/integrator.js"
    );

    const option = {
      name: "Wizard",
      componentCode: { welcome: "<Welcome />" },
      authCode: { login: "<Login />", signup: "<Signup />" },
    };

    const appProfile = {
      name: "Test App",
      routerType: "app",
      stylingApproach: { framework: "tailwind" },
    };

    const codebaseSnippets = {
      "src/app/layout.tsx": "<html><body>{children}</body></html>",
    };

    const result = await generateIntegration(
      option,
      appProfile,
      codebaseSnippets
    );

    expect(result.files).toHaveLength(2);
    expect(result.files[0].action).toBe("create");
    expect(result.commands).toContain("npm install bcrypt");
    expect(result.envVars).toHaveLength(1);
  });
});
