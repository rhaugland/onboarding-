"use client";

import { useState } from "react";
import StoryboardStrip from "./storyboard-strip";
import CommentSection from "./comment-section";
import ReactionBar from "./reaction-bar";
import type { StoryboardOption, Comment, Reaction } from "@/lib/api";

interface Props {
  projectId: string;
  options: StoryboardOption[];
  authMockup: { login: string; signup: string };
  appName: string;
  onPick: (optionId: string) => Promise<void>;
  onCustomize: (optionId: string) => Promise<void>;
  comments: Comment[];
  onCommentAdded: (comment: Comment) => void;
  reactions: Reaction[];
  onReactionChanged: () => void;
}

export default function StoryboardView({ projectId, options, authMockup, appName, onPick, onCustomize, comments, onCommentAdded, reactions, onReactionChanged }: Props) {
  const [pickingId, setPickingId] = useState<string | null>(null);
  const [customizingId, setCustomizingId] = useState<string | null>(null);

  async function handlePick(optionId: string) {
    setPickingId(optionId);
    try {
      await onPick(optionId);
    } finally {
      setPickingId(null);
    }
  }

  async function handleCustomize(optionId: string) {
    setCustomizingId(optionId);
    try { await onCustomize(optionId); } finally { setCustomizingId(null); }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900">Pick a storyboard</h1>
        <p className="text-sm text-gray-500">For {appName}</p>
      </header>
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        {options.map((option) => (
          <div key={option.id}>
            <StoryboardStrip
              option={option}
              authMockup={authMockup}
              onPick={() => handlePick(option.id)}
              onCustomize={() => handleCustomize(option.id)}
              picking={pickingId === option.id}
              customizing={customizingId === option.id}
            />
            <div className="bg-white rounded-b-xl border border-t-0 border-gray-200 px-5 pb-5">
              <div className="pt-4">
                <ReactionBar
                  projectId={projectId}
                  optionId={option.id}
                  reactions={reactions}
                  onReactionChanged={onReactionChanged}
                />
              </div>
              <CommentSection
                projectId={projectId}
                optionId={option.id}
                comments={comments}
                onCommentAdded={onCommentAdded}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
