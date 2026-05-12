import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { candles, marketRegions, metricOptions } from "./data/nvdaMap";

describe("NVDA signal map", () => {
  it("lets the analyst multi-select highlighted chart metrics", () => {
    render(<App />);

    expect(screen.getByText("3 overlays active")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /TAP Vector/i }));
    fireEvent.click(screen.getByRole("button", { name: /RSI Curvature/i }));

    expect(screen.getByText("5 overlays active")).toBeInTheDocument();
    expect(screen.getByLabelText("RSI Curvature overlay")).toHaveAttribute("aria-pressed", "true");
  });

  it("wires the header to real page sections", () => {
    render(<App />);

    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("href", "#overview");
    expect(screen.getByRole("link", { name: "Map" })).toHaveAttribute("href", "#map");
    expect(screen.getByRole("link", { name: "Thesis" })).toHaveAttribute("href", "#thesis");
    expect(screen.getByRole("link", { name: "Voice" })).toHaveAttribute("href", "#voice");
    expect(document.querySelector("#overview")).toBeInTheDocument();
    expect(document.querySelector("#map")).toBeInTheDocument();
    expect(document.querySelector("#thesis")).toBeInTheDocument();
    expect(document.querySelector("#voice")).toBeInTheDocument();
  });

  it("switches between dark and light themes", () => {
    render(<App />);

    const shell = screen.getByTestId("app-shell");
    expect(shell).toHaveAttribute("data-theme", "dark");

    fireEvent.click(screen.getByRole("button", { name: "Switch to light theme" }));

    expect(shell).toHaveAttribute("data-theme", "light");
    expect(screen.getByRole("button", { name: "Switch to dark theme" })).toBeInTheDocument();
  });

  it("ties metric filters to the visible map layers", () => {
    render(<App />);

    expect(screen.getByTestId("price-layer")).toBeInTheDocument();
    expect(screen.getByTestId("volume-layer")).toBeInTheDocument();
    expect(screen.getByTestId("risk-layer")).toBeInTheDocument();
    expect(screen.queryByTestId("tap-layer")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Price Structure overlay" }));
    fireEvent.click(screen.getByRole("button", { name: "Volume Velocity overlay" }));
    fireEvent.click(screen.getByRole("button", { name: "Risk Cone overlay" }));

    expect(screen.queryByTestId("price-layer")).not.toBeInTheDocument();
    expect(screen.queryByTestId("volume-layer")).not.toBeInTheDocument();
    expect(screen.queryByTestId("risk-layer")).not.toBeInTheDocument();
    expect(screen.getAllByText("No regions lit")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "TAP Vector overlay" }));

    expect(screen.getByTestId("tap-layer")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Opening Drive" })).toBeInTheDocument();
  });

  it("keeps the selected region aligned with active filters", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Risk Cone region" }));
    expect(screen.getByRole("heading", { name: "Risk Cone" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Volume Velocity overlay" }));
    fireEvent.click(screen.getByRole("button", { name: "Risk Cone overlay" }));

    expect(screen.getByRole("heading", { name: "Opening Drive" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Risk Cone" })).not.toBeInTheDocument();
  });

  it("selects regions from the HTML list and keyboard-accessible map controls", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Select Risk Cone" }));
    expect(screen.getByRole("heading", { name: "Risk Cone" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "RSI Curvature overlay" }));
    const momentumRegion = screen.getByRole("button", { name: "Momentum Bend region" });
    fireEvent.keyDown(momentumRegion, { key: " " });

    expect(screen.getByRole("heading", { name: "Momentum Bend" })).toBeInTheDocument();
  });
});

describe("NVDA map data", () => {
  it("uses only registered metrics for regions", () => {
    const metricIds = new Set(metricOptions.map((metric) => metric.id));

    for (const region of marketRegions) {
      expect(region.metrics.every((metric) => metricIds.has(metric))).toBe(true);
    }
  });

  it("keeps candle prices within their high-low range", () => {
    for (const candle of candles) {
      expect(candle.low).toBeLessThanOrEqual(Math.min(candle.open, candle.close));
      expect(candle.high).toBeGreaterThanOrEqual(Math.max(candle.open, candle.close));
    }
  });
});
