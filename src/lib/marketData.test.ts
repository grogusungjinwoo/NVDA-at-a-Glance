import { describe, expect, it } from "vitest";
import {
  buildTimeframeSeries,
  computeMacd,
  computeRsi,
  resampleBars,
  summarizeFrame,
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
      { time: "2026-05-12T13:30:00.000Z", open: 220, high: 223, low: 219, close: 222.5, volume: 220 },
      { time: "2026-05-12T13:40:00.000Z", open: 222.5, high: 224, low: 220.5, close: 221, volume: 200 }
    ]);
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

  it("builds the requested 10m through 4h timeframes with RSI and MACD evaluations", () => {
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

    expect(Object.keys(frames)).toEqual(["10m", "15m", "30m", "1h", "2h", "4h"]);
    expect(frames["10m"].bars[0].open).toBe(measured[0].open);
    expect(frames["4h"].bars.length).toBeGreaterThan(1);
    expect(frames["10m"].rsi.some((value) => value !== null)).toBe(true);
    expect(frames["10m"].macd.hist.some((value) => value !== null)).toBe(true);
  });

  it("summarizes the latest RSI and MACD state for the selected timeframe", () => {
    const closes = [10, 11, 12, 11.5, 12.4, 13.1, 12.9, 13.6, 14, 13.8, 14.4, 15.1, 15, 15.6, 16.2, 16.4];
    const rsi = computeRsi(closes, 5);
    const macd = computeMacd(closes, 3, 6, 3);
    const summary = summarizeFrame({
      timeframe: "10m",
      bars: closes.map((close, index) => ({
        time: new Date(Date.UTC(2026, 4, 12, 13, 30 + index * 10)).toISOString(),
        open: close - 0.2,
        high: close + 0.4,
        low: close - 0.5,
        close,
        volume: 1000 + index
      })),
      rsi,
      macd
    });

    expect(summary.latestClose).toBe(16.4);
    expect(summary.rsiValue).not.toBeNull();
    expect(summary.macdHistogram).not.toBeNull();
    expect(["bullish", "bearish", "neutral"]).toContain(summary.bias);
  });
});
