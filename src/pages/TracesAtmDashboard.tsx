import React, { useEffect, useMemo, useState } from "react";
import atmDashboardJson from "../../ATM.json";
import { Card, Loader } from "../components/Common";
import { runDql, N } from "../lib/dql";

interface Props {
  timeframe: string;
}

type AnyRec = Record<string, any>;

type TileConfig = {
  title?: string;
  description?: string;
  type: "data" | "markdown";
  query?: string;
  visualization?: "singleValue" | "lineChart" | "barChart";
  visualizationSettings?: any;
  content?: string;
};

type LayoutConfig = { x: number; y: number; w: number; h: number };

type DashboardConfig = {
  variables?: Array<{ key: string; defaultValue?: string }>;
  tiles: Record<string, TileConfig>;
  layouts: Record<string, LayoutConfig>;
};

type Series = {
  label: string;
  values: number[];
  geometry: "line" | "bar";
  color: string;
  unit?: UnitInfo;
  startMs?: number;
  intervalMs?: number;
};

type UnitInfo = { category?: string; unit?: string; decimals?: number };

const ATM_DASHBOARD = atmDashboardJson as DashboardConfig;
const ROW_HEIGHT = 58;
const DEFAULT_PALETTE = ["#134fc9", "#649438", "#ae132d", "#d56b1a", "#627cfe", "#438fb1", "#84859a"];

export const TracesAtmDashboard: React.FC<Props> = ({ timeframe }) => {
  const defaultFactor = Number(ATM_DASHBOARD.variables?.find((v) => v.key === "CalculatorExtraIngestFactor")?.defaultValue ?? "1.0");
  const [calculatorFactor, setCalculatorFactor] = useState(Number.isFinite(defaultFactor) ? defaultFactor : 1);
  const [recordsByTile, setRecordsByTile] = useState<Record<string, AnyRec[]>>({});
  const [loading, setLoading] = useState(false);
  const [errorsByTile, setErrorsByTile] = useState<Record<string, string>>({});
  const [refreshTick, setRefreshTick] = useState(0);

  const tileIds = useMemo(() => {
    return Object.keys(ATM_DASHBOARD.layouts).sort((a, b) => {
      const la = ATM_DASHBOARD.layouts[a];
      const lb = ATM_DASHBOARD.layouts[b];
      if (la.y !== lb.y) return la.y - lb.y;
      return la.x - lb.x;
    });
  }, []);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      const out: Record<string, AnyRec[]> = {};
      const errs: Record<string, string> = {};

      await Promise.all(
        tileIds.map(async (id) => {
          const tile = ATM_DASHBOARD.tiles[id];
          if (!tile || tile.type !== "data" || !tile.query) return;
          try {
            const query = applyVariables(tile.query, { CalculatorExtraIngestFactor: String(calculatorFactor) });
            out[id] = await runDql(query);
          } catch (e) {
            errs[id] = e instanceof Error ? e.message : "Query failed";
            out[id] = [];
          }
        })
      );

      setRecordsByTile(out);
      setErrorsByTile(errs);
      setLoading(false);
    };

    fetchAll();
  }, [calculatorFactor, refreshTick, tileIds]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Card title="ATM Dashboard">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          <label style={labelStyle}>
            Calculator extra ingest factor
            <input
              type="number"
              min={0.1}
              max={10}
              step={0.1}
              value={calculatorFactor}
              onChange={(e) => setCalculatorFactor(clampFloat(Number(e.target.value), 0.1, 10, 1))}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Timeframe context
            <input type="text" readOnly value={timeframe} style={{ ...inputStyle, opacity: 0.75 }} />
          </label>
          <div style={{ display: "flex", alignItems: "end" }}>
            <button onClick={() => setRefreshTick((x) => x + 1)} style={btnStyle}>Refresh ATM Tiles</button>
          </div>
        </div>
      </Card>

      {loading && <Loader msg="Loading ATM tiles..." />}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(24, minmax(0, 1fr))",
          gridAutoRows: `${ROW_HEIGHT}px`,
          gap: 12,
        }}
      >
        {tileIds.map((id) => {
          const tile = ATM_DASHBOARD.tiles[id];
          const layout = ATM_DASHBOARD.layouts[id];
          if (!tile || !layout) return null;

          return (
            <div
              key={id}
              style={{
                gridColumn: `${layout.x + 1} / span ${layout.w}`,
                gridRow: `${layout.y + 1} / span ${layout.h}`,
                minHeight: 0,
                height: "100%",
                overflow: "hidden",
              }}
            >
              <AtmTile
                tile={tile}
                layout={layout}
                records={recordsByTile[id] ?? []}
                error={errorsByTile[id]}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

const AtmTile: React.FC<{ tile: TileConfig; layout: LayoutConfig; records: AnyRec[]; error?: string }> = ({ tile, layout, records, error }) => {
  if (tile.type === "markdown") {
    return (
      <Card style={{ height: "100%", overflow: "hidden" }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>{stripMarkdownHeader(tile.content ?? "")}</div>
      </Card>
    );
  }

  const visualization = tile.visualization ?? "lineChart";
  const description = tile.description ?? "";
  const isCompactTile = layout.h <= 3;
  const isMediumTile = layout.h <= 4;
  const showDescription = !!description && !isCompactTile;
  const chartHeight = isCompactTile ? 105 : (isMediumTile ? 120 : 150);
  const showLegend = !isCompactTile;
  const descMaxHeight = isMediumTile ? 46 : 74;
  const cardPadding = isCompactTile ? 12 : 16;

  return (
    <Card title={tile.title} style={{ height: "100%", overflow: "hidden", padding: cardPadding }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, height: "100%", minHeight: 0, overflow: "hidden" }}>
        {showDescription && (
          <div style={{ maxHeight: descMaxHeight, overflow: "hidden" }}>
            <RichText text={description} compact={isMediumTile} />
          </div>
        )}
        {error && <div style={{ fontSize: 12, color: "#ae132d" }}>{error}</div>}
        {!error && visualization === "singleValue" && <SingleValueTile tile={tile} records={records} compact={isCompactTile} />}
        {!error && visualization !== "singleValue" && <SeriesChartTile tile={tile} records={records} height={chartHeight} showLegend={showLegend} />}
      </div>
    </Card>
  );
};

const SingleValueTile: React.FC<{ tile: TileConfig; records: AnyRec[]; compact?: boolean }> = ({ tile, records, compact = false }) => {
  const settings = tile.visualizationSettings?.singleValue;
  const field = settings?.recordField as string | undefined;
  const row = records[0] ?? {};
  const raw = field ? row[field] : firstNumber(row);
  const value = N(raw);
  const unit = resolveUnit(tile, field);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, minHeight: compact ? 72 : 120, overflow: "hidden" }}>
      <div style={{ fontSize: compact ? 28 : 36, fontWeight: 700, lineHeight: 1, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>{formatValue(value, unit)}</div>
    </div>
  );
};

const SeriesChartTile: React.FC<{ tile: TileConfig; records: AnyRec[]; height: number; showLegend: boolean }> = ({ tile, records, height, showLegend }) => {
  const series = buildSeries(tile, records);
  if (!series.length) {
    return <div style={{ fontSize: 12, opacity: 0.7 }}>No data</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minHeight: 0, overflow: "hidden" }}>
      <MiniSeriesChart series={series} height={height} />
      {showLegend && <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 11, opacity: 0.82, maxHeight: 36, overflow: "hidden" }}>
        {series.slice(0, 8).map((s) => (
          <span key={s.label} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color, display: "inline-block" }} />
            {s.label}
          </span>
        ))}
      </div>}
    </div>
  );
};

const MiniSeriesChart: React.FC<{ series: Series[]; height: number }> = ({ series, height }) => {
  const W = 1200;
  const H = height;
  const padL = 42;
  const padR = 8;
  const padT = 8;
  const padB = 24;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const len = Math.max(2, ...series.map((s) => s.values.length));
  const all = series.flatMap((s) => s.values.map(N));
  const max = Math.max(1, ...all);
  const min = Math.min(0, ...all);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const x = (i: number) => padL + (i / (len - 1)) * innerW;
  const y = (v: number) => padT + innerH - ((N(v) - min) / (max - min || 1)) * innerH;
  const clampedHoverIdx = hoverIdx == null ? null : Math.max(0, Math.min(len - 1, hoverIdx));

  const onMouseMove: React.MouseEventHandler<SVGSVGElement> = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    const t = (svgX - padL) / innerW;
    const idx = Math.round(t * (len - 1));
    setHoverIdx(Math.max(0, Math.min(len - 1, idx)));
  };

  const tooltipRows = clampedHoverIdx == null
    ? []
    : series.map((s) => {
        const v = s.values[Math.min(clampedHoverIdx, s.values.length - 1)];
        return { label: s.label, color: s.color, value: Number.isFinite(v) ? v : 0, unit: s.unit };
      });

  const tooltipLeftPct = clampedHoverIdx == null ? 0 : (x(clampedHoverIdx) / W) * 100;
  const tooltipOnRight = tooltipLeftPct > 68;
  const tooltipTimestamp = clampedHoverIdx == null ? null : resolveTooltipTimestamp(series, clampedHoverIdx);

  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H }} onMouseMove={onMouseMove} onMouseLeave={() => setHoverIdx(null)}>
        <rect x={padL} y={padT} width={innerW} height={innerH} fill="rgba(20,150,255,0.03)" rx={4} />
        {[0, 1, 2, 3, 4].map((i) => {
          const v = min + ((max - min) * i) / 4;
          const yy = y(v);
          return (
            <g key={i}>
              <line x1={padL} x2={W - padR} y1={yy} y2={yy} stroke="rgba(128,128,128,0.2)" strokeDasharray={i === 0 ? "" : "2 3"} />
            </g>
          );
        })}

        {series.map((s, idx) => {
          if (!s.values.length) return null;
          if (s.geometry === "bar") {
            const barW = Math.max(2, (innerW / len) * 0.8 / Math.max(1, series.length));
            return s.values.map((v, i) => {
              const xx = x(i) - (Math.max(1, series.length) * barW) / 2 + idx * barW;
              const yy = y(v);
              const baseY = y(0);
              const isHovered = clampedHoverIdx === i;
              return (
                <rect
                  key={`${s.label}-${i}`}
                  x={xx}
                  y={Math.min(yy, baseY)}
                  width={barW - 0.5}
                  height={Math.max(1, Math.abs(baseY - yy))}
                  fill={s.color}
                  opacity={isHovered ? 0.95 : 0.7}
                />
              );
            });
          }

          const path = s.values
            .map((v, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(v)}`)
            .join(" ");
          return <path key={s.label} d={path} fill="none" stroke={s.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />;
        })}

        {clampedHoverIdx != null && (
          <line
            x1={x(clampedHoverIdx)}
            x2={x(clampedHoverIdx)}
            y1={padT}
            y2={padT + innerH}
            stroke="rgba(128,128,128,0.65)"
            strokeDasharray="3 3"
          />
        )}

        {clampedHoverIdx != null && series.filter((s) => s.geometry === "line").map((s) => {
          const v = s.values[Math.min(clampedHoverIdx, s.values.length - 1)];
          return (
            <circle
              key={`marker-${s.label}`}
              cx={x(clampedHoverIdx)}
              cy={y(v)}
              r={3}
              fill={s.color}
              stroke="white"
              strokeWidth={1}
            />
          );
        })}
      </svg>

      {clampedHoverIdx != null && (
        <div
          style={{
            position: "absolute",
            top: 8,
            left: `${tooltipLeftPct}%`,
            transform: tooltipOnRight ? "translateX(calc(-100% - 8px))" : "translateX(8px)",
            background: "rgba(32,32,32,0.92)",
            color: "#fff",
            borderRadius: 6,
            padding: "8px 10px",
            fontSize: 11,
            lineHeight: 1.35,
            pointerEvents: "none",
            minWidth: 180,
            maxWidth: 280,
            boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
          }}
        >
          <div style={{ opacity: 0.85, marginBottom: 4 }}>{tooltipTimestamp ?? `Point #${clampedHoverIdx + 1}`}</div>
          {tooltipRows.map((row) => (
            <div key={row.label} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: row.color, display: "inline-block", flexShrink: 0 }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.label}</span>
              </span>
              <span style={{ fontWeight: 600 }}>{formatForTooltip(row.value, row.unit)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const RichText: React.FC<{ text: string; compact?: boolean }> = ({ text, compact = false }) => {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const maxLines = compact ? 2 : 4;
  const shown = lines.slice(0, maxLines);
  return (
    <div style={{ fontSize: 12, opacity: 0.84, lineHeight: 1.35, overflow: "hidden" }}>
      {shown.map((line, idx) => {
        if (line.startsWith("* ")) {
          return <div key={idx} style={{ marginBottom: 2 }}>- {line.slice(2)}</div>;
        }
        return <div key={idx} style={{ marginBottom: 2 }}>{line.split("**").join("")}</div>;
      })}
      {lines.length > maxLines && <div style={{ opacity: 0.7 }}>...</div>}
    </div>
  );
};

function stripMarkdownHeader(v: string): string {
  return v.replace(/^#+\s*/, "").trim();
}

function applyVariables(query: string, vars: Record<string, string>): string {
  let out = query;
  Object.entries(vars).forEach(([k, v]) => {
    out = out.split(`$${k}`).join(v);
  });
  return out;
}

function buildSeries(tile: TileConfig, records: AnyRec[]): Series[] {
  const chartSettings = tile.visualizationSettings?.chartSettings ?? {};
  const mapping = chartSettings.fieldMapping?.leftAxisValues as string[] | undefined;
  const displayed = tile.visualizationSettings?.dataMapping?.displayedFields as string[] | undefined;
  const selectedFields = (mapping && mapping.length ? mapping : displayed) ?? [];
  const overrides = chartSettings.seriesOverrides ?? [];
  const colorRules = tile.visualizationSettings?.coloring?.colorRules as any[] | undefined;

  const out: Series[] = [];
  records.forEach((r, recIdx) => {
    const groupingLabel = pickGroupLabel(r);
    selectedFields.forEach((field, fieldIdx) => {
      const v = r[field];
      if (!Array.isArray(v)) return;
      const values = v.map(N);
      const geom = resolveGeometry(tile, field, overrides);
      const label = groupingLabel ? `${groupingLabel} - ${field}` : (records.length > 1 ? `${field} #${recIdx + 1}` : field);
      out.push({
        label,
        values,
        geometry: geom,
        color: resolveColor(colorRules, field, groupingLabel, fieldIdx + recIdx),
        unit: resolveUnit(tile, field),
        startMs: resolveSeriesStartMs(r),
        intervalMs: resolveSeriesIntervalMs(r),
      });
    });
  });
  return out;
}

function resolveGeometry(tile: TileConfig, field: string, overrides: any[]): "line" | "bar" {
  for (const ov of overrides) {
    const ids = ov?.seriesId as string[] | undefined;
    if (!ids?.includes(field)) continue;
    const g = ov?.override?.geometry;
    if (g === "bar") return "bar";
    if (g === "line") return "line";
  }
  return tile.visualization === "barChart" ? "bar" : "line";
}

function pickGroupLabel(r: AnyRec): string | null {
  const candidates = ["licensing_type", "DT.name", "entity.name"];
  for (const c of candidates) {
    const v = r[c];
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
}

function resolveColor(rules: any[] | undefined, field: string, groupLabel: string | null, index: number): string {
  const readColor = (c: any): string | null => {
    if (!c) return null;
    if (typeof c === "string") return c;
    if (typeof c.Default === "string") return c.Default;
    return null;
  };

  if (Array.isArray(rules)) {
    for (const r of rules) {
      if (r?.value === field) {
        const c = readColor(r.customColor);
        if (c) return c;
      }
    }
    if (groupLabel) {
      for (const r of rules) {
        if (r?.value === groupLabel) {
          const c = readColor(r.customColor);
          if (c) return c;
        }
      }
    }
  }
  return DEFAULT_PALETTE[index % DEFAULT_PALETTE.length];
}

function resolveSeriesStartMs(record: AnyRec): number | undefined {
  const tf = record?.timeframe;
  if (tf?.start) {
    const ms = new Date(tf.start).getTime();
    if (Number.isFinite(ms)) return ms;
  }
  return undefined;
}

function resolveSeriesIntervalMs(record: AnyRec): number | undefined {
  const iv = N(record?.interval);
  if (!Number.isFinite(iv) || iv <= 0) return undefined;
  // Dynatrace timeseries interval is typically in nanoseconds.
  if (iv > 1_000_000) return iv / 1_000_000;
  return iv;
}

function resolveUnit(tile: TileConfig, field?: string): UnitInfo | undefined {
  if (!field) return undefined;
  const overrides = tile.visualizationSettings?.unitsOverrides as any[] | undefined;
  const hit = overrides?.find((u) => u.identifier === field);
  if (!hit) return undefined;
  return { category: hit.unitCategory, unit: hit.displayUnit ?? hit.baseUnit, decimals: hit.decimals };
}

function formatValue(value: number, unit?: UnitInfo): string {
  const decimals = Number.isFinite(unit?.decimals) ? Number(unit?.decimals) : 2;
  if (unit?.category === "percentage") return `${value.toFixed(decimals)}%`;
  if (unit?.category === "data") {
    const u = unit.unit;
    if (u === "gibibyte") return `${(value / (1024 ** 3)).toFixed(decimals)} GiB`;
    if (u === "kibibyte") return `${(value / 1024).toFixed(decimals)} KiB`;
    if (u === "byte") return `${value.toFixed(decimals)} B`;
  }
  return value.toFixed(decimals);
}

function formatForTooltip(value: number, unit?: UnitInfo): string {
  if (unit) return formatValue(value, unit);
  return formatCompact(value);
}

function formatCompact(v: number): string {
  const av = Math.abs(v);
  if (av >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)}B`;
  if (av >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (av >= 1_000) return `${(v / 1_000).toFixed(2)}K`;
  return v.toFixed(2);
}

function resolveTooltipTimestamp(series: Series[], idx: number): string | null {
  for (const s of series) {
    if (!s.startMs || !s.intervalMs) continue;
    const ms = s.startMs + idx * s.intervalMs;
    const d = new Date(ms);
    if (!Number.isFinite(d.getTime())) continue;
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return null;
}

function firstNumber(obj: AnyRec): number {
  const vals = Object.values(obj);
  for (const v of vals) {
    if (typeof v === "number") return v;
    if (typeof v === "string" && Number.isFinite(Number(v))) return Number(v);
  }
  return 0;
}

function clampFloat(v: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, v));
}

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 12,
};

const inputStyle: React.CSSProperties = {
  padding: "6px 10px",
  background: "rgba(128,128,128,0.1)",
  border: "1px solid rgba(128,128,128,0.3)",
  borderRadius: 4,
  color: "inherit",
  fontSize: 12,
};

const btnStyle: React.CSSProperties = {
  padding: "6px 12px",
  background: "transparent",
  border: "1px solid rgba(128,128,128,0.4)",
  borderRadius: 4,
  color: "inherit",
  cursor: "pointer",
  fontSize: 12,
};
