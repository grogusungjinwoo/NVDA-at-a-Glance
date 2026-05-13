import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TimeframeSeries } from "../lib/marketData";
import { CalendarHistory, type CalendarReportManifestItem } from "./CalendarHistory";
import { ChartGallery } from "./ChartGallery";
import { MathVisualizations } from "./MathVisualizations";

const sampleSeries: TimeframeSeries = {
  timeframe: "10m",
  bars: [
    { time: "2026-05-12T13:30:00.000Z", open: 130, high: 132, low: 129.5, close: 131.2, volume: 1_200_000 },
    { time: "2026-05-12T13:40:00.000Z", open: 131.2, high: 133.4, low: 130.8, close: 132.7, volume: 1_560_000 },
    { time: "2026-05-12T13:50:00.000Z", open: 132.7, high: 133.2, low: 131.6, close: 132.1, volume: 1_020_000 },
    { time: "2026-05-12T14:00:00.000Z", open: 132.1, high: 134.6, low: 131.9, close: 134.1, volume: 1_880_000 },
    { time: "2026-05-12T14:10:00.000Z", open: 134.1, high: 135.1, low: 133.2, close: 133.6, volume: 1_320_000 },
    { time: "2026-05-12T14:20:00.000Z", open: 133.6, high: 136.2, low: 133.3, close: 135.9, volume: 2_140_000 }
  ],
  intervalMinutes: 10,
  sourceTimeframe: "5m",
  rsi: [null, null, 48.2, 54.1, 59.8, 63.4],
  macd: {
    line: [null, null, 0.12, 0.18, 0.22, 0.27],
    signal: [null, null, 0.08, 0.13, 0.17, 0.21],
    hist: [null, null, 0.04, 0.05, 0.05, 0.06],
    slope: [null, null, null, 0.01, 0, 0.01]
  },
  stochRsi: {
    value: [null, null, null, 44, 58, 72],
    k: [null, null, null, null, null, 58],
    d: [null, null, null, null, null, null],
    rsiLength: 14,
    stochLength: 14
  },
  preLift: {
    phi: 1.618,
    deltaMinutes: [null, 10, 10, 10, 10, 10],
    angleRadians: [null, 0.16045, 0.16045, 0.16045, 0.16045, 0.16045],
    angleDegrees: [null, 9.193, 9.193, 9.193, 9.193, 9.193],
    pre: [null, 0.104, -0.041, 0.139, -0.034, 0.158],
    lift: [null, 6.702, 4.382, 8.078, 5.669, 9.193]
  }
};

const manifest: CalendarReportManifestItem[] = [
  {
    date: "2026-05-13",
    title: "NVDA research report 2026-05-13",
    reportPath: "reports/2026-05-13/report.json",
    pdfPath: "reports/2026-05-13/report.pdf",
    generatedAt: "2026-05-13T20:05:00.000Z"
  },
  {
    date: "2026-05-12",
    title: "NVDA research report 2026-05-12",
    reportPath: "reports/2026-05-12/report.json",
    pdfPath: "reports/2026-05-12/report.pdf",
    generatedAt: "2026-05-12T20:05:00.000Z"
  },
  {
    date: "2026-05-11",
    title: "NVDA research report 2026-05-11",
    reportPath: "reports/2026-05-11/report.json",
    pdfPath: "reports/2026-05-11/report.pdf",
    generatedAt: "2026-05-11T20:05:00.000Z"
  }
];

describe("scrolling expansion components", () => {
  it("renders every chart format in the gallery", () => {
    render(
      <ChartGallery
        series={sampleSeries}
        pylabImage={{
          alt: "Pylab NVDA overview",
          src: "/pylab/nvda-pylab-overview.png"
        }}
      />
    );

    expect(screen.getByRole("heading", { name: "All Chart Formats" })).toBeInTheDocument();
    expect(screen.getByText("Line")).toBeInTheDocument();
    expect(screen.getByText("Candles")).toBeInTheDocument();
    expect(screen.getByText("Area")).toBeInTheDocument();
    expect(screen.getByText("Volume")).toBeInTheDocument();
    expect(screen.getByText("RSI")).toBeInTheDocument();
    expect(screen.getByText("MACD")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Pylab NVDA overview" })).toHaveAttribute("src", "/pylab/nvda-pylab-overview.png");
  });

  it("renders the 4D mathematical visualization and its 2D slice", () => {
    render(<MathVisualizations series={sampleSeries} />);

    expect(screen.getByRole("heading", { name: "4D Mathematical Views" })).toBeInTheDocument();
    expect(screen.getByText("Heat Ribbon")).toBeInTheDocument();
    expect(screen.getByText("Volatility Surface")).toBeInTheDocument();
    expect(screen.getByText("Signal Manifold")).toBeInTheDocument();
    expect(screen.getByText("2D Slice")).toBeInTheDocument();
    expect(screen.getByLabelText("Heat ribbon encoding time price volume and indicator intensity")).toBeInTheDocument();
    expect(screen.getByLabelText("Volatility signal surface encoding time price volume and indicator intensity")).toBeInTheDocument();
    expect(screen.getByLabelText("Signal manifold encoding time price volume and indicator intensity")).toBeInTheDocument();
    expect(screen.getByLabelText("2D slice of the shared 4D signal surface")).toBeInTheDocument();
  });

  it("renders calendar history links with previous and next session affordances", () => {
    render(<CalendarHistory currentDate="2026-05-12" manifest={manifest} basePath="/NVDA-at-a-Glance/" />);

    expect(screen.getByRole("heading", { name: "Report Calendar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Previous Session" })).toHaveAttribute("href", "/NVDA-at-a-Glance/reports/2026-05-11/report.json");
    expect(screen.getByRole("link", { name: "Next Session" })).toHaveAttribute("href", "/NVDA-at-a-Glance/reports/2026-05-13/report.json");
    expect(screen.getByRole("link", { name: "NVDA research report 2026-05-12" })).toHaveAttribute("href", "/NVDA-at-a-Glance/reports/2026-05-12/report.json");
    expect(screen.getByRole("link", { name: "PDF for 2026-05-12" })).toHaveAttribute("href", "/NVDA-at-a-Glance/reports/2026-05-12/report.pdf");
  });
});
