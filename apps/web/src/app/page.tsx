"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import DropZone from "@/components/drop-zone";
import AnalysisStatus from "@/components/analysis-status";
import { analyzeProject, generateStoryboard } from "@/lib/api";

type Status = "idle" | "reading" | "analyzing" | "storyboarding" | "done" | "error";

export default function Home() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string>();

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
      const { projectId, appProfile } = await analyzeProject(
        files,
        projectName
      );

      setStatus("storyboarding");
      const { options, authMockup } = await generateStoryboard(projectId);

      setStatus("done");

      // Store data for preview page
      sessionStorage.setItem(
        "onboarder_session",
        JSON.stringify({
          projectId,
          appProfile,
          storyboardOptions: options,
          authMockup,
          fromZip: !dirHandle,
        })
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
