import type { MarketBar } from "./marketData";

export interface SessionAnalysis {
  open: number;
  lastClose: number;
  high: number;
  low: number;
  sessionReturnPct: number;
  rangeDollars: number;
  rangePct: number;
  totalVolume: number;
  averageVolume: number;
  vwap: number;
  closeVsVwapPct: number;
  realizedVolatilityPct: number;
  maxDrawdownPct: number;
  pressureScore: number;
  rewardRiskRatio: number;
  trendEfficiencyPct: number;
  trendLabel: "Constructive" | "Balanced" | "Defensive";
}

function round(value: number, places = 2): number {
  const scale = 10 ** places;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

export function computeSessionAnalysis(candles: MarketBar[]): SessionAnalysis {
  if (candles.length === 0) {
    return {
      open: 0,
      lastClose: 0,
      high: 0,
      low: 0,
      sessionReturnPct: 0,
      rangeDollars: 0,
      rangePct: 0,
      totalVolume: 0,
      averageVolume: 0,
      vwap: 0,
      closeVsVwapPct: 0,
      realizedVolatilityPct: 0,
      maxDrawdownPct: 0,
      pressureScore: 0,
      rewardRiskRatio: 0,
      trendEfficiencyPct: 0,
      trendLabel: "Balanced"
    };
  }

  const open = candles[0].open;
  const lastClose = candles[candles.length - 1].close;
  const high = Math.max(...candles.map((candle) => candle.high));
  const low = Math.min(...candles.map((candle) => candle.low));
  const totalVolume = candles.reduce((sum, candle) => sum + candle.volume, 0);
  const vwapNumerator = candles.reduce((sum, candle) => {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    return sum + typicalPrice * candle.volume;
  }, 0);
  const vwap = totalVolume === 0 ? 0 : vwapNumerator / totalVolume;
  const pressureTotal = candles.reduce((sum, candle) => {
    const range = candle.high - candle.low;
    return sum + (range === 0 ? 0.5 : (candle.close - candle.low) / range);
  }, 0);
  const logReturns = candles.map((candle, index) => {
    const previous = index === 0 ? candle.open : candles[index - 1].close;
    return Math.log(candle.close / previous);
  });
  const realizedVolatility = Math.sqrt(logReturns.reduce((sum, value) => sum + value ** 2, 0)) * 100;
  const downsideRoom = Math.max(lastClose - low, 0);
  const upsideRoom = Math.max(high - lastClose, 0);
  const pressureScore = (pressureTotal / candles.length) * 100;
  const sessionReturnPct = ((lastClose - open) / open) * 100;
  const trendEfficiencyPct = ((Math.abs(lastClose - open) / Math.max(high - low, 0.01)) * 100);
  let peak = candles[0].high;
  let maxDrawdownPct = 0;
  for (const candle of candles) {
    peak = Math.max(peak, candle.high);
    maxDrawdownPct = Math.min(maxDrawdownPct, ((candle.low - peak) / peak) * 100);
  }
  const trendLabel = sessionReturnPct > 0.35 && pressureScore >= 50
    ? "Constructive"
    : sessionReturnPct < -0.35 && pressureScore < 50
      ? "Defensive"
      : "Balanced";

  return {
    open: round(open),
    lastClose: round(lastClose),
    high: round(high),
    low: round(low),
    sessionReturnPct: round(sessionReturnPct),
    rangeDollars: round(high - low),
    rangePct: round(((high - low) / open) * 100),
    totalVolume: round(totalVolume),
    averageVolume: round(totalVolume / candles.length),
    vwap: round(vwap),
    closeVsVwapPct: vwap === 0 ? 0 : round(((lastClose - vwap) / vwap) * 100),
    realizedVolatilityPct: round(realizedVolatility),
    maxDrawdownPct: round(Math.abs(maxDrawdownPct)),
    pressureScore: round(pressureScore),
    rewardRiskRatio: downsideRoom === 0 ? 0 : round(upsideRoom / downsideRoom),
    trendEfficiencyPct: round(trendEfficiencyPct),
    trendLabel
  };
}
