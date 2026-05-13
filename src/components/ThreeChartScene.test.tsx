import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThreeChartScene } from "./ThreeChartScene";
import type { MarketBar } from "../lib/marketData";

const bars: MarketBar[] = [
  { time: "2026-05-12T13:30:00.000Z", open: 100, high: 103, low: 99, close: 102, volume: 1000 },
  { time: "2026-05-12T13:35:00.000Z", open: 102, high: 104, low: 101, close: 101.5, volume: 1500 },
  { time: "2026-05-12T13:40:00.000Z", open: 101.5, high: 106, low: 101, close: 105, volume: 2200 },
  { time: "2026-05-12T13:45:00.000Z", open: 105, high: 106, low: 103, close: 104, volume: 1800 }
];

function create2dContext() {
  return {
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    scale: vi.fn(),
    stroke: vi.fn(),
    fillStyle: "",
    strokeStyle: ""
  } as unknown as CanvasRenderingContext2D;
}

function renderScene(overrides: Partial<React.ComponentProps<typeof ThreeChartScene>> = {}) {
  const props = {
    bars,
    high: 106,
    low: 99,
    volumeMax: 2200,
    vwap: 103,
    zoom: 1,
    showVolume: true,
    showVwap: true,
    onSelectBar: vi.fn(),
    onZoom: vi.fn(),
    ...overrides
  };

  render(<ThreeChartScene {...props} />);
  const scene = screen.getByTestId("three-scene");
  vi.spyOn(scene, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 400,
    bottom: 240,
    width: 400,
    height: 240,
    toJSON: () => ({})
  } as DOMRect);

  return { props, scene };
}

beforeEach(() => {
  const context = create2dContext();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((type: string) => {
    if (type === "2d") return context;
    return null;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ThreeChartScene interactions", () => {
  it("exposes camera state changes after a mouse drag", () => {
    const { scene } = renderScene();
    expect(scene).toHaveAttribute("data-camera-yaw");
    expect(scene).toHaveAttribute("data-camera-pitch");

    const initialYaw = scene.getAttribute("data-camera-yaw");
    const initialPitch = scene.getAttribute("data-camera-pitch");

    fireEvent.mouseDown(scene, { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(scene, { clientX: 180, clientY: 60 });
    fireEvent.mouseUp(scene);

    expect(scene).not.toHaveAttribute("data-camera-yaw", initialYaw);
    expect(scene).not.toHaveAttribute("data-camera-pitch", initialPitch);
  });

  it("lets plain wheel events scroll the page without zooming the chart", () => {
    const onZoom = vi.fn();
    const { scene } = renderScene({ zoom: 1, onZoom });

    fireEvent.wheel(scene, { deltaY: -80 });

    expect(onZoom).not.toHaveBeenCalled();
  });

  it("calls zoom with a clamped next zoom value on modifier wheel", () => {
    const onZoom = vi.fn();
    const { scene } = renderScene({ zoom: 1, onZoom });

    fireEvent.wheel(scene, { deltaY: -80, ctrlKey: true });

    expect(onZoom).toHaveBeenCalledWith(1.16);
  });

  it("selects the expected bar from click position", () => {
    const onSelectBar = vi.fn();
    const { scene } = renderScene({ onSelectBar });

    fireEvent.click(scene, { clientX: 270 });

    expect(onSelectBar).toHaveBeenLastCalledWith(2);
  });

  it("moves selection left and right from the keyboard", () => {
    const onSelectBar = vi.fn();
    const { scene } = renderScene({ onSelectBar });

    fireEvent.keyDown(scene, { key: "ArrowRight" });
    fireEvent.keyDown(scene, { key: "ArrowLeft" });

    expect(onSelectBar).toHaveBeenNthCalledWith(1, 1);
    expect(onSelectBar).toHaveBeenNthCalledWith(2, 0);
  });

  it("does not enter fullscreen from double click unless fullscreen controls are enabled", () => {
    const onFullscreenToggle = vi.fn();
    const { scene } = renderScene({ onFullscreenToggle });
    const shell = scene.closest(".three-chart-shell");

    fireEvent.doubleClick(scene);

    expect(shell).not.toHaveClass("is-fullscreen");
    expect(scene).toHaveAttribute("data-fullscreen", "false");
    expect(onFullscreenToggle).not.toHaveBeenCalled();
  });

  it("toggles local fullscreen state on double click when fullscreen controls are enabled", () => {
    const onFullscreenToggle = vi.fn();
    const { scene } = renderScene({ onFullscreenToggle, showFullscreenControl: true });
    const shell = scene.closest(".three-chart-shell");

    fireEvent.doubleClick(scene);

    expect(shell).toHaveClass("is-fullscreen");
    expect(scene).toHaveAttribute("data-fullscreen", "true");
    expect(onFullscreenToggle).toHaveBeenCalledWith(true);
  });
});
