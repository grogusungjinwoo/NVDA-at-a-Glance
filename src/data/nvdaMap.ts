import type { HighlightDirection, HighlightSignal } from "../lib/highlightModel";

export type MetricId = "price" | "tap" | "lift" | "rsi" | "macd" | "volume" | "risk" | "ghost";

export interface MetricOption extends HighlightSignal {
  id: MetricId;
  description: string;
  color: string;
}

export interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketRegion {
  id: string;
  label: string;
  code: string;
  timeframe: string;
  metrics: MetricId[];
  direction: HighlightDirection;
  strength: number;
  x: number;
  y: number;
  width: number;
  height: number;
  price: string;
  thesis: string;
  detail: string;
}

export const metricOptions: MetricOption[] = [
  {
    id: "price",
    label: "Price Structure",
    description: "Swing shelves and accepted value ranges",
    strength: 81,
    direction: "bullish",
    color: "#d9b64f"
  },
  {
    id: "tap",
    label: "TAP Vector",
    description: "Trend angle pressure across the legacy stack",
    strength: 83,
    direction: "bullish",
    color: "#6fd3a1"
  },
  {
    id: "lift",
    label: "Lift Field",
    description: "Sin, cos, and volume resonance pressure",
    strength: 67,
    direction: "neutral",
    color: "#6ab7ff"
  },
  {
    id: "rsi",
    label: "RSI Curvature",
    description: "Momentum bend and rejection pockets",
    strength: 74,
    direction: "bullish",
    color: "#a5d83f"
  },
  {
    id: "macd",
    label: "MACD Slope",
    description: "Histogram compression and signal drift",
    strength: 58,
    direction: "neutral",
    color: "#b48dff"
  },
  {
    id: "volume",
    label: "Volume Velocity",
    description: "Participation velocity and exhaustion",
    strength: 72,
    direction: "bearish",
    color: "#ef8840"
  },
  {
    id: "risk",
    label: "Risk Cone",
    description: "Stop, target, and no-trade expansion",
    strength: 61,
    direction: "neutral",
    color: "#ef4e5f"
  },
  {
    id: "ghost",
    label: "Ghost Strikes",
    description: "Fibonacci and prime ratio reaction shelves",
    strength: 69,
    direction: "bearish",
    color: "#f1cf5f"
  }
];

export const candles: Candle[] = [
  { time: "09:30", open: 126.9, high: 127.8, low: 126.4, close: 127.55, volume: 2.45 },
  { time: "09:35", open: 127.55, high: 128.05, low: 127.18, close: 127.92, volume: 2.32 },
  { time: "09:40", open: 127.92, high: 128.28, low: 127.6, close: 127.74, volume: 2.08 },
  { time: "09:45", open: 127.74, high: 128.62, low: 127.66, close: 128.35, volume: 2.88 },
  { time: "09:50", open: 128.35, high: 128.9, low: 128.05, close: 128.68, volume: 3.05 },
  { time: "09:55", open: 128.68, high: 129.06, low: 128.22, close: 128.28, volume: 2.71 },
  { time: "10:00", open: 128.28, high: 128.84, low: 127.92, close: 128.1, volume: 3.18 },
  { time: "10:05", open: 128.1, high: 128.56, low: 127.72, close: 128.44, volume: 2.66 },
  { time: "10:10", open: 128.44, high: 129.0, low: 128.16, close: 128.86, volume: 2.94 },
  { time: "10:15", open: 128.86, high: 129.2, low: 128.42, close: 128.62, volume: 2.51 },
  { time: "10:20", open: 128.62, high: 129.38, low: 128.5, close: 129.08, volume: 3.22 },
  { time: "10:25", open: 129.08, high: 129.55, low: 128.74, close: 129.42, volume: 3.36 },
  { time: "10:30", open: 129.42, high: 129.82, low: 128.96, close: 129.0, volume: 3.64 },
  { time: "10:45", open: 129.0, high: 129.66, low: 128.74, close: 129.28, volume: 3.11 },
  { time: "11:00", open: 129.28, high: 129.92, low: 128.94, close: 129.72, volume: 3.42 },
  { time: "11:15", open: 129.72, high: 130.1, low: 129.2, close: 129.55, volume: 3.7 },
  { time: "11:30", open: 129.55, high: 130.24, low: 129.06, close: 129.15, volume: 4.12 },
  { time: "12:00", open: 129.15, high: 129.6, low: 128.48, close: 128.72, volume: 3.89 },
  { time: "12:30", open: 128.72, high: 129.18, low: 127.9, close: 128.18, volume: 3.48 },
  { time: "13:00", open: 128.18, high: 128.94, low: 127.82, close: 128.56, volume: 3.2 },
  { time: "13:30", open: 128.56, high: 129.08, low: 127.96, close: 128.32, volume: 2.84 },
  { time: "14:00", open: 128.32, high: 129.42, low: 128.08, close: 129.06, volume: 3.07 },
  { time: "14:30", open: 129.06, high: 129.7, low: 128.36, close: 128.74, volume: 2.76 },
  { time: "15:00", open: 128.74, high: 129.18, low: 128.02, close: 128.42, volume: 3.21 }
];

export const marketRegions: MarketRegion[] = [
  {
    id: "opening-drive",
    label: "Opening Drive",
    code: "OD",
    timeframe: "5m",
    metrics: ["price", "tap", "volume"],
    direction: "bullish",
    strength: 86,
    x: 76,
    y: 170,
    width: 230,
    height: 220,
    price: "$126.40-$128.90",
    thesis: "Acceptance above the open with fast participation.",
    detail: "The first impulse holds above the 09:30 low while volume expands into the 09:50 shelf."
  },
  {
    id: "momentum-bend",
    label: "Momentum Bend",
    code: "MB",
    timeframe: "15m",
    metrics: ["rsi", "macd", "lift"],
    direction: "neutral",
    strength: 69,
    x: 290,
    y: 130,
    width: 250,
    height: 260,
    price: "$127.72-$129.20",
    thesis: "RSI curvature improves while MACD slope compresses.",
    detail: "This is the first contested zone where upward price pressure loses clean velocity."
  },
  {
    id: "gamma-shelf",
    label: "Gamma Shelf",
    code: "GS",
    timeframe: "30m",
    metrics: ["price", "tap", "ghost"],
    direction: "bullish",
    strength: 78,
    x: 508,
    y: 92,
    width: 265,
    height: 250,
    price: "$128.74-$129.82",
    thesis: "Repeated reactions cluster around the 129 handle.",
    detail: "The 10:20 through 10:45 shelf behaves like the chart equivalent of a highlighted country boundary."
  },
  {
    id: "risk-cone",
    label: "Risk Cone",
    code: "RC",
    timeframe: "1h",
    metrics: ["risk", "volume", "macd"],
    direction: "bearish",
    strength: 73,
    x: 735,
    y: 72,
    width: 250,
    height: 335,
    price: "$128.48-$130.24",
    thesis: "Range expands as the midday high rejects.",
    detail: "Volume remains elevated while the curve rolls out of the 11:30 high, marking a defensive review area."
  },
  {
    id: "auction-drift",
    label: "Auction Drift",
    code: "AD",
    timeframe: "4h",
    metrics: ["lift", "rsi", "risk"],
    direction: "neutral",
    strength: 64,
    x: 960,
    y: 188,
    width: 235,
    height: 265,
    price: "$127.82-$129.70",
    thesis: "Late structure recovers without fully clearing risk.",
    detail: "Afternoon candles stabilize, but the map keeps the zone amber until momentum and lift agree."
  }
];
