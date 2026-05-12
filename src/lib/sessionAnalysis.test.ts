import { describe, expect, it } from "vitest";
import { computeSessionAnalysis } from "./sessionAnalysis";

describe("session analysis", () => {
  it("derives session math from candle data", () => {
    const analysis = computeSessionAnalysis([
      { time: "09:30", open: 100, high: 110, low: 90, close: 105, volume: 10 },
      { time: "09:35", open: 105, high: 112, low: 104, close: 110, volume: 20 }
    ]);

    expect(analysis.open).toBe(100);
    expect(analysis.lastClose).toBe(110);
    expect(analysis.sessionReturnPct).toBe(10);
    expect(analysis.rangeDollars).toBe(22);
    expect(analysis.rangePct).toBe(22);
    expect(analysis.totalVolume).toBe(30);
    expect(analysis.vwap).toBe(106.33);
    expect(analysis.realizedVolatilityPct).toBe(6.74);
    expect(analysis.pressureScore).toBe(75);
    expect(analysis.rewardRiskRatio).toBe(0.1);
    expect(analysis.trendLabel).toBe("Constructive");
  });
});
