import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import measuredData from "./data/nvdaSession.json";
import type { MarketSession } from "./data/nvdaMap";
import { buildTimeframeSeries, type MarketBar } from "./lib/marketData";

const packagedBars: MarketBar[] = (measuredData as MarketSession).candles
  .map((bar): MarketBar => ({
    time: bar.timestamp,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume
  }))
  .filter((bar) => bar.volume > 0);

function formatTestTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatTestPrice(value: number): string {
  return `$${value.toFixed(2)}`;
}

function lastFiniteTest(values: Array<number | null>): number | null {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function getIndicatorTarget() {
  const series = buildTimeframeSeries(packagedBars)["10m"];
  const visibleBars = series.bars.slice(-52);
  const latestRsi = lastFiniteTest(series.rsi);
  const latestMacd = lastFiniteTest(series.macd.hist);

  for (const [visibleIndex, bar] of visibleBars.entries()) {
    const sourceIndex = series.bars.findIndex((item) => item.time === bar.time);
    const rsi = series.rsi[sourceIndex];
    const macdHistogram = series.macd.hist[sourceIndex];

    if (
      typeof rsi === "number" &&
      typeof macdHistogram === "number" &&
      (rsi !== latestRsi || macdHistogram !== latestMacd)
    ) {
      return { bar, rsi, macdHistogram, visibleIndex, visibleCount: visibleBars.length };
    }
  }

  throw new Error("Expected packaged session to include a visible bar with distinct indicators.");
}

function getStableZoomTarget(bars = packagedBars) {
  const series = buildTimeframeSeries(bars)["10m"];
  const visibleBars = series.bars.slice(-52);
  const visibleIndex = 20;
  return { bar: visibleBars[visibleIndex], visibleIndex, visibleCount: visibleBars.length };
}

function clickChartIndex(index: number, total: number) {
  const scene = screen.getByTestId("three-scene");
  vi.spyOn(scene, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 1000,
    bottom: 460,
    width: 1000,
    height: 460,
    toJSON: () => ({})
  } as DOMRect);
  const clientX = total <= 1 ? 0 : (index / (total - 1)) * 1000;
  fireEvent.click(scene, { clientX });
}

function buildLongMarketSession(): MarketSession {
  const candles = Array.from({ length: 160 }, (_, index) => {
    const open = 205 + index * 0.09 + Math.sin(index / 7) * 1.2;
    const close = open + Math.sin(index / 5) * 0.55;
    const high = Math.max(open, close) + 0.42;
    const low = Math.min(open, close) - 0.38;

    return {
      timestamp: new Date(Date.UTC(2026, 4, 12, 13, 30 + index * 5)).toISOString(),
      time: "",
      open,
      high,
      low,
      close,
      volume: 1_000_000 + index * 10_000
    };
  });

  return {
    ...(measuredData as MarketSession),
    candles,
    regularMarketPrice: candles.at(-1)!.close
  };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => undefined)));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("NVDA at a Glance", () => {
  it("renders the immersive 3D bar chart with measured timeframes and indicators", async () => {
    await act(async () => {
      render(<App />);
    });

    const scene = screen.getByTestId("bar-scene");

    expect(screen.getByRole("heading", { name: "Hybrid 3D" })).toBeInTheDocument();
    expect(scene).toHaveAttribute("data-render-state", "ready");
    expect(screen.getByTestId("three-scene")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "10m timeframe" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "1h timeframe" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "4h timeframe" })).toBeInTheDocument();
    expect(screen.getByText("RSI Evaluation")).toBeInTheDocument();
    expect(screen.getByText("MACD Evaluation")).toBeInTheDocument();
  });

  it("lets the analyst switch timeframe, zoom, and choose additional graph formats", async () => {
    await act(async () => {
      render(<App />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "4h timeframe" }));
      fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
      fireEvent.click(screen.getByRole("button", { name: "Line graph format" }));
    });

    expect(screen.getByRole("button", { name: "4h timeframe" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Depth 1.35x")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Line graph format" })).toHaveAttribute("aria-pressed", "true");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Pylab Snapshot format" }));
    });

    expect(screen.getByRole("img", { name: "Pylab-generated NVDA price RSI MACD overview" })).toBeInTheDocument();
  });

  it("shows multiple timeframe charts as lightweight 2D cards in a scrolling comparison strip", async () => {
    await act(async () => {
      render(<App />);
    });

    expect(screen.getByTestId("timeframe-comparison-strip")).toBeInTheDocument();
    expect(screen.getByTestId("timeframe-comparison-card-10m")).toBeInTheDocument();
    expect(screen.getByTestId("timeframe-comparison-card-1h")).toBeInTheDocument();
    expect(screen.getByTestId("timeframe-comparison-card-4h")).toBeInTheDocument();
    expect(screen.getAllByTestId("three-scene")).toHaveLength(1);
    expect(screen.getByTestId("comparison-mini-chart-10m")).toBeInTheDocument();
    expect(screen.getByTestId("comparison-mini-chart-1h")).toBeInTheDocument();
    expect(screen.getByTestId("comparison-mini-chart-4h")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Open 1h comparison chart" }));
    });

    expect(screen.getByRole("button", { name: "1h timeframe" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Open 1h comparison chart" })).toHaveAttribute("aria-pressed", "true");
  });

  it("wires the header to real page sections", async () => {
    await act(async () => {
      render(<App />);
    });

    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("href", "#overview");
    expect(screen.getByRole("link", { name: "Map" })).toHaveAttribute("href", "#map");
    expect(screen.getByRole("link", { name: "Audit" })).toHaveAttribute("href", "#audit");
    expect(screen.getByRole("link", { name: "Thesis" })).toHaveAttribute("href", "#thesis");
    expect(screen.getByRole("link", { name: "Voice" })).toHaveAttribute("href", "#voice");
    expect(document.querySelector("#overview")).toBeInTheDocument();
    expect(document.querySelector("#map")).toBeInTheDocument();
    expect(document.querySelector("#audit")).toBeInTheDocument();
    expect(document.querySelector("#thesis")).toBeInTheDocument();
    expect(document.querySelector("#voice")).toBeInTheDocument();
  });

  it("switches between dark and light themes", async () => {
    await act(async () => {
      render(<App />);
    });

    const shell = screen.getByTestId("app-shell");
    expect(shell).toHaveAttribute("data-theme", "dark");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Switch to light theme" }));
    });

    expect(shell).toHaveAttribute("data-theme", "light");
    expect(screen.getByRole("button", { name: "Switch to dark theme" })).toBeInTheDocument();
  });

  it("offers layout choices on load", async () => {
    await act(async () => {
      render(<App />);
    });

    const shell = screen.getByTestId("app-shell");
    expect(shell).toHaveAttribute("data-layout", "default");
    expect(screen.getByRole("button", { name: "Use Default layout" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Use Focus layout" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use Research layout" })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Use Research layout" }));
    });

    expect(shell).toHaveAttribute("data-layout", "research");
    expect(screen.getByRole("button", { name: "Use Research layout" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows derived mathematical analysis for the selected measured timeframe", async () => {
    await act(async () => {
      render(<App />);
    });

    expect(screen.getByText("Math Stack")).toBeInTheDocument();
    expect(screen.getAllByText("VWAP").length).toBeGreaterThan(0);
    expect(screen.getByText("Measured Range")).toBeInTheDocument();
    expect(screen.getByText("RSI Regime")).toBeInTheDocument();
    expect(screen.getByText("MACD Bias")).toBeInTheDocument();
  });

  it("shows research-backed signal badges, options proxy, and report downloads", async () => {
    await act(async () => {
      render(<App />);
    });

    expect(screen.getByRole("heading", { name: "Evidence-Based Signal Stack" })).toBeInTheDocument();
    expect(screen.getByText("Momentum Confluence")).toBeInTheDocument();
    expect(screen.getByText("Options Chain Proxy")).toBeInTheDocument();
    expect(screen.getByText(/proxy from public chain OI\/Greeks/i)).toBeInTheDocument();
    expect(screen.getByText(/Not financial advice/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download PDF report" })).toHaveAttribute("href", expect.stringContaining("reports/"));
    expect(screen.getByRole("link", { name: "Open report calendar" })).toHaveAttribute("href", expect.stringContaining("calendar.ics"));
  });

  it("loads the expanded scrolling analysis surface with gallery, accuracy, calendar, and 4D visuals", async () => {
    await act(async () => {
      render(<App />);
    });

    expect(screen.getByRole("button", { name: "Enter fullscreen 3D view" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "All Chart Formats" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Accuracy Check" })).toBeInTheDocument();
    expect(screen.getByText("Data Integrity")).toBeInTheDocument();
    expect(screen.getByText("Signal Outcome")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Report Calendar" })).toBeInTheDocument();
    expect(screen.getByText("Previous Session")).toBeInTheDocument();
    expect(screen.getByText("Next Session")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "4D Mathematical Views" })).toBeInTheDocument();
    expect(screen.getByText("Heat Ribbon")).toBeInTheDocument();
    expect(screen.getByText("Volatility Surface")).toBeInTheDocument();
    expect(screen.getByText("Signal Manifold")).toBeInTheDocument();
  });

  it("shows the built-in data and UI audit with the 8 PM Eastern refresh timer", async () => {
    await act(async () => {
      render(<App />);
    });

    expect(screen.getByText("Data Source")).toBeInTheDocument();
    expect(screen.getByText("UI Audit")).toBeInTheDocument();
    expect(screen.getByText("Next Refresh")).toBeInTheDocument();
    expect(screen.getByText(/remaining/i)).toBeInTheDocument();
  });

  it("toggles indicator layers on the 3D chart", async () => {
    await act(async () => {
      render(<App />);
    });

    expect(screen.getByTestId("price-layer")).toBeInTheDocument();
    expect(screen.getByTestId("rsi-layer")).toBeInTheDocument();
    expect(screen.getByTestId("macd-layer")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "RSI overlay" }));
      fireEvent.click(screen.getByRole("button", { name: "MACD overlay" }));
    });

    expect(screen.queryByTestId("rsi-layer")).not.toBeInTheDocument();
    expect(screen.queryByTestId("macd-layer")).not.toBeInTheDocument();
    expect(screen.getByText("3 overlays active")).toBeInTheDocument();
  });

  it("shows the clicked bar's RSI and MACD details instead of the latest timeframe summary", async () => {
    const target = getIndicatorTarget();

    await act(async () => {
      render(<App />);
    });

    await act(async () => {
      clickChartIndex(target.visibleIndex, target.visibleCount);
    });

    const detail = screen.getByLabelText("Selected bar details");
    expect(within(detail).getByText(formatTestPrice(target.bar.close))).toBeInTheDocument();
    expect(within(detail).getByText(String(target.rsi))).toBeInTheDocument();
    expect(within(detail).getByText(String(target.macdHistogram))).toBeInTheDocument();
  });

  it("keeps the selected market bar pinned to the same timestamp when zoom changes", async () => {
    const longSession = buildLongMarketSession();
    const longBars: MarketBar[] = longSession.candles.map((bar) => ({
      time: bar.timestamp,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume
    }));
    const target = getStableZoomTarget(longBars);

    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve(longSession)
    })));

    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getByText("Published JSON synced")).toBeInTheDocument();
    });

    await act(async () => {
      clickChartIndex(target.visibleIndex, target.visibleCount);
    });

    const detail = screen.getByLabelText("Selected bar details");
    expect(within(detail).getByText(formatTestTime(target.bar.time))).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    });

    expect(within(detail).getByText(formatTestTime(target.bar.time))).toBeInTheDocument();
  });
});
