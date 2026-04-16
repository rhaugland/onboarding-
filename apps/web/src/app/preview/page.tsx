"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import OptionCard from "@/components/option-card";
import PreviewFrame from "@/components/preview-frame";
import ViewportToggle from "@/components/viewport-toggle";
import FlowBreakdown from "@/components/flow-breakdown";
import StoryboardView from "@/components/storyboard-view";
import { buildPreviewHtml } from "@/lib/preview-bundler";
import { buildOption, createCustomizeDraft, StoryboardOption, OnboardingOption } from "@/lib/api";

type Viewport = "phone" | "tablet" | "desktop";
type Mode = "storyboard" | "full";

interface SessionData {
  projectId: string;
  appProfile: { name: string };
  storyboardOptions: StoryboardOption[];
  authMockup: { login: string; signup: string };
  builtOption?: OnboardingOption;
  fromZip?: boolean;
}

export default function PreviewPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionData | null>(null);
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [buildError, setBuildError] = useState<string | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("onboarder_session");
    if (!stored) {
      router.push("/");
      return;
    }
    setSession(JSON.parse(stored));
  }, [router]);

  const mode: Mode = session?.builtOption ? "full" : "storyboard";

  const previewHtml = useMemo(() => {
    if (!session?.builtOption) return "";
    return buildPreviewHtml(session.builtOption);
  }, [session]);

  if (!session) return null;

  async function handlePick(optionId: string) {
    setBuildError(null);
    try {
      const result = await buildOption(session!.projectId, optionId);
      const pickedMeta = session!.storyboardOptions.find((o) => o.id === optionId);
      if (!pickedMeta) throw new Error("Picked option missing from session");
      const builtOption: OnboardingOption = {
        id: result.id,
        name: pickedMeta.name,
        rationale: pickedMeta.rationale,
        flowStructure: pickedMeta.flowStructure,
        componentCode: result.componentCode,
        authCode: result.authCode,
      };
      const updated = { ...session!, builtOption };
      sessionStorage.setItem("onboarder_session", JSON.stringify(updated));
      setSession(updated);
    } catch (err) {
      setBuildError(err instanceof Error ? err.message : "Build failed");
    }
  }

  async function handleCustomize(optionId: string) {
    setBuildError(null);
    try {
      const draft = await createCustomizeDraft(optionId);
      router.push(`/customize/${draft.id}`);
    } catch (err) {
      setBuildError(err instanceof Error ? err.message : "Customize failed");
    }
  }

  function handleBackToStoryboards() {
    const updated = { ...session! };
    delete updated.builtOption;
    sessionStorage.setItem("onboarder_session", JSON.stringify(updated));
    setSession(updated);
  }

  function handleIntegrate() {
    if (!session!.builtOption) return;
    sessionStorage.setItem(
      "onboarder_chosen",
      JSON.stringify({
        projectId: session!.projectId,
        optionId: session!.builtOption.id,
      })
    );
    router.push("/integrate");
  }

  if (mode === "storyboard") {
    return (
      <>
        {buildError && (
          <div className="bg-red-50 border-b border-red-200 text-red-800 text-sm px-6 py-3">
            Build failed: {buildError}
          </div>
        )}
        <StoryboardView
          options={session.storyboardOptions}
          authMockup={session.authMockup}
          appName={session.appProfile.name}
          onPick={handlePick}
          onCustomize={handleCustomize}
        />
      </>
    );
  }

  const built = session.builtOption!;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Onboarder</h1>
          <p className="text-sm text-gray-500">Built: {built.name}</p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={handleBackToStoryboards}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
          >
            ← Back to storyboards
          </button>
          <ViewportToggle viewport={viewport} onChange={setViewport} />
          <button
            onClick={handleIntegrate}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            Use this flow
          </button>
        </div>
      </header>

      <div className="flex h-[calc(100vh-73px)]">
        <aside className="w-80 bg-white border-r p-4 space-y-3 overflow-y-auto">
          <OptionCard option={built} isSelected={true} onSelect={() => {}} />
          <div className="pt-4 border-t">
            <FlowBreakdown steps={built.flowStructure} />
          </div>
        </aside>

        <main className="flex-1 p-6 overflow-y-auto">
          <PreviewFrame html={previewHtml} viewport={viewport} />
        </main>
      </div>
    </div>
  );
}
