import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  AreaChart,
  BarChart3,
  Box,
  CandlestickChart,
  ChevronDown,
  ChevronUp,
  Clock3,
  DatabaseZap,
  Eye,
  LineChart,
  Moon,
  RadioTower,
  RefreshCw,
  Rotate3D,
  Signal,
  Sun,
  Waves
} from "lucide-react";
import measuredData from "./data/nvdaSession.json";
import type { MarketSession } from "./data/nvdaMap";
import { formatEasternTimestamp, formatRefreshCountdown, getNextRefreshTime } from "./lib/refreshSchedule";
import { computeSessionAnalysis } from "./lib/sessionAnalysis";
import {
  TIMEFRAMES,
  buildTimeframeSeries,
  summarizeFrame,
  type MarketBar,
  type TimeframeKey,
  type TimeframeSeries
} from "./lib/marketData";

type Theme = "dark" | "light";
type LayoutMode = "default" | "focus" | "research";
type GraphFormat = "3d" | "line" | "candles" | "area" | "volume" | "rsi" | "macd" | "pylab";
type OverlayId = "price" | "volume" | "rsi" | "macd" | "vwap";
type DataStatus = "packaged" | "loading" | "synced" | "error";

const initialSession = measuredData as MarketSession;

const layoutOptions: Array<{ id: LayoutMode; label: string; description: string }> = [
  { id: "default", label: "Default", description: "Balanced chart, controls, indicators, and math." },
  { id: "focus", label: "Focus", description: "Chart-first view for zooming into bars." },
  { id: "research", label: "Research", description: "Analysis-first view for RSI, MACD, and measured ranges." }
];

const graphFormats: Array<{ id: GraphFormat; label: string; icon: typeof BarChart3; ariaLabel: string }> = [
  { id: "3d", label: "Immersive 3D Bars", icon: Box, ariaLabel: "Immersive 3D Bars format" },
  { id: "line", label: "Line", icon: LineChart, ariaLabel: "Line graph format" },
  { id: "candles", label: "Candles", icon: CandlestickChart, ariaLabel: "Candles format" },
  { id: "area", label: "Area", icon: AreaChart, ariaLabel: "Area format" },
  { id: "volume", label: "Volume", icon: BarChart3, ariaLabel: "Volume format" },
  { id: "rsi", label: "RSI", icon: Waves, ariaLabel: "RSI format" },
  { id: "macd", label: "MACD", icon: Signal, ariaLabel: "MACD format" },
  { id: "pylab", label: "Pylab Snapshot", icon: Eye, ariaLabel: "Pylab Snapshot format" }
];

const overlayOptions: Array<{ id: OverlayId; label: string; color: string }> = [
  { id: "price", label: "Price", color: "#d9b64f" },
  { id: "volume", label: "Volume", color: "#ef8840" },
  { id: "rsi", label: "RSI", color: "#9bdc4a" },
  { id: "macd", label: "MACD", color: "#b38cff" },
  { id: "vwap", label: "VWAP", color: "#6fd3a1" }
];

function sessionToBars(session: MarketSession): MarketBar[] {
  return session.candles.map((bar): MarketBar => ({
    time: bar.timestamp,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume
  }))
  .filter((bar) => bar.volume > 0);
}

function isMarketSession(value: unknown): value is MarketSession {
  const session = value as MarketSession;
  return Boolean(session?.symbol && Array.isArray(session.candles) && session.candles.length > 0 && Array.isArray(session.regions));
}

function formatPrice(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `$${value.toFixed(2)}` : "n/a";
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatPercent(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatTime(value: string | null): string {
  if (!value) return "n/a";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function lastFinite(values: Array<number | null>): number | null {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function seriesPath(values: number[], width = 240, height = 82): string {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values
    .map((value, index) => {
      const x = values.length <= 1 ? width / 2 : (index / (values.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function vwapForBars(bars: MarketBar[]): number {
  const totalVolume = bars.reduce((sum, bar) => sum + bar.volume, 0);
  if (totalVolume === 0) return bars.at(-1)?.close ?? 0;
  return bars.reduce((sum, bar) => sum + ((bar.high + bar.low + bar.close) / 3) * bar.volume, 0) / totalVolume;
}

function GraphPreview({ format, series }: { format: GraphFormat; series: TimeframeSeries }) {
  const bars = series.bars.slice(-40);
  const closes = bars.map((bar) => bar.close);
  const rsi = series.rsi.slice(-40).map((value) => value ?? 50);
  const macd = series.macd.hist.slice(-40).map((value) => value ?? 0);
  const volumeMax = Math.max(...bars.map((bar) => bar.volume), 1);
  const closePath = seriesPath(closes);
  const rsiPath = seriesPath(rsi);
  const macdPath = seriesPath(macd);

  if (format === "pylab") {
    return (
      <div className="pylab-card">
        <img
          alt="Pylab-generated NVDA price RSI MACD overview"
          src={`${import.meta.env.BASE_URL}pylab/nvda-pylab-overview.png`}
        />
        <small>Generated with pylab from the packaged measured session bars.</small>
      </div>
    );
  }

  return (
    <svg className="preview-chart" viewBox="0 0 240 104" role="img" aria-label={`${format} graph preview`}>
      <rect width="240" height="104" rx="8" />
      {format === "line" && <path className="preview-line" d={closePath} />}
      {format === "area" && <path className="preview-area" d={`${closePath} L 240 104 L 0 104 Z`} />}
      {format === "candles" && bars.map((bar, index) => {
        const x = 6 + index * (228 / Math.max(bars.length - 1, 1));
        const up = bar.close >= bar.open;
        const min = Math.min(...closes);
        const max = Math.max(...closes);
        const priceRange = max - min || 1;
        const y = (value: number) => 92 - ((value - min) / priceRange) * 76;
        const top = Math.min(y(bar.open), y(bar.close));
        return (
          <g className={up ? "preview-candle up" : "preview-candle down"} key={`${bar.time}-${index}`}>
            <line x1={x} x2={x} y1={y(bar.high)} y2={y(bar.low)} />
            <rect x={x - 2.5} y={top} width="5" height={Math.max(Math.abs(y(bar.close) - y(bar.open)), 2)} rx="1" />
          </g>
        );
      })}
      {format === "volume" && bars.map((bar, index) => {
        const x = 4 + index * (232 / Math.max(bars.length - 1, 1));
        const height = (bar.volume / volumeMax) * 82;
        return <rect className="preview-volume" key={`${bar.time}-${index}`} x={x} y={96 - height} width="4" height={height} rx="1" />;
      })}
      {format === "rsi" && (
        <>
          <line className="preview-guide" x1="0" x2="240" y1="28" y2="28" />
          <line className="preview-guide" x1="0" x2="240" y1="74" y2="74" />
          <path className="preview-rsi" d={rsiPath} />
        </>
      )}
      {format === "macd" && (
        <>
          <line className="preview-guide" x1="0" x2="240" y1="52" y2="52" />
          <path className="preview-macd" d={macdPath} />
        </>
      )}
    </svg>
  );
}

export function App() {
  const [session, setSession] = useState<MarketSession>(initialSession);
  const [dataStatus, setDataStatus] = useState<DataStatus>("packaged");
  const [now, setNow] = useState(() => new Date());
  const [theme, setTheme] = useState<Theme>("dark");
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("default");
  const [timeframe, setTimeframe] = useState<TimeframeKey>("10m");
  const [zoom, setZoom] = useState(1);
  const [format, setFormat] = useState<GraphFormat>("3d");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [activeOverlays, setActiveOverlays] = useState<OverlayId[]>(["price", "volume", "rsi", "macd", "vwap"]);
  const measuredBars = useMemo(() => sessionToBars(session), [session]);
  const frames = useMemo(() => buildTimeframeSeries(measuredBars), [measuredBars]);
  const activeSeries = frames[timeframe];
  const summary = useMemo(() => summarizeFrame(activeSeries), [activeSeries]);
  const analysis = useMemo(() => computeSessionAnalysis(activeSeries.bars), [activeSeries]);
  const visibleBars = activeSeries.bars.slice(-Math.max(12, Math.round(52 / zoom)));
  const selectedBar = selectedIndex === null ? visibleBars.at(-1)! : visibleBars[Math.min(selectedIndex, visibleBars.length - 1)];
  const high = Math.max(...visibleBars.map((bar) => bar.high));
  const low = Math.min(...visibleBars.map((bar) => bar.low));
  const range = high - low || 1;
  const volumeMax = Math.max(...visibleBars.map((bar) => bar.volume), 1);
  const vwap = vwapForBars(activeSeries.bars);
  const latestRsi = lastFinite(activeSeries.rsi);
  const latestMacdHist = lastFinite(activeSeries.macd.hist);
  const latestMacdSlope = lastFinite(activeSeries.macd.slope);
  const nextRefresh = getNextRefreshTime(now);
  const countdown = formatRefreshCountdown(now);
  const currentFormatLabel = graphFormats.find((item) => item.id === format)?.label ?? "Graph";

  const loadPublishedSession = useCallback(async (refresh = false) => {
    if (typeof fetch !== "function") return;
    const suffix = refresh ? `?t=${Date.now()}` : "";

    try {
      setDataStatus(refresh ? "loading" : "packaged");
      const response = await fetch(`${import.meta.env.BASE_URL}data/nvda-session.json${suffix}`, {
        cache: refresh ? "no-store" : "default"
      });
      if (!response.ok) throw new Error(`Published session returned ${response.status}`);
      const payload: unknown = await response.json();
      if (!isMarketSession(payload)) throw new Error("Published session payload is invalid");
      setSession(payload);
      setDataStatus("synced");
      setSelectedIndex(null);
    } catch {
      setDataStatus("error");
    }
  }, []);

  useEffect(() => {
    void loadPublishedSession(false);
  }, [loadPublishedSession]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    let timeout: number | undefined;

    function scheduleRefresh() {
      const delay = Math.min(Math.max(getNextRefreshTime(new Date()).getTime() - Date.now() + 1_500, 1_000), 2_147_483_647);
      timeout = window.setTimeout(() => {
        setNow(new Date());
        void loadPublishedSession(true);
        scheduleRefresh();
      }, delay);
    }

    scheduleRefresh();

    return () => {
      window.clearInterval(interval);
      if (timeout) window.clearTimeout(timeout);
    };
  }, [loadPublishedSession]);

  function toggleOverlay(id: OverlayId) {
    setActiveOverlays((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  return (
    <div className="terminal-shell" data-testid="app-shell" data-theme={theme} data-layout={layoutMode}>
      <header className="topbar">
        <a className="brand-mark" href="#map" aria-label="NVDA Signal Map home">
          <span>NV</span>
          <strong>NVDA at a Glance</strong>
        </a>
        <nav className="topnav" aria-label="Primary">
          <a href="#overview">Overview</a>
          <a href="#map" className="active">Map</a>
          <a href="#audit">Audit</a>
          <a href="#thesis">Thesis</a>
          <a href="#voice">Voice</a>
        </nav>
        <button
          className="icon-button"
          type="button"
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          aria-pressed={theme === "light"}
          onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
        >
          {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
        </button>
      </header>

      <section className="overview-section" id="overview">
        <div>
          <span className="eyebrow">NVDA / measured through {formatTime(measuredBars.at(-1)?.time ?? null)}</span>
          <h1>NVDA at a Glance</h1>
          <p>Measured Yahoo Finance 5m bars feed a session-aligned 10m to 4h bar field with RSI and MACD evaluations. One format is immersive and interactive; the others stay available for fast comparison.</p>
        </div>
        <dl className="overview-stats" aria-label="Session summary">
          <div>
            <dt>Last Close</dt>
            <dd>{formatPrice(summary.latestClose)}</dd>
          </div>
          <div>
            <dt>5m Source Bars</dt>
            <dd>{measuredBars.length}</dd>
          </div>
          <div>
            <dt>Active Bars</dt>
            <dd>{activeSeries.bars.length}</dd>
          </div>
          <div>
            <dt>Refresh</dt>
            <dd>{countdown}</dd>
          </div>
        </dl>
        <div className="layout-chooser" role="group" aria-label="Layout choices">
          {layoutOptions.map((option) => (
            <button
              aria-label={`Use ${option.label} layout`}
              aria-pressed={layoutMode === option.id}
              className={layoutMode === option.id ? "layout-choice active" : "layout-choice"}
              key={option.id}
              onClick={() => setLayoutMode(option.id)}
              type="button"
            >
              <strong>{option.label}</strong>
              <span>{option.description}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="audit-strip" id="audit" aria-label="UI and data audit">
        <article>
          <DatabaseZap size={16} />
          <span>Data Source</span>
          <strong>{dataStatus === "synced" ? "Published JSON synced" : dataStatus === "loading" ? "Refreshing" : dataStatus === "error" ? "Packaged fallback" : "Packaged JSON"}</strong>
          <small>{session.source}</small>
        </article>
        <article>
          <Rotate3D size={16} />
          <span>UI Audit</span>
          <strong>Seamless graph shell</strong>
          <small>{format} / {layoutMode} layout</small>
        </article>
        <article>
          <Clock3 size={16} />
          <span>Next Refresh</span>
          <strong>{formatEasternTimestamp(nextRefresh)}</strong>
          <small>{countdown} remaining</small>
        </article>
        <article>
          <RefreshCw size={16} />
          <span>Retrieved</span>
          <strong>{formatEasternTimestamp(session.retrievedAt)}</strong>
          <small>{formatCompact(analysis.totalVolume)} active volume</small>
        </article>
      </section>

      <main className="map-stage graph-stage" id="map">
        <aside className="filter-panel graph-controls" aria-label="Metric filters">
          <div className="panel-title">
            <RadioTower size={13} />
            <span>Overlays</span>
          </div>
          <div className="filter-list">
            {overlayOptions.map((overlay) => (
              <button
                aria-label={`${overlay.label} overlay`}
                aria-pressed={activeOverlays.includes(overlay.id)}
                className={activeOverlays.includes(overlay.id) ? "filter-row active" : "filter-row"}
                key={overlay.id}
                onClick={() => toggleOverlay(overlay.id)}
                type="button"
              >
                <Signal size={14} />
                <span>{overlay.label}</span>
                <i style={{ "--metric-color": overlay.color } as CSSProperties} />
              </button>
            ))}
          </div>
          <div className="legend-card">
            <div className="panel-title gold">
              <Rotate3D size={13} />
              <span>Active Stack</span>
            </div>
            <strong>{activeOverlays.length} overlays active</strong>
            <p>{summary.bias} / {timeframe}</p>
            <small>{format === "3d" ? "interactive depth enabled" : "comparison preview"}</small>
          </div>
        </aside>

        <section className="chart-map graph-workspace" aria-label="Interactive NVDA chart map">
          <div className="graph-toolbar">
            <div className="timeframe-control" role="group" aria-label="Timeframe selector">
              {TIMEFRAMES.map((option) => (
                <button
                  aria-label={`${option.key} timeframe`}
                  aria-pressed={timeframe === option.key}
                  className={timeframe === option.key ? "active" : ""}
                  key={option.key}
                  onClick={() => {
                    setTimeframe(option.key);
                    setSelectedIndex(null);
                  }}
                  type="button"
                >
                  {option.key}
                </button>
              ))}
            </div>
            <div className="zoom-control">
              <button aria-label="Zoom out" type="button" onClick={() => setZoom((value) => Math.max(0.75, Math.round((value - 0.3) * 100) / 100))}>
                <ChevronDown size={16} />
              </button>
              <span>Depth {zoom.toFixed(2)}x</span>
              <button aria-label="Zoom in" type="button" onClick={() => setZoom((value) => Math.min(2.25, Math.round((value + 0.35) * 100) / 100))}>
                <ChevronUp size={16} />
              </button>
            </div>
          </div>

          <div className="format-strip" role="group" aria-label="Graph formats">
            {graphFormats.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  aria-label={item.ariaLabel}
                  aria-pressed={format === item.id}
                  className={format === item.id ? "format-button active" : "format-button"}
                  key={item.id}
                  onClick={() => setFormat(item.id)}
                  type="button"
                >
                  <Icon size={15} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className={format === "3d" ? "immersive-field" : "immersive-field preview-mode"}>
            <div className="field-header">
              <div>
                <h2>{currentFormatLabel}</h2>
                <p>{format === "3d" ? "Click a bar to inspect its measured OHLCV, RSI, and MACD context." : `${currentFormatLabel} format preview`}</p>
              </div>
              <span>{visibleBars.length} bars visible</span>
            </div>

            {format === "3d" ? (
              <div className="bar-scene" style={{ "--zoom": zoom } as CSSProperties}>
                <div className="floor-grid" />
                {activeOverlays.includes("vwap") && (
                  <div
                    className="vwap-plane"
                    style={{ "--vwap-y": `${76 - ((vwap - low) / range) * 62}%` } as CSSProperties}
                    data-testid="vwap-layer"
                  />
                )}
                <div className="bar-lane" data-testid="price-layer">
                  {visibleBars.map((bar, index) => {
                    const closeHeight = 18 + ((bar.close - low) / range) * 68;
                    const volumeDepth = 18 + (bar.volume / volumeMax) * 64;
                    const up = bar.close >= bar.open;
                    const sourceIndex = activeSeries.bars.findIndex((item) => item.time === bar.time);
                    const rsiValue = activeSeries.rsi[sourceIndex] ?? null;
                    const macdValue = activeSeries.macd.hist[sourceIndex] ?? null;
                    return (
                      <button
                        aria-label={`${formatTime(bar.time)} bar`}
                        className={selectedBar?.time === bar.time ? "market-bar active" : "market-bar"}
                        key={bar.time}
                        onClick={() => setSelectedIndex(index)}
                        style={{
                          "--bar-height": `${closeHeight}%`,
                          "--bar-depth": `${volumeDepth}px`,
                          "--bar-color": up ? "#6fd3a1" : "#ef4e5f",
                          "--bar-index": index
                        } as CSSProperties}
                        type="button"
                      >
                        <span className="bar-face front" />
                        <span className="bar-face side" />
                        <span className="bar-face top" />
                        {activeOverlays.includes("volume") && <i className="volume-stem" data-testid={index === 0 ? "volume-layer" : undefined} />}
                        {activeOverlays.includes("rsi") && <em className="indicator-dot rsi" data-testid={index === 0 ? "rsi-layer" : undefined} style={{ "--rsi": `${rsiValue ?? 50}%` } as CSSProperties} />}
                        {activeOverlays.includes("macd") && <em className={macdValue !== null && macdValue >= 0 ? "indicator-dot macd positive" : "indicator-dot macd"} data-testid={index === 0 ? "macd-layer" : undefined} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <GraphPreview format={format} series={activeSeries} />
            )}
          </div>
        </section>

        <aside className="detail-card graph-detail" aria-label="Selected bar details">
          <div className="detail-card-header">
            <div>
              <h1>{timeframe} Bar</h1>
              <span>{formatTime(selectedBar.time)}</span>
            </div>
            <strong>{formatPrice(selectedBar.close)}</strong>
          </div>
          <dl className="detail-metrics">
            <div>
              <dt>Open</dt>
              <dd>{formatPrice(selectedBar.open)}</dd>
            </div>
            <div>
              <dt>High / Low</dt>
              <dd>{formatPrice(selectedBar.high)} / {formatPrice(selectedBar.low)}</dd>
            </div>
            <div>
              <dt>Volume</dt>
              <dd>{formatCompact(selectedBar.volume)}</dd>
            </div>
          </dl>
          <div className="indicator-readouts">
            <section>
              <span>RSI Evaluation</span>
              <strong>{summary.rsiValue ?? "n/a"}</strong>
              <p>{summary.rsiRegime}</p>
            </section>
            <section>
              <span>MACD Evaluation</span>
              <strong>{summary.macdHistogram ?? "n/a"}</strong>
              <p>line {summary.macdLine ?? "n/a"} / signal {summary.macdSignal ?? "n/a"}</p>
            </section>
          </div>
        </aside>

        <aside className="math-panel" aria-label="Mathematical analysis">
          <div className="panel-title gold">
            <BarChart3 size={13} />
            <span>Math Stack</span>
          </div>
          <div className="math-lede">
            <strong>{analysis.trendLabel}</strong>
            <span>{formatPercent(analysis.sessionReturnPct)} impulse from {formatPrice(analysis.open)} open.</span>
          </div>
          <dl className="math-grid">
            <div>
              <dt>VWAP</dt>
              <dd>{formatPrice(analysis.vwap)}</dd>
            </div>
            <div>
              <dt>Measured Range</dt>
              <dd>{formatPrice(analysis.rangeDollars)} / {analysis.rangePct.toFixed(2)}%</dd>
            </div>
            <div>
              <dt>RSI Regime</dt>
              <dd>{summary.rsiRegime}</dd>
            </div>
            <div>
              <dt>MACD Bias</dt>
              <dd>{summary.bias}</dd>
            </div>
            <div>
              <dt>MACD Slope</dt>
              <dd>{latestMacdSlope ?? "n/a"}</dd>
            </div>
            <div>
              <dt>Latest RSI</dt>
              <dd>{latestRsi ?? "n/a"}</dd>
            </div>
            <div>
              <dt>Histogram</dt>
              <dd>{latestMacdHist ?? "n/a"}</dd>
            </div>
            <div>
              <dt>Reward/Risk</dt>
              <dd>{analysis.rewardRiskRatio.toFixed(2)}x</dd>
            </div>
          </dl>
        </aside>
      </main>

      <section className="insight-section" id="thesis">
        <span className="eyebrow">Thesis</span>
        <h2>Measured bars replaced the stale synthetic map values.</h2>
        <p>The chart now derives 10m, 15m, 30m, 1h, 2h, and 4h bars from canonical 5m OHLCV, with buckets aligned to the 09:30 New York regular-session open.</p>
      </section>

      <section className="voice-section" id="voice">
        <span className="eyebrow">Voice</span>
        <h2>One graph you can go into, many formats you can compare.</h2>
        <p>The 3D bar field is the interactive workspace. The line, candle, area, volume, RSI, MACD, and Pylab views are quick alternate formats for analysis without competing for pointer control.</p>
      </section>
    </div>
  );
}
