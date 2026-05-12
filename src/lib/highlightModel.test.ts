import { describe, expect, it } from "vitest";
import { buildHighlightSummary, toggleSelection } from "./highlightModel";

describe("highlight model", () => {
  it("toggles a metric without disturbing the other selected metrics", () => {
    const initial = ["tap", "rsi"];

    expect(toggleSelection(initial, "volume")).toEqual(["tap", "rsi", "volume"]);
    expect(toggleSelection(initial, "tap")).toEqual(["rsi"]);
  });

  it("builds a readable summary from multiple active chart regions", () => {
    const summary = buildHighlightSummary(
      [
        { id: "tap", label: "TAP", strength: 83, direction: "bullish" },
        { id: "risk", label: "Risk Cone", strength: 61, direction: "neutral" },
        { id: "volume", label: "Volume Velocity", strength: 72, direction: "bearish" }
      ],
      ["tap", "volume"]
    );

    expect(summary.count).toBe(2);
    expect(summary.averageStrength).toBe(78);
    expect(summary.labels).toEqual(["TAP", "Volume Velocity"]);
    expect(summary.bias).toBe("mixed");
  });
});
