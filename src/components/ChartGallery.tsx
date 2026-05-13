import type { TimeframeSeries } from "../lib/marketData";

interface ChartGalleryProps {
  series: TimeframeSeries;
  pylabImage: {
    src: string;
    alt: string;
  };
}

function numericPath(values: number[], width = 220, height = 76): string {
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  return values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ");
}

export function ChartGallery({ series, pylabImage }: ChartGalleryProps) {
  const bars = series.bars.slice(-34);
  const closes = bars.map((bar) => bar.close);
  const rsi = series.rsi.slice(-34).map((value) => value ?? 50);
  const macd = series.macd.hist.slice(-34).map((value) => value ?? 0);
  const volumeMax = Math.max(...bars.map((bar) => bar.volume), 1);
  const low = Math.min(...bars.map((bar) => bar.low), 0);
  const high = Math.max(...bars.map((bar) => bar.high), 1);
  const priceRange = high - low || 1;
  const scaleY = (value: number) => 86 - ((value - low) / priceRange) * 70;
  const formats = [
    {
      id: "line",
      label: "Line",
      body: <path className="gallery-line" d={numericPath(closes)} />
    },
    {
      id: "candles",
      label: "Candles",
      body: bars.map((bar, index) => {
        const x = 6 + index * (208 / Math.max(bars.length - 1, 1));
        const up = bar.close >= bar.open;
        const yOpen = scaleY(bar.open);
        const yClose = scaleY(bar.close);

        return (
          <g className={up ? "gallery-candle up" : "gallery-candle down"} key={bar.time}>
            <line x1={x} x2={x} y1={scaleY(bar.high)} y2={scaleY(bar.low)} />
            <rect x={x - 2.4} y={Math.min(yOpen, yClose)} width="4.8" height={Math.max(Math.abs(yClose - yOpen), 2)} rx="1" />
          </g>
        );
      })
    },
    {
      id: "area",
      label: "Area",
      body: <path className="gallery-area" d={`${numericPath(closes)} L 220 92 L 0 92 Z`} />
    },
    {
      id: "volume",
      label: "Volume",
      body: bars.map((bar, index) => {
        const height = (bar.volume / volumeMax) * 74;
        const x = 4 + index * (212 / Math.max(bars.length - 1, 1));
        return <rect className="gallery-volume" key={bar.time} x={x} y={92 - height} width="4.8" height={height} rx="1" />;
      })
    },
    {
      id: "rsi",
      label: "RSI",
      body: (
        <>
          <line className="gallery-guide" x1="0" x2="220" y1="28" y2="28" />
          <line className="gallery-guide" x1="0" x2="220" y1="68" y2="68" />
          <path className="gallery-rsi" d={numericPath(rsi)} />
        </>
      )
    },
    {
      id: "macd",
      label: "MACD",
      body: (
        <>
          <line className="gallery-guide" x1="0" x2="220" y1="46" y2="46" />
          <path className="gallery-macd" d={numericPath(macd)} />
        </>
      )
    }
  ];

  return (
    <section className="scrolling-section chart-gallery-section" aria-label="All chart formats">
      <header className="section-heading">
        <span className="eyebrow">Format stack</span>
        <h2>All Chart Formats</h2>
        <p>Every supporting view is loaded in the same scroll, while the 3D field remains the interactive control surface.</p>
      </header>
      <div className="chart-gallery-grid">
        {formats.map((format) => (
          <article className="chart-gallery-card" key={format.id}>
            <header>
              <strong>{format.label}</strong>
              <span>{series.timeframe}</span>
            </header>
            <svg viewBox="0 0 220 96" role="img" aria-label={`${format.label} chart format`}>
              <rect width="220" height="96" rx="7" />
              {format.body}
            </svg>
          </article>
        ))}
        <article className="chart-gallery-card pylab-gallery-card">
          <header>
            <strong>Pylab</strong>
            <span>export</span>
          </header>
          <img src={pylabImage.src} alt={pylabImage.alt} />
        </article>
      </div>
    </section>
  );
}
