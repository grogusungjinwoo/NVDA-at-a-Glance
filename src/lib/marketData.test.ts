import { describe, expect, it } from "vitest";
import {
  buildMarketSessionMarkers,
  buildTimeframeSeries,
  classifyMarketSession,
  computeMacd,
  computePreLift,
  computeRsi,
  computeStochRsi,
  resampleBars,
  summarizeFrame,
  validateOhlcvBars,
  getTradingDate,
  type MarketBar
} from "./marketData";

const baseBars: MarketBar[] = [
  { time: "2026-05-12T13:30:00.000Z", open: 220, high: 222, low: 219, close: 221, volume: 100 },
  { time: "2026-05-12T13:35:00.000Z", open: 221, high: 223, low: 220, close: 222.5, volume: 120 },
  { time: "2026-05-12T13:40:00.000Z", open: 222.5, high: 224, low: 221, close: 221.5, volume: 90 },
  { time: "2026-05-12T13:45:00.000Z", open: 221.5, high: 222, low: 220.5, close: 221, volume: 110 }
];

describe("market data transforms", () => {
  it("resamples 5 minute bars into measured 10 minute OHLCV bars", () => {
    const bars = resampleBars(baseBars, 10);

    expect(bars).toEqual([
      { time: "2026-05-12T13:30:00.000Z", tradingDate: "2026-05-12", open: 220, high: 223, low: 219, close: 222.5, volume: 220, vwap: 221.3, session: "regular", sourceIntervalMinutes: 10, sourceBarCount: 2, isPartial: false },
      { time: "2026-05-12T13:40:00.000Z", tradingDate: "2026-05-12", open: 222.5, high: 224, low: 220.5, close: 221, volume: 200, vwap: 221.62, session: "regular", sourceIntervalMinutes: 10, sourceBarCount: 2, isPartial: false }
    ]);
  });

  it("validates malformed OHLCV bars before chart/report generation", () => {
    const errors = validateOhlcvBars([
      { time: "not-a-date", open: 10, high: 9, low: 11, close: 10, volume: -1 }
    ]);

    expect(errors).toContain("bar 0: invalid timestamp");
    expect(errors).toContain("bar 0: negative volume");
    expect(errors).toContain("bar 0: low is above body");
    expect(errors).toContain("bar 0: high is below body");
  });

  it("aligns higher timeframe bars to the 09:30 New York regular-session open", () => {
    const bars = resampleBars(baseBars, 60);

    expect(bars[0].time).toBe("2026-05-12T13:30:00.000Z");
    expect(bars[0].open).toBe(220);
    expect(bars[0].high).toBe(224);
    expect(bars[0].low).toBe(219);
    expect(bars[0].close).toBe(221);
  });

  it("aligns winter higher timeframe bars to the EST regular-session open", () => {
    const winterBars: MarketBar[] = [
      { time: "2026-01-12T14:30:00.000Z", open: 220, high: 222, low: 219, close: 221, volume: 100 },
      { time: "2026-01-12T14:35:00.000Z", open: 221, high: 223, low: 220, close: 222, volume: 110 }
    ];
    const bars = resampleBars(winterBars, 60);

    expect(bars[0].time).toBe("2026-01-12T14:30:00.000Z");
  });

  it("builds the requested 10m, 30m, 1h, and 4h timeframes with RSI and MACD evaluations", () => {
    const measured = Array.from({ length: 100 }, (_, index): MarketBar => {
      const close = 218 + Math.sin(index / 6) * 4 + index * 0.08;
      return {
        time: new Date(Date.UTC(2026, 4, 12, 13, 30 + index * 5)).toISOString(),
        open: close - 0.35,
        high: close + 0.8,
        low: close - 0.9,
        close,
        volume: 900_000 + index * 1_000
      };
    });

    const frames = buildTimeframeSeries(measured);

    expect(Object.keys(frames)).toEqual(["10m", "30m", "1h", "4h"]);
    expect(frames["10m"].bars[0].open).toBe(measured[0].open);
    expect(frames["30m"]).toMatchObject({
      intervalMinutes: 30,
      sourceTimeframe: "10m"
    });
    expect(frames["4h"].bars.length).toBeGreaterThan(1);
    expect(frames["10m"].rsi.some((value) => value !== null)).toBe(true);
    expect(frames["10m"].macd.hist.some((value) => value !== null)).toBe(true);
    expect(frames["10m"].macd.slope.some((value) => value !== null)).toBe(true);
    expect(frames["10m"].stochRsi.value.some((value) => value !== null)).toBe(true);
    expect(frames["10m"].preLift.angleRadians.some((value) => value !== null)).toBe(true);
  });

  it("preserves ET trading dates while resampling multi-day extended-hours bars", () => {
    const multiDay: MarketBar[] = [
      { time: "2026-05-12T08:00:00.000Z", open: 100, high: 101, low: 99, close: 100.5, volume: 100 },
      { time: "2026-05-12T08:05:00.000Z", open: 100.5, high: 102, low: 100, close: 101.5, volume: 120 },
      { time: "2026-05-13T08:00:00.000Z", open: 110, high: 111, low: 109, close: 110.5, volume: 130 },
      { time: "2026-05-13T08:05:00.000Z", open: 110.5, high: 112, low: 110, close: 111.5, volume: 140 }
    ];

    const bars = resampleBars(multiDay, 10);

    expect(bars).toHaveLength(2);
    expect(bars.map((bar) => bar.tradingDate)).toEqual(["2026-05-12", "2026-05-13"]);
    expect(bars.map((bar) => bar.open)).toEqual([100, 110]);
    expect(bars.map((bar) => bar.close)).toEqual([101.5, 111.5]);
  });

  it("builds DST-aware market session markers for each trading date", () => {
    const markers = buildMarketSessionMarkers(["2026-07-10", "2026-01-12"]);

    expect(markers.find((marker) => marker.tradingDate === "2026-07-10" && marker.kind === "extended-open")).toMatchObject({
      label: "4:00 AM",
      time: "2026-07-10T08:00:00.000Z"
    });
    expect(markers.find((marker) => marker.tradingDate === "2026-07-10" && marker.kind === "extended-close")?.time).toBe("2026-07-11T00:00:00.000Z");
    expect(markers.find((marker) => marker.tradingDate === "2026-01-12" && marker.kind === "regular-open")).toMatchObject({
      label: "9:30 AM",
      time: "2026-01-12T14:30:00.000Z"
    });
    expect(getTradingDate("2026-07-11T00:00:00.000Z")).toBe("2026-07-10");
  });

  it("tags extended-hours bars and preserves session segments through aggregation", () => {
    const extendedBars: MarketBar[] = [
      { time: "2026-05-12T08:00:00.000Z", open: 218, high: 219, low: 217, close: 218.4, volume: 100 },
      { time: "2026-05-12T13:30:00.000Z", open: 220, high: 221, low: 219, close: 220.5, volume: 200 },
      { time: "2026-05-12T20:05:00.000Z", open: 221, high: 222, low: 220.5, close: 221.4, volume: 120 }
    ];

    expect(extendedBars.map((bar) => classifyMarketSession(bar.time))).toEqual(["pre", "regular", "post"]);
    expect(resampleBars(extendedBars, 10).map((bar) => bar.session)).toEqual(["pre", "regular", "post"]);
  });

  it("computes StochRSI and PRE/Lift arctan angle math", () => {
    const closes = Array.from({ length: 40 }, (_, index) => 100 + Math.sin(index / 4) * 2 + index * 0.3);
    const stochRsi = computeStochRsi(closes, 5, 5, 3);
    const preLift = computePreLift([
      { time: "2026-05-12T13:30:00.000Z", open: 100, high: 101, low: 99, close: 100.6, volume: 100 },
      { time: "2026-05-12T13:40:00.000Z", open: 100.6, high: 102, low: 100, close: 101.6, volume: 140 }
    ], 1.618);

    expect(stochRsi.value.some((value) => value !== null)).toBe(true);
    expect(preLift.deltaMinutes[1]).toBe(10);
    expect(preLift.angleRadians[1]).toBeCloseTo(Math.atan(1.618 / 10), 4);
    expect(preLift.angleDegrees[1]).toBeCloseTo((Math.atan(1.618 / 10) * 180) / Math.PI, 2);
  });

  it("summarizes the latest RSI and MACD state for the selected timeframe", () => {
    const closes = [10, 11, 12, 11.5, 12.4, 13.1, 12.9, 13.6, 14, 13.8, 14.4, 15.1, 15, 15.6, 16.2, 16.4];
    const bars = closes.map((close, index) => ({
      time: new Date(Date.UTC(2026, 4, 12, 13, 30 + index * 10)).toISOString(),
      open: close - 0.2,
      high: close + 0.4,
      low: close - 0.5,
      close,
      volume: 1000 + index
    }));
    const rsi = computeRsi(closes, 5);
    const macd = computeMacd(closes, 3, 6, 3);
    const summary = summarizeFrame({
      timeframe: "10m",
      intervalMinutes: 10,
      sourceTimeframe: "5m",
      bars,
      rsi,
      macd,
      stochRsi: computeStochRsi(closes, 5, 5, 3),
      preLift: computePreLift(bars)
    });

    expect(summary.latestClose).toBe(16.4);
    expect(summary.rsiValue).not.toBeNull();
    expect(summary.macdHistogram).not.toBeNull();
    expect(["bullish", "bearish", "neutral"]).toContain(summary.bias);
  });
});
