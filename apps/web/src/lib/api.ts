async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    const text = await res.text();
    if (text) {
      try {
        const body = JSON.parse(text);
        message = body?.error || text;
      } catch {
        message = text;
      }
    }
    throw new Error(message);
  }

  return res.json();
}

export interface AppProfile {
  name: string;
  purpose: string;
  features: string[];
  setupRequirements: string[];
  tourWorthyFeatures: string[];
  existingAuth: boolean;
  stylingApproach: {
    framework: string;
    colors: Record<string, string>;
  };
  routerType: "app" | "pages";
}

export interface OnboardingOption {
  id: string;
  name: string;
  rationale: string;
  flowStructure: Array<{
    stepName: string;
    type: "form" | "tour" | "tooltip" | "checklist" | "contextual";
    description: string;
  }>;
  componentCode: Record<string, string>;
  authCode: {
    login: string;
    signup: string;
  };
}

export interface AnalyzeResponse {
  projectId: string;
  appProfile: AppProfile;
}

export interface GenerateResponse {
  options: OnboardingOption[];
}

export interface IntegrationFile {
  path: string;
  content: string;
  action: "create" | "modify";
  diff?: string;
}

export interface IntegrateResponse {
  files: IntegrationFile[];
  commands: string[];
  envVars: string[];
}

export const analyzeProject = (files: Record<string, string>, folderPath: string) =>
  request<AnalyzeResponse>("/api/analyze", {
    method: "POST",
    body: JSON.stringify({ files, folderPath }),
  });

export const generateOnboarding = (projectId: string) =>
  request<GenerateResponse>("/api/generate", {
    method: "POST",
    body: JSON.stringify({ projectId }),
  });

export const integrateOption = (projectId: string, optionId: string) =>
  request<IntegrateResponse>("/api/integrate", {
    method: "POST",
    body: JSON.stringify({ projectId, optionId }),
  });
