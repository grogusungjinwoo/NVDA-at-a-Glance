import { describe, expect, it } from "vitest";
import type { MarketSession } from "../data/nvdaMap";
import { getLatestTradingDate, normalizeSessionHistory } from "./sessionHistory";

function makeSession(date: string, close: number, status: "historical" | "current-intraday" | "complete" = "historical") {
  return {
    tradingDate: date,
    status,
    candles: [
      {
        timestamp: `${date}T13:30:00.000Z`,
        time: "09:30",
        open: close - 1,
        high: close + 1,
        low: close - 2,
        close,
        volume: 1_000_000
      }
    ]
  };
}

function makeMarketSession(sessions: ReturnType<typeof makeSession>[]): MarketSession {
  const latest = sessions.at(-1)!;

  return {
    symbol: "NVDA",
    sessionDate: latest.tradingDate,
    timezone: "America/New_York",
    source: "test",
    sourceUrl: "https://example.com",
    retrievedAt: "2026-05-18T20:15:00.000Z",
    regularMarketPrice: latest.candles.at(-1)!.close,
    previousClose: latest.candles[0].open,
    sessions,
    candles: latest.candles,
    regions: []
  };
}

describe("session history normalization", () => {
  it("keeps the newest session plus four earlier sessions and preserves candle trading dates", () => {
    const session = makeMarketSession([
      makeSession("2026-05-11", 205),
      makeSession("2026-05-12", 210),
      makeSession("2026-05-13", 215),
      makeSession("2026-05-14", 220),
      makeSession("2026-05-15", 225),
      makeSession("2026-05-18", 230, "current-intraday")
    ]);

    const history = normalizeSessionHistory(session);

    expect(history.map((item) => item.tradingDate)).toEqual([
      "2026-05-12",
      "2026-05-13",
      "2026-05-14",
      "2026-05-15",
      "2026-05-18"
    ]);
    expect(getLatestTradingDate(history)).toBe("2026-05-18");
    expect(history.flatMap((item) => item.candles.map((candle) => candle.tradingDate))).toEqual([
      "2026-05-12",
      "2026-05-13",
      "2026-05-14",
      "2026-05-15",
      "2026-05-18"
    ]);
  });

  it("falls back to top-level candles when no session history exists", () => {
    const session = makeMarketSession([makeSession("2026-05-18", 230, "current-intraday")]);
    const withoutHistory: MarketSession = {
      ...session,
      sessions: undefined,
      candles: session.candles.map((candle) => ({ ...candle, tradingDate: undefined }))
    };

    const history = normalizeSessionHistory(withoutHistory);

    expect(history).toHaveLength(1);
    expect(history[0].tradingDate).toBe("2026-05-18");
    expect(history[0].status).toBe("current-intraday");
    expect(history[0].candles[0].tradingDate).toBe("2026-05-18");
  });
});
