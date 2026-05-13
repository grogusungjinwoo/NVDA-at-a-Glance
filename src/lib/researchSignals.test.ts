import { describe, expect, it } from "vitest";
import {
  buildResearchFindings,
  computeAtr,
  computeStochRsi,
  detectEngulfingEvents,
  detectFairValueGaps,
  detectOpeningRangeBreakout,
  fibonacciLevels,
  summarizeBuyHold,
  type PriceEvent
} from "./researchSignals";
import type { MarketBar } from "./marketData";

function bar(index: number, open: number, high: number, low: number, close: number, volume = 1000): MarketBar {
  return {
    time: new Date(Date.UTC(2026, 4, 12, 13, 30 + index * 10)).toISOString(),
    open,
    high,
    low,
    close,
    volume
  };
}

const trendBars = Array.from({ length: 44 }, (_, index) => {
  const close = 200 + index * 0.45 + Math.sin(index / 4);
  return bar(index, close - 0.25, close + 0.7, close - 0.8, close, 1_000 + index * 55);
});

describe("research signal modules", () => {
  it("computes StochRSI and ATR for confluence rather than standalone edge claims", () => {
    const stochRsi = computeStochRsi(trendBars.map((item) => item.close));
    const atr = computeAtr(trendBars);

    expect(stochRsi.some((value) => value !== null)).toBe(true);
    expect(atr.at(-1)).toBeGreaterThan(0);
  });

  it("detects filtered opening range breakouts with stop and target assumptions", () => {
    const bars = [
      bar(0, 100, 101, 99, 100.5, 1200),
      bar(1, 100.5, 101.5, 100, 101, 1300),
      bar(2, 101, 101.25, 100.4, 100.8, 1250),
      bar(3, 100.8, 103, 100.7, 102.7, 2400),
      bar(4, 102.7, 104, 102.2, 103.8, 2600)
    ];
    const signal = detectOpeningRangeBreakout(bars, 30);

    expect(signal?.direction).toBe("bullish");
    expect(signal?.evidence.join(" ")).toContain("30 minute range");
    expect(signal?.stopAssumption).toContain("opposite side");
  });

  it("detects engulfing events and FVG imbalance zones with fill status", () => {
    const bars: MarketBar[] = [
      bar(0, 100, 101, 99, 99.5),
      bar(1, 99.3, 102, 99.1, 101.8),
      bar(2, 102, 103, 101.5, 102.7),
      bar(3, 103.5, 105, 103.2, 104.6),
      bar(4, 104.4, 104.7, 101.8, 102.2)
    ];
    const engulfing = detectEngulfingEvents(bars);
    const gaps = detectFairValueGaps(bars);

    expect(engulfing.some((event) => event.type === "bullish-engulfing")).toBe(true);
    expect(gaps.some((event: PriceEvent) => event.type === "bullish-fvg" && event.filled === true)).toBe(true);
  });

  it("builds fib levels and buy-and-hold baselines", () => {
    const fibs = fibonacciLevels(120, 100);
    const baseline = summarizeBuyHold([bar(0, 100, 103, 99, 101), bar(1, 101, 112, 100, 110)]);

    expect(fibs.find((level) => level.ratio === 0.618)?.price).toBe(112.36);
    expect(baseline.returnPct).toBe(10);
    expect(baseline.maxDrawdownPct).toBeLessThanOrEqual(0);
  });

  it("builds research findings with explicit limitations and baselines", () => {
    const findings = buildResearchFindings(trendBars);
    const ids = findings.map((finding) => finding.id);

    expect(ids).toContain("momentum");
    expect(ids).toContain("orb");
    expect(ids).toContain("buy-hold");
    expect(ids).toContain("quality-dip");
    expect(findings.find((finding) => finding.id === "momentum")?.limitations.join(" ")).toContain("confluence inputs only");
  });
});
