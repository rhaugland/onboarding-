"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import OptionCard from "@/components/option-card";
import PreviewFrame from "@/components/preview-frame";
import ViewportToggle from "@/components/viewport-toggle";
import FlowBreakdown from "@/components/flow-breakdown";
import StoryboardView from "@/components/storyboard-view";
import { buildPreviewHtml } from "@/lib/preview-bundler";
import {
  getProject,
  getComments,
  getReactions,
  buildOption,
  createCustomizeDraft,
  type ProjectResponse,
  type OnboardingOption,
  type Comment,
  type Reaction,
} from "@/lib/api";

type Viewport = "phone" | "tablet" | "desktop";

interface Props {
  projectId: string;
}

export default function PreviewView({ projectId }: Props) {
  const router = useRouter();
  const [data, setData] = useState<ProjectResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [buildError, setBuildError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);

  function handleShare() {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  useEffect(() => {
    let cancelled = false;
    getProject(projectId)
      .then((res) => {
        if (!cancelled) {
          setData(res);
          // Save to localStorage history so it appears on the home page
          try {
            const HISTORY_KEY = "onboarder_projects";
            const history: Array<{ projectId: string; name: string; date: string }> = JSON.parse(
              localStorage.getItem(HISTORY_KEY) || "[]"
            );
            const filtered = history.filter((p) => p.projectId !== projectId);
            filtered.unshift({
              projectId,
              name: res.project.name,
              date: new Date().toISOString(),
            });
            localStorage.setItem(HISTORY_KEY, JSON.stringify(filtered.slice(0, 20)));
          } catch {}
        }
      })
      .catch((err) => {
        if (!cancelled)
          setLoadError(err instanceof Error ? err.message : "Failed to load project");
      });
    getComments(projectId)
      .then((res) => {
        if (!cancelled) setComments(res.comments);
      })
      .catch(() => {});
    getReactions(projectId)
      .then((res) => {
        if (!cancelled) setReactions(res.reactions);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  function handleCommentAdded(comment: Comment) {
    setComments((prev) => [...prev, comment]);
  }

  function refreshReactions() {
    getReactions(projectId)
      .then((res) => setReactions(res.reactions))
      .catch(() => {});
  }

  const mode = data?.builtOption ? "full" : "storyboard";

  const previewHtml = useMemo(() => {
    if (!data?.builtOption) return "";
    const built: OnboardingOption = {
      id: data.builtOption.id,
      name: data.builtOption.name,
      rationale: data.builtOption.rationale,
      flowStructure: data.builtOption.flowStructure,
      componentCode: data.builtOption.componentCode,
      authCode: data.builtOption.authCode,
    };
    return buildPreviewHtml(built);
  }, [data]);

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-700">
        <p>{loadError}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-gray-600">Loading project...</span>
        </div>
      </div>
    );
  }

  async function handlePick(optionId: string) {
    setBuildError(null);
    try {
      await buildOption(projectId, optionId);
      const refreshed = await getProject(projectId);
      setData(refreshed);
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
    setData({ ...data!, builtOption: null });
  }

  function handleIntegrate() {
    router.push(`/integrate/${projectId}`);
  }

  const shareButton = (
    <button
      onClick={handleShare}
      className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"
    >
      {copied ? "Link copied!" : "Share"}
    </button>
  );

  if (mode === "storyboard") {
    return (
      <>
        {buildError && (
          <div className="bg-red-50 border-b border-red-200 text-red-800 text-sm px-6 py-3">
            Build failed: {buildError}
          </div>
        )}
        <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {data.project.isDemo && (
              <span className="px-2.5 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
                Demo Project
              </span>
            )}
          </div>
          {shareButton}
        </div>
        <StoryboardView
          projectId={projectId}
          options={data.options}
          authMockup={data.project.authMockup}
          appName={(data.project.appProfile as { name: string }).name}
          onPick={handlePick}
          onCustomize={handleCustomize}
          comments={comments}
          onCommentAdded={handleCommentAdded}
          reactions={reactions}
          onReactionChanged={refreshReactions}
        />
      </>
    );
  }

  const built = data.builtOption!;
  const builtAsOption: OnboardingOption = {
    id: built.id,
    name: built.name,
    rationale: built.rationale,
    flowStructure: built.flowStructure,
    componentCode: built.componentCode,
    authCode: built.authCode,
  };

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
          {shareButton}
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
          <OptionCard option={builtAsOption} isSelected={true} onSelect={() => {}} />
          <div className="pt-4 border-t">
            <FlowBreakdown steps={builtAsOption.flowStructure} />
          </div>
        </aside>

        <main className="flex-1 p-6 overflow-y-auto">
          <PreviewFrame html={previewHtml} viewport={viewport} />
        </main>
      </div>
    </div>
  );
}
