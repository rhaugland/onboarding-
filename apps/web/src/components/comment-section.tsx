"use client";

import { useState } from "react";
import { postComment, type Comment } from "@/lib/api";

interface Props {
  projectId: string;
  optionId: string;
  comments: Comment[];
  onCommentAdded: (comment: Comment) => void;
}

const NAME_KEY = "onboarder_commenter_name";

export default function CommentSection({
  projectId,
  optionId,
  comments,
  onCommentAdded,
}: Props) {
  const [name, setName] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(NAME_KEY) || "";
  });
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const optionComments = comments.filter((c) => c.optionId === optionId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !content.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      localStorage.setItem(NAME_KEY, name.trim());
      const comment = await postComment(projectId, optionId, name.trim(), content.trim());
      onCommentAdded(comment);
      setContent("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post comment");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-4 pt-4 border-t border-gray-200">
      {optionComments.length > 0 && (
        <div className="space-y-3 mb-4">
          {optionComments.map((c) => (
            <div key={c.id} className="bg-gray-50 rounded-lg px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-gray-900">
                  {c.authorName}
                </span>
                <span className="text-xs text-gray-400">
                  {new Date(c.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {c.content}
              </p>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2 items-start">
        <input
          type="text"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-28 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <input
          type="text"
          placeholder="Add a note..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <button
          type="submit"
          disabled={submitting || !name.trim() || !content.trim()}
          className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-40"
        >
          {submitting ? "..." : "Post"}
        </button>
      </form>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
