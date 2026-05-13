from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from pylab import arange, array, axhline, bar, close, figure, fill_between, grid, legend, plot, savefig, subplot, tight_layout, title, xticks, ylabel

ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / "src" / "data" / "nvdaSession.json"
OUTPUT = ROOT / "public" / "pylab" / "nvda-pylab-overview.png"


def ema(values: list[float], period: int) -> list[float | None]:
    if not values:
        return []
    multiplier = 2 / (period + 1)
    result: list[float | None] = [None] * len(values)
    current = values[0]
    for index, value in enumerate(values):
        current = (value - current) * multiplier + current
        result[index] = current if index >= period - 1 else None
    return result


def rsi(values: list[float], period: int = 14) -> list[float | None]:
    result: list[float | None] = [None] * len(values)
    if len(values) <= period:
        return result
    gains: list[float] = []
    losses: list[float] = []
    average_gain = 0.0
    average_loss = 0.0
    for index in range(1, len(values)):
        delta = values[index] - values[index - 1]
        gains.append(max(delta, 0))
        losses.append(max(-delta, 0))
        if index < period:
            continue
        if index == period:
            average_gain = sum(gains[:period]) / period
            average_loss = sum(losses[:period]) / period
        else:
            average_gain = ((average_gain * (period - 1)) + gains[-1]) / period
            average_loss = ((average_loss * (period - 1)) + losses[-1]) / period
        result[index] = 100 if average_loss == 0 else 100 - (100 / (1 + (average_gain / average_loss)))
    return result


def macd(values: list[float]) -> tuple[list[float | None], list[float | None], list[float | None]]:
    fast = ema(values, 12)
    slow = ema(values, 26)
    line = [(fast_value - slow_value) if fast_value is not None and slow_value is not None else None for fast_value, slow_value in zip(fast, slow)]
    signal_source = [value if value is not None else 0 for value in line]
    signal = ema(signal_source, 9)
    hist = [(line_value - signal_value) if line_value is not None and signal_value is not None else None for line_value, signal_value in zip(line, signal)]
    return line, signal, hist


def main() -> None:
    session = json.loads(INPUT.read_text(encoding="utf-8"))
    candles = session["candles"]
    closes = [float(candle["close"]) for candle in candles]
    opens = [float(candle["open"]) for candle in candles]
    labels = [datetime.fromisoformat(candle["timestamp"].replace("Z", "+00:00")).strftime("%H:%M") for candle in candles]
    rsi_values = rsi(closes)
    macd_line, signal_line, hist = macd(closes)
    x = arange(len(closes))
    colors = ["#6fd3a1" if close_value >= open_value else "#ef4e5f" for close_value, open_value in zip(closes, opens)]

    close("all")
    fig = figure(figsize=(14, 8), facecolor="#07110d")
    fig.suptitle(f"{session['symbol']} measured session / pylab technical overview", color="#dce8dc", fontsize=17, fontweight="bold")

    price_axis = subplot(3, 1, 1)
    price_axis.set_facecolor("#0b1611")
    bar(x, array(closes) - min(closes), bottom=min(closes), color=colors, width=0.72, alpha=0.86)
    plot(x, closes, color="#f0c85a", linewidth=1.8, label="Close")
    fill_between(x, closes, min(closes), color="#d9b64f", alpha=0.1)
    title("Price bars", color="#9fb39f", loc="left", fontsize=11, fontweight="bold")
    ylabel("USD", color="#9fb39f")
    grid(color="#22342b", alpha=0.45)
    legend(facecolor="#101b15", edgecolor="#24362c", labelcolor="#dce8dc")

    rsi_axis = subplot(3, 1, 2, sharex=price_axis)
    rsi_axis.set_facecolor("#0b1611")
    plot(x, [value if value is not None else 50 for value in rsi_values], color="#9bdc4a", linewidth=1.8, label="RSI 14")
    axhline(70, color="#ef4e5f", linewidth=1, alpha=0.7)
    axhline(30, color="#6fd3a1", linewidth=1, alpha=0.7)
    title("RSI evaluation", color="#9fb39f", loc="left", fontsize=11, fontweight="bold")
    ylabel("RSI", color="#9fb39f")
    grid(color="#22342b", alpha=0.45)
    legend(facecolor="#101b15", edgecolor="#24362c", labelcolor="#dce8dc")

    macd_axis = subplot(3, 1, 3, sharex=price_axis)
    macd_axis.set_facecolor("#0b1611")
    hist_values = [value if value is not None else 0 for value in hist]
    hist_colors = ["#6fd3a1" if value >= 0 else "#ef4e5f" for value in hist_values]
    bar(x, hist_values, color=hist_colors, width=0.7, alpha=0.75, label="Histogram")
    plot(x, [value if value is not None else 0 for value in macd_line], color="#b38cff", linewidth=1.5, label="MACD")
    plot(x, [value if value is not None else 0 for value in signal_line], color="#f0c85a", linewidth=1.3, label="Signal")
    axhline(0, color="#9fb39f", linewidth=1, alpha=0.5)
    title("MACD evaluation", color="#9fb39f", loc="left", fontsize=11, fontweight="bold")
    ylabel("MACD", color="#9fb39f")
    grid(color="#22342b", alpha=0.45)
    legend(facecolor="#101b15", edgecolor="#24362c", labelcolor="#dce8dc", ncol=3)

    tick_step = max(1, len(labels) // 10)
    xticks(x[::tick_step], labels[::tick_step], rotation=0, color="#9fb39f")
    for axis in (price_axis, rsi_axis, macd_axis):
        axis.tick_params(colors="#9fb39f")
        for spine in axis.spines.values():
            spine.set_color("#24362c")

    tight_layout(rect=(0, 0, 1, 0.95))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    savefig(OUTPUT, dpi=160, facecolor=fig.get_facecolor())
    print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    main()
