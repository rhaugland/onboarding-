"use client";

interface FlowStep {
  stepName: string;
  type: string;
  description: string;
}

interface FlowBreakdownProps {
  steps: FlowStep[];
}

const TYPE_COLORS: Record<string, string> = {
  form: "bg-purple-100 text-purple-700",
  tour: "bg-blue-100 text-blue-700",
  tooltip: "bg-green-100 text-green-700",
  checklist: "bg-orange-100 text-orange-700",
  contextual: "bg-teal-100 text-teal-700",
};

export default function FlowBreakdown({ steps }: FlowBreakdownProps) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
        Flow Steps
      </h3>
      <div className="space-y-1">
        {steps.map((step, i) => (
          <div
            key={step.stepName}
            className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50"
          >
            <span className="text-xs font-mono text-gray-400 w-5">
              {i + 1}
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                TYPE_COLORS[step.type] || "bg-gray-100 text-gray-600"
              }`}
            >
              {step.type}
            </span>
            <span className="text-sm text-gray-700">{step.description}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
