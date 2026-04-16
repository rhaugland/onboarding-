"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import OptionCard from "@/components/option-card";
import PreviewFrame from "@/components/preview-frame";
import ViewportToggle from "@/components/viewport-toggle";
import FlowBreakdown from "@/components/flow-breakdown";
import { buildPreviewHtml } from "@/lib/preview-bundler";

type Viewport = "phone" | "tablet" | "desktop";

interface FlowStep {
  stepName: string;
  type: string;
  description: string;
}

interface OnboardingOption {
  id: string;
  name: string;
  rationale: string;
  flowStructure: FlowStep[];
  componentCode: Record<string, string>;
  authCode: {
    login: string;
    signup: string;
  };
}

interface SessionData {
  projectId: string;
  options: OnboardingOption[];
}

export default function PreviewPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionData | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [viewport, setViewport] = useState<Viewport>("desktop");

  useEffect(() => {
    const stored = sessionStorage.getItem("onboarder_session");
    if (!stored) {
      router.push("/");
      return;
    }
    setSession(JSON.parse(stored));
  }, [router]);

  const previewHtmls = useMemo(() => {
    if (!session) return [];
    return session.options.map((option) => buildPreviewHtml(option));
  }, [session]);

  if (!session) return null;

  const selectedOption = session.options[selectedIndex];

  function handleChoose() {
    sessionStorage.setItem(
      "onboarder_chosen",
      JSON.stringify({
        projectId: session!.projectId,
        optionId: selectedOption.id,
      })
    );
    router.push("/integrate");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Onboarder</h1>
          <p className="text-sm text-gray-500">Compare onboarding options</p>
        </div>
        <div className="flex items-center gap-4">
          <ViewportToggle viewport={viewport} onChange={setViewport} />
          <button
            onClick={handleChoose}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            Use "{selectedOption.name}"
          </button>
        </div>
      </header>

      <div className="flex h-[calc(100vh-73px)]">
        {/* Side panel */}
        <aside className="w-80 bg-white border-r p-4 space-y-3 overflow-y-auto">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Options
          </h2>
          {session.options.map((option, i) => (
            <OptionCard
              key={option.id}
              option={option}
              isSelected={i === selectedIndex}
              onSelect={() => setSelectedIndex(i)}
            />
          ))}

          <div className="pt-4 border-t">
            <FlowBreakdown steps={selectedOption.flowStructure} />
          </div>
        </aside>

        {/* Main preview */}
        <main className="flex-1 p-6 overflow-y-auto">
          <PreviewFrame
            html={previewHtmls[selectedIndex]}
            viewport={viewport}
          />
        </main>
      </div>
    </div>
  );
}
