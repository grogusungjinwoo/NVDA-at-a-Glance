import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const SYMBOL = "NVDA";
const TIME_ZONE = "America/New_York";
const YAHOO_CHART_URL = `https://query1.finance.yahoo.com/v8/finance/chart/${SYMBOL}?range=1d&interval=5m&includePrePost=false`;
const OUTPUTS = [
  "src/data/nvdaSession.json",
  "public/data/nvda-session.json"
];

const metricPresets = {
  opening: ["price", "tap", "volume"],
  momentum: ["rsi", "macd", "lift"],
  shelf: ["price", "tap", "ghost"],
  risk: ["risk", "volume", "macd"],
  drift: ["lift", "rsi", "risk"]
};

function round(value, places = 2) {
  const scale = 10 ** places;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatDate(timestamp) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(timestamp * 1000));
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).format(new Date(timestamp * 1000));
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeCandle(timestamp, quote, index) {
  const open = quote.open?.[index];
  const high = quote.high?.[index];
  const low = quote.low?.[index];
  const close = quote.close?.[index];
  const volume = quote.volume?.[index];

  if (![open, high, low, close, volume].every(isFiniteNumber)) return null;
  if (volume <= 0) return null;
  if (low > Math.min(open, close) || high < Math.max(open, close)) return null;

  return {
    timestamp: new Date(timestamp * 1000).toISOString(),
    time: formatTime(timestamp),
    open: round(open),
    high: round(high),
    low: round(low),
    close: round(close),
    volume
  };
}

function summarizeRange(candles, startIndex, endIndex) {
  const slice = candles.slice(startIndex, endIndex + 1);
  const first = slice[0];
  const last = slice[slice.length - 1];
  const high = Math.max(...slice.map((candle) => candle.high));
  const low = Math.min(...slice.map((candle) => candle.low));
  const volume = slice.reduce((sum, candle) => sum + candle.volume, 0);
  const direction = last.close > first.open ? "bullish" : last.close < first.open ? "bearish" : "neutral";
  const move = Math.abs(last.close - first.open);
  const range = Math.max(high - low, 0.01);
  const strength = Math.round(clamp(56 + (move / range) * 24 + Math.log10(Math.max(volume, 10)) * 3, 52, 92));

  return { first, last, high, low, volume, direction, strength };
}

function buildRegion(candles, config) {
  const startIndex = clamp(config.startIndex, 0, candles.length - 1);
  const endIndex = clamp(config.endIndex, startIndex, candles.length - 1);
  const summary = summarizeRange(candles, startIndex, endIndex);

  return {
    id: config.id,
    label: config.label,
    code: config.code,
    timeframe: config.timeframe,
    metrics: config.metrics,
    direction: config.direction ?? summary.direction,
    strength: summary.strength,
    startTimestamp: summary.first.timestamp,
    endTimestamp: summary.last.timestamp,
    priceLow: round(summary.low),
    priceHigh: round(summary.high),
    thesis: config.thesis(summary),
    detail: config.detail(summary)
  };
}

function deriveRegions(candles) {
  const lastIndex = candles.length - 1;
  const highIndex = candles.reduce((best, candle, index) => candle.high > candles[best].high ? index : best, 0);
  const midpoint = Math.max(6, Math.floor(lastIndex * 0.38));

  const openingEnd = Math.min(5, lastIndex);
  const momentumStart = Math.min(openingEnd + 1, lastIndex);
  const momentumEnd = Math.min(Math.max(momentumStart + 6, midpoint), lastIndex);
  const shelfStart = Math.max(0, highIndex - 4);
  const shelfEnd = Math.min(lastIndex, highIndex + 3);
  const riskStart = Math.max(0, highIndex - 1);
  const riskEnd = Math.min(lastIndex, highIndex + Math.max(5, Math.floor(candles.length * 0.18)));
  const driftStart = Math.max(0, lastIndex - Math.max(6, Math.floor(candles.length * 0.24)));

  return [
    buildRegion(candles, {
      id: "opening-drive",
      label: "Opening Drive",
      code: "OD",
      timeframe: "5m",
      startIndex: 0,
      endIndex: openingEnd,
      metrics: metricPresets.opening,
      thesis: ({ last, first }) => `${last.close >= first.open ? "Acceptance" : "Rejection"} from the open sets the first liquidity shelf.`,
      detail: ({ first, last }) => `Opening run spans ${first.time} to ${last.time}, anchoring the first tradable impulse.`
    }),
    buildRegion(candles, {
      id: "momentum-bend",
      label: "Momentum Bend",
      code: "MB",
      timeframe: "15m",
      startIndex: momentumStart,
      endIndex: momentumEnd,
      metrics: metricPresets.momentum,
      thesis: ({ direction }) => `Momentum turns ${direction} as the early trend absorbs participation.`,
      detail: ({ first, last }) => `The ${first.time}-${last.time} pocket checks whether the first move is extending or compressing.`
    }),
    buildRegion(candles, {
      id: "gamma-shelf",
      label: "Gamma Shelf",
      code: "GS",
      timeframe: "30m",
      startIndex: shelfStart,
      endIndex: shelfEnd,
      metrics: metricPresets.shelf,
      thesis: ({ high }) => `Repeated reactions cluster near ${round(high)} and define the session shelf.`,
      detail: ({ first, last }) => `The shelf is derived from the local high window between ${first.time} and ${last.time}.`
    }),
    buildRegion(candles, {
      id: "risk-cone",
      label: "Risk Cone",
      code: "RC",
      timeframe: "1h",
      startIndex: riskStart,
      endIndex: riskEnd,
      metrics: metricPresets.risk,
      direction: "bearish",
      thesis: ({ high, low }) => `Risk expands while price rotates through a ${round(high - low)} point rejection band.`,
      detail: ({ first, last }) => `The risk cone is pinned to the high-response window from ${first.time} to ${last.time}.`
    }),
    buildRegion(candles, {
      id: "auction-drift",
      label: "Auction Drift",
      code: "AD",
      timeframe: "4h",
      startIndex: driftStart,
      endIndex: lastIndex,
      metrics: metricPresets.drift,
      thesis: ({ direction }) => `Late auction drift resolves ${direction} into the closing mark.`,
      detail: ({ first, last }) => `The closing read follows the final regular-session sequence from ${first.time} to ${last.time}.`
    })
  ];
}

async function fetchYahooSession() {
  const response = await fetch(YAHOO_CHART_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 NVDA-at-a-Glance/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Yahoo chart request failed: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  const result = payload.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const timestamps = result?.timestamp;

  if (!result || !quote || !Array.isArray(timestamps)) {
    throw new Error("Yahoo chart payload is missing timestamp or quote arrays.");
  }

  const candles = timestamps
    .map((timestamp, index) => normalizeCandle(timestamp, quote, index))
    .filter(Boolean);

  if (candles.length < 12) {
    throw new Error(`Yahoo chart payload produced only ${candles.length} valid candles.`);
  }

  const sessionDate = formatDate(timestamps[timestamps.length - 1]);
  const lastClose = candles[candles.length - 1].close;

  return {
    symbol: SYMBOL,
    sessionDate,
    timezone: TIME_ZONE,
    source: "Yahoo Finance chart API",
    sourceUrl: YAHOO_CHART_URL,
    retrievedAt: new Date().toISOString(),
    regularMarketPrice: round(result.meta?.regularMarketPrice ?? lastClose),
    previousClose: round(result.meta?.chartPreviousClose ?? result.meta?.previousClose ?? candles[0].open),
    candles,
    regions: deriveRegions(candles)
  };
}

async function writeJson(filePath, data) {
  const absolutePath = resolve(filePath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

const session = await fetchYahooSession();
await Promise.all(OUTPUTS.map((output) => writeJson(output, session)));

console.log(`Updated ${SYMBOL} session ${session.sessionDate} with ${session.candles.length} candles.`);
