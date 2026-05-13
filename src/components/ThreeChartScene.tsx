import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import * as THREE from "three";
import type { MarketBar, MarketSessionMarker } from "../lib/marketData";

export interface ThreeChartRenderQuality {
  maxPixelRatio: number;
  preserveDrawingBuffer: boolean;
  candleDetail: "standard" | "high";
}

interface ThreeChartSceneProps {
  bars: MarketBar[];
  sessionMarkers?: MarketSessionMarker[];
  renderQuality?: ThreeChartRenderQuality;
  high: number;
  low: number;
  volumeMax: number;
  vwap: number;
  zoom: number;
  showVolume: boolean;
  showVwap: boolean;
  onSelectBar: (index: number) => void;
  onZoom: (nextZoom: number) => void;
  ariaLabel?: string;
  className?: string;
  onFullscreenToggle?: (isFullscreen: boolean) => void;
  showFullscreenControl?: boolean;
  testId?: string;
}

function scalePrice(value: number, low: number, high: number): number {
  const range = high - low || 1;
  return -3.2 + ((value - low) / range) * 6.4;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function safeCanvasContext(
  canvas: HTMLCanvasElement,
  type: "2d" | "webgl" | "webgl2"
): CanvasRenderingContext2D | WebGLRenderingContext | WebGL2RenderingContext | null {
  try {
    return canvas.getContext(type) as CanvasRenderingContext2D | WebGLRenderingContext | WebGL2RenderingContext | null;
  } catch {
    return null;
  }
}

function drawFallback(canvas: HTMLCanvasElement, bars: MarketBar[], high: number, low: number, volumeMax: number) {
  const context = safeCanvasContext(canvas, "2d") as CanvasRenderingContext2D | null;
  if (!context) return;
  const width = canvas.clientWidth || 900;
  const height = canvas.clientHeight || 460;
  canvas.width = width * window.devicePixelRatio;
  canvas.height = height * window.devicePixelRatio;
  context.scale(window.devicePixelRatio, window.devicePixelRatio);
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#07120f";
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "rgba(238, 245, 232, 0.14)";

  for (let index = 0; index <= 5; index += 1) {
    const y = 36 + index * ((height - 92) / 5);
    context.beginPath();
    context.moveTo(38, y);
    context.lineTo(width - 28, y);
    context.stroke();
  }

  const range = high - low || 1;
  const barWidth = Math.max(4, (width - 86) / Math.max(bars.length, 1) - 4);
  bars.forEach((bar, index) => {
    const x = 42 + index * ((width - 86) / Math.max(bars.length, 1));
    const y = (price: number) => 34 + (1 - (price - low) / range) * (height - 116);
    const up = bar.close >= bar.open;
    context.strokeStyle = up ? "#6fd3a1" : "#ef4e5f";
    context.fillStyle = up ? "rgba(111, 211, 161, 0.82)" : "rgba(239, 78, 95, 0.82)";
    context.beginPath();
    context.moveTo(x + barWidth / 2, y(bar.high));
    context.lineTo(x + barWidth / 2, y(bar.low));
    context.stroke();
    const top = Math.min(y(bar.open), y(bar.close));
    context.fillRect(x, top, barWidth, Math.max(Math.abs(y(bar.close) - y(bar.open)), 2));
    context.fillStyle = "rgba(239, 136, 64, 0.66)";
    context.fillRect(x, height - 34 - (bar.volume / Math.max(volumeMax, 1)) * 56, barWidth, (bar.volume / Math.max(volumeMax, 1)) * 56);
  });
}

export function ThreeChartScene({
  bars,
  sessionMarkers = [],
  renderQuality = { maxPixelRatio: 2.5, preserveDrawingBuffer: false, candleDetail: "standard" },
  high,
  low,
  volumeMax,
  vwap,
  zoom,
  showVolume,
  showVwap,
  onSelectBar,
  onZoom,
  ariaLabel = "Price-accurate Three.js NVDA OHLCV candle and volume scene",
  className = "",
  onFullscreenToggle,
  showFullscreenControl = false,
  testId = "three-scene"
}: ThreeChartSceneProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; yaw: number; pitch: number; moved: boolean } | null>(null);
  const suppressNextClickRef = useRef(false);
  const selectedIndexRef = useRef(0);
  const cameraYawRef = useRef(0);
  const cameraPitchRef = useRef(0);
  const zoomRef = useRef(zoom);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [cameraYaw, setCameraYaw] = useState(0);
  const [cameraPitch, setCameraPitch] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const labels = useMemo(() => {
    const mid = low + (high - low) / 2;
    return [high, mid, low].map((value) => `$${value.toFixed(2)}`);
  }, [high, low]);
  const markerPositions = useMemo(() => {
    const firstTime = Date.parse(bars[0]?.time ?? "");
    const lastTime = Date.parse(bars.at(-1)?.time ?? "");
    const span = Math.max(lastTime - firstTime, 1);

    return sessionMarkers.map((marker) => {
      const markerTime = Date.parse(marker.time);
      const percent = Number.isFinite(markerTime) && Number.isFinite(firstTime) && Number.isFinite(lastTime)
        ? clamp(((markerTime - firstTime) / span) * 100, 0, 100)
        : 0;

      return { ...marker, percent };
    });
  }, [bars, sessionMarkers]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    function syncFullscreenState() {
      setIsFullscreen(document.fullscreenElement === shellRef.current);
    }

    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || bars.length === 0) return;
    const width = canvas.clientWidth || 920;
    const height = canvas.clientHeight || 460;

    let renderer: {
      setPixelRatio: (pixelRatio: number) => void;
      setSize: (width: number, height: number, updateStyle?: boolean) => void;
      setClearColor: (color: number, alpha?: number) => void;
      render: (scene: unknown, camera: unknown) => void;
      dispose: () => void;
    };
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: renderQuality.candleDetail === "high",
        alpha: false,
        preserveDrawingBuffer: renderQuality.preserveDrawingBuffer
      });
    } catch {
      drawFallback(canvas, bars, high, low, volumeMax);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, renderQuality.maxPixelRatio));
    renderer.setSize(width, height, false);
    renderer.setClearColor(0x07120f, 1);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x07120f, 14, 32);
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    const target = new THREE.Vector3(0, 0.2, 0);
    function positionCamera() {
      const zoomScale = Math.max(zoomRef.current, 0.7);
      const baseY = 7.4 / zoomScale;
      const baseZ = 13.2 / zoomScale;
      const radius = Math.hypot(baseY - target.y, baseZ);
      const yawRadians = (cameraYawRef.current * Math.PI) / 180;
      const pitchRadians = Math.atan2(baseY - target.y, baseZ) + (cameraPitchRef.current * Math.PI) / 180;
      const horizontalRadius = Math.cos(pitchRadians) * radius;
      camera.position.set(
        Math.sin(yawRadians) * horizontalRadius,
        target.y + Math.sin(pitchRadians) * radius,
        Math.cos(yawRadians) * horizontalRadius
      );
      camera.lookAt(target);
    }
    positionCamera();

    const ambient = new THREE.AmbientLight(0xffffff, 0.58);
    const key = new THREE.DirectionalLight(0xffffff, 1.25);
    key.position.set(4, 8, 6);
    scene.add(ambient, key);

    const floor = new THREE.GridHelper(18, 18, 0x31554b, 0x1f332f);
    floor.position.y = -4.35;
    floor.rotation.x = Math.PI / 2;
    scene.add(floor);

    const group = new THREE.Group();
    const spacing = 0.46;
    const totalWidth = (bars.length - 1) * spacing;
    const bodyWidth = 0.22;
    const bodyDepth = 0.3;
    const bodyGeometry = new THREE.BoxGeometry(bodyWidth, 1, bodyDepth);
    const volumeGeometry = new THREE.BoxGeometry(bodyWidth * 1.2, 1, bodyDepth * 1.2);
    const upMaterial = new THREE.MeshStandardMaterial({
      color: 0x6fd3a1,
      emissive: 0x153627,
      metalness: 0.1,
      roughness: 0.38
    });
    const downMaterial = new THREE.MeshStandardMaterial({
      color: 0xef4e5f,
      emissive: 0x3d1016,
      metalness: 0.1,
      roughness: 0.38
    });
    const wickMaterial = new THREE.LineBasicMaterial({ color: 0xeef5e8, transparent: true, opacity: 0.74 });
    const volumeMaterial = new THREE.MeshStandardMaterial({ color: 0xef8840, transparent: true, opacity: 0.66, roughness: 0.42 });
    const markerMaterial = new THREE.LineBasicMaterial({ color: 0xd9b64f, transparent: true, opacity: 0.38 });

    function markerXFor(time: string) {
      const targetTime = Date.parse(time);
      if (!Number.isFinite(targetTime) || bars.length <= 1) return 0;
      let nearestIndex = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;
      bars.forEach((bar, index) => {
        const distance = Math.abs(Date.parse(bar.time) - targetTime);
        if (distance < nearestDistance) {
          nearestIndex = index;
          nearestDistance = distance;
        }
      });
      return nearestIndex * spacing - totalWidth / 2;
    }

    bars.forEach((bar, index) => {
      const x = index * spacing - totalWidth / 2;
      const openY = scalePrice(bar.open, low, high);
      const closeY = scalePrice(bar.close, low, high);
      const highY = scalePrice(bar.high, low, high);
      const lowY = scalePrice(bar.low, low, high);
      const up = bar.close >= bar.open;
      const bodyHeight = Math.max(Math.abs(closeY - openY), 0.06);
      const body = new THREE.Mesh(
        bodyGeometry,
        up ? upMaterial : downMaterial
      );
      body.scale.y = bodyHeight;
      body.position.set(x, (openY + closeY) / 2, 0);
      body.userData.index = index;
      group.add(body);

      const wick = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, lowY, 0), new THREE.Vector3(x, highY, 0)]),
        wickMaterial
      );
      group.add(wick);

      if (showVolume) {
        const volumeHeight = Math.max(0.08, (bar.volume / Math.max(volumeMax, 1)) * 1.45);
        const volume = new THREE.Mesh(volumeGeometry, volumeMaterial);
        volume.scale.y = volumeHeight;
        volume.position.set(x, -4.25 + volumeHeight / 2, 0.62);
        group.add(volume);
      }
    });

    sessionMarkers.forEach((marker) => {
      const x = markerXFor(marker.time);
      const markerLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(x, -4.3, -0.58),
          new THREE.Vector3(x, 3.4, -0.58)
        ]),
        markerMaterial
      );
      group.add(markerLine);
    });

    if (showVwap) {
      const vwapY = scalePrice(vwap, low, high);
      const vwapLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-totalWidth / 2 - 0.3, vwapY, -0.34),
          new THREE.Vector3(totalWidth / 2 + 0.3, vwapY, -0.34)
        ]),
        new THREE.LineBasicMaterial({ color: 0xd9b64f, transparent: true, opacity: 0.96 })
      );
      group.add(vwapLine);
    }

    scene.add(group);
    let animationFrame = 0;
    let renderedWidth = 0;
    let renderedHeight = 0;

    const renderFrame = () => {
      const nextWidth = canvas.clientWidth || width;
      const nextHeight = canvas.clientHeight || height;
      if (nextWidth !== renderedWidth || nextHeight !== renderedHeight) {
        renderer.setSize(nextWidth, nextHeight, false);
        renderedWidth = nextWidth;
        renderedHeight = nextHeight;
        camera.aspect = nextWidth / Math.max(nextHeight, 1);
        camera.updateProjectionMatrix();
      }
      positionCamera();
      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(renderFrame);
    };

    renderFrame();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      scene.traverse((object: any) => {
        if ("geometry" in object && object.geometry instanceof THREE.BufferGeometry) object.geometry.dispose();
        if ("material" in object) {
          const material = object.material;
          if (Array.isArray(material)) material.forEach((item) => item.dispose());
          else if (material instanceof THREE.Material) material.dispose();
        }
      });
      renderer.dispose();
    };
  }, [bars, high, low, renderQuality, sessionMarkers, showVolume, showVwap, volumeMax, vwap]);

  useEffect(() => {
    if (bars.length === 0) {
      selectedIndexRef.current = 0;
      setHoverIndex(null);
      return;
    }

    selectedIndexRef.current = Math.min(selectedIndexRef.current, bars.length - 1);
  }, [bars.length]);

  function selectBar(index: number) {
    if (bars.length === 0) return;
    const nextIndex = Math.min(Math.max(index, 0), bars.length - 1);
    selectedIndexRef.current = nextIndex;
    setHoverIndex(nextIndex);
    onSelectBar(nextIndex);
  }

  function pickBar(clientX: number) {
    const canvas = canvasRef.current;
    if (!canvas || bars.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = (clientX - rect.left) / Math.max(rect.width, 1);
    const index = Math.min(Math.max(Math.round(ratio * (bars.length - 1)), 0), bars.length - 1);
    selectBar(index);
  }

  function toggleFullscreen() {
    if (!showFullscreenControl) return;
    setIsFullscreen((current) => {
      const next = !current;
      const shell = shellRef.current;

      try {
        if (next && shell?.requestFullscreen) {
          void shell.requestFullscreen().then(() => {
            setIsFullscreen(true);
            onFullscreenToggle?.(true);
          }).catch(() => undefined);
          return current;
        } else if (!next && document.fullscreenElement && document.exitFullscreen) {
          void document.exitFullscreen().then(() => {
            setIsFullscreen(false);
            onFullscreenToggle?.(false);
          }).catch(() => undefined);
          return current;
        }
      } catch {
        // Local state still gives tests and constrained browsers a deterministic fullscreen mode.
      }

      onFullscreenToggle?.(next);
      return next;
    });
  }

  const hoverBar = hoverIndex === null ? null : bars[hoverIndex];

  return (
    <div
      ref={shellRef}
      className={`three-chart-shell ${className} ${isFullscreen ? "is-fullscreen" : ""}`.trim()}
      data-fullscreen={isFullscreen ? "true" : "false"}
      onDoubleClick={showFullscreenControl ? toggleFullscreen : undefined}
      onMouseMove={(event) => {
        if (!dragStartRef.current) pickBar(event.clientX);
      }}
      onClick={(event) => {
        if (suppressNextClickRef.current) {
          suppressNextClickRef.current = false;
          return;
        }

        pickBar(event.clientX);
      }}
      onWheel={(event) => {
        if (!event.ctrlKey && !event.metaKey && !isFullscreen) return;
        event.preventDefault();
        onZoom(Math.min(2.8, Math.max(0.7, zoom + (event.deltaY < 0 ? 0.16 : -0.16))));
      }}
    >
      <canvas
        ref={canvasRef}
        className="three-scene"
        data-testid={testId}
        data-camera-pitch={cameraPitch.toFixed(2)}
        data-camera-yaw={cameraYaw.toFixed(2)}
        data-fullscreen={isFullscreen ? "true" : "false"}
        data-render-quality={renderQuality.candleDetail}
        role="img"
        aria-label={ariaLabel}
        tabIndex={0}
        onMouseDown={(event) => {
          dragStartRef.current = { x: event.clientX, y: event.clientY, yaw: cameraYaw, pitch: cameraPitch, moved: false };
        }}
        onMouseMove={(event) => {
          if (!dragStartRef.current) return;
          const dx = event.clientX - dragStartRef.current.x;
          const dy = event.clientY - dragStartRef.current.y;
          if (Math.abs(dx) > 1 || Math.abs(dy) > 1) dragStartRef.current.moved = true;
          const nextYaw = Math.max(-60, Math.min(60, dragStartRef.current.yaw + dx * 0.2));
          const nextPitch = Math.max(-35, Math.min(35, dragStartRef.current.pitch - dy * 0.18));
          cameraYawRef.current = nextYaw;
          cameraPitchRef.current = nextPitch;
          setCameraYaw(nextYaw);
          setCameraPitch(nextPitch);
        }}
        onMouseUp={() => {
          if (dragStartRef.current?.moved) suppressNextClickRef.current = true;
          dragStartRef.current = null;
        }}
        onMouseLeave={() => {
          if (dragStartRef.current?.moved) suppressNextClickRef.current = true;
          dragStartRef.current = null;
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") {
            event.preventDefault();
            selectBar(selectedIndexRef.current + 1);
          }
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            selectBar(selectedIndexRef.current - 1);
          }
        }}
      />
      {showFullscreenControl && (
        <button
          className="fullscreen-chart-button"
          type="button"
          aria-label={isFullscreen ? "Exit fullscreen 3D view" : "Enter fullscreen 3D view"}
          onClick={(event) => {
            event.stopPropagation();
            toggleFullscreen();
          }}
        >
          {isFullscreen ? "Exit" : "Fullscreen"}
        </button>
      )}
      <div className="three-axis-labels" aria-hidden="true">
        {labels.map((label) => <span key={label}>{label}</span>)}
      </div>
      <div className="session-marker-layer" aria-hidden="true">
        {markerPositions.map((marker) => (
          <span
            className={`session-marker ${marker.kind}`}
            data-testid={`session-marker-${marker.id}`}
            key={marker.id}
            style={{ "--marker-x": `${marker.percent}%` } as CSSProperties}
          >
            <b>{marker.label}</b>
            <em>{marker.tradingDate}</em>
          </span>
        ))}
      </div>
      <div className="volume-axis-label" aria-hidden="true">Vol {volumeMax.toLocaleString()}</div>
      {hoverBar && (
        <output className="three-tooltip">
          <strong>{new Date(hoverBar.time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</strong>
          <span>O {hoverBar.open.toFixed(2)} H {hoverBar.high.toFixed(2)} L {hoverBar.low.toFixed(2)} C {hoverBar.close.toFixed(2)}</span>
          <span>V {hoverBar.volume.toLocaleString()}</span>
        </output>
      )}
    </div>
  );
}
