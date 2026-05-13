import { spawn } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const SYMBOL = "NVDA";
const TIME_ZONE = "America/New_York";
const YAHOO_CHART_URL = `https://query1.finance.yahoo.com/v8/finance/chart/${SYMBOL}?range=10d&interval=5m&includePrePost=true`;
const HISTORY_SESSION_COUNT = 4;
const SESSION_POLICY = {
  includeExtendedHours: true,
  aggregationAnchor: "regular-open",
  expectedSegments: [
    { id: "pre", startEt: "04:00", endEt: "09:30" },
    { id: "regular", startEt: "09:30", endEt: "16:00" },
    { id: "post", startEt: "16:00", endEt: "20:00" }
  ]
};
const EXTENDED_OPEN_MINUTES = 4 * 60;
const SESSION_OPEN_MINUTES = 9 * 60 + 30;
const SESSION_CLOSE_MINUTES = 16 * 60;
const EXTENDED_CLOSE_MINUTES = 20 * 60;
const LIVE_SCREENSHOT_PORT = 5191;
const LEGACY_SESSION_OUTPUTS = [
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

const demoOptionChain = [
  { contractId: "NVDA260619C00220000", expiry: "2026-06-19", strike: 220, type: "call", volume: 18_400, openInterest: 4_250, iv: 0.44, delta: 0.42, gamma: 0.012, last: 9.85 },
  { contractId: "NVDA260619P00190000", expiry: "2026-06-19", strike: 190, type: "put", volume: 3_200, openInterest: 7_800, iv: 0.39, delta: -0.28, gamma: 0.009, last: 4.1 },
  { contractId: "NVDA260717C00240000", expiry: "2026-07-17", strike: 240, type: "call", volume: 22_100, openInterest: 3_100, iv: 0.48, delta: 0.31, gamma: 0.01, last: 7.2 },
  { contractId: "NVDA260717P00180000", expiry: "2026-07-17", strike: 180, type: "put", volume: 2_100, openInterest: 2_800, iv: 0.42, delta: -0.2, gamma: 0.007, last: 3.35 }
];

const researchAnchors = [
  { label: "Rink 2023 technical-rule cost caveat", href: "https://link.springer.com/article/10.1007/s11408-023-00433-2" },
  { label: "Wiest 2022/2023 momentum evidence", href: "https://link.springer.com/article/10.1007/s11408-022-00417-8" },
  { label: "Zarattini, Barbon, Aziz ORB filters", href: "https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4729284" },
  { label: "Deng et al. 2022 candlestick context", href: "https://journals.sagepub.com/doi/10.1177/21582440221117803" }
];

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

  const timestampIso = new Date(timestamp * 1000).toISOString();
  return {
    timestamp: timestampIso,
    tradingDate: formatDate(timestamp),
    time: formatTime(timestamp),
    session: classifyMarketSession(timestampIso),
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
      timeframe: "10m",
      startIndex: momentumStart,
      endIndex: momentumEnd,
      metrics: metricPresets.momentum,
      thesis: ({ direction }) => `Momentum turns ${direction} as the early trend absorbs participation.`,
      detail: ({ first, last }) => `The ${first.time}-${last.time} pocket checks whether the first move is extending or compressing.`
    }),
    buildRegion(candles, {
      id: "daily-shelf",
      label: "Daily Shelf",
      code: "DS",
      timeframe: "1h",
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

function getZonedParts(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
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

function zonedTimeToUtc(parts) {
  const desiredAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  let estimate = desiredAsUtc;

  for (let index = 0; index < 2; index += 1) {
    const actual = getZonedParts(new Date(estimate));
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    estimate += desiredAsUtc - actualAsUtc;
  }

  return estimate;
}

function getSessionOpenUtc(time) {
  const parts = getZonedParts(new Date(time));
  return zonedTimeToUtc({ ...parts, hour: 9, minute: 30, second: 0 });
}

function getExtendedOpenUtc(time) {
  const parts = getZonedParts(new Date(time));
  return zonedTimeToUtc({ ...parts, hour: 4, minute: 0, second: 0 });
}

function getRegularCloseUtc(time) {
  const parts = getZonedParts(new Date(time));
  return zonedTimeToUtc({ ...parts, hour: 16, minute: 0, second: 0 });
}

function getSegmentAnchorUtc(time) {
  const parts = getZonedParts(new Date(time));
  const minutes = parts.hour * 60 + parts.minute;
  if (minutes < SESSION_OPEN_MINUTES) return getExtendedOpenUtc(time);
  if (minutes < SESSION_CLOSE_MINUTES) return getSessionOpenUtc(time);
  return getRegularCloseUtc(time);
}

function classifyMarketSession(value) {
  const parts = getZonedParts(new Date(value));
  const minutes = parts.hour * 60 + parts.minute;
  if (minutes < SESSION_OPEN_MINUTES) return "pre";
  if (minutes < SESSION_CLOSE_MINUTES) return "regular";
  return "post";
}

function sessionToBars(session) {
  return session.candles.map((bar) => ({
    time: bar.timestamp,
    tradingDate: bar.tradingDate ?? formatDate(Date.parse(bar.timestamp) / 1000),
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
    session: bar.session ?? classifyMarketSession(bar.timestamp),
    sourceIntervalMinutes: 5,
    sourceBarCount: 1
  }));
}

function validateOhlcvBars(baseBars) {
  const errors = [];
  baseBars.forEach((bar, index) => {
    const time = new Date(bar.time).getTime();
    if (!Number.isFinite(time)) errors.push(`bar ${index}: invalid timestamp`);
    if (![bar.open, bar.high, bar.low, bar.close, bar.volume].every(isFiniteNumber)) errors.push(`bar ${index}: non-finite OHLCV`);
    if (bar.volume < 0) errors.push(`bar ${index}: negative volume`);
    if (bar.low > Math.min(bar.open, bar.close)) errors.push(`bar ${index}: low is above body`);
    if (bar.high < Math.max(bar.open, bar.close)) errors.push(`bar ${index}: high is below body`);
  });
  return errors;
}

function statusFor(statuses) {
  if (statuses.includes("fail")) return "fail";
  if (statuses.includes("warn")) return "warn";
  return "pass";
}

function formatClock(hour, minute) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} ET`;
}

function localTimeToIso(tradingDate, hour, minute) {
  const [year, month, day] = tradingDate.split("-").map(Number);
  return new Date(zonedTimeToUtc({ year, month, day, hour, minute, second: 0 })).toISOString();
}

function getExpectedScanWindows(tradingDate) {
  return [
    { id: "open-30m", label: "30m 09:30-10:00 ET candle close", start: [9, 30], end: [10, 0] },
    { id: "open-1h", label: "1h 09:30-10:30 ET window", start: [9, 30], end: [10, 30] },
    { id: "late-session", label: "Late 15:30-close ET window", start: [15, 30], end: [16, 0] }
  ].map((window) => ({
    id: window.id,
    label: window.label,
    startEt: formatClock(window.start[0], window.start[1]),
    endEt: formatClock(window.end[0], window.end[1]),
    startTime: localTimeToIso(tradingDate, window.start[0], window.start[1]),
    endTime: localTimeToIso(tradingDate, window.end[0], window.end[1])
  }));
}

function evaluateScanWindows(bars, tradingDate) {
  return getExpectedScanWindows(tradingDate).map((window) => {
    const startMs = Date.parse(window.startTime);
    const endMs = Date.parse(window.endTime);
    const windowBars = bars.filter((bar) => {
      const time = new Date(bar.time).getTime();
      return Number.isFinite(time) && time >= startMs && time < endMs;
    });
    const last = windowBars.at(-1);
    return {
      ...window,
      status: last ? "pass" : "fail",
      barCount: windowBars.length,
      closeTime: window.endTime,
      close: last?.close ?? null,
      volume: windowBars.reduce((sum, bar) => sum + (isFiniteNumber(bar.volume) ? bar.volume : 0), 0),
      detail: last
        ? `${windowBars.length} bars found; close ${round(last.close)} at ${window.endEt}.`
        : `No bars found for ${window.startEt}-${window.endEt}.`
    };
  });
}

function evaluateTimestampOrder(bars) {
  const errors = [];
  let previousTime = Number.NEGATIVE_INFINITY;
  bars.forEach((bar, index) => {
    const time = new Date(bar.time).getTime();
    if (!Number.isFinite(time)) return;
    if (time <= previousTime) errors.push(`bar ${index}: timestamp is not strictly after previous bar`);
    previousTime = time;
  });
  return {
    id: "timestamp-order",
    label: "Timestamp order",
    status: errors.length > 0 ? "fail" : "pass",
    detail: errors.length > 0 ? errors.join("; ") : `${bars.length} bars are strictly ordered.`
  };
}

function evaluateSessionOpen(bars, tradingDate) {
  const firstTime = new Date(bars[0]?.time ?? "").getTime();
  const extended = SESSION_POLICY.includeExtendedHours;
  const expectedOpenMinutes = extended ? EXTENDED_OPEN_MINUTES : SESSION_OPEN_MINUTES;
  const expectedCloseMinutes = extended ? EXTENDED_CLOSE_MINUTES : SESSION_CLOSE_MINUTES;
  const expectedOpenHour = Math.floor(expectedOpenMinutes / 60);
  const expectedOpenMinute = expectedOpenMinutes % 60;
  const label = extended ? "Extended-hours session alignment" : "09:30 ET session alignment";
  if (!Number.isFinite(firstTime)) {
    return { id: "session-open", label, status: "fail", detail: "First bar timestamp is missing or invalid." };
  }
  const [year, month, day] = tradingDate.split("-").map(Number);
  const firstParts = getZonedParts(new Date(firstTime));
  const firstMinutes = firstParts.hour * 60 + firstParts.minute;
  const startsAtOpen = firstParts.year === year && firstParts.month === month && firstParts.day === day && firstMinutes === expectedOpenMinutes;
  const startsAtRegularOpen = extended && firstParts.year === year && firstParts.month === month && firstParts.day === day && firstMinutes === SESSION_OPEN_MINUTES;
  const outsideSessionCount = bars.filter((bar) => {
    const time = new Date(bar.time).getTime();
    if (!Number.isFinite(time)) return false;
    const parts = getZonedParts(new Date(time));
    const minutes = parts.hour * 60 + parts.minute;
    return parts.year !== year || parts.month !== month || parts.day !== day || minutes < expectedOpenMinutes || minutes >= expectedCloseMinutes;
  }).length;
  const status = startsAtOpen && outsideSessionCount === 0
    ? "pass"
    : startsAtRegularOpen && outsideSessionCount === 0
      ? "warn"
      : "fail";
  return {
    id: "session-open",
    label,
    status,
    detail: status === "pass"
      ? extended
        ? "Bars cover the expected 4:00 AM-8:00 PM ET extended session segments."
        : "Bars start at 09:30 ET and remain inside the regular session."
      : status === "warn"
        ? "Extended hours were requested, but the provider payload started at the regular 09:30 ET open."
      : [
        startsAtOpen ? null : `first bar starts at ${formatClock(firstParts.hour, firstParts.minute)} instead of ${formatClock(expectedOpenHour, expectedOpenMinute)}`,
        outsideSessionCount > 0 ? `${outsideSessionCount} bars are outside the expected ${extended ? "4:00 AM-8:00 PM ET" : "regular"} session` : null
      ].filter(Boolean).join("; ")
  };
}

function normalizeArtifactPath(path) {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

function artifactExtensionMatches(kind, path) {
  const patterns = {
    report: /\.json$/i,
    pdf: /\.pdf$/i,
    calendar: /\.(ics|json)$/i,
    pylab: /\.(png|jpe?g|webp|svg)$/i,
    chart: /\.(png|jpe?g|webp|svg)$/i,
    screenshot: /\.(png|jpe?g|webp)$/i
  };
  return patterns[kind]?.test(path) ?? false;
}

function evaluateArtifactReferences(artifacts, availablePaths) {
  const available = new Set(availablePaths.map(normalizeArtifactPath));
  return artifacts.map((artifact) => {
    const path = normalizeArtifactPath(artifact.path);
    const pathIsRelative = path.length > 0 && !path.startsWith("/") && !path.split("/").includes("..");
    const extensionMatches = artifactExtensionMatches(artifact.kind, path);
    const exists = available.has(path);
    const required = artifact.required ?? false;
    const status = !pathIsRelative || !extensionMatches || (required && !exists)
      ? "fail"
      : exists
        ? "pass"
        : "warn";
    const detail = !pathIsRelative
      ? "Path must be a relative public artifact path."
      : !extensionMatches
        ? `${artifact.kind} artifact path has an unexpected extension.`
        : exists
          ? "Referenced artifact is available."
          : required
            ? "Required artifact is missing."
            : "Optional artifact is not available.";
    return { ...artifact, path, required, status, exists, detail };
  });
}

function evaluateIndicatorAvailability(timeframes) {
  return Object.entries(timeframes).sort(([left], [right]) => left.localeCompare(right)).map(([timeframe, frame]) => {
    const rsiAvailable = frame.rsi?.some(isFiniteNumber) ?? false;
    const macdAvailable = frame.macd?.hist?.some(isFiniteNumber) ?? false;
    const macdSlopeAvailable = frame.macd?.slope?.some(isFiniteNumber) ?? false;
    const stochRsiAvailable = frame.stochRsi?.value?.some(isFiniteNumber) ?? false;
    const preLiftAvailable = (frame.preLift?.angleRadians?.some(isFiniteNumber) ?? false) && (frame.preLift?.lift?.some(isFiniteNumber) ?? false);
    const status = rsiAvailable && macdAvailable && macdSlopeAvailable && stochRsiAvailable && preLiftAvailable ? "pass" : "warn";
    return {
      timeframe,
      status,
      rsiAvailable,
      macdAvailable,
      macdSlopeAvailable,
      stochRsiAvailable,
      preLiftAvailable,
      detail: status === "pass"
        ? `${timeframe} RSI, MACD histogram/slope, StochRSI, and PRE/Lift are available.`
        : `${timeframe} missing ${[
          rsiAvailable ? null : "RSI",
          macdAvailable ? null : "MACD histogram",
          macdSlopeAvailable ? null : "MACD slope",
          stochRsiAvailable ? null : "StochRSI",
          preLiftAvailable ? null : "PRE/Lift"
        ].filter(Boolean).join(" and ")}.`
    };
  });
}

function directionAligned(direction, movePct, neutralMoveThresholdPct = 0.25) {
  if (direction === "bullish") return movePct > neutralMoveThresholdPct;
  if (direction === "bearish") return movePct < -neutralMoveThresholdPct;
  return Math.abs(movePct) <= neutralMoveThresholdPct;
}

function buildDelayedOutcome({ tradingDate, findings, previousDaily, nextDaily, currentClose }) {
  const source = nextDaily && findings.length > 0
    ? { kind: "current-to-next", fromDate: tradingDate, toDate: nextDaily.tradingDate, fromClose: currentClose, toClose: nextDaily.close, findings }
    : previousDaily?.findings?.length
      ? { kind: "previous-to-current", fromDate: previousDaily.tradingDate, toDate: tradingDate, fromClose: previousDaily.close, toClose: currentClose, findings: previousDaily.findings }
      : null;
  if (!source || !isFiniteNumber(source.fromClose) || !isFiniteNumber(source.toClose) || source.fromClose === 0) return undefined;

  const movePct = round(((source.toClose - source.fromClose) / source.fromClose) * 100, 4);
  const evaluations = source.findings.map((finding) => {
    const aligned = directionAligned(finding.direction, movePct);
    return {
      findingId: finding.id,
      label: finding.label,
      direction: finding.direction,
      confidence: finding.confidence,
      aligned,
      scorePct: aligned ? 100 : 0
    };
  });
  if (evaluations.length === 0) return undefined;

  return {
    source: source.kind,
    fromDate: source.fromDate,
    toDate: source.toDate,
    fromClose: round(source.fromClose),
    toClose: round(source.toClose),
    movePct,
    scorePct: round(evaluations.reduce((sum, item) => sum + item.scorePct, 0) / evaluations.length),
    evaluations
  };
}

function buildAccuracyCheck({ tradingDate, generatedAt, bars, timeframes, findings, artifacts, availablePaths, previousDaily, nextDaily }) {
  const ohlcvErrors = validateOhlcvBars(bars);
  const scanWindows = evaluateScanWindows(bars, tradingDate);
  const indicatorAvailability = evaluateIndicatorAvailability(timeframes);
  const artifactReferences = evaluateArtifactReferences(artifacts, availablePaths);
  const outcome = buildDelayedOutcome({ tradingDate, findings, previousDaily, nextDaily, currentClose: bars.at(-1)?.close });
  const checks = [
    {
      id: "ohlcv",
      label: "OHLCV validity",
      status: ohlcvErrors.length > 0 ? "fail" : "pass",
      detail: ohlcvErrors.length > 0 ? ohlcvErrors.join("; ") : `${bars.length} OHLCV bars are valid.`
    },
    evaluateTimestampOrder(bars),
    evaluateSessionOpen(bars, tradingDate),
    {
      id: "scan-windows",
      label: "Expected scan windows",
      status: statusFor(scanWindows.map((window) => window.status)),
      detail: scanWindows.every((window) => window.status === "pass") ? "All expected scan windows have data." : scanWindows.filter((window) => window.status !== "pass").map((window) => window.detail).join("; ")
    },
    {
      id: "indicator-availability",
      label: "Indicator availability",
      status: indicatorAvailability.length === 0 ? "warn" : statusFor(indicatorAvailability.map((indicator) => indicator.status)),
      detail: indicatorAvailability.length === 0 ? "No indicator frames were supplied." : indicatorAvailability.filter((indicator) => indicator.status !== "pass").map((indicator) => indicator.detail).join("; ") || "Supplied indicator frames include RSI and MACD histogram values."
    },
    {
      id: "artifact-references",
      label: "Artifact references",
      status: statusFor(artifactReferences.map((artifact) => artifact.status)),
      detail: artifactReferences.filter((artifact) => artifact.status !== "pass").map((artifact) => `${artifact.id}: ${artifact.detail}`).join("; ") || "All required artifact references are available."
    }
  ];

  return {
    status: statusFor([...checks.map((check) => check.status), ...scanWindows.map((window) => window.status), ...indicatorAvailability.map((indicator) => indicator.status), ...artifactReferences.map((artifact) => artifact.status)]),
    tradingDate,
    generatedAt,
    checks,
    scanWindows,
    indicatorAvailability,
    artifactReferences,
    ...(outcome ? { outcome } : {})
  };
}

function resampleBars(baseBars, targetMinutes) {
  const bucketMs = targetMinutes * 60_000;
  const buckets = new Map();

  for (const bar of baseBars) {
    const time = new Date(bar.time).getTime();
    if (!Number.isFinite(time)) continue;
    const segmentAnchor = getSegmentAnchorUtc(time);
    const bucketStart = segmentAnchor + Math.floor((time - segmentAnchor) / bucketMs) * bucketMs;
    const current = buckets.get(bucketStart) ?? [];
    current.push(bar);
    buckets.set(bucketStart, current);
  }

  return [...buckets.entries()].sort(([left], [right]) => left - right).map(([bucketStart, bars]) => {
    const volume = bars.reduce((sum, bar) => sum + bar.volume, 0);
    const vwap = volume === 0
      ? bars.at(-1).close
      : bars.reduce((sum, bar) => sum + ((bar.high + bar.low + bar.close) / 3) * bar.volume, 0) / volume;
    return {
      time: new Date(bucketStart).toISOString(),
      tradingDate: bars[0].tradingDate ?? formatDate(bucketStart / 1000),
      open: round(bars[0].open),
      high: round(Math.max(...bars.map((bar) => bar.high))),
      low: round(Math.min(...bars.map((bar) => bar.low))),
      close: round(bars.at(-1).close),
      volume: Math.round(volume),
      vwap: round(vwap),
      session: classifyMarketSession(new Date(bucketStart).toISOString()),
      sourceIntervalMinutes: targetMinutes,
      sourceBarCount: bars.reduce((sum, bar) => sum + (bar.sourceBarCount ?? 1), 0),
      isPartial: bars.some((bar) => bar.isPartial) || bars.length < Math.max(1, targetMinutes / 5)
    };
  });
}

function computeEma(series, length) {
  const alpha = 2 / (length + 1);
  let previous = null;
  return series.map((value) => {
    if (!isFiniteNumber(value)) return null;
    previous = previous === null ? value : alpha * value + (1 - alpha) * previous;
    return previous;
  });
}

function computeRsi(close, length = 14) {
  const output = Array(close.length).fill(null);
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
  return output.map((value) => value === null ? null : round(value));
}

function computeMacd(close, fast = 12, slow = 26, signalLength = 9) {
  const fastEma = computeEma(close, fast);
  const slowEma = computeEma(close, slow);
  const line = close.map((_, index) => fastEma[index] === null || slowEma[index] === null ? null : fastEma[index] - slowEma[index]);
  const signal = computeEma(line, signalLength);
  const hist = line.map((value, index) => value === null || signal[index] === null ? null : value - signal[index]);
  const slope = hist.map((value, index) => value === null || index === 0 || hist[index - 1] === null ? null : value - hist[index - 1]);
  return {
    line: line.map((value) => value === null ? null : round(value, 4)),
    signal: signal.map((value) => value === null ? null : round(value, 4)),
    hist: hist.map((value) => value === null ? null : round(value, 4)),
    slope: slope.map((value) => value === null ? null : round(value, 4))
  };
}

function movingAverage(values, length) {
  return values.map((_, index) => {
    const window = values.slice(Math.max(0, index - length + 1), index + 1);
    if (window.length < length || window.some((value) => value === null)) return null;
    return round(window.reduce((sum, value) => sum + value, 0) / length);
  });
}

function computeStochRsi(close, rsiLength = 14, stochLength = 14, smoothLength = 3) {
  const rsi = computeRsi(close, rsiLength);
  const value = rsi.map((current, index) => {
    if (current === null) return null;
    const window = rsi.slice(Math.max(0, index - stochLength + 1), index + 1);
    if (window.length < stochLength || window.some((item) => item === null)) return null;
    const low = Math.min(...window);
    const high = Math.max(...window);
    const range = high - low;
    return round(range === 0 ? 0 : ((current - low) / range) * 100);
  });
  const k = movingAverage(value, smoothLength);
  const d = movingAverage(k, smoothLength);
  return { value, k, d, rsiLength, stochLength };
}

function computePreLift(bars, phi = 1.618) {
  const volumeMax = Math.max(...bars.map((bar) => bar.volume), 1);
  const deltaMinutes = bars.map((bar, index) => {
    if (index === 0) return null;
    const current = new Date(bar.time).getTime();
    const previous = new Date(bars[index - 1].time).getTime();
    if (!Number.isFinite(current) || !Number.isFinite(previous) || current <= previous) return null;
    return (current - previous) / 60000;
  });
  const angleRadians = deltaMinutes.map((delta) => delta === null || delta === 0 ? null : round(Math.atan(phi / delta), 6));
  const angleDegrees = angleRadians.map((angle) => angle === null ? null : round((angle * 180) / Math.PI, 4));
  const pre = bars.map((bar, index) => {
    const angle = angleDegrees[index];
    if (angle === null || bar.open === 0) return null;
    return round(((bar.close - bar.open) / bar.open) * angle, 4);
  });
  const lift = bars.map((bar, index) => {
    const angle = angleDegrees[index];
    if (angle === null) return null;
    return round((bar.volume / volumeMax) * angle, 4);
  });
  return { phi, deltaMinutes, angleRadians, angleDegrees, pre, lift };
}

function buildTimeframes(baseBars) {
  const tenMinute = resampleBars(baseBars, 10);
  const frames = {
    "10m": tenMinute,
    "30m": resampleBars(tenMinute, 30),
    "1h": resampleBars(tenMinute, 60),
    "4h": resampleBars(tenMinute, 240)
  };

  return Object.fromEntries(Object.entries(frames).map(([timeframe, bars]) => {
    const closes = bars.map((bar) => bar.close);
    return [timeframe, {
      timeframe,
      intervalMinutes: timeframe === "10m" ? 10 : timeframe === "30m" ? 30 : timeframe === "1h" ? 60 : 240,
      sourceTimeframe: timeframe === "10m" ? "5m" : "10m",
      bars,
      rsi: computeRsi(closes),
      macd: computeMacd(closes),
      stochRsi: computeStochRsi(closes),
      preLift: computePreLift(bars)
    }];
  }));
}

function lastFinite(values) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (isFiniteNumber(values[index])) return values[index];
  }
  return null;
}

function buildLevels(bars) {
  const high = Math.max(...bars.map((bar) => bar.high));
  const low = Math.min(...bars.map((bar) => bar.low));
  const range = high - low;
  return {
    dailyHigh: round(high),
    dailyLow: round(low),
    fibonacci: [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1].map((ratio) => ({
      ratio,
      label: `${round(ratio * 100, 1)}%`,
      price: round(low + range * ratio)
    }))
  };
}

function buildResearchFindings(bars, frame) {
  const closes = bars.map((bar) => bar.close);
  const levels = buildLevels(bars);
  const first = bars[0];
  const last = bars.at(-1);
  const rsi = lastFinite(frame.rsi);
  const macdHist = lastFinite(frame.macd.hist);
  const returnPct = ((last.close - first.open) / first.open) * 100;
  const opening = bars.slice(0, 3);
  const openingHigh = Math.max(...opening.map((bar) => bar.high));
  const openingLow = Math.min(...opening.map((bar) => bar.low));
  const orbDirection = last.close > openingHigh ? "bullish" : last.close < openingLow ? "bearish" : "neutral";
  const fvgCount = bars.slice(2).filter((bar, index) => bar.low > bars[index].high || bar.high < bars[index].low).length;
  const momentumDirection = rsi !== null && macdHist !== null && rsi >= 52 && macdHist >= 0 ? "bullish" : rsi !== null && macdHist !== null && rsi <= 48 && macdHist < 0 ? "bearish" : "neutral";

  return [
    {
      id: "momentum",
      label: "Momentum Confluence",
      direction: momentumDirection,
      confidence: momentumDirection === "neutral" ? 46 : 62,
      evidence: [`RSI ${rsi ?? "n/a"} and MACD histogram ${macdHist ?? "n/a"}.`, "Momentum is evaluated as confluence against recent price and volume."],
      limitations: ["MACD and StochRSI are confluence inputs only, not standalone edge claims.", "Recent technical-rule evidence is mixed after costs."]
    },
    {
      id: "orb",
      label: "Opening Range Breakout",
      direction: orbDirection,
      confidence: orbDirection === "neutral" ? 38 : 58,
      evidence: [`Opening proxy range ${round(openingLow)} to ${round(openingHigh)}.`, "Requires stocks-in-play, stop, target, and slippage assumptions."],
      limitations: ["ORB must be filtered by RVOL and compared with buy-and-hold.", "No personalized financial advice."]
    },
    {
      id: "daily-levels",
      label: "Daily High/Low and Fib Map",
      direction: last.close >= (levels.dailyHigh + levels.dailyLow) / 2 ? "bullish" : "bearish",
      confidence: 52,
      evidence: [`Session high ${levels.dailyHigh}, low ${levels.dailyLow}.`, `Fib 61.8% ${levels.fibonacci.find((level) => level.ratio === 0.618).price}.`],
      limitations: ["Fib levels are references, not proof of support or resistance.", "Daily highs/lows require market-structure context."]
    },
    {
      id: "imbalance",
      label: "FVG / Imbalance Zones",
      direction: fvgCount > 0 ? "neutral" : "neutral",
      confidence: fvgCount > 0 ? 48 : 32,
      evidence: [`${fvgCount} three-candle imbalance zones detected.`, "Zones are tracked for fill status and invalidation in the UI model."],
      limitations: ["ICT/FVG is treated as a testable imbalance zone, not doctrine.", "Volume confirmation is required."]
    },
    {
      id: "buy-hold",
      label: "Buy-and-Hold Baseline",
      direction: returnPct > 0 ? "bullish" : returnPct < 0 ? "bearish" : "neutral",
      confidence: 55,
      evidence: [`Session buy-and-hold return ${returnPct >= 0 ? "+" : ""}${round(returnPct)}%.`, "All tactical reads are compared against this baseline."],
      limitations: ["Baseline ignores taxes, borrowing costs, and overnight risk.", "Costs and slippage can dominate intraday edges."]
    },
    {
      id: "quality-dip",
      label: "Profitable-Company Dip Proxy",
      direction: last.close > closes.at(-2) ? "bullish" : "neutral",
      confidence: 42,
      evidence: [`Latest close ${round(last.close)} versus prior ${round(closes.at(-2) ?? last.close)}.`, "Quality/profitability requires separate fundamental data."],
      limitations: ["This is a dip-versus-strength comparison only.", "Gamma-neutral market-maker behavior is proxied from options data."]
    }
  ];
}

function scanUnusualOptions(chain, spot) {
  return chain
    .filter((row) => row.volume >= 1_000 && row.openInterest > 0)
    .map((row) => {
      const volumeOpenInterestRatio = row.volume / row.openInterest;
      const notionalProxy = row.volume * (row.last ?? 0) * 100;
      const score = volumeOpenInterestRatio * 35 + Math.log10(Math.max(row.volume, 10)) * 12 - Math.abs(row.strike - spot) / Math.max(spot, 1) * 40;
      return {
        ...row,
        volumeOpenInterestRatio: round(volumeOpenInterestRatio, 2),
        notionalProxy: round(notionalProxy),
        score: round(score, 1),
        evidence: [`${row.volume.toLocaleString()} volume against ${row.openInterest.toLocaleString()} OI.`],
        limitations: ["Demo/persisted chain only; live scans require a licensed provider."]
      };
    })
    .filter((row) => row.volumeOpenInterestRatio >= 1.5 || row.score >= 80)
    .sort((left, right) => right.score - left.score);
}

function buildGammaProfile(chain, spot) {
  const byStrike = [...new Set(chain.map((row) => row.strike))].sort((left, right) => left - right).map((strike) => {
    const rows = chain.filter((row) => row.strike === strike);
    const callGamma = rows.filter((row) => row.type === "call").reduce((sum, row) => sum + (row.gamma ?? 0) * row.openInterest * 100 * spot, 0);
    const putGamma = rows.filter((row) => row.type === "put").reduce((sum, row) => sum - (row.gamma ?? 0) * row.openInterest * 100 * spot, 0);
    return { strike, callGamma: round(callGamma), putGamma: round(putGamma), netGammaProxy: round(callGamma + putGamma) };
  });
  const neutral = byStrike.reduce((best, row) => !best || Math.abs(row.netGammaProxy) < Math.abs(best.netGammaProxy) ? row : best, null);
  return {
    byStrike,
    gammaNeutralEstimate: neutral?.strike ?? null,
    netGammaProxy: round(byStrike.reduce((sum, row) => sum + row.netGammaProxy, 0)),
    disclaimer: "Dealer gamma is a proxy from public chain OI/Greeks; actual market-maker inventory is not observable."
  };
}

function escapePdfText(value) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildDailyReport({ tradingDate, generatedAt, bars, findings, accuracy, chartImages, calendarLinks, indicatorSnapshots }) {
  const first = bars[0];
  const last = bars.at(-1);
  const returnPct = ((last.close - first.open) / first.open) * 100;
  return {
    symbol: SYMBOL,
    tradingDate,
    generatedAt,
    summary: `${SYMBOL} delayed research data for ${tradingDate}: ${findings.length} signal modules evaluated; session return ${returnPct >= 0 ? "+" : ""}${round(returnPct)}%.`,
    findings,
    pdfPath: `reports/${tradingDate}/report.pdf`,
    reportPath: `reports/${tradingDate}/report.json`,
    calendarPath: "reports/calendar.ics",
    ...(accuracy ? { accuracy } : {}),
    ...(chartImages ? { chartImages } : {}),
    ...(calendarLinks ? { calendarLinks } : {}),
    ...(indicatorSnapshots ? { indicatorSnapshots } : {}),
    disclaimer: "Educational research output only. Not financial advice."
  };
}

function buildPdfBytes(report) {
  const accuracyLines = report.accuracy ? [
    `Accuracy check: ${report.accuracy.status.toUpperCase()}`,
    ...report.accuracy.scanWindows.map((window) => `${window.label}: ${window.status.toUpperCase()} close ${window.close ?? "n/a"}`)
  ] : [];
  const chartLines = report.chartImages?.map((chart) => chart.kind === "screenshot"
    ? `Live UI screenshot: ${chart.label} (${chart.path})`
    : `Chart artifact: ${chart.label} (${chart.path})`) ?? [];
  const indicatorLines = Object.values(report.indicatorSnapshots ?? {}).map((snapshot) => (
    `${snapshot.timeframe} indicators: RSI ${snapshot.rsi ?? "n/a"}, MACD hist ${snapshot.macdHistogram ?? "n/a"}, slope ${snapshot.macdSlope ?? "n/a"}, StochRSI ${snapshot.stochRsi ?? "n/a"}, PRE angle ${snapshot.preLiftAngleDegrees ?? "n/a"}, lift ${snapshot.preLift ?? "n/a"}`
  ));
  const lines = [
    `${report.symbol} Daily Quant Research`,
    report.tradingDate,
    "Session summary",
    report.summary,
    report.disclaimer,
    "Validation",
    ...accuracyLines,
    "Generated chart artifacts",
    ...chartLines,
    "Indicator snapshots",
    ...indicatorLines,
    "Signals and levels",
    ...report.findings.flatMap((finding) => [
      `${finding.label}: ${finding.direction.toUpperCase()} (${finding.confidence}%)`,
      finding.evidence.join(" "),
      finding.limitations.join(" ")
    ])
  ].map((line) => line.slice(0, 110));
  const content = [
    "BT",
    "/F1 18 Tf",
    "54 760 Td",
    `(${escapePdfText(lines[0])}) Tj`,
    "/F1 10 Tf",
    ...lines.slice(1, 32).flatMap((line) => ["0 -18 Td", `(${escapePdfText(line)}) Tj`]),
    "ET"
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefStart = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f\n`;
  offsets.slice(1).forEach((offset) => {
    body += `${offset.toString().padStart(10, "0")} 00000 n\n`;
  });
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(body, "utf8");
}

function formatIcsDate(value) {
  return value.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function buildCalendarArtifacts(reports) {
  const linkedReports = linkCalendarReports(reports);
  const manifest = linkedReports.map((report) => ({
    date: report.tradingDate,
    title: `${report.symbol} research report ${report.tradingDate}`,
    reportPath: report.reportPath,
    pdfPath: report.pdfPath,
    generatedAt: report.generatedAt,
    ...(report.calendarLinks?.previous ? { previous: report.calendarLinks.previous } : {}),
    ...(report.calendarLinks?.next ? { next: report.calendarLinks.next } : {})
  })).sort((left, right) => right.date.localeCompare(left.date));

  const events = linkedReports.map((report) => [
    "BEGIN:VEVENT",
    `UID:nvda-research-${report.tradingDate}@nvda-at-a-glance`,
    `DTSTAMP:${formatIcsDate(report.generatedAt)}`,
    `DTSTART;VALUE=DATE:${report.tradingDate.replace(/-/g, "")}`,
    `SUMMARY:NVDA research report ${report.tradingDate}`,
    `DESCRIPTION:${report.summary.replace(/[,;]/g, " ")}`,
    "END:VEVENT"
  ].join("\r\n"));

  return {
    manifest,
    ics: ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//NVDA at a Glance//Research Reports//EN", "CALSCALE:GREGORIAN", ...events, "END:VCALENDAR", ""].join("\r\n")
  };
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

  const sessions = [...candles.reduce((groups, candle) => {
    const current = groups.get(candle.tradingDate) ?? [];
    current.push(candle);
    groups.set(candle.tradingDate, current);
    return groups;
  }, new Map()).entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-HISTORY_SESSION_COUNT)
    .map(([tradingDate, sessionCandles], index, selectedSessions) => ({
      tradingDate,
      status: index === selectedSessions.length - 1 ? "current-intraday" : "historical",
      candles: sessionCandles,
      previousClose: index > 0 ? selectedSessions[index - 1][1].at(-1)?.close : undefined,
      regularMarketPrice: sessionCandles.at(-1)?.close,
      coverage: {
        firstTimestamp: sessionCandles[0].timestamp,
        lastTimestamp: sessionCandles.at(-1).timestamp,
        candleCount: sessionCandles.length,
        hasPremarket: sessionCandles.some((candle) => candle.session === "pre"),
        hasRegular: sessionCandles.some((candle) => candle.session === "regular"),
        hasPostmarket: sessionCandles.some((candle) => candle.session === "post")
      }
    }));

  if (sessions.length === 0) {
    throw new Error("Yahoo chart payload produced no grouped trading sessions.");
  }

  const latestSession = sessions.at(-1);
  const sessionDate = latestSession.tradingDate;
  const lastClose = latestSession.candles.at(-1).close;

  return {
    symbol: SYMBOL,
    sessionDate,
    timezone: TIME_ZONE,
    source: "Yahoo Finance chart API",
    sourceUrl: YAHOO_CHART_URL,
    sessionPolicy: SESSION_POLICY,
    retrievedAt: new Date().toISOString(),
    regularMarketPrice: round(result.meta?.regularMarketPrice ?? lastClose),
    previousClose: round(result.meta?.chartPreviousClose ?? result.meta?.previousClose ?? latestSession.candles[0].open),
    sessions,
    candles: latestSession.candles,
    regions: deriveRegions(latestSession.candles)
  };
}

async function loadFallbackSession(error) {
  const raw = await readFile(resolve("src/data/nvdaSession.json"), "utf8");
  const session = JSON.parse(raw);
  const fallbackCandles = session.candles.map((candle) => ({
    ...candle,
    tradingDate: candle.tradingDate ?? session.sessionDate
  }));
  return {
    ...session,
    sourceUrl: YAHOO_CHART_URL,
    sessionPolicy: session.sessionPolicy ?? SESSION_POLICY,
    source: `${session.source ?? "Packaged fallback"} (fallback after refresh error: ${error.message})`,
    retrievedAt: new Date().toISOString(),
    candles: fallbackCandles,
    sessions: session.sessions ?? [{
      tradingDate: session.sessionDate,
      status: "current-intraday",
      candles: fallbackCandles,
      previousClose: session.previousClose,
      regularMarketPrice: session.regularMarketPrice,
      coverage: {
        firstTimestamp: fallbackCandles[0]?.timestamp ?? "",
        lastTimestamp: fallbackCandles.at(-1)?.timestamp ?? "",
        candleCount: fallbackCandles.length,
        hasPremarket: fallbackCandles.some((candle) => candle.session === "pre"),
        hasRegular: fallbackCandles.some((candle) => candle.session === "regular"),
        hasPostmarket: fallbackCandles.some((candle) => candle.session === "post")
      }
    }]
  };
}

async function writeJson(filePath, data) {
  const absolutePath = resolve(filePath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function writeBinary(filePath, data) {
  const absolutePath = resolve(filePath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, data);
}

async function writeText(filePath, data) {
  const absolutePath = resolve(filePath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, data, "utf8");
}

function escapeSvgText(value) {
  return String(value).replace(/[&<>"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;"
  }[character]));
}

function svgPolylinePoints(values, width = 720, height = 260, padding = 38) {
  const finiteValues = values
    .map((value, index) => ({ value, index }))
    .filter((item) => isFiniteNumber(item.value));
  if (finiteValues.length === 0) return "";
  const min = Math.min(...finiteValues.map((item) => item.value));
  const max = Math.max(...finiteValues.map((item) => item.value));
  const span = max - min || 1;
  const denominator = Math.max(values.length - 1, 1);
  return finiteValues.map((item) => {
    const x = padding + (item.index / denominator) * (width - padding * 2);
    const y = height - padding - ((item.value - min) / span) * (height - padding * 2);
    return `${round(x, 1)},${round(y, 1)}`;
  }).join(" ");
}

function buildLineSvg(title, seriesEntries) {
  const width = 720;
  const height = 260;
  const legend = seriesEntries.map((entry, index) => (
    `<g transform="translate(${40 + index * 160} 236)"><rect width="10" height="10" fill="${entry.color}" rx="2"/><text x="16" y="10">${escapeSvgText(entry.label)}</text></g>`
  )).join("");
  const polylines = seriesEntries.map((entry) => {
    const points = svgPolylinePoints(entry.values, width, height);
    return points ? `<polyline points="${points}" fill="none" stroke="${entry.color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>` : "";
  }).join("");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeSvgText(title)}">`,
    `<rect width="${width}" height="${height}" fill="#07110d"/>`,
    `<text x="36" y="30" fill="#e5f4ea" font-family="Arial, sans-serif" font-size="18">${escapeSvgText(title)}</text>`,
    `<line x1="38" y1="210" x2="682" y2="210" stroke="#245242" stroke-width="1"/>`,
    `<line x1="38" y1="48" x2="38" y2="210" stroke="#245242" stroke-width="1"/>`,
    polylines,
    `<g fill="#a9c8b7" font-family="Arial, sans-serif" font-size="12">${legend}</g>`,
    "</svg>"
  ].join("");
}

function buildSignalPressure(frame) {
  return frame.bars.map((bar, index) => {
    const rsiPressure = (frame.rsi[index] ?? 50) / 100;
    const macdPressure = Math.tanh((frame.macd.hist[index] ?? 0) * 8);
    const liftPressure = (frame.preLift.lift[index] ?? 0) / 20;
    return round(bar.close * (0.88 + rsiPressure * 0.14 + macdPressure * 0.04 + liftPressure * 0.02), 4);
  });
}

function buildChartImages(tradingDate) {
  const chartRoot = `reports/${tradingDate}/charts`;
  const timeframeArtifacts = ["10m", "30m", "1h", "4h"].flatMap((timeframe) => [
    {
      id: `price-volume-${timeframe}`,
      label: `${timeframe} price and volume`,
      kind: "chart",
      path: `${chartRoot}/price-volume-${timeframe}.svg`,
      required: true
    },
    {
      id: `rsi-${timeframe}`,
      label: `${timeframe} RSI`,
      kind: "chart",
      path: `${chartRoot}/rsi-${timeframe}.svg`,
      required: true
    },
    {
      id: `macd-${timeframe}`,
      label: `${timeframe} MACD`,
      kind: "chart",
      path: `${chartRoot}/macd-${timeframe}.svg`,
      required: true
    },
    {
      id: `stoch-rsi-${timeframe}`,
      label: `${timeframe} StochRSI`,
      kind: "chart",
      path: `${chartRoot}/stoch-rsi-${timeframe}.svg`,
      required: true
    },
    {
      id: `pre-lift-${timeframe}`,
      label: `${timeframe} PRE/Lift`,
      kind: "chart",
      path: `${chartRoot}/pre-lift-${timeframe}.svg`,
      required: true
    }
  ]);
  return [
    {
      id: "pylab-overview",
      label: "Pylab technical overview",
      kind: "pylab",
      path: "pylab/nvda-pylab-overview.png",
      required: true
    },
    {
      id: "live-ui-overview",
      label: "Live UI overview screenshot",
      kind: "screenshot",
      path: `reports/${tradingDate}/live-ui-overview.jpg`,
      required: false
    },
    { id: "levels", label: "Math and level map", kind: "chart", path: `${chartRoot}/levels.svg`, required: true },
    { id: "four-d-view", label: "4D signal view", kind: "chart", path: `${chartRoot}/4d-view.svg`, required: true },
    { id: "two-d-slice", label: "2D shared surface slice", kind: "chart", path: `${chartRoot}/2d-slice.svg`, required: true },
    ...timeframeArtifacts
  ];
}

function buildChartSvgArtifacts(tradingDate, timeframes, levels) {
  const chartRoot = `reports/${tradingDate}/charts`;
  const artifacts = [];
  Object.entries(timeframes).forEach(([timeframe, frame]) => {
    artifacts.push({
      path: `${chartRoot}/price-volume-${timeframe}.svg`,
      svg: buildLineSvg(`${timeframe} price and volume`, [
        { label: "Close", values: frame.bars.map((bar) => bar.close), color: "#6fd3a1" },
        { label: "Volume", values: frame.bars.map((bar) => bar.volume), color: "#d9b64f" }
      ])
    });
    artifacts.push({
      path: `${chartRoot}/rsi-${timeframe}.svg`,
      svg: buildLineSvg(`${timeframe} RSI`, [{ label: "RSI", values: frame.rsi, color: "#a5d83f" }])
    });
    artifacts.push({
      path: `${chartRoot}/macd-${timeframe}.svg`,
      svg: buildLineSvg(`${timeframe} MACD`, [
        { label: "Histogram", values: frame.macd.hist, color: "#b48dff" },
        { label: "Slope", values: frame.macd.slope, color: "#6ab7ff" }
      ])
    });
    artifacts.push({
      path: `${chartRoot}/stoch-rsi-${timeframe}.svg`,
      svg: buildLineSvg(`${timeframe} StochRSI`, [
        { label: "Value", values: frame.stochRsi.value, color: "#ef8840" },
        { label: "%K", values: frame.stochRsi.k, color: "#6fd3a1" },
        { label: "%D", values: frame.stochRsi.d, color: "#ef4e5f" }
      ])
    });
    artifacts.push({
      path: `${chartRoot}/pre-lift-${timeframe}.svg`,
      svg: buildLineSvg(`${timeframe} PRE and Lift`, [
        { label: "PRE", values: frame.preLift.pre, color: "#f1cf5f" },
        { label: "Lift", values: frame.preLift.lift, color: "#6ab7ff" },
        { label: "Angle", values: frame.preLift.angleDegrees, color: "#ef8840" }
      ])
    });
  });

  artifacts.push({
    path: `${chartRoot}/levels.svg`,
    svg: buildLineSvg("Math and level map", [
      { label: "Fibonacci levels", values: levels.fibonacci.map((level) => level.price), color: "#d9b64f" }
    ])
  });
  artifacts.push({
    path: `${chartRoot}/4d-view.svg`,
    svg: buildLineSvg("4D signal view", [
      { label: "10m pressure", values: buildSignalPressure(timeframes["10m"]), color: "#6fd3a1" },
      { label: "1h pressure", values: buildSignalPressure(timeframes["1h"]), color: "#6ab7ff" },
      { label: "4h pressure", values: buildSignalPressure(timeframes["4h"]), color: "#b48dff" }
    ])
  });
  artifacts.push({
    path: `${chartRoot}/2d-slice.svg`,
    svg: buildLineSvg("2D shared surface slice", [
      { label: "PRE", values: timeframes["10m"].preLift.pre, color: "#f1cf5f" },
      { label: "MACD slope", values: timeframes["10m"].macd.slope, color: "#6ab7ff" },
      { label: "StochRSI", values: timeframes["10m"].stochRsi.value, color: "#ef8840" }
    ])
  });
  return artifacts;
}

function buildIndicatorSnapshots(timeframes) {
  return Object.fromEntries(Object.entries(timeframes).map(([timeframe, frame]) => [timeframe, {
    timeframe,
    rsi: lastFinite(frame.rsi),
    macdHistogram: lastFinite(frame.macd.hist),
    macdSlope: lastFinite(frame.macd.slope),
    stochRsi: lastFinite(frame.stochRsi.value),
    preLiftAngleDegrees: lastFinite(frame.preLift.angleDegrees),
    preLift: lastFinite(frame.preLift.lift)
  }]));
}

function buildReportArtifacts({ reportPath, pdfPath, calendarPath }, chartImages) {
  return [
    { id: "report-json", label: "Report JSON", kind: "report", path: reportPath, required: true },
    { id: "report-pdf", label: "Report PDF", kind: "pdf", path: pdfPath, required: true },
    { id: "calendar-ics", label: "Calendar ICS", kind: "calendar", path: calendarPath, required: true },
    ...chartImages
  ];
}

async function collectAvailableArtifactPaths(artifacts, plannedPaths = []) {
  const available = new Set(plannedPaths.map(normalizeArtifactPath));
  await Promise.all(artifacts.map(async (artifact) => {
    try {
      await access(resolve("public", normalizeArtifactPath(artifact.path)));
      available.add(normalizeArtifactPath(artifact.path));
    } catch {
      // Missing artifacts are reported by the accuracy model.
    }
  }));
  return [...available];
}

function outcomeReferenceFromArtifact(artifact) {
  const tradingDate = artifact?.tradingDate ?? artifact?.date;
  const close = artifact?.stock?.latestClose ?? artifact?.latestClose ?? artifact?.close;
  const findings = Array.isArray(artifact?.findings) ? artifact.findings : undefined;
  if (!tradingDate || !isFiniteNumber(close)) return null;
  return { tradingDate, close, ...(findings ? { findings } : {}) };
}

async function readAdjacentDailyOutcome(currentTradingDate) {
  try {
    const raw = await readFile(resolve("public/data/nvda-latest.json"), "utf8");
    const reference = outcomeReferenceFromArtifact(JSON.parse(raw));
    if (!reference || reference.tradingDate === currentTradingDate) return {};
    return reference.tradingDate < currentTradingDate ? { previousDaily: reference } : { nextDaily: reference };
  } catch {
    return {};
  }
}

function toCalendarLink(report) {
  return {
    date: report.tradingDate,
    title: `${report.symbol} research report ${report.tradingDate}`,
    reportPath: report.reportPath,
    pdfPath: report.pdfPath
  };
}

function linkCalendarReports(reports) {
  const ascending = [...reports].sort((left, right) => left.tradingDate.localeCompare(right.tradingDate));
  const linked = ascending.map((report, index) => ({
    ...report,
    calendarLinks: {
      ...(ascending[index - 1] ? { previous: toCalendarLink(ascending[index - 1]) } : {}),
      ...(ascending[index + 1] ? { next: toCalendarLink(ascending[index + 1]) } : {})
    }
  }));
  return reports.map((report) => linked.find((item) => item.tradingDate === report.tradingDate) ?? report);
}

async function readExistingReports(nextReport) {
  try {
    const raw = await readFile(resolve("public/reports/calendar.json"), "utf8");
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed) ? parsed : parsed.reports ?? [];
    return [nextReport, ...items.filter((item) => item.date !== nextReport.tradingDate).map((item) => ({
      symbol: SYMBOL,
      tradingDate: item.date,
      generatedAt: item.generatedAt,
      summary: item.title,
      findings: [],
      pdfPath: item.pdfPath,
      reportPath: item.reportPath,
      calendarPath: "reports/calendar.ics",
      disclaimer: "Educational research output only. Not financial advice."
    }))];
  } catch {
    return [nextReport];
  }
}

async function waitForLocalServer(url, timeoutMs = 25_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
    } catch {
      // Keep polling until Vite is ready or the timeout expires.
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function captureLiveUiScreenshot(tradingDate) {
  const outputPath = `reports/${tradingDate}/live-ui-overview.jpg`;
  const appUrl = `http://127.0.0.1:${LIVE_SCREENSHOT_PORT}/NVDA-at-a-Glance/`;
  let server;
  let browser;
  try {
    const { chromium } = await import("playwright");
    server = spawn(process.execPath, [
      resolve("node_modules/vite/bin/vite.js"),
      "--host",
      "127.0.0.1",
      "--port",
      String(LIVE_SCREENSHOT_PORT),
      "--strictPort"
    ], {
      cwd: process.cwd(),
      stdio: "ignore",
      windowsHide: true
    });
    await waitForLocalServer(appUrl);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1400 },
      deviceScaleFactor: 1
    });
    await page.goto(appUrl, { waitUntil: "networkidle", timeout: 30_000 });
    await mkdir(dirname(resolve("public", outputPath)), { recursive: true });
    await page.screenshot({
      path: resolve("public", outputPath),
      type: "jpeg",
      quality: 86,
      fullPage: false
    });
    return outputPath;
  } catch (error) {
    console.warn(`Live UI screenshot capture skipped: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    if (server && !server.killed) server.kill();
  }
}

let session;
try {
  session = await fetchYahooSession();
} catch (error) {
  console.warn(error instanceof Error ? error.message : String(error));
  session = await loadFallbackSession(error instanceof Error ? error : new Error(String(error)));
}

const baseBars = sessionToBars(session);
const validationErrors = validateOhlcvBars(baseBars);
if (validationErrors.length > 0) {
  throw new Error(`Invalid OHLCV payload:\n${validationErrors.join("\n")}`);
}

await Promise.all(LEGACY_SESSION_OUTPUTS.map((output) => writeJson(output, session)));
const liveScreenshotPath = await captureLiveUiScreenshot(session.sessionDate);

const timeframes = buildTimeframes(baseBars);
const activeBars = timeframes["10m"].bars;
const levels = buildLevels(activeBars);
const findings = buildResearchFindings(activeBars, timeframes["10m"]);
const latestClose = activeBars.at(-1).close;
const unusualOptions = scanUnusualOptions(demoOptionChain, latestClose);
const gammaProfile = buildGammaProfile(demoOptionChain, latestClose);
const reportPaths = {
  reportPath: `reports/${session.sessionDate}/report.json`,
  pdfPath: `reports/${session.sessionDate}/report.pdf`,
  calendarPath: "reports/calendar.ics"
};
const chartImages = buildChartImages(session.sessionDate);
const chartSvgArtifacts = buildChartSvgArtifacts(session.sessionDate, timeframes, levels);
const indicatorSnapshots = buildIndicatorSnapshots(timeframes);
const reportArtifacts = buildReportArtifacts(reportPaths, chartImages);
const availableArtifactPaths = await collectAvailableArtifactPaths(reportArtifacts, [
  reportPaths.reportPath,
  reportPaths.pdfPath,
  reportPaths.calendarPath,
  ...chartSvgArtifacts.map((artifact) => artifact.path),
  ...(liveScreenshotPath ? [liveScreenshotPath] : [])
]);
const adjacentDailyOutcome = await readAdjacentDailyOutcome(session.sessionDate);
const accuracy = buildAccuracyCheck({
  tradingDate: session.sessionDate,
  generatedAt: session.retrievedAt,
  bars: baseBars,
  timeframes,
  findings,
  artifacts: reportArtifacts,
  availablePaths: availableArtifactPaths,
  ...adjacentDailyOutcome
});
const report = buildDailyReport({
  tradingDate: session.sessionDate,
  generatedAt: session.retrievedAt,
  bars: activeBars,
  findings,
  accuracy,
  chartImages,
  indicatorSnapshots
});
const reports = await readExistingReports(report);
const linkedReports = linkCalendarReports(reports);
const linkedReport = linkedReports.find((item) => item.tradingDate === report.tradingDate) ?? report;
const calendar = buildCalendarArtifacts(linkedReports);

const latestArtifact = {
  symbol: SYMBOL,
  tradingDate: session.sessionDate,
  generatedAt: session.retrievedAt,
  label: "Delayed research data",
  source: session.source,
  sourceUrl: session.sourceUrl,
  sessionPolicy: session.sessionPolicy ?? SESSION_POLICY,
  sessions: session.sessions ?? [],
  stock: {
    bars: baseBars,
    latestClose,
    previousClose: session.previousClose,
    regularMarketPrice: session.regularMarketPrice
  },
  timeframes,
  levels,
  findings,
  accuracy,
  chartImages,
  indicatorSnapshots,
  researchAnchors,
  options: {
    provider: "demo-persisted",
    chain: demoOptionChain,
    unusualOptions,
    gammaProfile,
    limitations: [
      "Live options-chain scans require a paid/licensed provider such as Polygon/Massive.",
      "Gamma-neutral/dealer positioning is a public OI/Greeks proxy, not observed inventory."
    ]
  },
  report: {
    jsonPath: linkedReport.reportPath,
    pdfPath: linkedReport.pdfPath,
    calendarPath: linkedReport.calendarPath,
    ...(linkedReport.calendarLinks ? { calendarLinks: linkedReport.calendarLinks } : {}),
    chartImages
  },
  disclaimer: linkedReport.disclaimer
};

await Promise.all([
  writeJson("public/data/nvda-latest.json", latestArtifact),
  writeJson(`public/${linkedReport.reportPath}`, linkedReport),
  writeBinary(`public/${linkedReport.pdfPath}`, buildPdfBytes(linkedReport)),
  ...chartSvgArtifacts.map((artifact) => writeText(`public/${artifact.path}`, artifact.svg)),
  writeJson("public/reports/calendar.json", { reports: calendar.manifest }),
  writeFile(resolve("public/reports/calendar.ics"), calendar.ics, "utf8")
]);

console.log(`Updated ${SYMBOL} session ${session.sessionDate} with ${session.candles.length} candles, ${findings.length} findings, and ${chartSvgArtifacts.length} chart artifacts${liveScreenshotPath ? ` plus ${liveScreenshotPath}` : ""}.`);
