"use client";
import { parseChoices, answerToChoiceIndex, CHOICE_LETTERS } from "@/app/lib/vqa-utils";
import type { InformationValue } from "@/app/types";

interface ExtraImage {
  col: string;
  url: string;
}

interface QACardProps {
  question: string;
  answer?: InformationValue;
  choices?: InformationValue;
  explanation?: InformationValue;
  extraImages?: ExtraImage[];
  onImageClick?: (url: string) => void;
  activeImageUrl?: string | null;
}

export default function QACard({
  question,
  answer,
  choices: rawChoices,
  explanation,
  extraImages,
  onImageClick,
  activeImageUrl,
}: QACardProps) {
  const choices = parseChoices(rawChoices);
  const correctIdx = choices ? answerToChoiceIndex(answer, choices) : -1;

  return (
    <div className="space-y-3 border-b border-gray-100 pb-3">
      {/* Extra images strip */}
      {extraImages && extraImages.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {extraImages.map(({ col, url }) => (
            <button
              key={col}
              onClick={() => onImageClick?.(url)}
              className={`shrink-0 overflow-hidden rounded border-2 transition-all ${
                activeImageUrl === url
                  ? "border-blue-500 ring-1 ring-blue-300"
                  : "border-gray-200 hover:border-gray-400"
              }`}
            >
              <img
                src={url}
                alt={col}
                className="h-16 w-16 object-cover"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}

      {/* Question */}
      <div>
        <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          Question
        </div>
        <div className="text-sm leading-relaxed text-gray-900">{question}</div>
      </div>

      {/* Choices */}
      {choices && choices.length > 0 && (
        <div className="space-y-1">
          {choices.map((choice, i) => {
            const isCorrect = correctIdx === i;
            return (
              <div
                key={i}
                className={`flex items-start gap-2 rounded px-2 py-1 text-xs transition-colors ${
                  isCorrect
                    ? "bg-emerald-50 text-emerald-900"
                    : "text-gray-700"
                }`}
              >
                <span
                  className={`mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-semibold ${
                    isCorrect
                      ? "bg-emerald-500 text-white"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {CHOICE_LETTERS[i]}
                </span>
                <span className="leading-snug">{choice}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Answer */}
      {answer != null && (
        <div>
          <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            Answer
          </div>
          <div className="text-sm font-medium text-gray-900">
            {String(answer)}
          </div>
        </div>
      )}

      {/* Explanation */}
      {explanation != null && String(explanation).trim() !== "" && (
        <div className="rounded bg-amber-50 px-3 py-2">
          <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600">
            Explanation
          </div>
          <div className="text-xs leading-relaxed text-amber-900">
            {String(explanation)}
          </div>
        </div>
      )}
    </div>
  );
}
