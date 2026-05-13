import { describe, expect, it } from "vitest";
import { buildCalendarArtifacts, buildDailyReport, buildPdfBytes, linkCalendarReports } from "./reportModel";
import type { MarketBar } from "./marketData";
import type { SignalFinding } from "./researchSignals";
import type { AccuracyCheck, ChartImageReference } from "./accuracyModel";

const bars: MarketBar[] = [
  { time: "2026-05-12T13:30:00.000Z", open: 200, high: 202, low: 199, close: 201, volume: 1000 },
  { time: "2026-05-12T13:40:00.000Z", open: 201, high: 205, low: 200, close: 204, volume: 1500 }
];

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

describe("daily report model", () => {
  it("creates report metadata and download paths", () => {
    const report = buildDailyReport({
      tradingDate: "2026-05-12",
      generatedAt: "2026-05-13T00:15:00.000Z",
      bars,
      findings
    });

    expect(report.pdfPath).toBe("reports/2026-05-12/report.pdf");
    expect(report.reportPath).toBe("reports/2026-05-12/report.json");
    expect(report.disclaimer).toContain("Not financial advice");
  });

  it("generates a minimal downloadable PDF byte stream", () => {
    const report = buildDailyReport({
      tradingDate: "2026-05-12",
      generatedAt: "2026-05-13T00:15:00.000Z",
      bars,
      findings
    });
    const pdf = buildPdfBytes(report);
    const header = new TextDecoder().decode(pdf.slice(0, 8));

    expect(header).toContain("%PDF");
  });

  it("carries optional accuracy checks and chart image references", () => {
    const accuracy: AccuracyCheck = {
      status: "pass",
      tradingDate: "2026-05-12",
      generatedAt: "2026-05-13T00:15:00.000Z",
      checks: [],
      scanWindows: [],
      indicatorAvailability: [],
      artifactReferences: []
    };
    const chartImages: ChartImageReference[] = [
      {
        id: "pylab-overview",
        label: "Pylab overview",
        kind: "pylab",
        path: "pylab/nvda-pylab-overview.png",
        required: true
      }
    ];
    const report = buildDailyReport({
      tradingDate: "2026-05-12",
      generatedAt: "2026-05-13T00:15:00.000Z",
      bars,
      findings,
      accuracy,
      chartImages
    });

    expect(report.accuracy?.status).toBe("pass");
    expect(report.chartImages?.[0].path).toBe("pylab/nvda-pylab-overview.png");
  });

  it("carries indicator snapshots and live UI screenshot references into the generated PDF", () => {
    const chartImages: ChartImageReference[] = [
      {
        id: "live-ui-overview",
        label: "Live UI overview screenshot",
        kind: "screenshot",
        path: "reports/2026-05-12/live-ui-overview.jpg",
        required: true
      }
    ];
    const report = buildDailyReport({
      tradingDate: "2026-05-12",
      generatedAt: "2026-05-13T00:15:00.000Z",
      bars,
      findings,
      chartImages,
      indicatorSnapshots: {
        "10m": {
          timeframe: "10m",
          latestBarTime: "2026-05-12T13:40:00.000Z",
          rsi: 55,
          macdHistogram: 0.12,
          macdSlope: 0.03,
          stochRsi: 72,
          preLiftAngleDegrees: 9.2,
          lift: 1.4
        }
      }
    });
    const pdfText = new TextDecoder().decode(buildPdfBytes(report));

    expect(report.indicatorSnapshots?.["10m"].stochRsi).toBe(72);
    expect(report.chartImages?.[0].kind).toBe("screenshot");
    expect(pdfText).toContain("Live UI screenshot");
    expect(pdfText).toContain("10m indicators");
  });

  it("builds calendar manifest and ICS artifacts", () => {
    const report = buildDailyReport({
      tradingDate: "2026-05-12",
      generatedAt: "2026-05-13T00:15:00.000Z",
      bars,
      findings
    });
    const artifacts = buildCalendarArtifacts([report]);

    expect(artifacts.manifest[0].pdfPath).toBe("reports/2026-05-12/report.pdf");
    expect(artifacts.ics).toContain("BEGIN:VCALENDAR");
    expect(artifacts.ics).toContain("SUMMARY:NVDA research report 2026-05-12");
  });

  it("links calendar manifest items to previous and next reports", () => {
    const reports = ["2026-05-11", "2026-05-12", "2026-05-13"].map((tradingDate) => buildDailyReport({
      tradingDate,
      generatedAt: `${tradingDate}T21:00:00.000Z`,
      bars,
      findings
    }));

    const linkedReports = linkCalendarReports(reports);
    const artifacts = buildCalendarArtifacts(linkedReports);
    const middleReport = linkedReports.find((report) => report.tradingDate === "2026-05-12");
    const middleManifestItem = artifacts.manifest.find((item) => item.date === "2026-05-12");

    expect(middleReport?.calendarLinks?.previous?.date).toBe("2026-05-11");
    expect(middleReport?.calendarLinks?.next?.date).toBe("2026-05-13");
    expect(middleManifestItem?.previous?.reportPath).toBe("reports/2026-05-11/report.json");
    expect(middleManifestItem?.next?.pdfPath).toBe("reports/2026-05-13/report.pdf");
  });
});
