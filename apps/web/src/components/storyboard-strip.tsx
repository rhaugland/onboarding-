"use client";

import { useMemo, useState } from "react";
import { buildStoryboardStripHtml } from "@/lib/storyboard-bundler";
import StoryboardFullscreen from "./storyboard-fullscreen";
import StepThroughPreview from "./step-through-preview";
import type { StoryboardOption } from "@/lib/api";

interface Props {
  option: StoryboardOption;
  authMockup: { login: string; signup: string };
  onPick: () => void;
  onCustomize: () => void;
  picking: boolean;
  customizing: boolean;
}

export default function StoryboardStrip({ option, authMockup, onPick, onCustomize, picking, customizing }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [isTrying, setIsTrying] = useState(false);

  const html = useMemo(
    () =>
      buildStoryboardStripHtml({
        name: option.name,
        flowStructure: option.flowStructure,
        mockupCode: option.mockupCode,
        authMockup,
      }),
    [option, authMockup]
  );

  return (
    <>
      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <header className="flex items-start justify-between p-5 border-b border-gray-100">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{option.name}</h3>
            <p className="text-sm text-gray-500 mt-1 max-w-2xl">{option.rationale}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsTrying(true)}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Try it
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              aria-label={`Expand ${option.name} to fullscreen`}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Expand
            </button>
            <button
              type="button"
              onClick={onCustomize}
              disabled={customizing}
              aria-label={`Customize ${option.name}`}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              {customizing ? "Opening…" : "Customize"}
            </button>
            <button
              type="button"
              onClick={onPick}
              disabled={picking}
              className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 disabled:opacity-50"
            >
              {picking ? "Building…" : "Pick this flow"}
            </button>
          </div>
        </header>

        <div
          className="relative group cursor-zoom-in"
          onClick={() => setIsOpen(true)}
          role="button"
          tabIndex={0}
          aria-label={`Expand ${option.name} to fullscreen`}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setIsOpen(true);
            }
          }}
        >
          <iframe
            srcDoc={html}
            className="w-full h-[340px] border-0 block pointer-events-none"
            sandbox="allow-scripts"
            title={`${option.name} storyboard`}
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors pointer-events-none">
            <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white text-gray-900 text-sm font-medium px-3 py-1.5 rounded-lg shadow-lg flex items-center gap-1.5">
              <span aria-hidden="true">⤢</span>
              <span>Click to expand</span>
            </div>
          </div>
        </div>
      </section>

      {isOpen && (
        <StoryboardFullscreen
          option={option}
          authMockup={authMockup}
          onClose={() => setIsOpen(false)}
          onPick={onPick}
          picking={picking}
        />
      )}

      {isTrying && (
        <StepThroughPreview
          option={option}
          authMockup={authMockup}
          onClose={() => setIsTrying(false)}
        />
      )}
    </>
  );
}
