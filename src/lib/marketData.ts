export type TimeframeKey = "10m" | "15m" | "30m" | "1h" | "2h" | "4h";

export interface MarketBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MacdSeries {
  line: Array<number | null>;
  signal: Array<number | null>;
  hist: Array<number | null>;
  slope: Array<number | null>;
}

export interface TimeframeSeries {
  timeframe: TimeframeKey;
  bars: MarketBar[];
  rsi: Array<number | null>;
  macd: MacdSeries;
}

export interface FrameSummary {
  latestClose: number;
  high: number;
  low: number;
  volume: number;
  rsiValue: number | null;
  rsiRegime: "overbought" | "oversold" | "neutral" | "unknown";
  macdLine: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  macdSlope: number | null;
  bias: "bullish" | "bearish" | "neutral";
}

export const TIMEFRAMES: Array<{ key: TimeframeKey; minutes: number }> = [
  { key: "10m", minutes: 10 },
  { key: "15m", minutes: 15 },
  { key: "30m", minutes: 30 },
  { key: "1h", minutes: 60 },
  { key: "2h", minutes: 120 },
  { key: "4h", minutes: 240 }
];

const NEW_YORK_TIME_ZONE = "America/New_York";

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function round(value: number | null, places = 2): number | null {
  if (!isFiniteNumber(value)) return null;
  const scale = 10 ** places;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function lastFinite(values: Array<number | null>): number | null {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (isFiniteNumber(values[index])) return values[index];
  }
  return null;
}

function getZonedParts(date: Date): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: NEW_YORK_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second)
  };
}

function zonedTimeToUtc(parts: ZonedParts): number {
  const desiredAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  let estimate = desiredAsUtc;

  for (let index = 0; index < 2; index += 1) {
    const actual = getZonedParts(new Date(estimate));
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    estimate += desiredAsUtc - actualAsUtc;
  }

  return estimate;
}

function getSessionOpenUtc(time: number): number {
  const parts = getZonedParts(new Date(time));
  return zonedTimeToUtc({ ...parts, hour: 9, minute: 30, second: 0 });
}

export function resampleBars(baseBars: MarketBar[], targetMinutes: number): MarketBar[] {
  const bucketMs = targetMinutes * 60_000;
  const buckets = new Map<number, MarketBar[]>();

  for (const bar of baseBars) {
    const time = new Date(bar.time).getTime();
    if (!Number.isFinite(time)) continue;
    const sessionOpen = getSessionOpenUtc(time);
    const bucketStart = sessionOpen + Math.floor((time - sessionOpen) / bucketMs) * bucketMs;
    const current = buckets.get(bucketStart) ?? [];
    current.push(bar);
    buckets.set(bucketStart, current);
  }

  return [...buckets.entries()]
    .sort(([left], [right]) => left - right)
    .map(([bucketStart, bars]) => ({
      time: new Date(bucketStart).toISOString(),
      open: round(bars[0].open)!,
      high: round(Math.max(...bars.map((bar) => bar.high)))!,
      low: round(Math.min(...bars.map((bar) => bar.low)))!,
      close: round(bars[bars.length - 1].close)!,
      volume: Math.round(bars.reduce((sum, bar) => sum + bar.volume, 0))
    }));
}

export function computeEma(series: Array<number | null>, length: number): Array<number | null> {
  const alpha = 2 / (length + 1);
  let previous: number | null = null;

  return series.map((value) => {
    if (!isFiniteNumber(value)) return null;
    previous = previous === null ? value : alpha * value + (1 - alpha) * previous;
    return previous;
  });
}

export function computeRsi(close: number[], length = 14): Array<number | null> {
  const output: Array<number | null> = Array(close.length).fill(null);
  if (close.length <= length) return output;

  let gain = 0;
  let loss = 0;
  for (let index = 1; index <= length; index += 1) {
    const delta = close[index] - close[index - 1];
    if (delta >= 0) gain += delta;
    else loss -= delta;
  }

  let averageGain = gain / length;
  let averageLoss = loss / length;
  output[length] = averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss);

  for (let index = length + 1; index < close.length; index += 1) {
    const delta = close[index] - close[index - 1];
    averageGain = (averageGain * (length - 1) + Math.max(delta, 0)) / length;
    averageLoss = (averageLoss * (length - 1) + Math.max(-delta, 0)) / length;
    output[index] = averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss);
  }

  return output.map((value) => round(value));
}

export function computeMacd(close: number[], fast = 12, slow = 26, signalLength = 9): MacdSeries {
  const fastEma = computeEma(close, fast);
  const slowEma = computeEma(close, slow);
  const line = close.map((_, index) => (fastEma[index] === null || slowEma[index] === null ? null : fastEma[index]! - slowEma[index]!));
  const signal = computeEma(line, signalLength);
  const hist = line.map((value, index) => (value === null || signal[index] === null ? null : value - signal[index]!));
  const slope = hist.map((value, index) => (value === null || index === 0 || hist[index - 1] === null ? null : value - hist[index - 1]!));

  return {
    line: line.map((value) => round(value, 4)),
    signal: signal.map((value) => round(value, 4)),
    hist: hist.map((value) => round(value, 4)),
    slope: slope.map((value) => round(value, 4))
  };
}

export function buildTimeframeSeries(baseBars: MarketBar[]): Record<TimeframeKey, TimeframeSeries> {
  return Object.fromEntries(
    TIMEFRAMES.map(({ key, minutes }) => {
      const bars = resampleBars(baseBars, minutes);
      const closes = bars.map((bar) => bar.close);
      return [
        key,
        {
          timeframe: key,
          bars,
          rsi: computeRsi(closes),
          macd: computeMacd(closes)
        }
      ];
    })
  ) as Record<TimeframeKey, TimeframeSeries>;
}

export function summarizeFrame(series: TimeframeSeries): FrameSummary {
  const latest = series.bars.at(-1);
  const latestRsi = lastFinite(series.rsi);
  const macdLine = lastFinite(series.macd.line);
  const macdSignal = lastFinite(series.macd.signal);
  const macdHistogram = lastFinite(series.macd.hist);
  const macdSlope = lastFinite(series.macd.slope);
  const rsiRegime = latestRsi === null ? "unknown" : latestRsi >= 70 ? "overbought" : latestRsi <= 30 ? "oversold" : "neutral";
  const bias = latestRsi !== null && macdHistogram !== null && macdSlope !== null
    ? latestRsi >= 50 && macdHistogram >= 0 && macdSlope >= 0
      ? "bullish"
      : latestRsi < 50 && macdHistogram < 0 && macdSlope < 0
        ? "bearish"
        : "neutral"
    : "neutral";

  return {
    latestClose: round(latest?.close ?? 0)!,
    high: round(Math.max(...series.bars.map((bar) => bar.high))) ?? 0,
    low: round(Math.min(...series.bars.map((bar) => bar.low))) ?? 0,
    volume: Math.round(series.bars.reduce((sum, bar) => sum + bar.volume, 0)),
    rsiValue: round(latestRsi),
    rsiRegime,
    macdLine: round(macdLine, 4),
    macdSignal: round(macdSignal, 4),
    macdHistogram: round(macdHistogram, 4),
    macdSlope: round(macdSlope, 4),
    bias
  };
}
