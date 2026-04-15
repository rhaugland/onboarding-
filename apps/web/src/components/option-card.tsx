"use client";

interface OnboardingOption {
  id: string;
  name: string;
  rationale: string;
  flowStructure: Array<{
    stepName: string;
    type: string;
    description: string;
  }>;
}

interface OptionCardProps {
  option: OnboardingOption;
  isSelected: boolean;
  onSelect: () => void;
}

export default function OptionCard({
  option,
  isSelected,
  onSelect,
}: OptionCardProps) {
  return (
    <button
      onClick={onSelect}
      className={`
        w-full text-left p-4 rounded-xl border-2 transition-all
        ${
          isSelected
            ? "border-blue-500 bg-blue-50"
            : "border-gray-200 bg-white hover:border-gray-300"
        }
      `}
    >
      <h3 className="font-semibold text-gray-900">{option.name}</h3>
      <p className="text-sm text-gray-500 mt-1">{option.rationale}</p>
      <div className="mt-3 flex items-center gap-2">
        <span className="text-xs font-medium text-gray-400">
          {option.flowStructure.length} steps
        </span>
        <span className="text-xs text-gray-300">|</span>
        <span className="text-xs text-gray-400">
          {[...new Set(option.flowStructure.map((s) => s.type))].join(", ")}
        </span>
      </div>
    </button>
  );
}
