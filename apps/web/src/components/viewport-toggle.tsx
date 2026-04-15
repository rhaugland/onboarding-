"use client";

type Viewport = "phone" | "tablet" | "desktop";

interface ViewportToggleProps {
  viewport: Viewport;
  onChange: (viewport: Viewport) => void;
}

const VIEWPORTS: { key: Viewport; label: string; width: string }[] = [
  { key: "phone", label: "Phone", width: "375px" },
  { key: "tablet", label: "Tablet", width: "768px" },
  { key: "desktop", label: "Desktop", width: "100%" },
];

export default function ViewportToggle({
  viewport,
  onChange,
}: ViewportToggleProps) {
  return (
    <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
      {VIEWPORTS.map((v) => (
        <button
          key={v.key}
          onClick={() => onChange(v.key)}
          className={`
            px-3 py-1.5 text-sm rounded-md transition-all
            ${
              viewport === v.key
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }
          `}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}

export function getViewportWidth(viewport: Viewport): string {
  return VIEWPORTS.find((v) => v.key === viewport)?.width || "100%";
}
