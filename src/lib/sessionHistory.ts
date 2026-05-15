import type { Candle, MarketSession, TradingSessionHistory } from "../data/nvdaMap";

export interface NormalizedSessionHistory {
  tradingDate: string;
  status: TradingSessionHistory["status"];
  candles: Candle[];
  previousClose?: number;
  regularMarketPrice?: number;
  coverage?: TradingSessionHistory["coverage"];
}

const DEFAULT_SESSION_LIMIT = 5;

function withTradingDate(candles: Candle[], tradingDate: string): Candle[] {
  return candles.map((candle) => ({
    ...candle,
    tradingDate: candle.tradingDate ?? tradingDate
  }));
}

export function normalizeSessionHistory(session: MarketSession, limit = DEFAULT_SESSION_LIMIT): NormalizedSessionHistory[] {
  const sourceSessions: TradingSessionHistory[] = session.sessions?.length
    ? session.sessions
    : [{
      tradingDate: session.sessionDate,
      status: "current-intraday",
      candles: session.candles,
      previousClose: session.previousClose,
      regularMarketPrice: session.regularMarketPrice,
      coverage: {
        firstTimestamp: session.candles[0]?.timestamp ?? "",
        lastTimestamp: session.candles.at(-1)?.timestamp ?? "",
        candleCount: session.candles.length,
        hasPremarket: session.candles.some((candle) => candle.session === "pre"),
        hasRegular: session.candles.some((candle) => candle.session === "regular"),
        hasPostmarket: session.candles.some((candle) => candle.session === "post")
      }
    }];

  return sourceSessions
    .filter((historySession) => historySession.tradingDate && historySession.candles.length > 0)
    .map((historySession) => ({
      tradingDate: historySession.tradingDate,
      status: historySession.status,
      candles: withTradingDate(historySession.candles, historySession.tradingDate),
      previousClose: historySession.previousClose,
      regularMarketPrice: historySession.regularMarketPrice,
      coverage: historySession.coverage
    }))
    .sort((left, right) => left.tradingDate.localeCompare(right.tradingDate))
    .slice(-Math.max(limit, 1));
}

export function getLatestTradingDate(history: NormalizedSessionHistory[]): string | null {
  return history.at(-1)?.tradingDate ?? null;
}
