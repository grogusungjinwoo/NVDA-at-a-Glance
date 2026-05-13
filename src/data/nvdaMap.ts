import fallbackSessionJson from "./nvdaSession.json";
import type { HighlightDirection, HighlightSignal } from "../lib/highlightModel";

export type MetricId = "price" | "tap" | "lift" | "rsi" | "macd" | "volume" | "risk" | "ghost";

export interface MetricOption extends HighlightSignal {
  id: MetricId;
  description: string;
  color: string;
}

export interface Candle {
  timestamp: string;
  time: string;
  session?: "pre" | "regular" | "post";
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
  startTimestamp: string;
  endTimestamp: string;
  priceLow: number;
  priceHigh: number;
  thesis: string;
  detail: string;
}

export interface MarketSession {
  symbol: string;
  sessionDate: string;
  timezone: string;
  source: string;
  sourceUrl: string;
  sessionPolicy?: {
    includeExtendedHours: boolean;
    aggregationAnchor: string;
    expectedSegments: Array<{ id: "pre" | "regular" | "post"; startEt: string; endEt: string }>;
  };
  retrievedAt: string;
  regularMarketPrice: number;
  previousClose: number;
  candles: Candle[];
  regions: MarketRegion[];
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
    description: "Trend angle pressure across the measured session",
    strength: 83,
    direction: "bullish",
    color: "#6fd3a1"
  },
  {
    id: "lift",
    label: "Lift Field",
    description: "Volume resonance and late-session pressure",
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

export const fallbackSession = fallbackSessionJson as MarketSession;
export const candles = fallbackSession.candles;
export const marketRegions = fallbackSession.regions;
