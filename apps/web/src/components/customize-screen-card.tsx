"use client";

import { useMemo, useState } from "react";
import { buildSingleScreenHtml } from "@/lib/single-screen-bundler";

type Status = "ready" | "regenerating" | "failed" | "swapped";

interface SiblingOption {
  id: string;
  name: string;
  mockupCode: Record<string, string>;
}

interface Props {
  stepName: string;
  stepDescription: string;
  currentCode: string;
  skipped: boolean;
  siblings: SiblingOption[];
  onToggleSkip: (skipped: boolean) => void;
  onRegenerate: (prompt: string) => Promise<void>;
  onSwap: (sourceOptionId: string) => Promise<void>;
  onExpand: () => void;
}

export default function CustomizeScreenCard({
  stepName,
  stepDescription,
  currentCode,
  skipped,
  siblings,
  onToggleSkip,
  onRegenerate,
  onSwap,
  onExpand,
}: Props) {
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<Status>("ready");
  const [swappedFrom, setSwappedFrom] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [iframeKey, setIframeKey] = useState(0);

  const html = useMemo(
    () => buildSingleScreenHtml(currentCode, stepName),
    [currentCode, stepName]
  );

  async function handleRegenerate() {
    const trimmed = prompt.trim();
    if (trimmed.length === 0) return;
    setStatus("regenerating");
    setErrorMsg(null);
    try {
      await onRegenerate(trimmed);
      setStatus("ready");
      setSwappedFrom(null);
      setPrompt("");
      setIframeKey((k) => k + 1);
    } catch (err) {
      setStatus("failed");
      setErrorMsg(err instanceof Error ? err.message : "Regeneration failed");
    }
  }

  async function handleSwap(sib: SiblingOption) {
    setStatus("regenerating");
    setErrorMsg(null);
    try {
      await onSwap(sib.id);
      setStatus("swapped");
      setSwappedFrom(sib.name);
      setIframeKey((k) => k + 1);
    } catch (err) {
      setStatus("failed");
      setErrorMsg(err instanceof Error ? err.message : "Swap failed");
    }
  }

  const regenerating = status === "regenerating";
  const disabled = prompt.trim().length === 0 || regenerating;

  return (
    <section
      className={`bg-white rounded-xl border border-gray-200 p-5 space-y-4 transition-opacity ${
        skipped ? "opacity-40" : ""
      }`}
    >
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold text-gray-900">{stepName}</h3>
          <label className="flex items-center gap-1.5 text-sm text-gray-500">
            <input
              type="checkbox"
              checked={skipped}
              onChange={(e) => onToggleSkip(e.target.checked)}
            />
            Skip this step
          </label>
        </div>
        <button
          type="button"
          onClick={onExpand}
          aria-label={`Expand ${stepName} to fullscreen`}
          className="px-3 py-1.5 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          <span aria-hidden="true">⤢</span> Expand
        </button>
      </header>

      <div className="rounded-lg overflow-hidden border border-gray-200 bg-white">
        <iframe
          key={iframeKey}
          srcDoc={html}
          className="w-full h-[320px] border-0 block"
          sandbox="allow-scripts"
          title={`${stepName} mockup`}
        />
      </div>

      <div className="space-y-2">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe a change (e.g., make the CTA green and bolder)"
          className="w-full min-h-[72px] p-3 text-sm border border-gray-300 rounded-lg resize-y"
          disabled={regenerating || skipped}
        />
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={disabled || skipped}
            className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
          >
            {regenerating ? "Regenerating…" : "Regenerate"}
          </button>
          {siblings.length > 0 && !skipped && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-500">Swap from:</span>
              {siblings.map((sib) => {
                const hasStep = Boolean(sib.mockupCode[stepName]);
                return (
                  <button
                    key={sib.id}
                    type="button"
                    onClick={() => handleSwap(sib)}
                    disabled={!hasStep || regenerating}
                    className="px-3 py-1.5 text-xs text-gray-700 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    title={hasStep ? "" : "Source option has no matching step"}
                  >
                    {sib.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="text-xs">
        {status === "ready" && <span className="text-gray-500">Ready</span>}
        {status === "regenerating" && <span className="text-gray-500">Regenerating…</span>}
        {status === "swapped" && swappedFrom && (
          <span className="text-gray-600">Swapped from {swappedFrom}</span>
        )}
        {status === "failed" && (
          <span className="text-red-600">
            Failed — {errorMsg || "retry"}
            <button
              type="button"
              onClick={handleRegenerate}
              className="ml-2 underline"
            >
              Retry
            </button>
          </span>
        )}
      </div>
    </section>
  );
}
