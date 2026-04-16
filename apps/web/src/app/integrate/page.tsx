"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import ChangesetViewer from "@/components/changeset-viewer";
import { integrateOption } from "@/lib/api";
import type { IntegrateResponse } from "@/lib/api";

export default function IntegratePage() {
  const router = useRouter();
  const [status, setStatus] = useState<
    "loading" | "review" | "writing" | "done" | "error"
  >("loading");
  const [changeset, setChangeset] = useState<IntegrateResponse | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const stored = sessionStorage.getItem("onboarder_chosen");
    if (!stored) {
      router.push("/");
      return;
    }

    const { projectId, optionId } = JSON.parse(stored);

    integrateOption(projectId, optionId)
      .then((result) => {
        setChangeset(result);
        setStatus("review");
      })
      .catch((err) => {
        setError(err.message);
        setStatus("error");
      });
  }, [router]);

  const fromZip = (() => {
    if (typeof window === "undefined") return false;
    const session = sessionStorage.getItem("onboarder_session");
    if (!session) return false;
    try { return JSON.parse(session).fromZip === true; } catch { return false; }
  })();

  async function handleConfirm() {
    if (!changeset) return;

    // If uploaded from zip, download as zip instead of writing to filesystem
    if (fromZip) {
      setStatus("writing");
      try {
        const JSZip = (await import("jszip")).default;
        const zip = new JSZip();
        for (const file of changeset.files) {
          zip.file(file.path, file.content);
        }
        const blob = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "onboarding-integration.zip";
        a.click();
        URL.revokeObjectURL(url);
        setStatus("done");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create zip");
        setStatus("error");
      }
      return;
    }

    // Otherwise write directly to filesystem
    const dirHandle = (window as unknown as Record<string, unknown>)
      .__onboarderDirHandle as FileSystemDirectoryHandle | undefined;
    if (!dirHandle) {
      setError(
        "Lost access to project folder. Please go back and re-select the project."
      );
      setStatus("error");
      return;
    }

    setStatus("writing");

    try {
      const { writeProjectFiles } = await import("@/lib/file-reader");
      await writeProjectFiles(
        dirHandle,
        changeset.files.map((f) => ({ path: f.path, content: f.content }))
      );
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to write files");
      setStatus("error");
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Onboarder</h1>
          <p className="text-sm text-gray-500">Review & integrate</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => router.push("/preview")}
            className="px-4 py-2 text-gray-600 border rounded-lg hover:bg-gray-50"
          >
            Back
          </button>
          {status === "review" && (
            <button
              onClick={handleConfirm}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              {fromZip ? "Download Integration Zip" : "Write Files to Project"}
            </button>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-8">
        {status === "loading" && (
          <div className="flex items-center gap-3 justify-center py-20">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-gray-600">
              Generating integration code...
            </span>
          </div>
        )}

        {status === "error" && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <p className="text-red-600">{error}</p>
            <button
              onClick={() => router.push("/")}
              className="mt-4 text-sm text-red-500 underline"
            >
              Start over
            </button>
          </div>
        )}

        {(status === "review" || status === "writing") && changeset && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              Review Changes
            </h2>
            <p className="text-gray-500 mb-8">
              These files will be added or modified in your project. Review them
              before confirming.
            </p>
            <ChangesetViewer
              files={changeset.files}
              commands={changeset.commands}
              envVars={changeset.envVars}
            />
            {status === "writing" && (
              <div className="mt-6 flex items-center gap-3 justify-center">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-gray-600">Writing files...</span>
              </div>
            )}
          </div>
        )}

        {status === "done" && changeset && (
          <div className="text-center py-20 space-y-4">
            <div className="text-6xl">&#10003;</div>
            <h2 className="text-3xl font-bold text-gray-900">
              Integration Complete
            </h2>
            <p className="text-gray-500 max-w-md mx-auto">
              Onboarding has been written to your project. Run the following
              commands to finish setup:
            </p>
            {changeset.commands.length > 0 && (
              <div className="bg-gray-900 rounded-lg p-4 max-w-lg mx-auto text-left">
                {changeset.commands.map((cmd, i) => (
                  <div key={i} className="font-mono text-sm text-green-400">
                    $ {cmd}
                  </div>
                ))}
              </div>
            )}
            {changeset.envVars.length > 0 && (
              <div className="mt-4">
                <p className="text-sm text-gray-500 mb-2">
                  Add these to your .env:
                </p>
                <div className="bg-gray-900 rounded-lg p-4 max-w-lg mx-auto text-left">
                  {changeset.envVars.map((v, i) => (
                    <div
                      key={i}
                      className="font-mono text-sm text-yellow-400"
                    >
                      {v}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <button
              onClick={() => {
                sessionStorage.clear();
                router.push("/");
              }}
              className="mt-6 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Start New Project
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
