import type { CSSProperties } from "react";
import type { TimeframeSeries } from "../lib/marketData";
import { buildChartSurfaceModel } from "../lib/chartSurfaceModel";

interface MathVisualizationsProps {
  series: TimeframeSeries;
}

function finiteOr(value: number | null | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function buildCells(series: TimeframeSeries) {
  const model = buildChartSurfaceModel(series);
  const points = model.points.slice(-28);

  return points.map((point) => ({
    id: point.time,
    price: point.y * 100,
    volume: point.volumeIntensity * 100,
    rsi: finiteOr(point.rsi, 50),
    macd: finiteOr(point.macdHistogram, 0),
    pressure: point.indicatorPressure,
    sliceX: point.x * 100,
    sliceY: 100 - point.y * 100
  }));
}

export function MathVisualizations({ series }: MathVisualizationsProps) {
  const cells = buildCells(series);
  const latest = cells.at(-1);
  const averageRsi = cells.length === 0 ? 50 : cells.reduce((sum, cell) => sum + cell.rsi, 0) / cells.length;
  const averageVolume = cells.length === 0 ? 0 : cells.reduce((sum, cell) => sum + cell.volume, 0) / cells.length;

  return (
    <section className="scrolling-section math-visual-section" aria-label="4D mathematical visualizations">
      <header className="section-heading">
        <span className="eyebrow">Mathematical projection</span>
        <h2>4D Mathematical Views</h2>
        <p>Time, price, volume, and indicator intensity are projected as compact visual fields beside the bar charts.</p>
      </header>
      <div className="math-visual-grid">
        <article className="math-visual-card">
          <header>
            <strong>Heat Ribbon</strong>
            <span>price / rsi / volume</span>
          </header>
          <div className="heat-ribbon" aria-label="Heat ribbon encoding time price volume and indicator intensity">
            {cells.map((cell) => (
              <i
                key={cell.id}
                style={{
                  "--price": `${cell.price}%`,
                  "--volume": `${Math.max(cell.volume, 8)}%`,
                  "--rsi": cell.rsi
                } as CSSProperties}
              />
            ))}
          </div>
          <small>Latest price percentile {Math.round(latest?.price ?? 0)}%</small>
        </article>

        <article className="math-visual-card">
          <header>
            <strong>Volatility Surface</strong>
            <span>range curvature</span>
          </header>
          <div className="volatility-surface" aria-label="Volatility signal surface encoding time price volume and indicator intensity">
            {cells.map((cell) => (
              <i
                key={cell.id}
                style={{
                  "--height": `${Math.max(12, cell.volume)}%`,
                  "--lift": `${cell.price}%`,
                  "--shade": cell.macd >= 0 ? 1 : 0
                } as CSSProperties}
              />
            ))}
          </div>
          <small>Average relative volume {Math.round(averageVolume)}%</small>
        </article>

        <article className="math-visual-card">
          <header>
            <strong>Signal Manifold</strong>
            <span>rsi / macd state</span>
          </header>
          <div className="signal-manifold" aria-label="Signal manifold encoding time price volume and indicator intensity">
            {cells.map((cell) => (
              <i
                key={cell.id}
                style={{
                  "--x": `${cell.price}%`,
                  "--y": `${100 - cell.rsi}%`,
                  "--size": `${Math.max(6, Math.min(18, cell.volume / 5))}px`,
                  "--macd": cell.macd >= 0 ? 1 : 0
                } as CSSProperties}
              />
            ))}
          </div>
          <small>Average RSI {averageRsi.toFixed(1)}</small>
        </article>

        <article className="math-visual-card">
          <header>
            <strong>2D Slice</strong>
            <span>time / price</span>
          </header>
          <div className="signal-slice" aria-label="2D slice of the shared 4D signal surface">
            {cells.map((cell) => (
              <i
                key={cell.id}
                style={{
                  "--x": `${cell.sliceX}%`,
                  "--y": `${cell.sliceY}%`,
                  "--pressure": cell.pressure
                } as CSSProperties}
              />
            ))}
          </div>
          <small>Shared model projection</small>
        </article>
      </div>
    </section>
  );
}
