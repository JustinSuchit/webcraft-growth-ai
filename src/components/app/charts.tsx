"use client";
import { useState } from "react";

/**
 * Small, dependency-free SVG charts. One series per chart (title names it, so no legend),
 * one y-axis, recessive grid, 2px lines, rounded bar ends, hover tooltip on every chart.
 */
interface Point { label: string; value: number }

const W = 640;
const PAD = { l: 40, r: 12, t: 12, b: 24 };

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / p) * p;
}

export function LineChart({ data, height = 180, color = "var(--chart-1)", format = (n: number) => n.toLocaleString(), zeroBaseline = true }: { data: Point[]; height?: number; color?: string; format?: (n: number) => string; zeroBaseline?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const min = Math.min(...data.map((d) => d.value));
  const maxRaw = Math.max(...data.map((d) => d.value));
  // Flows (reach, views) start at zero; slow-moving levels (followers) may opt out to show change.
  const lo = !zeroBaseline && min > 0 ? Math.floor(min * 0.98) : 0;
  const hi = niceMax(maxRaw);
  const ih = height - PAD.t - PAD.b;
  const iw = W - PAD.l - PAD.r;
  const x = (i: number) => PAD.l + (data.length <= 1 ? 0 : (i / (data.length - 1)) * iw);
  const y = (v: number) => PAD.t + ih - ((v - lo) / (hi - lo || 1)) * ih;
  const path = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join("");
  const ticks = [lo, lo + (hi - lo) / 2, hi];
  const h = hover !== null ? data[hover] : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full" role="img" aria-label="Line chart" onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          setHover(Math.max(0, Math.min(data.length - 1, Math.round(((px - PAD.l) / iw) * (data.length - 1)))));
        }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeDasharray={t === lo ? undefined : "3 4"} />
            <text x={PAD.l - 8} y={y(t) + 3} textAnchor="end" fontSize="10" fill="var(--muted)" className="tabular">{format(Math.round(t))}</text>
          </g>
        ))}
        {[0, Math.floor((data.length - 1) / 2), data.length - 1].map((i) => data[i] ? (
          <text key={i} x={x(i)} y={height - 6} textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"} fontSize="10" fill="var(--muted)">{data[i].label}</text>
        ) : null)}
        <path d={`${path}L${x(data.length - 1)},${y(lo)}L${x(0)},${y(lo)}Z`} fill={color} opacity="0.08" />
        <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {h ? (
          <g>
            <line x1={x(hover!)} x2={x(hover!)} y1={PAD.t} y2={PAD.t + ih} stroke="var(--muted)" strokeOpacity="0.4" />
            <circle cx={x(hover!)} cy={y(h.value)} r="4.5" fill={color} stroke="var(--surface)" strokeWidth="2" />
          </g>
        ) : null}
      </svg>
      {h ? (
        <div className="pointer-events-none absolute top-0 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs shadow-lg"
          style={{ left: `clamp(0px, calc(${(x(hover!) / W) * 100}% - 50px), calc(100% - 110px))` }}>
          <div className="text-muted">{h.label}</div>
          <div className="tabular font-semibold">{format(h.value)}</div>
        </div>
      ) : null}
    </div>
  );
}

export function BarChart({ data, height = 180, color = "var(--chart-2)", format = (n: number) => n.toLocaleString() }: { data: Point[]; height?: number; color?: string; format?: (n: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const hi = niceMax(Math.max(...data.map((d) => d.value), 1));
  const ih = height - PAD.t - PAD.b;
  const iw = W - PAD.l - PAD.r;
  const slot = iw / data.length;
  const bw = Math.max(2, slot - 2); // 2px surface gap between bars
  const y = (v: number) => PAD.t + ih - (v / hi) * ih;
  const h = hover !== null ? data[hover] : null;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full" role="img" aria-label="Bar chart" onMouseLeave={() => setHover(null)}>
        {[0, hi / 2, hi].map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeDasharray={t ? "3 4" : undefined} />
            <text x={PAD.l - 8} y={y(t) + 3} textAnchor="end" fontSize="10" fill="var(--muted)">{format(t)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const bx = PAD.l + i * slot + 1;
          const top = y(d.value);
          const bh = PAD.t + ih - top;
          const r = Math.min(4, bw / 2, bh);
          return (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <rect x={PAD.l + i * slot} y={PAD.t} width={slot} height={ih} fill="transparent" />
              {d.value > 0 ? (
                <path d={`M${bx},${PAD.t + ih}V${top + r}Q${bx},${top} ${bx + r},${top}H${bx + bw - r}Q${bx + bw},${top} ${bx + bw},${top + r}V${PAD.t + ih}Z`}
                  fill={color} opacity={hover === null || hover === i ? 1 : 0.45} />
              ) : null}
            </g>
          );
        })}
        {[0, data.length - 1].map((i) => data[i] ? (
          <text key={i} x={PAD.l + i * slot + slot / 2} y={height - 6} textAnchor={i ? "end" : "start"} fontSize="10" fill="var(--muted)">{data[i].label}</text>
        ) : null)}
      </svg>
      {h ? (
        <div className="pointer-events-none absolute top-0 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs shadow-lg"
          style={{ left: `clamp(0px, calc(${((PAD.l + hover! * slot) / W) * 100}% - 40px), calc(100% - 100px))` }}>
          <div className="text-muted">{h.label}</div>
          <div className="tabular font-semibold">{format(h.value)}</div>
        </div>
      ) : null}
    </div>
  );
}
