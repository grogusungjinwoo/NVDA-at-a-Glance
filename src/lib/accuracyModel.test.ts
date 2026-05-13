import { describe, expect, it } from "vitest";
import type { MarketBar } from "./marketData";
import type { SignalFinding } from "./researchSignals";
import { buildAccuracyCheck, evaluateScanWindows, getExpectedScanWindows } from "./accuracyModel";

function sessionBar(index: number, close = 100 + index * 0.1): MarketBar {
  return {
    time: new Date(Date.UTC(2026, 4, 12, 13, 30 + index * 5)).toISOString(),
    open: close - 0.05,
    high: close + 0.2,
    low: close - 0.3,
    close,
    volume: 1_000 + index
  };
}

const fullSessionBars = Array.from({ length: 78 }, (_, index) => sessionBar(index));

const findings: SignalFinding[] = [
  {
    id: "momentum",
    label: "Momentum Confluence",
    direction: "bullish",
    confidence: 62,
    evidence: ["RSI and MACD agree."],
    limitations: ["Confluence only."]
  }
];

describe("accuracy model", () => {
  it("builds deterministic scan windows for regular-session reads", () => {
    const summerWindows = getExpectedScanWindows("2026-05-12");
    const winterWindows = getExpectedScanWindows("2026-01-12");

    expect(summerWindows.map((window) => [window.id, window.startTime, window.endTime])).toEqual([
      ["open-30m", "2026-05-12T13:30:00.000Z", "2026-05-12T14:00:00.000Z"],
      ["open-1h", "2026-05-12T13:30:00.000Z", "2026-05-12T14:30:00.000Z"],
      ["late-session", "2026-05-12T19:30:00.000Z", "2026-05-12T20:00:00.000Z"]
    ]);
    expect(winterWindows[0].startTime).toBe("2026-01-12T14:30:00.000Z");
    expect(winterWindows[2].startTime).toBe("2026-01-12T20:30:00.000Z");
  });

  it("evaluates scan-window closes from available OHLCV bars", () => {
    const windows = evaluateScanWindows(fullSessionBars, "2026-05-12");

    expect(windows.find((window) => window.id === "open-30m")).toMatchObject({
      status: "pass",
      barCount: 6,
      closeTime: "2026-05-12T14:00:00.000Z",
      close: fullSessionBars[5].close
    });
    expect(windows.find((window) => window.id === "open-1h")?.close).toBe(fullSessionBars[11].close);
    expect(windows.find((window) => window.id === "late-session")?.close).toBe(fullSessionBars[77].close);
  });

  it("passes valid data, required artifact references, indicators, and delayed outcomes", () => {
    const latestClose = fullSessionBars.at(-1)!.close;
    const accuracy = buildAccuracyCheck({
      tradingDate: "2026-05-12",
      generatedAt: "2026-05-13T00:15:00.000Z",
      bars: fullSessionBars,
      indicatorFrames: {
        "10m": { rsi: [null, 55], macd: { hist: [null, 0.12], slope: [null, 0.02] }, stochRsi: { value: [null, 70] }, preLift: { angleRadians: [null, 0.16], lift: [null, 1.2] } },
        "1h": { rsi: [51], macd: { hist: [0.05], slope: [0.01] }, stochRsi: { value: [65] }, preLift: { angleRadians: [0.12], lift: [0.8] } }
      },
      findings,
      artifacts: [
        { id: "report-json", label: "Report JSON", kind: "report", path: "reports/2026-05-12/report.json", required: true },
        { id: "report-pdf", label: "Report PDF", kind: "pdf", path: "reports/2026-05-12/report.pdf", required: true },
        { id: "pylab-overview", label: "Pylab overview", kind: "pylab", path: "pylab/nvda-pylab-overview.png", required: true }
      ],
      availablePaths: [
        "reports/2026-05-12/report.json",
        "reports/2026-05-12/report.pdf",
        "pylab/nvda-pylab-overview.png"
      ],
      nextDaily: {
        tradingDate: "2026-05-13",
        close: latestClose + 2
      }
    });

    expect(accuracy.status).toBe("pass");
    expect(accuracy.checks.every((check) => check.status === "pass")).toBe(true);
    expect(accuracy.artifactReferences.every((artifact) => artifact.status === "pass")).toBe(true);
    expect(accuracy.outcome?.scorePct).toBe(100);
    expect(accuracy.outcome?.evaluations[0]).toMatchObject({ findingId: "momentum", aligned: true });
  });

  it("allows segmented extended-hours sessions when the policy opts in", () => {
    const extendedBars: MarketBar[] = [
      { time: "2026-05-12T08:00:00.000Z", open: 100, high: 101, low: 99, close: 100.5, volume: 10, session: "pre" },
      ...fullSessionBars,
      { time: "2026-05-12T20:05:00.000Z", open: 108, high: 109, low: 107, close: 108.5, volume: 10, session: "post" }
    ];
    const accuracy = buildAccuracyCheck({
      tradingDate: "2026-05-12",
      generatedAt: "2026-05-13T00:15:00.000Z",
      bars: extendedBars,
      sessionPolicy: {
        includeExtendedHours: true,
        aggregationAnchor: "regular-open",
        expectedSegments: [
          { id: "pre", startEt: "04:00", endEt: "09:30" },
          { id: "regular", startEt: "09:30", endEt: "16:00" },
          { id: "post", startEt: "16:00", endEt: "20:00" }
        ]
      },
      indicatorFrames: {
        "10m": { rsi: [55], macd: { hist: [0.12], slope: [0.01] }, stochRsi: { value: [80] }, preLift: { angleRadians: [0.1], lift: [1] } }
      },
      findings,
      artifacts: [],
      availablePaths: []
    });

    expect(accuracy.checks.find((check) => check.id === "session-open")?.status).toBe("pass");
    expect(accuracy.checks.find((check) => check.id === "session-open")?.detail).toContain("4:00 AM-8:00 PM ET");
  });

  it("warns when extended hours are requested but the provider starts at the regular open", () => {
    const accuracy = buildAccuracyCheck({
      tradingDate: "2026-05-12",
      generatedAt: "2026-05-13T00:15:00.000Z",
      bars: fullSessionBars,
      sessionPolicy: {
        includeExtendedHours: true,
        aggregationAnchor: "regular-open",
        expectedSegments: [
          { id: "pre", startEt: "04:00", endEt: "09:30" },
          { id: "regular", startEt: "09:30", endEt: "16:00" },
          { id: "post", startEt: "16:00", endEt: "20:00" }
        ]
      },
      indicatorFrames: {
        "10m": { rsi: [55], macd: { hist: [0.12], slope: [0.01] }, stochRsi: { value: [80] }, preLift: { angleRadians: [0.1], lift: [1] } }
      },
      findings,
      artifacts: [],
      availablePaths: []
    });

    expect(accuracy.status).toBe("warn");
    expect(accuracy.checks.find((check) => check.id === "session-open")).toMatchObject({
      status: "warn",
      detail: "Extended hours were requested, but the provider payload started at the regular 09:30 ET open."
    });
  });

  it("fails malformed OHLCV data, timestamp order, and session-open alignment", () => {
    const accuracy = buildAccuracyCheck({
      tradingDate: "2026-05-12",
      generatedAt: "2026-05-13T00:15:00.000Z",
      bars: [
        { time: "2026-05-12T13:35:00.000Z", open: 100, high: 99, low: 101, close: 100, volume: -1 },
        { time: "2026-05-12T13:30:00.000Z", open: 100, high: 101, low: 99, close: 100.5, volume: 10 }
      ],
      indicatorFrames: {
        "10m": { rsi: [null], macd: { hist: [null], slope: [null] }, stochRsi: { value: [null] }, preLift: { angleRadians: [null], lift: [null] } }
      },
      findings,
      artifacts: [
        { id: "report-json", label: "Report JSON", kind: "report", path: "reports/2026-05-12/report.json", required: true }
      ],
      availablePaths: []
    });

    expect(accuracy.status).toBe("fail");
    expect(accuracy.checks.find((check) => check.id === "ohlcv")?.status).toBe("fail");
    expect(accuracy.checks.find((check) => check.id === "timestamp-order")?.status).toBe("fail");
    expect(accuracy.checks.find((check) => check.id === "session-open")?.status).toBe("fail");
    expect(accuracy.artifactReferences[0].status).toBe("fail");
  });
});
