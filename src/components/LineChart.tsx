import React, { useMemo } from "react";

interface Props {
  history: number[];
  forecast?: number[];
  upper?: number[];
  lower?: number[];
  height?: number;
  startMs?: number;
  intervalMs?: number;
  yLabel?: string;
  historyPortion?: number;
}

/** Lightweight inline SVG line chart with optional forecast & confidence band. */
export const LineChart: React.FC<Props> = ({
  history,
  forecast = [],
  upper = [],
  lower = [],
  height = 220,
  startMs,
  intervalMs,
  yLabel,
  historyPortion,
}) => {
  const all = [...history, ...forecast, ...upper, ...lower];
  const max = Math.max(1, ...all);
  const min = Math.min(0, ...all);
  const total = history.length + forecast.length;
  const W = 1200;
  const H = height;
  const padL = 44, padR = 8, padT = 12, padB = 34;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const hasForecast = forecast.length > 0;
  const useWeightedLayout = hasForecast && history.length > 1 && !!historyPortion;
  const histPortion = Math.max(0.5, Math.min(0.9, historyPortion ?? 0.7));
  const histW = useWeightedLayout ? innerW * histPortion : innerW;
  const fcW = useWeightedLayout ? innerW - histW : innerW;

  const x = (i: number) => {
    if (!useWeightedLayout) return padL + (total <= 1 ? 0 : (i / (total - 1)) * innerW);
    if (i <= history.length - 1) {
      return padL + (history.length <= 1 ? 0 : (i / (history.length - 1)) * histW);
    }
    const j = i - history.length;
    return padL + histW + ((j + 1) / forecast.length) * fcW;
  };
  const y = (v: number) => padT + innerH - ((v - min) / (max - min || 1)) * innerH;
  const baselineValue = min <= 0 && max >= 0 ? 0 : min;
  const baselineY = y(baselineValue);

  const histPath = useMemo(() => {
    if (!history.length) return "";
    return history.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(v)}`).join(" ");
  }, [history, max, min, total]);

  const fcPath = useMemo(() => {
    if (!forecast.length) return "";
    const start = history.length - 1;
    const segs: string[] = [];
    if (history.length) segs.push(`M ${x(start)} ${y(history[history.length - 1])}`);
    forecast.forEach((v, i) => segs.push(`L ${x(start + 1 + i)} ${y(v)}`));
    return segs.join(" ");
  }, [forecast, history, max, min, total]);

  const histAreaPath = useMemo(() => {
    if (!history.length) return "";
    const top = history.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(v)}`).join(" ");
    const endX = x(history.length - 1);
    const startX = x(0);
    return `${top} L ${endX} ${baselineY} L ${startX} ${baselineY} Z`;
  }, [history, baselineY, max, min, total]);

  const fcAreaPath = useMemo(() => {
    if (!forecast.length) return "";
    const start = Math.max(0, history.length - 1);
    const points = [history[history.length - 1], ...forecast];
    const top = points.map((v, i) => `${i === 0 ? "M" : "L"} ${x(start + i)} ${y(v)}`).join(" ");
    const endX = x(start + points.length - 1);
    const startX = x(start);
    return `${top} L ${endX} ${baselineY} L ${startX} ${baselineY} Z`;
  }, [forecast, history, baselineY, max, min, total]);

  const bandPath = useMemo(() => {
    if (!upper.length || !lower.length) return "";
    const start = history.length;
    const top = upper.map((v, i) => `${i === 0 ? "M" : "L"} ${x(start + i)} ${y(v)}`).join(" ");
    const bot = lower
      .slice()
      .reverse()
      .map((v, i) => `L ${x(start + (lower.length - 1 - i))} ${y(v)}`)
      .join(" ");
    return `${top} ${bot} Z`;
  }, [upper, lower, history, max, min, total]);

  // Y ticks
  const ticks = 4;
  const tickVals = Array.from({ length: ticks + 1 }, (_, i) => min + ((max - min) * i) / ticks);

  const fmt = (v: number) => {
    if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(1) + "B";
    if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + "M";
    if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + "K";
    return v.toFixed(0);
  };

  const tsLabel = (i: number) => {
    if (!startMs || !intervalMs) return "";
    const ms = startMs + i * intervalMs;
    const d = new Date(ms);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H }}>
      <defs>
        <linearGradient id="lineHistArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(20,150,255,0.26)" />
          <stop offset="100%" stopColor="rgba(20,150,255,0.02)" />
        </linearGradient>
        <linearGradient id="lineFcArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(20,150,255,0.18)" />
          <stop offset="100%" stopColor="rgba(20,150,255,0.01)" />
        </linearGradient>
      </defs>

      <rect x={padL} y={padT} width={innerW} height={innerH} fill="rgba(20,150,255,0.03)" rx={4} />

      {tickVals.map((v, i) => (
        <g key={i}>
          <line
            x1={padL}
            x2={W - padR}
            y1={y(v)}
            y2={y(v)}
            stroke="rgba(128,128,128,0.2)"
            strokeDasharray={i === 0 ? "" : "2 3"}
          />
          <text x={padL - 6} y={y(v) + 4} fontSize="10" textAnchor="end" fill="currentColor" opacity={0.7}>
            {fmt(v)}
          </text>
        </g>
      ))}
      {/* x ticks: 5 evenly-spaced labels */}
      {startMs && intervalMs && total > 1 && Array.from({ length: 5 }, (_, i) => {
        const idx = Math.round((i / 4) * (total - 1));
        return (
          <text key={i} x={x(idx)} y={H - 10} fontSize="10" textAnchor="middle" fill="currentColor" opacity={0.7}>
            {tsLabel(idx)}
          </text>
        );
      })}
      {histAreaPath && <path d={histAreaPath} fill="url(#lineHistArea)" />}
      {fcAreaPath && forecast.length > 0 && <path d={fcAreaPath} fill="url(#lineFcArea)" />}
      {bandPath && <path d={bandPath} fill="rgba(20,150,255,0.15)" />}
      {histPath && <path d={histPath} fill="none" stroke="#1496ff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />}
      {fcPath && <path d={fcPath} fill="none" stroke="#1496ff" strokeWidth="2.2" strokeDasharray="4 3" strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />}

      {history.length > 0 && (
        <circle cx={x(history.length - 1)} cy={y(history[history.length - 1])} r={2.5} fill="#1496ff" />
      )}
      {forecast.length > 0 && (
        <circle cx={x(total - 1)} cy={y(forecast[forecast.length - 1])} r={2.5} fill="#1496ff" />
      )}

      {/* divider between history & forecast */}
      {forecast.length > 0 && (
        <line
          x1={x(history.length - 1)}
          x2={x(history.length - 1)}
          y1={padT}
          y2={padT + innerH}
          stroke="rgba(128,128,128,0.5)"
          strokeDasharray="3 3"
        />
      )}
      {yLabel && (
        <text x={8} y={padT + innerH / 2} fontSize="10" fill="currentColor" opacity={0.6}
              transform={`rotate(-90 8 ${padT + innerH / 2})`} textAnchor="middle">
          {yLabel}
        </text>
      )}
    </svg>
  );
};
