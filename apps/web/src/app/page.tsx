"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import DropZone from "@/components/drop-zone";
import AnalysisStatus from "@/components/analysis-status";
import { analyzeProject, generateOnboarding } from "@/lib/api";

type Status = "idle" | "reading" | "analyzing" | "generating" | "done" | "error";

export default function Home() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string>();

  async function handleFilesReady(
    files: Record<string, string>,
    dirHandle: FileSystemDirectoryHandle
  ) {
    try {
      setStatus("reading");
      setError(undefined);

      // Store dirHandle for later integration
      (window as any).__onboarderDirHandle = dirHandle;

      setStatus("analyzing");
      const { projectId, appProfile } = await analyzeProject(
        files,
        dirHandle.name
      );

      setStatus("generating");
      const { options } = await generateOnboarding(projectId);

      setStatus("done");

      // Store data for preview page
      sessionStorage.setItem(
        "onboarder_session",
        JSON.stringify({ projectId, appProfile, options })
      );

      router.push("/preview");
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
      </div>

      <DropZone
        onFilesReady={handleFilesReady}
        disabled={status !== "idle" && status !== "error"}
      />

      <AnalysisStatus status={status} error={error} />
    </main>
  );
}
