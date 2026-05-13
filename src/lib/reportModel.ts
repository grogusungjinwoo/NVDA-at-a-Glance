import type { MarketBar } from "./marketData";
import type { SignalFinding } from "./researchSignals";
import type { AccuracyCheck, ChartImageReference } from "./accuracyModel";

export interface CalendarReportLink {
  date: string;
  title: string;
  reportPath: string;
  pdfPath: string;
}

export interface CalendarReportLinks {
  previous?: CalendarReportLink;
  next?: CalendarReportLink;
}

export interface DailyReport {
  symbol: "NVDA";
  tradingDate: string;
  generatedAt: string;
  summary: string;
  findings: SignalFinding[];
  pdfPath: string;
  reportPath: string;
  calendarPath: string;
  accuracy?: AccuracyCheck;
  chartImages?: ChartImageReference[];
  indicatorSnapshots?: Record<string, IndicatorSnapshot>;
  calendarLinks?: CalendarReportLinks;
  disclaimer: string;
}

export interface IndicatorSnapshot {
  timeframe: string;
  latestBarTime: string;
  rsi: number | null;
  macdHistogram: number | null;
  macdSlope: number | null;
  stochRsi: number | null;
  preLiftAngleDegrees: number | null;
  lift: number | null;
}

export interface CalendarManifestItem {
  date: string;
  title: string;
  reportPath: string;
  pdfPath: string;
  generatedAt: string;
  previous?: CalendarReportLink;
  next?: CalendarReportLink;
}

export interface CalendarArtifacts {
  manifest: CalendarManifestItem[];
  ics: string;
}

const DISCLAIMER = "Educational research output only. Not financial advice.";

function escapePdfText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function formatIcsDate(value: string): string {
  return value.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function buildDailyReport(input: {
  symbol?: "NVDA";
  tradingDate: string;
  generatedAt: string;
  bars: MarketBar[];
  findings: SignalFinding[];
  accuracy?: AccuracyCheck;
  chartImages?: ChartImageReference[];
  indicatorSnapshots?: Record<string, IndicatorSnapshot>;
  calendarLinks?: CalendarReportLinks;
}): DailyReport {
  const first = input.bars[0];
  const last = input.bars.at(-1);
  const returnPct = first && last ? ((last.close - first.open) / first.open) * 100 : 0;
  const summary = `NVDA delayed research data for ${input.tradingDate}: ${input.findings.length} signal modules evaluated; session return ${returnPct >= 0 ? "+" : ""}${returnPct.toFixed(2)}%.`;

  return {
    symbol: input.symbol ?? "NVDA",
    tradingDate: input.tradingDate,
    generatedAt: input.generatedAt,
    summary,
    findings: input.findings,
    pdfPath: `reports/${input.tradingDate}/report.pdf`,
    reportPath: `reports/${input.tradingDate}/report.json`,
    calendarPath: "reports/calendar.ics",
    ...(input.accuracy ? { accuracy: input.accuracy } : {}),
    ...(input.chartImages ? { chartImages: input.chartImages } : {}),
    ...(input.indicatorSnapshots ? { indicatorSnapshots: input.indicatorSnapshots } : {}),
    ...(input.calendarLinks ? { calendarLinks: input.calendarLinks } : {}),
    disclaimer: DISCLAIMER
  };
}

function toCalendarLink(report: DailyReport): CalendarReportLink {
  return {
    date: report.tradingDate,
    title: `${report.symbol} research report ${report.tradingDate}`,
    reportPath: report.reportPath,
    pdfPath: report.pdfPath
  };
}

export function linkCalendarReports(reports: DailyReport[]): DailyReport[] {
  const ascending = [...reports].sort((left, right) => left.tradingDate.localeCompare(right.tradingDate));
  const linked = ascending.map((report, index): DailyReport => ({
    ...report,
    calendarLinks: {
      ...(ascending[index - 1] ? { previous: toCalendarLink(ascending[index - 1]) } : {}),
      ...(ascending[index + 1] ? { next: toCalendarLink(ascending[index + 1]) } : {})
    }
  }));

  return reports.map((report) => linked.find((item) => item.tradingDate === report.tradingDate) ?? report);
}

export function buildCalendarArtifacts(reports: DailyReport[]): CalendarArtifacts {
  const linkedReports = linkCalendarReports(reports);
  const manifest = linkedReports
    .map((report) => ({
      date: report.tradingDate,
      title: `${report.symbol} research report ${report.tradingDate}`,
      reportPath: report.reportPath,
      pdfPath: report.pdfPath,
      generatedAt: report.generatedAt,
      ...(report.calendarLinks?.previous ? { previous: report.calendarLinks.previous } : {}),
      ...(report.calendarLinks?.next ? { next: report.calendarLinks.next } : {})
    }))
    .sort((left, right) => right.date.localeCompare(left.date));

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
    ics: [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//NVDA at a Glance//Research Reports//EN",
      "CALSCALE:GREGORIAN",
      ...events,
      "END:VCALENDAR",
      ""
    ].join("\r\n")
  };
}

export function buildPdfBytes(report: DailyReport): Uint8Array {
  const findings = report.findings.slice(0, 8).flatMap((finding) => [
    `${finding.label}: ${finding.direction.toUpperCase()} (${finding.confidence}%)`,
    `Evidence: ${finding.evidence.slice(0, 2).join(" ")}`,
    `Limitations: ${finding.limitations.slice(0, 2).join(" ")}`
  ]);
  const accuracyLines = report.accuracy ? [
    `Accuracy check: ${report.accuracy.status.toUpperCase()}`,
    ...report.accuracy.scanWindows.map((window) => `${window.label}: ${window.status.toUpperCase()} close ${window.close ?? "n/a"}`)
  ] : [];
  const chartLines = report.chartImages?.map((chart) => (
    chart.kind === "screenshot"
      ? `Live UI screenshot: ${chart.label} (${chart.path})`
      : `Chart artifact: ${chart.label} (${chart.path})`
  )) ?? [];
  const indicatorLines = Object.values(report.indicatorSnapshots ?? {}).map((snapshot) => (
    `${snapshot.timeframe} indicators: RSI ${snapshot.rsi ?? "n/a"}, MACD hist ${snapshot.macdHistogram ?? "n/a"}, slope ${snapshot.macdSlope ?? "n/a"}, StochRSI ${snapshot.stochRsi ?? "n/a"}, PRE angle ${snapshot.preLiftAngleDegrees ?? "n/a"}, lift ${snapshot.lift ?? "n/a"}`
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
    ...findings
  ].map((line) => line.slice(0, 110));
  const content = [
    "BT",
    "/F1 18 Tf",
    "54 760 Td",
    `(${escapePdfText(lines[0] ?? "NVDA Report")}) Tj`,
    "/F1 10 Tf",
    ...lines.slice(1).flatMap((line) => ["0 -18 Td", `(${escapePdfText(line)}) Tj`]),
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
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f\n";
  offsets.slice(1).forEach((offset) => {
    body += `${offset.toString().padStart(10, "0")} 00000 n\n`;
  });
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return new TextEncoder().encode(body);
}
