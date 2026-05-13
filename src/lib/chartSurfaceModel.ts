import type { MarketSessionSegment, TimeframeSeries } from "./marketData";

export interface ChartSurfacePoint {
  time: string;
  session: MarketSessionSegment;
  x: number;
  y: number;
  z: number;
  price: number;
  volumeIntensity: number;
  indicatorPressure: number;
  rsi: number | null;
  macdHistogram: number | null;
  stochRsi: number | null;
  preLiftAngleDegrees: number | null;
}

export interface ChartSlicePoint {
  time: string;
  x: number;
  y: number;
  price: number;
  indicatorPressure: number;
}

export interface ChartSurfaceModel {
  timeframe: string;
  points: ChartSurfacePoint[];
  slice2d: ChartSlicePoint[];
}

function finiteOr(value: number | null | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalize(value: number, min: number, max: number): number {
  const range = max - min || 1;
  return Math.max(0, Math.min(1, (value - min) / range));
}

export function buildChartSurfaceModel(series: TimeframeSeries): ChartSurfaceModel {
  const bars = series.bars;
  const high = Math.max(...bars.map((bar) => bar.high), 1);
  const low = Math.min(...bars.map((bar) => bar.low), 0);
  const volumeMax = Math.max(...bars.map((bar) => bar.volume), 1);
  const macdValues = series.macd.hist.map((value) => finiteOr(value, 0));
  const macdAbsMax = Math.max(...macdValues.map((value) => Math.abs(value)), 1);

  const points = bars.map((bar, index): ChartSurfacePoint => {
    const rsi = series.rsi[index] ?? null;
    const macdHistogram = series.macd.hist[index] ?? null;
    const stochRsi = series.stochRsi.value[index] ?? null;
    const preLiftAngleDegrees = series.preLift.angleDegrees[index] ?? null;
    const rsiPressure = finiteOr(rsi, 50) / 100;
    const stochPressure = finiteOr(stochRsi, 50) / 100;
    const macdPressure = 0.5 + finiteOr(macdHistogram, 0) / (2 * macdAbsMax);
    const anglePressure = normalize(finiteOr(preLiftAngleDegrees, 0), 0, 20);
    const indicatorPressure = normalize((rsiPressure + stochPressure + macdPressure + anglePressure) / 4, 0, 1);

    return {
      time: bar.time,
      session: bar.session ?? "regular",
      x: bars.length <= 1 ? 0.5 : index / (bars.length - 1),
      y: normalize(bar.close, low, high),
      z: normalize(bar.volume, 0, volumeMax),
      price: bar.close,
      volumeIntensity: normalize(bar.volume, 0, volumeMax),
      indicatorPressure,
      rsi,
      macdHistogram,
      stochRsi,
      preLiftAngleDegrees
    };
  });

  return {
    timeframe: series.timeframe,
    points,
    slice2d: points.map((point) => ({
      time: point.time,
      x: point.x,
      y: point.y,
      price: point.price,
      indicatorPressure: point.indicatorPressure
    }))
  };
}
