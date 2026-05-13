import { computeMacd, computeRsi, type MarketBar } from "./marketData";

export type SignalDirection = "bullish" | "bearish" | "neutral";

export interface SignalFinding {
  id: string;
  label: string;
  direction: SignalDirection;
  confidence: number;
  evidence: string[];
  limitations: string[];
}

export interface OpeningRangeSignal {
  rangeHigh: number;
  rangeLow: number;
  rangeMinutes: number;
  breakoutTime: string | null;
  direction: SignalDirection;
  evidence: string[];
  stopAssumption: string;
  targetAssumption: string;
}

export interface PriceEvent {
  id: string;
  type: "bullish-engulfing" | "bearish-engulfing" | "bullish-fvg" | "bearish-fvg";
  time: string;
  direction: Exclude<SignalDirection, "neutral">;
  priceLow: number;
  priceHigh: number;
  filled?: boolean;
  invalidated?: boolean;
  evidence: string[];
}

export interface FibonacciLevel {
  ratio: number;
  price: number;
  label: string;
}

export interface BuyHoldSummary {
  entry: number;
  exit: number;
  returnPct: number;
  maxDrawdownPct: number;
}

const round = (value: number, places = 2) => {
  const scale = 10 ** places;
  return Math.round((value + Number.EPSILON) * scale) / scale;
};

function lastFinite(values: Array<number | null>): number | null {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function formatPrice(value: number): string {
  return `$${value.toFixed(2)}`;
}

function percent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function computeAtr(bars: MarketBar[], length = 14): Array<number | null> {
  const output: Array<number | null> = Array(bars.length).fill(null);
  if (bars.length < length) return output;

  const trueRanges = bars.map((bar, index) => {
    const previousClose = index === 0 ? bar.close : bars[index - 1].close;
    return Math.max(bar.high - bar.low, Math.abs(bar.high - previousClose), Math.abs(bar.low - previousClose));
  });

  let atr = trueRanges.slice(0, length).reduce((sum, value) => sum + value, 0) / length;
  output[length - 1] = round(atr);

  for (let index = length; index < trueRanges.length; index += 1) {
    atr = (atr * (length - 1) + trueRanges[index]) / length;
    output[index] = round(atr);
  }

  return output;
}

export function computeStochRsi(close: number[], rsiLength = 14, stochLength = 14): Array<number | null> {
  const rsi = computeRsi(close, rsiLength);

  return rsi.map((value, index) => {
    if (value === null || index < rsiLength + stochLength - 1) return null;
    const window = rsi.slice(index - stochLength + 1, index + 1).filter((item): item is number => item !== null);
    if (window.length < stochLength) return null;
    const min = Math.min(...window);
    const max = Math.max(...window);
    if (max === min) return 50;
    return round(((value - min) / (max - min)) * 100);
  });
}

export function computeRvol(bars: MarketBar[], lookback = 20): Array<number | null> {
  return bars.map((bar, index) => {
    if (index < lookback) return null;
    const baseline = bars.slice(index - lookback, index).reduce((sum, item) => sum + item.volume, 0) / lookback;
    return baseline === 0 ? null : round(bar.volume / baseline, 2);
  });
}

export function detectOpeningRangeBreakout(bars: MarketBar[], rangeMinutes = 30): OpeningRangeSignal | null {
  if (bars.length < 4) return null;
  const start = new Date(bars[0].time).getTime();
  const rangeEnd = start + rangeMinutes * 60_000;
  const openingBars = bars.filter((bar) => new Date(bar.time).getTime() < rangeEnd);
  const followThrough = bars.filter((bar) => new Date(bar.time).getTime() >= rangeEnd);
  if (openingBars.length === 0 || followThrough.length === 0) return null;

  const rangeHigh = round(Math.max(...openingBars.map((bar) => bar.high)));
  const rangeLow = round(Math.min(...openingBars.map((bar) => bar.low)));
  const breakout = followThrough.find((bar) => bar.close > rangeHigh || bar.close < rangeLow);
  const direction = breakout?.close && breakout.close > rangeHigh ? "bullish" : breakout?.close && breakout.close < rangeLow ? "bearish" : "neutral";

  return {
    rangeHigh,
    rangeLow,
    rangeMinutes,
    breakoutTime: breakout?.time ?? null,
    direction,
    evidence: [
      `${rangeMinutes} minute range: ${formatPrice(rangeLow)} to ${formatPrice(rangeHigh)}.`,
      breakout ? `${direction} break closed at ${formatPrice(breakout.close)}.` : "No close outside the opening range yet."
    ],
    stopAssumption: "Stop modeled at the opposite side of the opening range plus slippage.",
    targetAssumption: "Target modeled from opening-range height and checked against buy-and-hold."
  };
}

export function detectEngulfingEvents(bars: MarketBar[]): PriceEvent[] {
  const events: PriceEvent[] = [];

  for (let index = 1; index < bars.length; index += 1) {
    const previous = bars[index - 1];
    const current = bars[index];
    const previousBearish = previous.close < previous.open;
    const previousBullish = previous.close > previous.open;
    const currentBullish = current.close > current.open;
    const currentBearish = current.close < current.open;
    const previousBodyLow = Math.min(previous.open, previous.close);
    const previousBodyHigh = Math.max(previous.open, previous.close);
    const currentBodyLow = Math.min(current.open, current.close);
    const currentBodyHigh = Math.max(current.open, current.close);
    const engulfs = currentBodyLow <= previousBodyLow && currentBodyHigh >= previousBodyHigh;

    if (engulfs && previousBearish && currentBullish) {
      events.push({
        id: `engulf-${current.time}`,
        type: "bullish-engulfing",
        time: current.time,
        direction: "bullish",
        priceLow: round(current.low),
        priceHigh: round(current.high),
        invalidated: current.low < previous.low,
        evidence: [`Bullish body engulfed the prior bearish body at ${current.time}.`]
      });
    }

    if (engulfs && previousBullish && currentBearish) {
      events.push({
        id: `engulf-${current.time}`,
        type: "bearish-engulfing",
        time: current.time,
        direction: "bearish",
        priceLow: round(current.low),
        priceHigh: round(current.high),
        invalidated: current.high > previous.high,
        evidence: [`Bearish body engulfed the prior bullish body at ${current.time}.`]
      });
    }
  }

  return events;
}

export function detectFairValueGaps(bars: MarketBar[]): PriceEvent[] {
  const events: PriceEvent[] = [];

  for (let index = 2; index < bars.length; index += 1) {
    const left = bars[index - 2];
    const right = bars[index];
    const future = bars.slice(index + 1);

    if (right.low > left.high) {
      const priceLow = round(left.high);
      const priceHigh = round(right.low);
      events.push({
        id: `fvg-${right.time}`,
        type: "bullish-fvg",
        time: right.time,
        direction: "bullish",
        priceLow,
        priceHigh,
        filled: future.some((bar) => bar.low <= priceHigh),
        evidence: [`Three-candle upward imbalance zone spans ${formatPrice(priceLow)} to ${formatPrice(priceHigh)}.`]
      });
    }

    if (right.high < left.low) {
      const priceLow = round(right.high);
      const priceHigh = round(left.low);
      events.push({
        id: `fvg-${right.time}`,
        type: "bearish-fvg",
        time: right.time,
        direction: "bearish",
        priceLow,
        priceHigh,
        filled: future.some((bar) => bar.high >= priceLow),
        evidence: [`Three-candle downward imbalance zone spans ${formatPrice(priceLow)} to ${formatPrice(priceHigh)}.`]
      });
    }
  }

  return events;
}

export function fibonacciLevels(high: number, low: number): FibonacciLevel[] {
  const range = high - low;
  return [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1].map((ratio) => ({
    ratio,
    label: `${round(ratio * 100, 1)}%`,
    price: round(low + range * ratio)
  }));
}

export function summarizeBuyHold(bars: MarketBar[]): BuyHoldSummary {
  const first = bars[0];
  const last = bars[bars.length - 1];
  let peak = first.close;
  let maxDrawdownPct = 0;

  for (const bar of bars) {
    peak = Math.max(peak, bar.close);
    maxDrawdownPct = Math.min(maxDrawdownPct, ((bar.low - peak) / peak) * 100);
  }

  return {
    entry: round(first.open),
    exit: round(last.close),
    returnPct: round(((last.close - first.open) / first.open) * 100),
    maxDrawdownPct: round(maxDrawdownPct)
  };
}

export function buildResearchFindings(bars: MarketBar[]): SignalFinding[] {
  if (bars.length < 3) return [];

  const closes = bars.map((bar) => bar.close);
  const rsi = computeRsi(closes);
  const stochRsi = computeStochRsi(closes);
  const macd = computeMacd(closes);
  const atr = computeAtr(bars);
  const rvol = computeRvol(bars);
  const buyHold = summarizeBuyHold(bars);
  const orb = detectOpeningRangeBreakout(bars, 30);
  const fvg = detectFairValueGaps(bars);
  const engulfing = detectEngulfingEvents(bars);
  const high = Math.max(...bars.map((bar) => bar.high));
  const low = Math.min(...bars.map((bar) => bar.low));
  const fibs = fibonacciLevels(high, low);
  const latestClose = bars.at(-1)!.close;
  const latestRsi = lastFinite(rsi);
  const latestStochRsi = lastFinite(stochRsi);
  const latestMacdHist = lastFinite(macd.hist);
  const latestRvol = lastFinite(rvol);
  const latestAtr = lastFinite(atr);
  const priorClose = bars.at(-2)?.close ?? latestClose;
  const dipFromHighPct = ((latestClose - high) / high) * 100;

  const momentumDirection: SignalDirection = latestRsi !== null && latestMacdHist !== null
    ? latestRsi >= 52 && latestMacdHist >= 0
      ? "bullish"
      : latestRsi <= 48 && latestMacdHist < 0
        ? "bearish"
        : "neutral"
    : "neutral";

  return [
    {
      id: "momentum",
      label: "Momentum Confluence",
      direction: momentumDirection,
      confidence: momentumDirection === "neutral" ? 46 : 62,
      evidence: [
        `RSI ${latestRsi ?? "n/a"}, StochRSI ${latestStochRsi ?? "n/a"}, MACD histogram ${latestMacdHist ?? "n/a"}.`,
        `Latest ATR ${latestAtr ?? "n/a"} frames stop distance and volatility normalization.`
      ],
      limitations: [
        "MACD and StochRSI are confluence inputs only, not standalone edge claims.",
        "Recent technical-rule evidence is mixed after costs; momentum is stronger at portfolio level than single-ticker prediction."
      ]
    },
    {
      id: "orb",
      label: "Opening Range Breakout",
      direction: orb?.direction ?? "neutral",
      confidence: orb?.direction === "neutral" ? 38 : 58,
      evidence: [
        ...(orb?.evidence ?? ["Opening range could not be evaluated."]),
        `RVOL ${latestRvol ?? "n/a"} used as stocks-in-play context.`
      ],
      limitations: [
        orb?.stopAssumption ?? "Stop must be specified before evaluation.",
        orb?.targetAssumption ?? "Target must be compared with buy-and-hold.",
        "ORB requires slippage, spread, and rejection filters before any live-trading use."
      ]
    },
    {
      id: "daily-levels",
      label: "Daily High/Low and Fib Map",
      direction: latestClose >= (high + low) / 2 ? "bullish" : "bearish",
      confidence: 52,
      evidence: [
        `Session high ${formatPrice(high)}, low ${formatPrice(low)}, close ${formatPrice(latestClose)}.`,
        `Key retracement levels: ${fibs.map((level) => `${level.label} ${formatPrice(level.price)}`).join(", ")}.`
      ],
      limitations: [
        "Fib levels are reference levels; they are not statistical proof of support or resistance.",
        "Daily highs/lows need volume and regime context to avoid hindsight anchoring."
      ]
    },
    {
      id: "imbalance",
      label: "FVG / Imbalance Zones",
      direction: fvg.at(-1)?.direction ?? "neutral",
      confidence: fvg.length > 0 ? 48 : 32,
      evidence: fvg.length > 0
        ? [`${fvg.length} three-candle imbalance zones detected; latest ${fvg.at(-1)!.filled ? "has filled/touched" : "is still open"}.`]
        : ["No three-candle imbalance zone detected in the visible data."],
      limitations: [
        "ICT/FVG labels are implemented as testable imbalance zones, not academically proven doctrine.",
        "Fill status and invalidation must be reviewed with volume confirmation."
      ]
    },
    {
      id: "candlestick",
      label: "Engulfing Events",
      direction: engulfing.at(-1)?.direction ?? "neutral",
      confidence: engulfing.length > 0 ? 44 : 30,
      evidence: engulfing.length > 0
        ? [`${engulfing.length} engulfing events detected; latest event at ${engulfing.at(-1)!.time}.`]
        : ["No bullish or bearish engulfing body event detected."],
      limitations: [
        "Candlestick evidence is mixed and context dependent.",
        "Engulfing events are warnings or context markers, not complete trade systems."
      ]
    },
    {
      id: "buy-hold",
      label: "Buy-and-Hold Baseline",
      direction: buyHold.returnPct > 0 ? "bullish" : buyHold.returnPct < 0 ? "bearish" : "neutral",
      confidence: 55,
      evidence: [
        `Session buy-and-hold from ${formatPrice(buyHold.entry)} to ${formatPrice(buyHold.exit)} returned ${percent(buyHold.returnPct)}.`,
        `Max intraperiod drawdown was ${percent(buyHold.maxDrawdownPct)}.`
      ],
      limitations: [
        "Baseline ignores position sizing, taxes, borrowing costs, and overnight risk.",
        "All tactical signals should be compared against this baseline after costs."
      ]
    },
    {
      id: "quality-dip",
      label: "Profitable-Company Dip Proxy",
      direction: latestClose < priorClose && dipFromHighPct < -1 ? "neutral" : latestClose > priorClose ? "bullish" : "neutral",
      confidence: 42,
      evidence: [
        `Latest close changed ${percent(((latestClose - priorClose) / priorClose) * 100)} from the prior bar.`,
        `Close is ${percent(dipFromHighPct)} from the visible high; quality/profitability must come from fundamentals.`
      ],
      limitations: [
        "This is a dip-versus-strength comparison, not proof of company quality.",
        "Gamma-neutral market-maker behavior is modeled only through options-chain proxies."
      ]
    }
  ];
}
