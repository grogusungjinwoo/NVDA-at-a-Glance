export type HighlightDirection = "bullish" | "bearish" | "neutral";

export interface HighlightSignal {
  id: string;
  label: string;
  strength: number;
  direction: HighlightDirection;
}

export interface HighlightSummary {
  count: number;
  averageStrength: number;
  labels: string[];
  bias: HighlightDirection | "mixed";
}

export function toggleSelection(selected: string[], id: string): string[] {
  if (selected.includes(id)) {
    return selected.filter((item) => item !== id);
  }

  return [...selected, id];
}

export function buildHighlightSummary(signals: HighlightSignal[], selectedIds: string[]): HighlightSummary {
  const selected = signals.filter((signal) => selectedIds.includes(signal.id));
  const averageStrength = selected.length
    ? Math.round(selected.reduce((sum, signal) => sum + signal.strength, 0) / selected.length)
    : 0;
  const directions = new Set(selected.map((signal) => signal.direction));
  const directional = [...directions].filter((direction) => direction !== "neutral");
  const bias = directional.length === 0 ? "neutral" : directional.length === 1 ? directional[0] : "mixed";

  return {
    count: selected.length,
    averageStrength,
    labels: selected.map((signal) => signal.label),
    bias
  };
}
