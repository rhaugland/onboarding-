"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import CustomizeScreenCard from "@/components/customize-screen-card";
import StoryboardFullscreen from "@/components/storyboard-fullscreen";
import {
  getCustomizeDraft,
  updateCustomizeSkips,
  regenerateCustomizeScreen,
  swapCustomizeScreen,
  finalizeCustomizeDraft,
  buildOption,
  type CustomizeDraft,
  type StoryboardOption,
  type OnboardingOption,
} from "@/lib/api";

interface Props {
  draftId: string;
}

export default function CustomizeView({ draftId }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState<CustomizeDraft | null>(null);
  const [siblings, setSiblings] = useState<StoryboardOption[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [hasEdited, setHasEdited] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getCustomizeDraft(draftId)
      .then((res) => {
        if (cancelled) return;
        setDraft(res.draft);
        setSiblings(res.siblings.filter((s) => s.id !== res.draft.baseOptionId && s.id !== res.draft.id));
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Failed to load draft");
      });
    return () => {
      cancelled = true;
    };
  }, [draftId]);

  const isDirty = useMemo(() => {
    if (!draft) return false;
    return (
      hasEdited ||
      (draft.skippedSteps?.length ?? 0) > 0 ||
      (draft.customizeHistory?.length ?? 0) > 0
    );
  }, [draft, hasEdited]);

  async function handleToggleSkip(stepName: string, skipped: boolean) {
    if (!draft) return;
    const next = skipped
      ? [...draft.skippedSteps, stepName]
      : draft.skippedSteps.filter((s) => s !== stepName);
    setDraft({ ...draft, skippedSteps: next });
    try {
      await updateCustomizeSkips(draftId, next);
    } catch (err) {
      // Revert on failure
      setDraft({ ...draft });
    }
  }

  async function handleRegenerate(stepName: string, prompt: string) {
    if (!draft) return;
    const result = await regenerateCustomizeScreen(draftId, stepName, prompt);
    setHasEdited(true);
    setDraft({
      ...draft,
      mockupCode: { ...draft.mockupCode, [stepName]: result.mockupCode },
    });
  }

  async function handleSwap(stepName: string, sourceOptionId: string) {
    if (!draft) return;
    const result = await swapCustomizeScreen(draftId, stepName, sourceOptionId);
    setHasEdited(true);
    setDraft({
      ...draft,
      mockupCode: { ...draft.mockupCode, [stepName]: result.mockupCode },
    });
  }

  async function handleFinalize() {
    if (!draft) return;
    setFinalizing(true);
    setFinalizeError(null);
    try {
      const finalized = await finalizeCustomizeDraft(draftId);
      const built = await buildOption(finalized.projectId, finalized.id);

      // Push built option into sessionStorage so /preview can render it
      const stored = sessionStorage.getItem("onboarder_session");
      if (stored) {
        const session = JSON.parse(stored);
        const builtOption: OnboardingOption = {
          id: built.id,
          name: finalized.name,
          rationale: finalized.rationale,
          flowStructure: finalized.flowStructure,
          componentCode: built.componentCode,
          authCode: built.authCode,
        };
        sessionStorage.setItem(
          "onboarder_session",
          JSON.stringify({ ...session, builtOption })
        );
      }
      router.push("/preview");
    } catch (err) {
      setFinalizing(false);
      setFinalizeError(err instanceof Error ? err.message : "Finalize failed");
    }
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-700">
        <div className="max-w-md text-center space-y-3">
          <p>{loadError}</p>
          <button
            type="button"
            onClick={() => router.push("/preview")}
            className="underline text-sm"
          >
            Back to storyboards
          </button>
        </div>
      </div>
    );
  }

  if (!draft) return null;

  const expandedPanelCode = expandedStep ? draft.mockupCode[expandedStep] : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <button
            type="button"
            onClick={() => router.push("/preview")}
            className="text-sm text-gray-500 hover:text-gray-900"
          >
            ← Back
          </button>
          <h1 className="text-xl font-bold text-gray-900 mt-1">{draft.name}</h1>
          <p className="text-sm text-gray-500">{draft.rationale}</p>
        </div>
        <div className="flex items-center gap-3">
          {finalizeError && (
            <span className="text-sm text-red-600">{finalizeError}</span>
          )}
          <button
            type="button"
            onClick={handleFinalize}
            disabled={finalizing || !isDirty}
            className="px-5 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50"
            title={isDirty ? "" : "Make at least one change first"}
          >
            {finalizing ? "Finalizing…" : "Finalize"}
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-6 space-y-5">
        {draft.flowStructure.map((step) => {
          const code = draft.mockupCode[step.stepName];
          if (!code) return null;
          return (
            <CustomizeScreenCard
              key={step.stepName}
              stepName={step.stepName}
              stepDescription={step.description}
              currentCode={code}
              skipped={draft.skippedSteps.includes(step.stepName)}
              siblings={siblings}
              onToggleSkip={(skipped) => handleToggleSkip(step.stepName, skipped)}
              onRegenerate={(prompt) => handleRegenerate(step.stepName, prompt)}
              onSwap={(sourceOptionId) => handleSwap(step.stepName, sourceOptionId)}
              onExpand={() => setExpandedStep(step.stepName)}
            />
          );
        })}
      </div>

      {expandedStep && expandedPanelCode && (
        <StoryboardFullscreen
          option={{
            id: draft.id,
            name: `${draft.name} — ${expandedStep}`,
            rationale: draft.rationale,
            flowStructure: [draft.flowStructure.find((s) => s.stepName === expandedStep)!],
            mockupCode: { [expandedStep]: expandedPanelCode },
          }}
          authMockup={{ login: "", signup: "" }}
          onClose={() => setExpandedStep(null)}
          showPickButton={false}
        />
      )}
    </div>
  );
}
