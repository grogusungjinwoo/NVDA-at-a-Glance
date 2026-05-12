import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => undefined)));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("NVDA at a Glance", () => {
  it("renders the immersive 3D bar chart with measured timeframes and indicators", async () => {
    await act(async () => {
      render(<App />);
    });

    expect(screen.getByRole("heading", { name: "Immersive 3D Bars" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "10m timeframe" })).toHaveAttribute("aria-pressed", "true");
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
});
