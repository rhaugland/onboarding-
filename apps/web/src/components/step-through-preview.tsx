"use client";

import { useState, useMemo } from "react";
import { buildSingleScreenHtml } from "@/lib/single-screen-bundler";
import type { StoryboardOption } from "@/lib/api";

interface Props {
  option: StoryboardOption;
  authMockup: { login: string; signup: string };
  onClose: () => void;
}

interface Screen {
  label: string;
  description: string;
  html: string;
}

export default function StepThroughPreview({ option, authMockup, onClose }: Props) {
  const [currentStep, setCurrentStep] = useState(0);

  const screens = useMemo(() => {
    const list: Screen[] = [];

    if (authMockup.signup) {
      list.push({
        label: "Sign Up",
        description: "Account creation",
        html: buildSingleScreenHtml(authMockup.signup, "signup"),
      });
    }
    if (authMockup.login) {
      list.push({
        label: "Log In",
        description: "Authentication",
        html: buildSingleScreenHtml(authMockup.login, "login"),
      });
    }

    for (const step of option.flowStructure) {
      const code = option.mockupCode[step.stepName];
      if (!code) continue;
      list.push({
        label: step.stepName,
        description: step.description,
        html: buildSingleScreenHtml(code, step.stepName),
      });
    }

    return list;
  }, [option, authMockup]);

  if (screens.length === 0) return null;

  const screen = screens[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === screens.length - 1;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-2xl w-[90vw] max-w-4xl h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {option.name}
            </h2>
            <p className="text-sm text-gray-500">
              Step {currentStep + 1} of {screens.length}: {screen.label}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none px-2"
          >
            &times;
          </button>
        </div>

        {/* Step indicator dots */}
        <div className="flex items-center justify-center gap-2 py-3 bg-gray-50 border-b border-gray-100">
          {screens.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setCurrentStep(i)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs transition-colors ${
                i === currentStep
                  ? "bg-gray-900 text-white"
                  : i < currentStep
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-200 text-gray-500 hover:bg-gray-300"
              }`}
            >
              {i < currentStep && <span>&#10003;</span>}
              {s.label}
            </button>
          ))}
        </div>

        {/* Description */}
        <div className="px-6 py-3 bg-blue-50 border-b border-blue-100">
          <p className="text-sm text-blue-800">{screen.description}</p>
        </div>

        {/* Preview iframe */}
        <div className="flex-1 relative">
          <iframe
            key={currentStep}
            srcDoc={screen.html}
            className="absolute inset-0 w-full h-full border-0"
            sandbox="allow-scripts"
            title={`Step ${currentStep + 1}: ${screen.label}`}
          />
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-white">
          <button
            type="button"
            onClick={() => setCurrentStep((s) => s - 1)}
            disabled={isFirst}
            className="px-5 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            &larr; Previous
          </button>

          <span className="text-sm text-gray-400">
            {currentStep + 1} / {screens.length}
          </span>

          {isLast ? (
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
            >
              Done &#10003;
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setCurrentStep((s) => s + 1)}
              className="px-5 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 font-medium"
            >
              Next &rarr;
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
