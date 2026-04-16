"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { buildSingleScreenHtml } from "@/lib/single-screen-bundler";
import type { StoryboardOption } from "@/lib/api";

interface Props {
  option: StoryboardOption;
  authMockup: { login: string; signup: string };
  onClose: () => void;
  onPick: () => void;
  picking: boolean;
}

interface Panel {
  label: string;
  code: string;
}

export default function StoryboardFullscreen({
  option,
  authMockup,
  onClose,
  onPick,
  picking,
}: Props) {
  const panels = useMemo<Panel[]>(() => {
    const list: Panel[] = [];
    if (authMockup.login) list.push({ label: "Login", code: authMockup.login });
    if (authMockup.signup) list.push({ label: "Signup", code: authMockup.signup });
    for (const step of option.flowStructure) {
      const code = option.mockupCode[step.stepName];
      if (!code) {
        console.warn(
          `[StoryboardFullscreen] missing mockup for step "${step.stepName}" in option "${option.name}"`
        );
        continue;
      }
      list.push({ label: step.stepName, code });
    }
    return list;
  }, [option, authMockup]);

  const [currentIndex, setCurrentIndex] = useState(0);

  // Keyboard: arrows navigate, Esc closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowRight") {
        setCurrentIndex((i) => Math.min(panels.length - 1, i + 1));
      } else if (e.key === "ArrowLeft") {
        setCurrentIndex((i) => Math.max(0, i - 1));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, panels.length]);

  // Prevent body scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const current = panels[currentIndex];
  const html = useMemo(
    () => (current ? buildSingleScreenHtml(current.code, current.label) : ""),
    [current]
  );

  const isAtStart = currentIndex === 0;
  const isAtEnd = currentIndex >= panels.length - 1;

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/75"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${option.name} fullscreen preview`}
    >
      <header
        className="flex items-center justify-between px-6 py-3 bg-gray-900 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0">
          <h2 className="text-base font-semibold truncate">{option.name}</h2>
          <p className="text-xs text-gray-400 truncate">
            {current ? current.label : "No screens"} · {panels.length === 0 ? 0 : currentIndex + 1} / {panels.length}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onPick}
            disabled={picking || panels.length === 0}
            className="px-4 py-1.5 bg-white text-gray-900 text-sm font-medium rounded-lg hover:bg-gray-100 disabled:opacity-50"
          >
            {picking ? "Building…" : "Pick this flow"}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close fullscreen preview"
            className="w-8 h-8 flex items-center justify-center text-gray-300 hover:text-white text-xl"
          >
            ×
          </button>
        </div>
      </header>

      <div
        className="flex-1 flex items-stretch justify-center p-6 min-h-0"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
          disabled={isAtStart}
          aria-label="Previous screen"
          className="flex-shrink-0 w-12 self-center text-white text-3xl disabled:opacity-30"
        >
          ‹
        </button>

        <div className="flex-1 bg-white rounded-lg overflow-hidden mx-4 shadow-2xl">
          {current ? (
            <iframe
              key={currentIndex}
              srcDoc={html}
              className="w-full h-full border-0 block"
              sandbox="allow-scripts"
              title={`${option.name} — ${current.label}`}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              No screens available.
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setCurrentIndex((i) => Math.min(panels.length - 1, i + 1))}
          disabled={isAtEnd}
          aria-label="Next screen"
          className="flex-shrink-0 w-12 self-center text-white text-3xl disabled:opacity-30"
        >
          ›
        </button>
      </div>
    </div>,
    document.body
  );
}
