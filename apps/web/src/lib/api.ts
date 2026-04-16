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

export interface StoryboardOption {
  id: string;
  name: string;
  rationale: string;
  flowStructure: Array<{
    stepName: string;
    type: "form" | "tour" | "tooltip" | "checklist" | "contextual";
    description: string;
  }>;
  mockupCode: Record<string, string>;
}

export interface StoryboardResponse {
  options: StoryboardOption[];
  authMockup: { login: string; signup: string };
}

export interface BuildResponse {
  id: string;
  componentCode: Record<string, string>;
  authCode: { login: string; signup: string };
}

export const generateStoryboard = (projectId: string) =>
  request<StoryboardResponse>("/api/storyboard", {
    method: "POST",
    body: JSON.stringify({ projectId }),
  });

export const buildOption = (projectId: string, optionId: string) =>
  request<BuildResponse>("/api/build", {
    method: "POST",
    body: JSON.stringify({ projectId, optionId }),
  });

export interface CustomizeDraft {
  id: string;
  projectId: string;
  name: string;
  rationale: string;
  flowStructure: Array<{
    stepName: string;
    type: "form" | "tour" | "tooltip" | "checklist" | "contextual";
    description: string;
  }>;
  mockupCode: Record<string, string>;
  status: "storyboard" | "customizing" | "ready" | "built";
  baseOptionId: string | null;
  skippedSteps: string[];
  customizeHistory: Array<Record<string, unknown>>;
}

export interface CustomizeGetResponse {
  draft: CustomizeDraft;
  siblings: StoryboardOption[];
}

export const createCustomizeDraft = (baseOptionId: string) =>
  request<CustomizeDraft>("/api/customize", {
    method: "POST",
    body: JSON.stringify({ baseOptionId }),
  });

export const getCustomizeDraft = (id: string) =>
  request<CustomizeGetResponse>(`/api/customize/${id}`);

export const updateCustomizeSkips = (id: string, skippedSteps: string[]) =>
  request<{ ok: true }>(`/api/customize/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ skippedSteps }),
  });

export const regenerateCustomizeScreen = (
  id: string,
  stepName: string,
  prompt: string
) =>
  request<{ ok: true; mockupCode: string }>(
    `/api/customize/${id}/screens/${encodeURIComponent(stepName)}/regenerate`,
    {
      method: "POST",
      body: JSON.stringify({ prompt }),
    }
  );

export const swapCustomizeScreen = (
  id: string,
  stepName: string,
  sourceOptionId: string
) =>
  request<{ ok: true; mockupCode: string }>(
    `/api/customize/${id}/screens/${encodeURIComponent(stepName)}/swap`,
    {
      method: "POST",
      body: JSON.stringify({ sourceOptionId }),
    }
  );

export const finalizeCustomizeDraft = (id: string) =>
  request<CustomizeDraft>(`/api/customize/${id}/finalize`, {
    method: "POST",
  });
