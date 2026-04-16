"use client";

interface AnalysisStatusProps {
  status: "idle" | "reading" | "analyzing" | "storyboarding" | "done" | "error";
  error?: string;
}

const STATUS_MESSAGES: Record<string, string> = {
  idle: "Ready",
  reading: "Reading project files...",
  analyzing: "Analyzing project structure with AI...",
  storyboarding: "Generating storyboards...",
  done: "Done!",
  error: "Something went wrong",
};

export default function AnalysisStatus({ status, error }: AnalysisStatusProps) {
  if (status === "idle") return null;

  const isLoading = ["reading", "analyzing", "storyboarding"].includes(status);

  return (
    <div className="w-full max-w-2xl mx-auto mt-8 p-6 bg-white rounded-xl shadow-sm">
      <div className="flex items-center gap-3">
        {isLoading && (
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        )}
        {status === "done" && <span className="text-green-500 text-xl">&#10003;</span>}
        {status === "error" && <span className="text-red-500 text-xl">&#10007;</span>}
        <span
          className={`text-lg ${
            status === "error" ? "text-red-600" : "text-gray-700"
          }`}
        >
          {STATUS_MESSAGES[status]}
        </span>
      </div>
      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
    </div>
  );
}
