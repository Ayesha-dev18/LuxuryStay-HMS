import { useEffect, useId, useMemo, useRef, useState } from "react";

import { compactNumber } from "../../lib/format";

const SERIES = [
  "var(--a-series-1)",
  "var(--a-series-2)",
  "var(--a-series-3)",
  "var(--a-series-4)",
  "var(--a-series-5)",
];

// A rounded axis maximum and four even steps.
const niceScale = (max) => {
  if (max <= 0) return { top: 4, ticks: [0, 1, 2, 3, 4] };
  const rough = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((unit) => unit * magnitude).find((value) => value >= rough);
  return { top: step * 4, ticks: [0, 1, 2, 3, 4].map((index) => index * step) };
};

/*
  Single-series trend chart: one y axis, a 2px line over a faint area, a
  crosshair and tooltip on hover, and a table for assistive technology.
*/
export function TrendChart({ data, format = (value) => value, label, height = 250 }) {
  const gradientId = useId();
  const wrapRef = useRef(null);
  const [active, setActive] = useState(null);
  const [width, setWidth] = useState(720);

  // The drawing is sized to its container, so text and line weights stay the
  // same size on a phone and on a wide desktop.
  useEffect(() => {
    const element = wrapRef.current;
    if (!element || typeof ResizeObserver === "undefined") return undefined;

    const observer = new ResizeObserver(([entry]) => {
      const next = Math.round(entry.contentRect.width);
      if (next > 0) setWidth(Math.max(next, 280));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const pad = { top: 14, right: 12, bottom: 28, left: 46 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const { points, ticks, top } = useMemo(() => {
    const scale = niceScale(Math.max(...data.map((item) => item.value), 0));
    const step = data.length > 1 ? innerW / (data.length - 1) : 0;

    return {
      ...scale,
      points: data.map((item, index) => ({
        ...item,
        x: pad.left + (data.length > 1 ? index * step : innerW / 2),
        y: pad.top + innerH - (item.value / scale.top) * innerH,
      })),
    };
  }, [data, innerW, innerH, pad.left, pad.top]);

  if (points.length === 0) return null;

  const line = points.map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" ");
  const base = pad.top + innerH;
  const area = `${line} L${points.at(-1).x},${base} L${points[0].x},${base} Z`;

  // At most seven x labels, always including the first and last.
  const every = Math.max(Math.ceil(points.length / 7), 1);
  const showLabel = (index) => index % every === 0 || index === points.length - 1;

  const onMove = (event) => {
    const box = wrapRef.current.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * width;
    let nearest = 0;
    for (let index = 1; index < points.length; index += 1) {
      if (Math.abs(points[index].x - x) < Math.abs(points[nearest].x - x)) nearest = index;
    }
    setActive(nearest);
  };

  const current = active === null ? null : points[active];

  return (
    <figure className="chart" ref={wrapRef} style={{ margin: 0 }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={label}
        onPointerMove={onMove}
        onPointerLeave={() => setActive(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--a-series-1)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--a-series-1)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {ticks.map((tick) => {
          const y = pad.top + innerH - (tick / top) * innerH;
          return (
            <g key={tick}>
              <line className="grid-line" x1={pad.left} x2={width - pad.right} y1={y} y2={y} />
              <text x={pad.left - 8} y={y + 4} textAnchor="end">
                {compactNumber(tick)}
              </text>
            </g>
          );
        })}

        {points.map(
          (point, index) =>
            showLabel(index) && (
              <text
                key={point.key}
                x={point.x}
                y={height - 8}
                textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}
              >
                {point.label}
              </text>
            )
        )}

        <path d={area} fill={`url(#${gradientId})`} />
        <path
          className="chart-line"
          pathLength={1}
          d={line}
          fill="none"
          stroke="var(--a-series-1)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {current && (
          <g>
            <line
              x1={current.x}
              x2={current.x}
              y1={pad.top}
              y2={base}
              stroke="var(--a-line-strong)"
              strokeWidth="1"
            />
            <circle
              cx={current.x}
              cy={current.y}
              r="5"
              fill="var(--a-series-1)"
              stroke="var(--a-surface)"
              strokeWidth="2"
            />
          </g>
        )}

        <rect x={pad.left} y={pad.top} width={innerW} height={innerH} fill="transparent" />
      </svg>

      {current && (
        <div
          className="chart-tip"
          style={{
            left: `${Math.min(Math.max((current.x / width) * 100, 12), 88)}%`,
            top: `${(current.y / height) * 100}%`,
          }}
        >
          <span className="muted">{current.title || current.label}</span>
          <strong>{format(current.value)}</strong>
          {current.note && <span className="muted">{current.note}</span>}
        </div>
      )}

      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {points.map((point) => (
            <tr key={point.key}>
              <th scope="row">{point.title || point.label}</th>
              <td>{format(point.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/*
  Part-to-whole donut. Segments are separated by a surface-coloured gap and
  every segment is named with its value in the legend beside it, so identity
  never depends on colour alone.
*/
export function Donut({ segments, centerValue, centerLabel, label }) {
  const [active, setActive] = useState(null);

  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const gap = total > 0 && segments.filter((segment) => segment.value > 0).length > 1 ? 3 : 0;

  const arcs = segments.map((segment, index) => {
    const length = total > 0 ? (segment.value / total) * circumference : 0;
    const before = segments
      .slice(0, index)
      .reduce((sum, item) => sum + (total > 0 ? (item.value / total) * circumference : 0), 0);

    return {
      ...segment,
      color: segment.color || SERIES[index % SERIES.length],
      dash: `${Math.max(length - gap, 0)} ${circumference}`,
      offset: -before,
      share: total > 0 ? Math.round((segment.value / total) * 100) : 0,
    };
  });

  return (
    <div className="donut-wrap">
      <div className="chart">
        <svg viewBox="0 0 140 140" role="img" aria-label={label}>
          <circle cx="70" cy="70" r={radius} fill="none" stroke="var(--a-surface-3)" strokeWidth="14" />
          <g transform="rotate(-90 70 70)">
            {arcs.map(
              (arc, index) =>
                arc.value > 0 && (
                  <circle
                    key={arc.label}
                    cx="70"
                    cy="70"
                    r={radius}
                    fill="none"
                    stroke={arc.color}
                    strokeWidth={active === index ? 17 : 14}
                    strokeDasharray={arc.dash}
                    strokeDashoffset={arc.offset}
                    style={{ transition: "stroke-width 0.2s ease" }}
                    onPointerEnter={() => setActive(index)}
                    onPointerLeave={() => setActive(null)}
                  />
                )
            )}
          </g>
          <text className="donut-center" x="70" y="70" textAnchor="middle">
            {active === null ? centerValue : `${arcs[active].share}%`}
          </text>
          <text x="70" y="88" textAnchor="middle">
            {active === null ? centerLabel : arcs[active].label}
          </text>
        </svg>
      </div>

      <div className="legend">
        {arcs.map((arc, index) => (
          <div
            className="legend-row"
            key={arc.label}
            onPointerEnter={() => setActive(index)}
            onPointerLeave={() => setActive(null)}
          >
            <i className="legend-swatch" style={{ background: arc.color }} aria-hidden="true" />
            <span>{arc.label}</span>
            <strong>{arc.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Horizontal bars for comparing a handful of named values. */
export function BarList({ items, format = (value) => value, color = "var(--a-series-1)" }) {
  const max = Math.max(...items.map((item) => item.value), 0);

  return (
    <div className="bars">
      {items.map((item) => (
        <div className="bar-row" key={item.label} title={`${item.label}: ${format(item.value)}`}>
          <span>{item.label}</span>
          <div className="meter">
            <i
              style={{
                width: `${max > 0 ? Math.max((item.value / max) * 100, item.value > 0 ? 2 : 0) : 0}%`,
                background: item.color || color,
              }}
            />
          </div>
          <strong>{format(item.value)}</strong>
        </div>
      ))}
    </div>
  );
}

// Parts of a whole on one line, with every value spelled out underneath so
// colour is never the only way to read it.
export function StatusBar({ segments, label }) {
  const visible = segments.filter((segment) => segment.value > 0);
  const total = visible.reduce((sum, segment) => sum + segment.value, 0);

  return (
    <div>
      <div className="status-bar" role="img" aria-label={label}>
        {visible.map((segment) => (
          <i
            key={segment.label}
            style={{ flexGrow: segment.value, background: segment.color }}
            title={`${segment.label}: ${segment.value}`}
          />
        ))}
      </div>
      <div className="legend" style={{ marginTop: 18 }}>
        {segments.map((segment) => (
          <div className="legend-row" key={segment.label}>
            <i className="legend-swatch" style={{ background: segment.color }} aria-hidden="true" />
            <span>{segment.label}</span>
            <strong>{segment.value}</strong>
            <span className="muted small" style={{ flex: "0 0 40px", textAlign: "right" }}>
              {total > 0 ? Math.round((segment.value / total) * 100) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export { SERIES };
