import { describe, expect, it } from "vitest";
import type { TimeframeSeries } from "./marketData";
import { buildChartSurfaceModel } from "./chartSurfaceModel";

const series: TimeframeSeries = {
  timeframe: "10m",
  intervalMinutes: 10,
  sourceTimeframe: "5m",
  bars: [
    { time: "2026-05-12T13:30:00.000Z", open: 100, high: 102, low: 99, close: 101, volume: 100, session: "regular" },
    { time: "2026-05-12T13:40:00.000Z", open: 101, high: 104, low: 100, close: 103, volume: 200, session: "regular" },
    { time: "2026-05-12T13:50:00.000Z", open: 103, high: 105, low: 102, close: 104, volume: 150, session: "regular" }
  ],
  rsi: [45, 55, 65],
  macd: {
    line: [0.1, 0.2, 0.3],
    signal: [0.05, 0.14, 0.2],
    hist: [0.05, 0.06, 0.1],
    slope: [null, 0.01, 0.04]
  },
  stochRsi: {
    value: [40, 60, 80],
    k: [null, null, 60],
    d: [null, null, null],
    rsiLength: 14,
    stochLength: 14
  },
  preLift: {
    phi: 1.618,
    deltaMinutes: [null, 10, 10],
    angleRadians: [null, 0.16, 0.16],
    angleDegrees: [null, 9.2, 9.2],
    pre: [null, 0.1, 0.08],
    lift: [null, 1.4, 1.1]
  }
};

describe("chart surface model", () => {
  it("builds shared 4D points and a 2D slice from the same timeframe data", () => {
    const model = buildChartSurfaceModel(series);

    expect(model.points).toHaveLength(3);
    expect(model.points[1]).toMatchObject({
      time: "2026-05-12T13:40:00.000Z",
      x: 0.5,
      session: "regular"
    });
    expect(model.points[2].indicatorPressure).toBeGreaterThan(model.points[0].indicatorPressure);
    expect(model.slice2d.map((point) => point.time)).toEqual(series.bars.map((bar) => bar.time));
  });
});
