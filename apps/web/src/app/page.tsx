"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import DropZone from "@/components/drop-zone";
import AnalysisStatus from "@/components/analysis-status";
import { analyzeProject, generateStoryboard, getDemoProject } from "@/lib/api";

type Status = "idle" | "reading" | "analyzing" | "storyboarding" | "done" | "error";

interface SavedProject {
  projectId: string;
  name: string;
  date: string;
}

const HISTORY_KEY = "onboarder_projects";

function loadHistory(): SavedProject[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveToHistory(projectId: string, name: string) {
  const history = loadHistory().filter((p) => p.projectId !== projectId);
  history.unshift({ projectId, name, date: new Date().toISOString() });
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 20)));
}

export default function Home() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string>();
  const [history, setHistory] = useState<SavedProject[]>([]);
  const [hasDemo, setHasDemo] = useState(false);
  const [loadingDemo, setLoadingDemo] = useState(false);

  useEffect(() => {
    setHistory(loadHistory());
    getDemoProject()
      .then(() => setHasDemo(true))
      .catch(() => {});
  }, []);

  async function handleDemo() {
    setLoadingDemo(true);
    try {
      const { projectId } = await getDemoProject();
      router.push(`/preview/${projectId}`);
    } catch {
      setLoadingDemo(false);
    }
  }

  async function handleFilesReady(
    files: Record<string, string>,
    dirHandle: FileSystemDirectoryHandle | null,
    projectName: string
  ) {
    try {
      setStatus("reading");
      setError(undefined);

      // Store dirHandle for later integration (null for zip uploads)
      if (dirHandle) {
        (window as unknown as Record<string, unknown>).__onboarderDirHandle = dirHandle;
      }

      const fileCount = Object.keys(files).length;
      const payloadSize = JSON.stringify(files).length;
      console.log(`[onboarder] ${fileCount} files, ~${(payloadSize / 1024).toFixed(0)}KB payload`);

      setStatus("analyzing");
      const { projectId } = await analyzeProject(files, projectName);

      setStatus("storyboarding");
      await generateStoryboard(projectId);

      setStatus("done");
      saveToHistory(projectId, projectName);
      router.push(`/preview/${projectId}`);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900">Onboarder</h1>
        <p className="text-lg text-gray-500 mt-2">
          AI-powered onboarding for your Next.js apps
        </p>
        {hasDemo && status === "idle" && (
          <button
            onClick={handleDemo}
            disabled={loadingDemo}
            className="mt-4 px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50"
          >
            {loadingDemo ? "Loading demo..." : "Try a demo"}
          </button>
        )}
      </div>

      <DropZone
        onFilesReady={handleFilesReady}
        disabled={status !== "idle" && status !== "error"}
      />

      <AnalysisStatus status={status} error={error} />

      {history.length > 0 && status === "idle" && (
        <div className="mt-12 w-full max-w-md">
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
            Recent Projects
          </h2>
          <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
            {history.map((p) => (
              <button
                key={p.projectId}
                onClick={() => router.push(`/preview/${p.projectId}`)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 text-left"
              >
                <div>
                  <span className="text-sm font-medium text-gray-900">
                    {p.name}
                  </span>
                  <span className="text-xs text-gray-400 ml-2">
                    {new Date(p.date).toLocaleDateString()}
                  </span>
                </div>
                <span className="text-gray-400 text-sm">→</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
