import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  Activity,
  BarChart3,
  CircleDot,
  Crosshair,
  Layers3,
  LineChart,
  Moon,
  RadioTower,
  SlidersHorizontal,
  Sun,
  TrendingUp,
  Waves,
  Zap
} from "lucide-react";
import { buildHighlightSummary, toggleSelection } from "./lib/highlightModel";
import { candles, marketRegions, metricOptions, type MarketRegion, type MetricId } from "./data/nvdaMap";

const metricIcons: Record<MetricId, typeof Activity> = {
  price: LineChart,
  tap: TrendingUp,
  lift: Waves,
  rsi: Activity,
  macd: BarChart3,
  volume: RadioTower,
  risk: Crosshair,
  ghost: Zap
};

const defaultSelected: MetricId[] = ["price", "volume", "risk"];

function formatPrice(value: number): string {
  return `$${value.toFixed(2)}`;
}

function directionLabel(direction: MarketRegion["direction"] | "mixed"): string {
  if (direction === "mixed") return "mixed bias";
  return direction;
}

export function App() {
  const [selectedMetrics, setSelectedMetrics] = useState<MetricId[]>(defaultSelected);
  const [focusedRegionId, setFocusedRegionId] = useState(marketRegions[0].id);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const summary = useMemo(() => buildHighlightSummary(metricOptions, selectedMetrics), [selectedMetrics]);
  const activeRegions = useMemo(
    () => marketRegions.filter((region) => region.metrics.some((metric) => selectedMetrics.includes(metric))),
    [selectedMetrics]
  );
  const focusedRegion = activeRegions.find((region) => region.id === focusedRegionId) ?? activeRegions[0] ?? null;
  const highs = candles.map((candle) => candle.high);
  const lows = candles.map((candle) => candle.low);
  const maxPrice = Math.max(...highs) + 0.45;
  const minPrice = Math.min(...lows) - 0.45;
  const plot = { left: 70, top: 58, width: 1140, height: 510 };
  const xFor = (index: number) => plot.left + (index / (candles.length - 1)) * plot.width;
  const yFor = (price: number) => plot.top + ((maxPrice - price) / (maxPrice - minPrice)) * plot.height;
  const closePath = candles.map((candle, index) => `${index === 0 ? "M" : "L"} ${xFor(index).toFixed(2)} ${yFor(candle.close).toFixed(2)}`).join(" ");
  const volumeMax = Math.max(...candles.map((candle) => candle.volume));

  useEffect(() => {
    if (activeRegions.length === 0) return;
    if (!activeRegions.some((region) => region.id === focusedRegionId)) {
      setFocusedRegionId(activeRegions[0].id);
    }
  }, [activeRegions, focusedRegionId]);

  function hasMetric(metricId: MetricId): boolean {
    return selectedMetrics.includes(metricId);
  }

  function toggleMetric(metricId: MetricId) {
    setSelectedMetrics((current) => toggleSelection(current, metricId) as MetricId[]);
  }

  function regionColor(region: MarketRegion): string {
    const matchedMetric = region.metrics.find((metric) => selectedMetrics.includes(metric)) ?? region.metrics[0];
    return metricOptions.find((metric) => metric.id === matchedMetric)?.color ?? "#d9b64f";
  }

  return (
    <div className="terminal-shell" data-testid="app-shell" data-theme={theme}>
      <header className="topbar">
        <a className="brand-mark" href="#map" aria-label="NVDA Signal Map home">
          <span>NV</span>
          <strong>NVDA at a Glance</strong>
        </a>
        <nav className="topnav" aria-label="Primary">
          <a href="#overview">Overview</a>
          <a href="#map" className="active">Map</a>
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
          <span className="eyebrow">NVDA / 2026-05-09</span>
          <h1>NVDA at a Glance</h1>
          <p>Market terrain from the Phantom Resonance Engine legacy session, mapping PRE pressure, velocity, risk, and momentum layers across one compact chart workspace.</p>
        </div>
        <dl className="overview-stats" aria-label="Session summary">
          <div>
            <dt>Last Close</dt>
            <dd>{formatPrice(candles[candles.length - 1].close)}</dd>
          </div>
          <div>
            <dt>Bars</dt>
            <dd>{candles.length}</dd>
          </div>
          <div>
            <dt>Regions</dt>
            <dd>{marketRegions.length}</dd>
          </div>
        </dl>
      </section>

      <main className="map-stage" id="map">
        <aside className="filter-panel" aria-label="Metric filters">
          <div className="panel-title">
            <SlidersHorizontal size={13} />
            <span>Metric Filter</span>
          </div>
          <div className="filter-list">
            {metricOptions.map((metric) => {
              const Icon = metricIcons[metric.id];
              const active = selectedMetrics.includes(metric.id);
              return (
                <button
                  aria-label={`${metric.label} overlay`}
                  aria-pressed={active}
                  className={active ? "filter-row active" : "filter-row"}
                  key={metric.id}
                  onClick={() => toggleMetric(metric.id)}
                  type="button"
                >
                  <Icon size={14} />
                  <span>{metric.label}</span>
                  <i style={{ "--metric-color": metric.color } as CSSProperties} />
                </button>
              );
            })}
          </div>
          <div className="legend-card">
            <div className="panel-title gold">
              <Layers3 size={13} />
              <span>Active Stack</span>
            </div>
            <strong>{summary.count} overlays active</strong>
            <p>{summary.averageStrength}% composite strength</p>
            <small>{directionLabel(summary.bias)}</small>
          </div>
          <div className="region-list" aria-label="Active regions">
            <div className="panel-title">
              <CircleDot size={13} />
              <span>Regions</span>
            </div>
            {activeRegions.length === 0 ? (
              <p>No regions match the active filters.</p>
            ) : (
              activeRegions.map((region) => (
                <button
                  aria-label={`Select ${region.label}`}
                  className={focusedRegion?.id === region.id ? "region-row active" : "region-row"}
                  key={region.id}
                  onClick={() => setFocusedRegionId(region.id)}
                  type="button"
                >
                  <span>{region.code}</span>
                  <strong>{region.label}</strong>
                  <small>{region.strength}%</small>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="chart-map" aria-label="Interactive NVDA chart map">
          <svg className="market-svg" viewBox="0 0 1280 680" role="group" aria-label="NVDA chart with selectable signal regions">
            <defs>
              <linearGradient id="ocean" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0%" stopColor="#263238" />
                <stop offset="100%" stopColor="#172620" />
              </linearGradient>
              <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <rect width="1280" height="680" fill="url(#ocean)" />
            {Array.from({ length: 9 }, (_, index) => {
              const y = plot.top + (index / 8) * plot.height;
              const price = maxPrice - (index / 8) * (maxPrice - minPrice);
              return (
                <g key={`price-${index}`}>
                  <line className="map-grid-line" x1={plot.left} x2={plot.left + plot.width} y1={y} y2={y} />
                  <text className="axis-label" x={plot.left - 16} y={y + 5} textAnchor="end">{formatPrice(price)}</text>
                </g>
              );
            })}
            {Array.from({ length: 8 }, (_, index) => {
              const x = plot.left + (index / 7) * plot.width;
              const candle = candles[Math.min(candles.length - 1, Math.round((index / 7) * (candles.length - 1)))];
              return (
                <g key={`time-${index}`}>
                  <line className="map-grid-line vertical" x1={x} x2={x} y1={plot.top} y2={plot.top + plot.height} />
                  <text className="axis-label" x={x} y={plot.top + plot.height + 38} textAnchor="middle">{candle.time}</text>
                </g>
              );
            })}

            {activeRegions.map((region) => {
              const color = regionColor(region);
              const focused = region.id === focusedRegion.id;
              return (
                <g
                  className={focused ? "region active" : "region"}
                  key={region.id}
                  onClick={() => setFocusedRegionId(region.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setFocusedRegionId(region.id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`${region.label} region`}
                >
                  <rect
                    x={region.x}
                    y={region.y}
                    width={region.width}
                    height={region.height}
                    rx="18"
                    fill={color}
                    opacity={focused ? 0.33 : 0.22}
                    stroke={color}
                    strokeWidth={focused ? 3 : 1.5}
                    filter={focused ? "url(#softGlow)" : undefined}
                  />
                  <text className="region-label" x={region.x + region.width / 2} y={region.y + 34} textAnchor="middle">{region.label}</text>
                  <text className="region-code" x={region.x + region.width / 2} y={region.y + 58} textAnchor="middle">{region.code} / {region.timeframe}</text>
                </g>
              );
            })}

            {hasMetric("price") && (
              <g data-testid="price-layer">
                <path className="close-line-shadow" d={closePath} />
                <path className="close-line" d={closePath} />
                {candles.map((candle, index) => {
                  const x = xFor(index);
                  const up = candle.close >= candle.open;
                  const bodyTop = Math.min(yFor(candle.open), yFor(candle.close));
                  const bodyHeight = Math.max(Math.abs(yFor(candle.close) - yFor(candle.open)), 3);
                  return (
                    <g className={up ? "candle up" : "candle down"} key={candle.time}>
                      <line x1={x} x2={x} y1={yFor(candle.high)} y2={yFor(candle.low)} />
                      <rect x={x - 8} y={bodyTop} width="16" height={bodyHeight} rx="2" />
                    </g>
                  );
                })}
              </g>
            )}

            {hasMetric("volume") && (
              <g data-testid="volume-layer">
                {candles.map((candle, index) => {
                  const volumeHeight = (candle.volume / volumeMax) * 72;
                  return <rect className="volume-bar" key={candle.time} x={xFor(index) - 10} y={620 - volumeHeight} width="20" height={volumeHeight} rx="2" />;
                })}
              </g>
            )}

            {hasMetric("tap") && <line className="tap-vector" data-testid="tap-layer" x1="105" x2="720" y1="432" y2="152" />}
            {hasMetric("risk") && <path className="risk-ribbon" data-testid="risk-layer" d="M 746 102 C 858 178 940 268 998 388" />}
            <text className="map-watermark" x="640" y="648" textAnchor="middle">NVDA / 2026-05-09 / Phantom Resonance Engine</text>
          </svg>
        </section>

        <aside className="detail-card" aria-label="Selected region details">
          {focusedRegion ? (
            <>
              <div className="detail-card-header">
                <div>
                  <h1>{focusedRegion.label}</h1>
                  <span>{focusedRegion.code} / {focusedRegion.timeframe}</span>
                </div>
                <button className="close-button" type="button" aria-label="Reset selected region" onClick={() => setFocusedRegionId(activeRegions[0]?.id ?? marketRegions[0].id)}>
                  <CircleDot size={18} />
                </button>
              </div>
              <dl className="detail-metrics">
                <div>
                  <dt>Price Range</dt>
                  <dd>{focusedRegion.price}</dd>
                </div>
                <div>
                  <dt>Signal Bias</dt>
                  <dd>{directionLabel(focusedRegion.direction)}</dd>
                </div>
                <div>
                  <dt>Strength</dt>
                  <dd>{focusedRegion.strength}%</dd>
                </div>
              </dl>
              <div className="detail-section">
                <span>Thesis</span>
                <p>{focusedRegion.thesis}</p>
              </div>
              <div className="detail-section quiet">
                <span>Map Note</span>
                <p>{focusedRegion.detail}</p>
              </div>
              <div className="chip-row">
                {focusedRegion.metrics.map((metricId) => {
                  const metric = metricOptions.find((item) => item.id === metricId);
                  if (!metric) return null;
                  return <span key={metricId} style={{ "--chip-color": metric.color } as CSSProperties}>{metric.label}</span>;
                })}
              </div>
            </>
          ) : (
            <div className="empty-detail">
              <h1>No regions lit</h1>
              <p>Turn on at least one metric filter to restore chart regions and detail readouts.</p>
            </div>
          )}
        </aside>

        <footer className="status-strip">
          <span>{activeRegions.length === 0 ? "No regions lit" : `${activeRegions.length} regions lit`}</span>
          <span>{candles.length} bars rendered</span>
          <span>Last close {formatPrice(candles[candles.length - 1].close)}</span>
        </footer>
      </main>

      <section className="insight-section" id="thesis">
        <span className="eyebrow">Thesis</span>
        <h2>Pressure is constructive until the late-session risk cone wins.</h2>
        <p>The map treats NVDA as a layered read: price structure and TAP keep the opening and gamma shelf constructive, while volume and risk decide whether that pressure converts into continuation or defensive review.</p>
      </section>

      <section className="voice-section" id="voice">
        <span className="eyebrow">Voice</span>
        <h2>Fast read, low ceremony.</h2>
        <p>Use the filter stack to ask one question at a time. Price shows structure, velocity shows participation, risk shows where the session stops being casual.</p>
      </section>
    </div>
  );
}
