"use client";

import { useState } from "react";

interface DropZoneProps {
  onFilesReady: (
    files: Record<string, string>,
    dirHandle: FileSystemDirectoryHandle | null,
    projectName: string
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
      onFilesReady(files, dirHandle, dirHandle.name);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        console.error("Failed to read project:", err);
      }
    }
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;

    const items = e.dataTransfer.items;
    if (!items || items.length === 0) return;

    // Check if it's a zip file
    const firstItem = items[0];
    if (firstItem.kind === "file") {
      const file = firstItem.getAsFile();
      if (file && file.name.endsWith(".zip")) {
        try {
          const { readZipFile } = await import("@/lib/file-reader");
          const { files, name } = await readZipFile(file);
          onFilesReady(files, null, name);
        } catch (err) {
          console.error("Failed to read zip:", err);
        }
        return;
      }
    }

    // Try as a directory via File System Access API
    if ("getAsFileSystemHandle" in DataTransferItem.prototype) {
      try {
        const handle = await (firstItem as any).getAsFileSystemHandle();
        if (handle && handle.kind === "directory") {
          const { readProjectFiles } = await import("@/lib/file-reader");
          const files = await readProjectFiles(handle as FileSystemDirectoryHandle);
          onFilesReady(files, handle as FileSystemDirectoryHandle, handle.name);
          return;
        }
      } catch (err) {
        console.error("Failed to read dropped folder:", err);
      }
    }

    // Fallback: if it's a single zip file from the file list
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith(".zip")) {
      try {
        const { readZipFile } = await import("@/lib/file-reader");
        const { files, name } = await readZipFile(file);
        onFilesReady(files, null, name);
      } catch (err) {
        console.error("Failed to read zip:", err);
      }
      return;
    }

    // Nothing we can handle — fall back to folder picker
    handleClick();
  }

  return (
    <div
      onClick={handleClick}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") handleClick();
      }}
      className={`
        w-full max-w-2xl mx-auto p-16 rounded-2xl border-2 border-dashed
        transition-all cursor-pointer select-none
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
          Drag & drop a project folder or <span className="font-medium">.zip file</span>,
          or click to browse.
        </p>
      </div>
    </div>
  );
}
