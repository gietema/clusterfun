/**
 * Utilities for parsing VQA (Visual Question Answering) data from various
 * HuggingFace dataset formats.
 */

/**
 * Parse choices from various formats found in VLM datasets.
 *
 * Handles:
 * - JSON array: '["cat", "dog", "bird"]'
 * - Python repr: "['cat', 'dog', 'bird']"
 * - Already an array (defensive)
 *
 * Returns null if parsing fails or input is not a list-like value.
 */
export function parseChoices(raw: unknown): string[] | null {
  if (raw == null) return null;

  if (Array.isArray(raw)) {
    return raw.map(String);
  }

  if (typeof raw !== "string") return null;

  const trimmed = raw.trim();
  if (!trimmed.startsWith("[")) return null;

  // Try JSON parse first
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    // Fall through to Python repr handling
  }

  // Handle Python repr: ['cat', 'dog'] → replace single quotes with double
  try {
    const jsonified = trimmed.replace(/'/g, '"');
    const parsed = JSON.parse(jsonified);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    // Not parseable
  }

  return null;
}

/**
 * Determine if the answer corresponds to a choice index.
 * Returns the 0-based index, or -1 if not a choice reference.
 *
 * Handles:
 * - Letter answers: "A" → 0, "B" → 1, "C" → 2, "D" → 3
 * - Numeric string answers: "0" → 0, "1" → 1
 * - Numeric answers: 0 → 0, 1 → 1
 */
export function answerToChoiceIndex(answer: unknown, choices: string[]): number {
  if (answer == null || choices.length === 0) return -1;

  // Letter answer (A, B, C, D, ...)
  if (typeof answer === "string" && /^[A-Z]$/.test(answer)) {
    const idx = answer.charCodeAt(0) - "A".charCodeAt(0);
    return idx >= 0 && idx < choices.length ? idx : -1;
  }

  // Numeric answer
  const num = typeof answer === "number" ? answer : Number(answer);
  if (Number.isInteger(num) && num >= 0 && num < choices.length) {
    return num;
  }

  return -1;
}

/** Letters for labeling choices: A, B, C, D, E, ... */
export const CHOICE_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
