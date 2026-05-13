import type { MarketBar } from "./marketData";
import type { SignalDirection, SignalFinding } from "./researchSignals";

export type AccuracyStatus = "pass" | "warn" | "fail";
export type ArtifactKind = "report" | "pdf" | "calendar" | "pylab" | "chart" | "screenshot";

export interface AccuracyCheckItem {
  id: string;
  label: string;
  status: AccuracyStatus;
  detail: string;
}

export interface ExpectedScanWindow {
  id: "open-30m" | "open-1h" | "late-session";
  label: string;
  startEt: string;
  endEt: string;
  startTime: string;
  endTime: string;
}

export interface ScanWindowCheck extends ExpectedScanWindow {
  status: AccuracyStatus;
  barCount: number;
  closeTime: string;
  close: number | null;
  volume: number;
  detail: string;
}

export interface IndicatorFrameInput {
  rsi?: Array<number | null>;
  macd?: {
    hist?: Array<number | null>;
    slope?: Array<number | null>;
  };
  stochRsi?: {
    value?: Array<number | null>;
  };
  preLift?: {
    angleRadians?: Array<number | null>;
    lift?: Array<number | null>;
  };
}

export interface IndicatorAvailability {
  timeframe: string;
  status: AccuracyStatus;
  rsiAvailable: boolean;
  macdAvailable: boolean;
  macdSlopeAvailable: boolean;
  stochRsiAvailable: boolean;
  preLiftAvailable: boolean;
  detail: string;
}

export interface ArtifactReference {
  id: string;
  label: string;
  kind: ArtifactKind;
  path: string;
  required?: boolean;
}

export interface ChartImageReference extends ArtifactReference {
  kind: "pylab" | "chart" | "screenshot";
}

export interface MarketSessionPolicy {
  includeExtendedHours: boolean;
  aggregationAnchor: "regular-open";
  expectedSegments: Array<{
    id: "pre" | "regular" | "post";
    startEt: string;
    endEt: string;
  }>;
}

export interface ArtifactReferenceCheck extends ArtifactReference {
  status: AccuracyStatus;
  exists: boolean;
  detail: string;
}

export interface DailyOutcomeReference {
  tradingDate: string;
  close: number;
  findings?: SignalFinding[];
}

export interface SignalOutcomeEvaluation {
  findingId: string;
  label: string;
  direction: SignalDirection;
  confidence: number;
  aligned: boolean;
  scorePct: number;
}

export interface DelayedSignalOutcome {
  source: "current-to-next" | "previous-to-current";
  fromDate: string;
  toDate: string;
  fromClose: number;
  toClose: number;
  movePct: number;
  scorePct: number;
  evaluations: SignalOutcomeEvaluation[];
}

export interface AccuracyCheck {
  status: AccuracyStatus;
  tradingDate: string;
  generatedAt: string;
  checks: AccuracyCheckItem[];
  scanWindows: ScanWindowCheck[];
  indicatorAvailability: IndicatorAvailability[];
  artifactReferences: ArtifactReferenceCheck[];
  outcome?: DelayedSignalOutcome;
}

export interface BuildAccuracyCheckInput {
  tradingDate: string;
  generatedAt: string;
  bars: MarketBar[];
  indicatorFrames?: Record<string, IndicatorFrameInput>;
  findings?: SignalFinding[];
  artifacts?: ArtifactReference[];
  availablePaths?: Iterable<string>;
  sessionPolicy?: MarketSessionPolicy;
  previousDaily?: DailyOutcomeReference;
  nextDaily?: DailyOutcomeReference;
  neutralMoveThresholdPct?: number;
}

const NEW_YORK_TIME_ZONE = "America/New_York";
const SESSION_OPEN_MINUTES = 9 * 60 + 30;
const SESSION_CLOSE_MINUTES = 16 * 60;
const EXTENDED_OPEN_MINUTES = 4 * 60;
const EXTENDED_CLOSE_MINUTES = 20 * 60;

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

interface LocalClock {
  hour: number;
  minute: number;
}

interface WindowDefinition {
  id: ExpectedScanWindow["id"];
  label: string;
  start: LocalClock;
  end: LocalClock;
}

const SCAN_WINDOWS: WindowDefinition[] = [
  {
    id: "open-30m",
    label: "30m 09:30-10:00 ET candle close",
    start: { hour: 9, minute: 30 },
    end: { hour: 10, minute: 0 }
  },
  {
    id: "open-1h",
    label: "1h 09:30-10:30 ET window",
    start: { hour: 9, minute: 30 },
    end: { hour: 10, minute: 30 }
  },
  {
    id: "late-session",
    label: "Late 15:30-close ET window",
    start: { hour: 15, minute: 30 },
    end: { hour: 16, minute: 0 }
  }
];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function round(value: number, places = 2): number {
  const scale = 10 ** places;
  return Math.round((value + Number.EPSILON) * scale) / scale;
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

function parseTradingDate(tradingDate: string): Pick<ZonedParts, "year" | "month" | "day"> {
  const [year, month, day] = tradingDate.split("-").map(Number);
  return { year, month, day };
}

function localTimeToIso(tradingDate: string, clock: LocalClock): string {
  const date = parseTradingDate(tradingDate);
  return new Date(zonedTimeToUtc({ ...date, hour: clock.hour, minute: clock.minute, second: 0 })).toISOString();
}

function formatClock(clock: LocalClock): string {
  return `${String(clock.hour).padStart(2, "0")}:${String(clock.minute).padStart(2, "0")} ET`;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

function hasFinite(values: Array<number | null> | undefined): boolean {
  return values?.some((value) => isFiniteNumber(value)) ?? false;
}

function statusFor(statuses: AccuracyStatus[]): AccuracyStatus {
  if (statuses.includes("fail")) return "fail";
  if (statuses.includes("warn")) return "warn";
  return "pass";
}

function validateOhlcv(bars: MarketBar[]): string[] {
  const errors: string[] = [];

  bars.forEach((bar, index) => {
    const prefix = `bar ${index}`;
    const time = new Date(bar.time).getTime();
    if (!Number.isFinite(time)) errors.push(`${prefix}: invalid timestamp`);
    if (![bar.open, bar.high, bar.low, bar.close, bar.volume].every(isFiniteNumber)) {
      errors.push(`${prefix}: non-finite OHLCV value`);
      return;
    }
    if (bar.volume < 0) errors.push(`${prefix}: negative volume`);
    if (bar.low > Math.min(bar.open, bar.close)) errors.push(`${prefix}: low is above body`);
    if (bar.high < Math.max(bar.open, bar.close)) errors.push(`${prefix}: high is below body`);
  });

  return errors;
}

function evaluateTimestampOrder(bars: MarketBar[]): AccuracyCheckItem {
  const errors: string[] = [];
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

function evaluateSessionOpen(bars: MarketBar[], tradingDate: string, sessionPolicy?: MarketSessionPolicy): AccuracyCheckItem {
  const firstTime = new Date(bars[0]?.time ?? "").getTime();
  if (!Number.isFinite(firstTime)) {
    return {
      id: "session-open",
      label: "09:30 ET session alignment",
      status: "fail",
      detail: "First bar timestamp is missing or invalid."
    };
  }

  const [year, month, day] = tradingDate.split("-").map(Number);
  const firstParts = getZonedParts(new Date(firstTime));
  const expectedOpenMinutes = sessionPolicy?.includeExtendedHours ? EXTENDED_OPEN_MINUTES : SESSION_OPEN_MINUTES;
  const expectedCloseMinutes = sessionPolicy?.includeExtendedHours ? EXTENDED_CLOSE_MINUTES : SESSION_CLOSE_MINUTES;
  const expectedOpenHour = Math.floor(expectedOpenMinutes / 60);
  const expectedOpenMinute = expectedOpenMinutes % 60;
  const startsAtOpen = firstParts.year === year
    && firstParts.month === month
    && firstParts.day === day
    && firstParts.hour === expectedOpenHour
    && firstParts.minute === expectedOpenMinute;
  const startsAtRegularOpen = Boolean(sessionPolicy?.includeExtendedHours)
    && firstParts.year === year
    && firstParts.month === month
    && firstParts.day === day
    && firstParts.hour === 9
    && firstParts.minute === 30;
  const outsideSessionCount = bars.filter((bar) => {
    const time = new Date(bar.time).getTime();
    if (!Number.isFinite(time)) return false;
    const parts = getZonedParts(new Date(time));
    const minutes = parts.hour * 60 + parts.minute;
    return parts.year !== year
      || parts.month !== month
      || parts.day !== day
      || minutes < expectedOpenMinutes
      || minutes >= expectedCloseMinutes;
  }).length;

  const status = startsAtOpen && outsideSessionCount === 0
    ? "pass"
    : startsAtRegularOpen && outsideSessionCount === 0
      ? "warn"
      : "fail";
  const issues = [
    startsAtOpen ? null : `first bar starts at ${formatClock({ hour: firstParts.hour, minute: firstParts.minute })}`,
    outsideSessionCount > 0 ? `${outsideSessionCount} bars are outside the regular session` : null
  ].filter((issue): issue is string => issue !== null);

  return {
    id: "session-open",
    label: sessionPolicy?.includeExtendedHours ? "Extended-hours session alignment" : "09:30 ET session alignment",
    status,
    detail: status === "pass"
      ? sessionPolicy?.includeExtendedHours
        ? "Bars start at 4:00 AM-8:00 PM ET segmented extended hours and remain inside the expected full-day window."
        : "Bars start at 09:30 ET and remain inside the regular session."
      : status === "warn"
        ? "Extended hours were requested, but the provider payload started at the regular 09:30 ET open."
      : issues.join("; ")
  };
}

function expectedExtension(kind: ArtifactKind): RegExp {
  switch (kind) {
    case "report":
      return /\.json$/i;
    case "pdf":
      return /\.pdf$/i;
    case "calendar":
      return /\.(ics|json)$/i;
    case "pylab":
    case "chart":
    case "screenshot":
      return /\.(png|jpe?g|webp|svg)$/i;
  }
}

export function getExpectedScanWindows(tradingDate: string): ExpectedScanWindow[] {
  return SCAN_WINDOWS.map((window) => ({
    id: window.id,
    label: window.label,
    startEt: formatClock(window.start),
    endEt: formatClock(window.end),
    startTime: localTimeToIso(tradingDate, window.start),
    endTime: localTimeToIso(tradingDate, window.end)
  }));
}

export function evaluateScanWindows(bars: MarketBar[], tradingDate: string): ScanWindowCheck[] {
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

export function evaluateIndicatorAvailability(indicatorFrames: Record<string, IndicatorFrameInput> = {}): IndicatorAvailability[] {
  return Object.entries(indicatorFrames)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([timeframe, frame]) => {
      const rsiAvailable = hasFinite(frame.rsi);
      const macdAvailable = hasFinite(frame.macd?.hist);
      const macdSlopeAvailable = hasFinite(frame.macd?.slope);
      const stochRsiAvailable = hasFinite(frame.stochRsi?.value);
      const preLiftAvailable = hasFinite(frame.preLift?.angleRadians) && hasFinite(frame.preLift?.lift);
      const status: AccuracyStatus = rsiAvailable && macdAvailable && macdSlopeAvailable && stochRsiAvailable && preLiftAvailable ? "pass" : "warn";

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

export function evaluateArtifactReferences(
  artifacts: ArtifactReference[] = [],
  availablePaths: Iterable<string> = []
): ArtifactReferenceCheck[] {
  const available = new Set([...availablePaths].map(normalizePath));

  return artifacts.map((artifact) => {
    const normalized = normalizePath(artifact.path);
    const pathIsRelative = normalized.length > 0 && !normalized.startsWith("/") && !normalized.split("/").includes("..");
    const extensionMatches = expectedExtension(artifact.kind).test(normalized);
    const exists = available.has(normalized);
    const required = artifact.required ?? false;
    const status: AccuracyStatus = !pathIsRelative || !extensionMatches || (required && !exists)
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

    return {
      ...artifact,
      path: normalized,
      required,
      status,
      exists,
      detail
    };
  });
}

function isDirectionAligned(direction: SignalDirection, movePct: number, neutralMoveThresholdPct: number): boolean {
  if (direction === "bullish") return movePct > neutralMoveThresholdPct;
  if (direction === "bearish") return movePct < -neutralMoveThresholdPct;
  return Math.abs(movePct) <= neutralMoveThresholdPct;
}

function buildDelayedOutcome(input: BuildAccuracyCheckInput, currentClose: number): DelayedSignalOutcome | undefined {
  const neutralMoveThresholdPct = input.neutralMoveThresholdPct ?? 0.25;
  const source = input.nextDaily && (input.findings?.length ?? 0) > 0
    ? {
      kind: "current-to-next" as const,
      fromDate: input.tradingDate,
      toDate: input.nextDaily.tradingDate,
      fromClose: currentClose,
      toClose: input.nextDaily.close,
      findings: input.findings ?? []
    }
    : input.previousDaily?.findings && input.previousDaily.findings.length > 0
      ? {
        kind: "previous-to-current" as const,
        fromDate: input.previousDaily.tradingDate,
        toDate: input.tradingDate,
        fromClose: input.previousDaily.close,
        toClose: currentClose,
        findings: input.previousDaily.findings
      }
      : null;

  if (!source || !isFiniteNumber(source.fromClose) || !isFiniteNumber(source.toClose) || source.fromClose === 0) {
    return undefined;
  }

  const movePct = round(((source.toClose - source.fromClose) / source.fromClose) * 100, 4);
  const evaluations = source.findings.map((finding) => {
    const aligned = isDirectionAligned(finding.direction, movePct, neutralMoveThresholdPct);
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
    scorePct: round(evaluations.reduce((sum, evaluation) => sum + evaluation.scorePct, 0) / evaluations.length),
    evaluations
  };
}

export function buildAccuracyCheck(input: BuildAccuracyCheckInput): AccuracyCheck {
  const ohlcvErrors = validateOhlcv(input.bars);
  const scanWindows = evaluateScanWindows(input.bars, input.tradingDate);
  const indicatorAvailability = evaluateIndicatorAvailability(input.indicatorFrames);
  const artifactReferences = evaluateArtifactReferences(input.artifacts, input.availablePaths);
  const latestClose = input.bars.at(-1)?.close;
  const outcome = isFiniteNumber(latestClose) ? buildDelayedOutcome(input, latestClose) : undefined;

  const checks: AccuracyCheckItem[] = [
    {
      id: "ohlcv",
      label: "OHLCV validity",
      status: ohlcvErrors.length > 0 ? "fail" : "pass",
      detail: ohlcvErrors.length > 0 ? ohlcvErrors.join("; ") : `${input.bars.length} OHLCV bars are valid.`
    },
    evaluateTimestampOrder(input.bars),
    evaluateSessionOpen(input.bars, input.tradingDate, input.sessionPolicy),
    {
      id: "scan-windows",
      label: "Expected scan windows",
      status: statusFor(scanWindows.map((window) => window.status)),
      detail: scanWindows.every((window) => window.status === "pass")
        ? "All expected scan windows have data."
        : scanWindows.filter((window) => window.status !== "pass").map((window) => window.detail).join("; ")
    },
    {
      id: "indicator-availability",
      label: "Indicator availability",
      status: indicatorAvailability.length === 0 ? "warn" : statusFor(indicatorAvailability.map((indicator) => indicator.status)),
      detail: indicatorAvailability.length === 0
        ? "No indicator frames were supplied."
        : indicatorAvailability.every((indicator) => indicator.status === "pass")
          ? "Supplied indicator frames include RSI, MACD, StochRSI, and PRE/Lift values."
          : indicatorAvailability.filter((indicator) => indicator.status !== "pass").map((indicator) => indicator.detail).join("; ")
    },
    {
      id: "artifact-references",
      label: "Artifact references",
      status: statusFor(artifactReferences.map((artifact) => artifact.status)),
      detail: artifactReferences.length === 0
        ? "No artifact references were supplied."
        : artifactReferences.every((artifact) => artifact.status === "pass")
          ? "All required artifact references are available."
          : artifactReferences.filter((artifact) => artifact.status !== "pass").map((artifact) => `${artifact.id}: ${artifact.detail}`).join("; ")
    }
  ];

  const status = statusFor([
    ...checks.map((check) => check.status),
    ...scanWindows.map((window) => window.status),
    ...indicatorAvailability.map((indicator) => indicator.status),
    ...artifactReferences.map((artifact) => artifact.status)
  ]);

  return {
    status,
    tradingDate: input.tradingDate,
    generatedAt: input.generatedAt,
    checks,
    scanWindows,
    indicatorAvailability,
    artifactReferences,
    outcome
  };
}
