"use client";

import { useState } from "react";

interface DropZoneProps {
  onFilesReady: (
    files: Record<string, string>,
    dirHandle: FileSystemDirectoryHandle
  ) => void;
  disabled?: boolean;
}

export default function DropZone({ onFilesReady, disabled }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  async function handleClick() {
    if (disabled) return;

    try {
      const { pickProjectFolder, readProjectFiles } = await import(
        "@/lib/file-reader"
      );
      const dirHandle = await pickProjectFolder();
      const files = await readProjectFiles(dirHandle);
      onFilesReady(files, dirHandle);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        console.error("Failed to read project:", err);
      }
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        handleClick();
      }}
      className={`
        w-full max-w-2xl mx-auto p-16 rounded-2xl border-2 border-dashed
        transition-all cursor-pointer
        ${
          isDragging
            ? "border-blue-500 bg-blue-50"
            : "border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50"
        }
        ${disabled ? "opacity-50 cursor-not-allowed" : ""}
      `}
    >
      <div className="text-center space-y-4">
        <div className="text-5xl">&#128193;</div>
        <h2 className="text-xl font-semibold text-gray-700">
          Select a Next.js Project
        </h2>
        <p className="text-gray-500">
          Click to choose a project folder. We'll analyze it and generate
          onboarding options.
        </p>
      </div>
    </button>
  );
}
