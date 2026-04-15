"use client";

import { getViewportWidth } from "./viewport-toggle";

type Viewport = "phone" | "tablet" | "desktop";

interface PreviewFrameProps {
  html: string;
  viewport: Viewport;
}

export default function PreviewFrame({ html, viewport }: PreviewFrameProps) {
  const width = getViewportWidth(viewport);

  return (
    <div className="flex justify-center bg-gray-100 rounded-xl p-4 min-h-[600px]">
      <iframe
        srcDoc={html}
        className="bg-white rounded-lg shadow-lg border-0"
        style={{
          width,
          maxWidth: "100%",
          height: "600px",
        }}
        sandbox="allow-scripts allow-forms"
        title="Onboarding Preview"
      />
    </div>
  );
}
