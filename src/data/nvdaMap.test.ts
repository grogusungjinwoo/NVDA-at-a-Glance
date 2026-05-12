import { describe, expect, it } from "vitest";
import { candles, marketRegions, metricOptions } from "./nvdaMap";

describe("NVDA session data", () => {
  it("uses only registered metrics for regions", () => {
    const metricIds = new Set(metricOptions.map((metric) => metric.id));

    for (const region of marketRegions) {
      expect(region.metrics.every((metric) => metricIds.has(metric))).toBe(true);
    }
  });

  it("keeps candle prices within their high-low range and in chronological order", () => {
    let previous = 0;

    for (const candle of candles) {
      const timestamp = Date.parse(candle.timestamp);
      expect(timestamp).toBeGreaterThan(previous);
      expect(candle.low).toBeLessThanOrEqual(Math.min(candle.open, candle.close));
      expect(candle.high).toBeGreaterThanOrEqual(Math.max(candle.open, candle.close));
      previous = timestamp;
    }
  });

  it("uses semantic timestamp and price bounds for every region", () => {
    for (const region of marketRegions) {
      expect(Date.parse(region.startTimestamp)).not.toBeNaN();
      expect(Date.parse(region.endTimestamp)).toBeGreaterThanOrEqual(Date.parse(region.startTimestamp));
      expect(region.priceLow).toBeLessThanOrEqual(region.priceHigh);
    }
  });
});
