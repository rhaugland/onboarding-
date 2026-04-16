"use client";

import { useMemo } from "react";
import { buildStoryboardStripHtml } from "@/lib/storyboard-bundler";
import type { StoryboardOption } from "@/lib/api";

interface Props {
  option: StoryboardOption;
  authMockup: { login: string; signup: string };
  onPick: () => void;
  picking: boolean;
}

export default function StoryboardStrip({ option, authMockup, onPick, picking }: Props) {
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
    <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <header className="flex items-start justify-between p-5 border-b border-gray-100">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{option.name}</h3>
          <p className="text-sm text-gray-500 mt-1 max-w-2xl">{option.rationale}</p>
        </div>
        <button
          onClick={onPick}
          disabled={picking}
          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50"
        >
          {picking ? "Building…" : "Pick this flow"}
        </button>
      </header>
      <iframe
        srcDoc={html}
        className="w-full h-[340px] border-0 block"
        sandbox="allow-scripts"
        title={`${option.name} storyboard`}
      />
    </section>
  );
}
