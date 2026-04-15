const IGNORE_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  ".turbo",
  "coverage",
  ".vercel",
]);

const IGNORE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".mp4",
  ".webm",
  ".mp3",
  ".pdf",
  ".zip",
]);

const INCLUDE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".json",
  ".css",
  ".mjs",
  ".cjs",
]);

export async function pickProjectFolder(): Promise<FileSystemDirectoryHandle> {
  return await window.showDirectoryPicker({ mode: "readwrite" });
}

export async function readProjectFiles(
  dirHandle: FileSystemDirectoryHandle,
  basePath: string = ""
): Promise<Record<string, string>> {
  const files: Record<string, string> = {};

  for await (const [name, handle] of dirHandle.entries()) {
    const path = basePath ? `${basePath}/${name}` : name;

    if (handle.kind === "directory") {
      if (IGNORE_DIRS.has(name)) continue;
      const subFiles = await readProjectFiles(
        handle as FileSystemDirectoryHandle,
        path
      );
      Object.assign(files, subFiles);
    } else {
      const ext = name.substring(name.lastIndexOf("."));
      if (IGNORE_EXTENSIONS.has(ext)) continue;
      if (!INCLUDE_EXTENSIONS.has(ext) && name !== "package.json") continue;

      try {
        const file = await (handle as FileSystemFileHandle).getFile();
        const text = await file.text();
        if (text.length <= 50000) {
          files[path] = text;
        }
      } catch {
        // Skip files that can't be read
      }
    }
  }

  return files;
}

export async function writeProjectFiles(
  dirHandle: FileSystemDirectoryHandle,
  files: Array<{ path: string; content: string }>
): Promise<void> {
  for (const file of files) {
    const parts = file.path.split("/");
    let currentDir = dirHandle;

    for (const dir of parts.slice(0, -1)) {
      currentDir = await currentDir.getDirectoryHandle(dir, { create: true });
    }

    const fileName = parts[parts.length - 1];
    const fileHandle = await currentDir.getFileHandle(fileName, {
      create: true,
    });
    const writable = await fileHandle.createWritable();
    await writable.write(file.content);
    await writable.close();
  }
}
