"use client";

import { useState } from "react";
import { postReaction, type Reaction } from "@/lib/api";

interface Props {
  projectId: string;
  optionId: string;
  reactions: Reaction[];
  onReactionChanged: () => void;
}

const NAME_KEY = "onboarder_commenter_name";

export default function ReactionBar({
  projectId,
  optionId,
  reactions,
  onReactionChanged,
}: Props) {
  const [submitting, setSubmitting] = useState(false);

  const optionReactions = reactions.filter((r) => r.optionId === optionId);
  const ups = optionReactions.filter((r) => r.type === "up");
  const downs = optionReactions.filter((r) => r.type === "down");

  const voterName =
    typeof window !== "undefined"
      ? localStorage.getItem(NAME_KEY) || ""
      : "";

  const myReaction = optionReactions.find((r) => r.voterName === voterName);

  async function handleVote(type: "up" | "down") {
    if (!voterName) {
      const name = prompt("Enter your name to vote:");
      if (!name?.trim()) return;
      localStorage.setItem(NAME_KEY, name.trim());
    }
    const currentName =
      localStorage.getItem(NAME_KEY) || "";
    if (!currentName) return;

    setSubmitting(true);
    try {
      await postReaction(projectId, optionId, currentName, type);
      onReactionChanged();
    } catch {
      // silent fail
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => handleVote("up")}
        disabled={submitting}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full border transition-colors ${
          myReaction?.type === "up"
            ? "bg-green-50 border-green-300 text-green-700"
            : "border-gray-200 text-gray-500 hover:bg-gray-50"
        }`}
      >
        <span>&#x1F44D;</span>
        {ups.length > 0 && <span>{ups.length}</span>}
      </button>
      <button
        type="button"
        onClick={() => handleVote("down")}
        disabled={submitting}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full border transition-colors ${
          myReaction?.type === "down"
            ? "bg-red-50 border-red-300 text-red-700"
            : "border-gray-200 text-gray-500 hover:bg-gray-50"
        }`}
      >
        <span>&#x1F44E;</span>
        {downs.length > 0 && <span>{downs.length}</span>}
      </button>
      {optionReactions.length > 0 && (
        <span className="text-xs text-gray-400">
          {[...new Set(optionReactions.map((r) => r.voterName))].join(", ")}
        </span>
      )}
    </div>
  );
}
