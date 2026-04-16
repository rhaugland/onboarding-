"use client";

import { useState } from "react";
import StoryboardStrip from "./storyboard-strip";
import type { StoryboardOption } from "@/lib/api";

interface Props {
  options: StoryboardOption[];
  authMockup: { login: string; signup: string };
  appName: string;
  onPick: (optionId: string) => Promise<void>;
}

export default function StoryboardView({ options, authMockup, appName, onPick }: Props) {
  const [pickingId, setPickingId] = useState<string | null>(null);

  async function handlePick(optionId: string) {
    setPickingId(optionId);
    try {
      await onPick(optionId);
    } finally {
      setPickingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900">Pick a storyboard</h1>
        <p className="text-sm text-gray-500">For {appName}</p>
      </header>
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        {options.map((option) => (
          <StoryboardStrip
            key={option.id}
            option={option}
            authMockup={authMockup}
            onPick={() => handlePick(option.id)}
            picking={pickingId === option.id}
          />
        ))}
      </div>
    </div>
  );
}
