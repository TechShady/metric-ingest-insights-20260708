import React, { useEffect, useMemo, useState } from "react";
import { Card, Loader, Stat } from "../components/Common";
import { SortableTable } from "../components/SortableTable";
import { runDql } from "../lib/dql";
import { fetchAllMetricCardinality } from "../lib/queries";
import { fmtNum } from "../lib/forecast";
import { useSettings } from "../state/SettingsContext";

interface Props {
  timeframe: string;
}

interface BucketWindow {
  index: number;
  fromExpr: string;
  toExpr: string;
  startMs: number;
  endMs: number;
  label: string;
}

interface MetricTrend {
  metricKey: string;
  values: number[];
  total: number;
}

interface AppliedFilters {
  serviceFilter: string;
  attrKey: string;
  attrValue: string;
}

const MAX_CARDINALITY_MINUTES = 7 * 24 * 60;
const QUERY_MAX_RECORDS = 100000;
const MAX_TOP_N = 50;
const MIN_BUCKETS = 2;
const MAX_BUCKETS = 24;
const BUCKET_CONCURRENCY = 4;
const CACHE_TTL_MS = 5 * 60 * 1000;

const trendsCache = new Map<string, { expires: number; data: CachedResult }>();

interface CachedResult {
  windows: BucketWindow[];
  series: MetricTrend[];
  truncatedBuckets: number;
  timeframeUsed: string;
  wasTimeframeCapped: boolean;
  filterMode: "server" | "client";
}

export const CardinalityTrendsPage: React.FC<Props> = ({ timeframe }) => {
  const { topN } = useSettings();

  const [topNLocal, setTopNLocal] = useState<number>(Math.max(1, Math.min(MAX_TOP_N, topN)));
  const [bucketCount, setBucketCount] = useState<number>(12);
  const [serviceFilterDraft, setServiceFilterDraft] = useState("");
  const [attrKeyDraft, setAttrKeyDraft] = useState("");
  const [attrValueDraft, setAttrValueDraft] = useState("");
  const [appliedFilters, setAppliedFilters] = useState<AppliedFilters>({ serviceFilter: "", attrKey: "", attrValue: "" });

  const [activeMetric, setActiveMetric] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const [windows, setWindows] = useState<BucketWindow[]>([]);
  const [series, setSeries] = useState<MetricTrend[]>([]);
  const [truncatedBuckets, setTruncatedBuckets] = useState(0);
  const [timeframeUsed, setTimeframeUsed] = useState<string>(timeframe);
  const [wasTimeframeCapped, setWasTimeframeCapped] = useState(false);
  const [filterMode, setFilterMode] = useState<"server" | "client">("server");

  useEffect(() => {
    let abort = false;
    setLoading(true);
    setError(null);

    (async () => {
      const parsedMinutes = timeframeToMinutes(timeframe);
      const baseMinutes = parsedMinutes ?? 7 * 24 * 60;
      const cappedMinutes = Math.min(baseMinutes, MAX_CARDINALITY_MINUTES);
      const cappedExpr = minutesToRelativeExpr(cappedMinutes);

      const normalizedFilters = normalizeFilters(appliedFilters);
      const cacheKey = JSON.stringify({
        timeframe: cappedExpr,
        topN: topNLocal,
        buckets: bucketCount,
        filters: normalizedFilters,
      });

      const cached = trendsCache.get(cacheKey);
      if (cached && cached.expires > Date.now()) {
        if (abort) return;
        setWindows(cached.data.windows);
        setSeries(cached.data.series);
        setTruncatedBuckets(cached.data.truncatedBuckets);
        setTimeframeUsed(cached.data.timeframeUsed);
        setWasTimeframeCapped(cached.data.wasTimeframeCapped);
        setFilterMode(cached.data.filterMode);
        setLoading(false);
        return;
      }

      setProgress("Loading top metrics by cardinality...");
      const topRows = await fetchAllMetricCardinality(cappedExpr, undefined, topNLocal);
      if (abort) return;

      const metricKeys = topRows.map((r) => r.metric_key);
      if (!metricKeys.length) {
        setWindows([]);
        setSeries([]);
        setTruncatedBuckets(0);
        setTimeframeUsed(cappedExpr);
        setWasTimeframeCapped(baseMinutes > MAX_CARDINALITY_MINUTES);
        setLoading(false);
        return;
      }

      const nowMs = Date.now();
      const builtWindows = buildWindows(cappedMinutes, clampInt(String(bucketCount), MIN_BUCKETS, MAX_BUCKETS, 12), nowMs);

      const inArgs = metricKeys.map((k) => `"${escapeDqlString(k)}"`).join(", ");
      const hasClientOnlyFilter = normalizedFilters.serviceFilter.length > 0;
      const canUseServerFilter = !hasClientOnlyFilter;

      setProgress(`Loading ${builtWindows.length} buckets...`);

      const perBucketRows = await runBucketsWithConcurrency(
        builtWindows,
        BUCKET_CONCURRENCY,
        async (w, idx) => {
          if (abort) return { rows: [], truncated: false, idx };
          if (canUseServerFilter) {
            const query = buildServerAggregatedQuery(w, inArgs, normalizedFilters);
            const rows = await runDql(query, { maxRecords: QUERY_MAX_RECORDS });
            return { rows, truncated: rows.length >= QUERY_MAX_RECORDS, idx };
          }

          const rawQuery = `fetch metric.series, from:${w.fromExpr}, to:${w.toExpr}\n| filter in(metric.key, ${inArgs})`;
          const rows = await runDql(rawQuery, { maxRecords: QUERY_MAX_RECORDS });
          return { rows, truncated: rows.length >= QUERY_MAX_RECORDS, idx };
        },
        (done) => {
          if (!abort) setProgress(`Loading bucket ${done}/${builtWindows.length}...`);
        },
      );

      if (abort) return;

      const sortedBucketRows = perBucketRows.sort((a, b) => a.idx - b.idx);
      const bucketValues: Array<Record<string, number>> = [];
      let truncCount = 0;

      for (const bucket of sortedBucketRows) {
        if (bucket.truncated) truncCount++;
        const counts = new Map<string, number>();
        for (const k of metricKeys) counts.set(k, 0);

        if (canUseServerFilter) {
          for (const row of bucket.rows) {
            const k = String(row["metric.key"] ?? "");
            if (!k || !counts.has(k)) continue;
            counts.set(k, Number(row.series ?? 0));
          }
        } else {
          for (const rec of bucket.rows) {
            if (!matchesServiceFilter(rec, normalizedFilters.serviceFilter)) continue;
            if (!matchesResourceAttrFilter(rec, normalizedFilters.attrKey, normalizedFilters.attrValue)) continue;
            const k = String(rec["metric.key"] ?? "");
            if (!k || !counts.has(k)) continue;
            counts.set(k, (counts.get(k) ?? 0) + 1);
          }
        }

        const rowObj: Record<string, number> = {};
        for (const k of metricKeys) rowObj[k] = counts.get(k) ?? 0;
        bucketValues.push(rowObj);
      }

      const builtSeries: MetricTrend[] = metricKeys.map((k) => {
        const values = bucketValues.map((b) => b[k] ?? 0);
        const total = values.reduce((a, b) => a + b, 0);
        return { metricKey: k, values, total };
      });

      builtSeries.sort((a, b) => {
        const aLast = a.values[a.values.length - 1] ?? 0;
        const bLast = b.values[b.values.length - 1] ?? 0;
        return bLast - aLast;
      });

      const result: CachedResult = {
        windows: builtWindows,
        series: builtSeries,
        truncatedBuckets: truncCount,
        timeframeUsed: cappedExpr,
        wasTimeframeCapped: baseMinutes > MAX_CARDINALITY_MINUTES,
        filterMode: canUseServerFilter ? "server" : "client",
      };
      trendsCache.set(cacheKey, { expires: Date.now() + CACHE_TTL_MS, data: result });

      if (abort) return;
      setWindows(result.windows);
      setSeries(result.series);
      setTruncatedBuckets(result.truncatedBuckets);
      setTimeframeUsed(result.timeframeUsed);
      setWasTimeframeCapped(result.wasTimeframeCapped);
      setFilterMode(result.filterMode);
      setLoading(false);

      if (activeMetric && !builtSeries.some((s) => s.metricKey === activeMetric)) {
        setActiveMetric(null);
      }
    })().catch((e: unknown) => {
      if (abort) return;
      setError(e instanceof Error ? e.message : "Failed to load cardinality trends.");
      setLoading(false);
    });

    return () => {
      abort = true;
    };
  }, [timeframe, topNLocal, bucketCount, appliedFilters, refreshTick]);

  const visibleSeries = useMemo(() => {
    if (!activeMetric) return series;
    return series.filter((s) => s.metricKey === activeMetric);
  }, [series, activeMetric]);

  const colorByMetric = useMemo(() => {
    const map = new Map<string, string>();
    for (let i = 0; i < series.length; i++) map.set(series[i].metricKey, COLORS[i % COLORS.length]);
    return map;
  }, [series]);

  const peakSeries = useMemo(() => series.reduce((max, s) => Math.max(max, Math.max(0, ...s.values)), 0), [series]);
  const avgLatest = useMemo(() => {
    if (!series.length) return 0;
    return series.reduce((a, s) => a + (s.values[s.values.length - 1] ?? 0), 0) / series.length;
  }, [series]);

  const selectedMetric = activeMetric ? series.find((s) => s.metricKey === activeMetric) : null;

  const notebookDql = useMemo(
    () => buildNotebookDql(timeframeUsed, series, appliedFilters.serviceFilter, appliedFilters.attrKey, appliedFilters.attrValue),
    [timeframeUsed, series, appliedFilters],
  );
  const anomalyDql = useMemo(
    () => buildAnomalyDql(timeframeUsed, selectedMetric?.metricKey ?? series[0]?.metricKey),
    [timeframeUsed, selectedMetric?.metricKey, series],
  );

  if (loading) return <Loader msg={progress || "Loading cardinality trends..."} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card title="Cardinality Trend Controls">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          <label style={labelStyle}>
            Top N metrics
            <input
              type="number"
              min={1}
              max={MAX_TOP_N}
              value={topNLocal}
              onChange={(e) => setTopNLocal(clampInt(e.target.value, 1, MAX_TOP_N, topNLocal))}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Buckets
            <select
              value={bucketCount}
              onChange={(e) => setBucketCount(clampInt(e.target.value, MIN_BUCKETS, MAX_BUCKETS, 12))}
              style={inputStyle}
            >
              <option value={6}>6</option>
              <option value={10}>10</option>
              <option value={12}>12</option>
              <option value={18}>18</option>
              <option value={24}>24</option>
            </select>
          </label>
          <label style={labelStyle}>
            Service filter (contains)
            <input
              value={serviceFilterDraft}
              onChange={(e) => setServiceFilterDraft(e.target.value)}
              placeholder="e.g. checkout"
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Resource attribute key
            <input
              value={attrKeyDraft}
              onChange={(e) => setAttrKeyDraft(e.target.value)}
              placeholder="e.g. dt.entity.host"
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Resource attribute value (contains)
            <input
              value={attrValueDraft}
              onChange={(e) => setAttrValueDraft(e.target.value)}
              placeholder="e.g. HOST-"
              style={inputStyle}
            />
          </label>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
            <button
              onClick={() => setAppliedFilters(normalizeFilters({ serviceFilter: serviceFilterDraft, attrKey: attrKeyDraft, attrValue: attrValueDraft }))}
              style={btnPrimary}
            >
              Apply
            </button>
            <button onClick={() => setRefreshTick((x) => x + 1)} style={btnSec}>Refresh</button>
          </div>
        </div>
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
          Top N is selected from current cardinality snapshot over {timeframeUsed}. Queries use {filterMode === "server" ? "server-side aggregation" : "client-side filtering"}.
        </div>
      </Card>

      {error && (
        <Card>
          <div style={{ color: "#dc2626", fontSize: 13 }}>{error}</div>
        </Card>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <Stat label="Metrics trended" value={String(series.length)} />
        <Stat label="Peak series (any metric)" value={fmtNum(peakSeries)} />
        <Stat label="Avg latest bucket" value={fmtNum(avgLatest)} />
        <Stat label="Legend filter" value={activeMetric ? "1 metric" : "All metrics"} sub={activeMetric ?? "No filter"} />
      </div>

      <Card title="Cardinality Over Time (Top N)">
        {series.length > 0 && windows.length > 0 ? (
          <CardinalityTrendChart
            windows={windows}
            series={series}
            visibleSeries={visibleSeries}
            activeMetric={activeMetric}
            colorByMetric={colorByMetric}
            onToggleMetric={(metric) => setActiveMetric((prev) => (prev === metric ? null : metric))}
          />
        ) : (
          <div style={{ opacity: 0.7, fontSize: 12 }}>No matching data for the selected filters.</div>
        )}
      </Card>

      <Card title="Metrics in View">
        <SortableTable
          columns={[
            { key: "metric", header: "Metric key", render: (r: MetricTrend) => <code>{r.metricKey}</code>, sortValue: (r: MetricTrend) => r.metricKey },
            {
              key: "latest",
              header: "Latest",
              align: "right",
              render: (r: MetricTrend) => fmtNum(r.values[r.values.length - 1] ?? 0),
              sortValue: (r: MetricTrend) => r.values[r.values.length - 1] ?? 0,
            },
            {
              key: "avg",
              header: "Avg",
              align: "right",
              render: (r: MetricTrend) => fmtNum(r.values.length ? r.total / r.values.length : 0),
              sortValue: (r: MetricTrend) => (r.values.length ? r.total / r.values.length : 0),
            },
            {
              key: "peak",
              header: "Peak",
              align: "right",
              render: (r: MetricTrend) => fmtNum(Math.max(0, ...r.values)),
              sortValue: (r: MetricTrend) => Math.max(0, ...r.values),
            },
            { key: "sum", header: "Bucket sum", align: "right", render: (r: MetricTrend) => fmtNum(r.total), sortValue: (r: MetricTrend) => r.total },
          ]}
          data={visibleSeries}
          rowKey={(r) => r.metricKey}
          maxHeight={420}
          maxRows={300}
          defaultSortKey="latest"
          defaultSortDir="desc"
          onRowClick={(r) => setActiveMetric((prev) => (prev === r.metricKey ? null : r.metricKey))}
          rowStyle={(r) => ({ background: activeMetric === r.metricKey ? "rgba(20,150,255,0.12)" : undefined })}
        />
      </Card>

      <Card title="Cardinality Limits And Caveats">
        <div style={{ fontSize: 12, opacity: 0.82, display: "grid", gap: 4 }}>
          <div>Cardinality timeframe used: <code>{timeframeUsed}</code>{wasTimeframeCapped ? " (capped at 7d)" : ""}</div>
          <div>Buckets queried: {windows.length} (max {MAX_BUCKETS} in UI)</div>
          <div>Top metrics limit: {topNLocal} (max {MAX_TOP_N} in UI)</div>
          <div>Per-bucket max records: {fmtNum(QUERY_MAX_RECORDS)} rows</div>
          <div>Potential truncation in {truncatedBuckets}/{windows.length} buckets</div>
          <div>
            Service filter requires client-side pass over raw records and is slower; resource-attribute-only filters run server-side.
          </div>
        </div>
      </Card>

      <Card title="DQL Export (Notebook / Anomaly Detection)">
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
          <div>
            <div style={sectionTitleStyle}>Notebook DQL (cardinality trend context)</div>
            <textarea readOnly value={notebookDql} style={textareaStyle} />
            <div style={{ marginTop: 6, display: "flex", gap: 8 }}>
              <button onClick={() => copyText(notebookDql)} style={btnSec}>Copy Notebook DQL</button>
            </div>
          </div>
          <div>
            <div style={sectionTitleStyle}>Anomaly Detection DQL seed (selected metric)</div>
            <textarea readOnly value={anomalyDql} style={textareaStyle} />
            <div style={{ marginTop: 6, display: "flex", gap: 8 }}>
              <button onClick={() => copyText(anomalyDql)} style={btnSec}>Copy Anomaly DQL</button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

const COLORS = [
  "#0ea5e9",
  "#f97316",
  "#22c55e",
  "#e11d48",
  "#8b5cf6",
  "#f59e0b",
  "#14b8a6",
  "#ef4444",
  "#3b82f6",
  "#84cc16",
  "#d946ef",
  "#06b6d4",
  "#a855f7",
  "#10b981",
  "#fb7185",
  "#6366f1",
  "#f43f5e",
  "#0d9488",
  "#0891b2",
  "#65a30d",
];

const CardinalityTrendChart: React.FC<{
  windows: BucketWindow[];
  series: MetricTrend[];
  visibleSeries: MetricTrend[];
  activeMetric: string | null;
  colorByMetric: Map<string, string>;
  onToggleMetric: (metricKey: string) => void;
}> = ({ windows, series, visibleSeries, activeMetric, colorByMetric, onToggleMetric }) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const W = 1600;
  const H = 330;
  const padL = 56;
  const padR = 20;
  const padT = 14;
  const padB = 44;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const maxY = Math.max(1, ...visibleSeries.flatMap((s) => s.values));
  const isolatedSeries = activeMetric && visibleSeries.length === 1 ? visibleSeries[0] : null;

  const x = (i: number) => padL + (windows.length <= 1 ? 0 : (i / (windows.length - 1)) * innerW);
  const y = (v: number) => padT + innerH - (v / maxY) * innerH;

  const yTickVals = Array.from({ length: 5 }, (_, i) => (maxY * i) / 4);
  const hoverX = hoverIdx != null ? x(hoverIdx) : null;

  const tooltipRows = useMemo(() => {
    if (hoverIdx == null) return [];
    return visibleSeries
      .map((s) => ({ metricKey: s.metricKey, value: s.values[hoverIdx] ?? 0 }))
      .sort((a, b) => b.value - a.value)
      .slice(0, activeMetric ? 1 : 8);
  }, [hoverIdx, visibleSeries, activeMetric]);

  const isolatedAreaPath = useMemo(() => {
    if (!isolatedSeries || !isolatedSeries.values.length) return "";
    const top = isolatedSeries.values.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(v)}`).join(" ");
    const endX = x(isolatedSeries.values.length - 1);
    const startX = x(0);
    const baseY = y(0);
    return `${top} L ${endX} ${baseY} L ${startX} ${baseY} Z`;
  }, [isolatedSeries, maxY, windows.length]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ position: "relative", width: "100%" }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: "100%", height: 330, display: "block" }}
          onMouseLeave={() => setHoverIdx(null)}
          onMouseMove={(e) => {
            const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const px = ((e.clientX - rect.left) / rect.width) * W;
            const clamped = Math.max(padL, Math.min(W - padR, px));
            const ratio = (clamped - padL) / innerW;
            const idx = Math.round(ratio * Math.max(1, windows.length - 1));
            setHoverIdx(Math.max(0, Math.min(windows.length - 1, idx)));
          }}
        >
          <defs>
            <linearGradient id="cardinalityArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(20,150,255,0.24)" />
              <stop offset="100%" stopColor="rgba(20,150,255,0.02)" />
            </linearGradient>
          </defs>

          <rect x={padL} y={padT} width={innerW} height={innerH} fill="rgba(20,150,255,0.03)" rx={4} />

          {yTickVals.map((v, i) => (
            <g key={i}>
              <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="rgba(128,128,128,0.2)" strokeDasharray={i === 0 ? "" : "2 3"} />
              <text x={padL - 6} y={y(v) + 4} fontSize="10" textAnchor="end" fill="currentColor" opacity={0.75}>
                {fmtNum(v)}
              </text>
            </g>
          ))}

          {isolatedAreaPath && <path d={isolatedAreaPath} fill="url(#cardinalityArea)" />}

          {visibleSeries.map((s) => {
            const color = colorByMetric.get(s.metricKey) ?? "#1496ff";
            const path = s.values.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(v)}`).join(" ");
            return (
              <path
                key={s.metricKey}
                d={path}
                fill="none"
                stroke={color}
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeOpacity={activeMetric && activeMetric !== s.metricKey ? 0.28 : 1}
                style={{ cursor: "pointer" }}
                onClick={() => onToggleMetric(s.metricKey)}
              />
            );
          })}

          {hoverX != null && (
            <line x1={hoverX} x2={hoverX} y1={padT} y2={padT + innerH} stroke="rgba(128,128,128,0.5)" strokeDasharray="3 3" />
          )}

          {hoverIdx != null && visibleSeries.map((s) => {
            const color = colorByMetric.get(s.metricKey) ?? "#1496ff";
            const v = s.values[hoverIdx] ?? 0;
            return <circle key={`pt-${s.metricKey}`} cx={x(hoverIdx)} cy={y(v)} r={2.5} fill={color} />;
          })}

          {windows.length > 1 && Array.from({ length: Math.min(6, windows.length) }, (_, i) => {
            const idx = Math.round((i / Math.max(1, Math.min(6, windows.length) - 1)) * (windows.length - 1));
            return (
              <text key={i} x={x(idx)} y={H - 12} fontSize="10" textAnchor="middle" fill="currentColor" opacity={0.7}>
                {windows[idx].label}
              </text>
            );
          })}
        </svg>

        {hoverIdx != null && tooltipRows.length > 0 && (
          <div
            style={{
              position: "absolute",
              left: `min(80%, max(8px, calc(${((x(hoverIdx) / W) * 100).toFixed(2)}% + 10px)))`,
              top: 12,
              background: "rgba(24,24,24,0.92)",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 6,
              padding: "8px 10px",
              fontSize: 11,
              minWidth: 220,
              pointerEvents: "none",
              zIndex: 3,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 6 }}>{windows[hoverIdx]?.label ?? ""}</div>
            {tooltipRows.map((r) => (
              <div key={r.metricKey} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 2 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <span style={{ width: 8, height: 8, borderRadius: 99, background: colorByMetric.get(r.metricKey) ?? "#1496ff", flexShrink: 0 }} />
                  {r.metricKey}
                </span>
                <strong>{fmtNum(r.value)}</strong>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {series.map((s) => {
          const color = colorByMetric.get(s.metricKey) ?? "#1496ff";
          const isActive = activeMetric === s.metricKey;
          return (
            <button
              key={s.metricKey}
              onClick={() => onToggleMetric(s.metricKey)}
              style={{ ...legendBtn, borderColor: isActive ? color : "rgba(128,128,128,0.35)", background: isActive ? "rgba(20,150,255,0.12)" : "transparent" }}
              title="Click to filter by this metric; click again to clear."
            >
              <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 99, background: color }} />
              <span style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.metricKey}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

function normalizeFilters(f: AppliedFilters): AppliedFilters {
  return {
    serviceFilter: f.serviceFilter.trim(),
    attrKey: f.attrKey.trim(),
    attrValue: f.attrValue.trim(),
  };
}

async function runBucketsWithConcurrency<T>(
  windows: BucketWindow[],
  concurrency: number,
  worker: (w: BucketWindow, idx: number) => Promise<T>,
  onDone?: (done: number) => void,
): Promise<T[]> {
  const out: T[] = new Array(windows.length);
  let next = 0;
  let done = 0;
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (true) {
      const i = next;
      next++;
      if (i >= windows.length) return;
      out[i] = await worker(windows[i], i);
      done++;
      onDone?.(done);
    }
  });
  await Promise.all(workers);
  return out;
}

function buildServerAggregatedQuery(window: BucketWindow, inArgs: string, filters: AppliedFilters): string {
  const lines = [
    `fetch metric.series, from:${window.fromExpr}, to:${window.toExpr}`,
    `| filter in(metric.key, ${inArgs})`,
  ];

  if (filters.attrKey) {
    if (filters.attrValue) {
      lines.push(`| filter contains(toString(${filters.attrKey}), "${escapeDqlString(filters.attrValue)}")`);
    } else {
      lines.push(`| filter isNotNull(${filters.attrKey})`);
    }
  }

  lines.push("| summarize series = count(), by:{metric.key}");
  return lines.join("\n");
}

function timeframeToMinutes(tf: string): number | null {
  const m = tf.match(/^now\(\)-(\d+)([dhm])$/);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2];
  if (!Number.isFinite(n) || n <= 0) return null;
  if (unit === "d") return n * 24 * 60;
  if (unit === "h") return n * 60;
  return n;
}

function minutesToRelativeExpr(totalMinutes: number): string {
  if (totalMinutes % (24 * 60) === 0) return `now()-${totalMinutes / (24 * 60)}d`;
  if (totalMinutes % 60 === 0) return `now()-${totalMinutes / 60}h`;
  return `now()-${totalMinutes}m`;
}

function minutesOffsetExpr(minutesAgo: number): string {
  if (minutesAgo <= 0) return "now()";
  if (minutesAgo % (24 * 60) === 0) return `now()-${minutesAgo / (24 * 60)}d`;
  if (minutesAgo % 60 === 0) return `now()-${minutesAgo / 60}h`;
  return `now()-${minutesAgo}m`;
}

function buildWindows(totalMinutes: number, buckets: number, nowMs: number): BucketWindow[] {
  const out: BucketWindow[] = [];
  for (let i = 0; i < buckets; i++) {
    const startAgo = totalMinutes - Math.floor((totalMinutes * i) / buckets);
    const endAgo = totalMinutes - Math.floor((totalMinutes * (i + 1)) / buckets);
    const startMs = nowMs - startAgo * 60000;
    const endMs = nowMs - endAgo * 60000;
    out.push({
      index: i,
      fromExpr: minutesOffsetExpr(startAgo),
      toExpr: minutesOffsetExpr(endAgo),
      startMs,
      endMs,
      label: formatBucketLabel(endMs, totalMinutes),
    });
  }
  return out;
}

function formatBucketLabel(ms: number, totalMinutes: number): string {
  const d = new Date(ms);
  const mm = d.getMonth() + 1;
  const dd = d.getDate();
  if (totalMinutes >= 24 * 60) return `${mm}/${dd}`;
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mi}`;
}

function escapeDqlString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function clampInt(raw: string, min: number, max: number, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function matchesServiceFilter(record: Record<string, unknown>, serviceFilter: string): boolean {
  const needle = serviceFilter.trim().toLowerCase();
  if (!needle) return true;

  for (const [k, v] of Object.entries(record)) {
    if (v == null) continue;
    if (!k.toLowerCase().includes("service")) continue;
    if (String(v).toLowerCase().includes(needle)) return true;
  }
  return false;
}

function matchesResourceAttrFilter(record: Record<string, unknown>, attrKey: string, attrValue: string): boolean {
  const key = attrKey.trim();
  const valueNeedle = attrValue.trim().toLowerCase();
  if (!key) return true;
  if (!(key in record)) return false;
  const value = record[key];
  if (value == null) return false;
  if (!valueNeedle) return true;
  return String(value).toLowerCase().includes(valueNeedle);
}

function buildNotebookDql(
  timeframeUsed: string,
  series: MetricTrend[],
  serviceFilter: string,
  attrKey: string,
  attrValue: string,
): string {
  const keys = series.slice(0, 20).map((s) => s.metricKey);
  const inArgs = keys.length ? keys.map((k) => `"${escapeDqlString(k)}"`).join(", ") : "\"metric.key.example\"";
  const notes: string[] = [];
  if (serviceFilter.trim()) notes.push(`Service filter (client-applied in app): ${serviceFilter.trim()}`);
  if (attrKey.trim()) notes.push(`Resource attribute filter: ${attrKey.trim()} contains ${attrValue.trim() || "<any>"}`);

  return [
    "// Cardinality trend context query for Notebook",
    `fetch metric.series, from:${timeframeUsed}`,
    `| filter in(metric.key, ${inArgs})`,
    "| summarize series = count(), by:{metric.key}",
    "| sort series desc",
    "",
    ...notes.map((n) => `// ${n}`),
  ].join("\n");
}

function buildAnomalyDql(timeframeUsed: string, metricKey?: string): string {
  const safeKey = metricKey && metricKey.trim().length > 0 ? metricKey : "dt.custom.metric.example";
  const metricExpr = toMetricExpr(safeKey);
  return [
    "// Seed query for anomaly exploration on selected metric",
    `timeseries datapoints = count(${metricExpr}), from:${timeframeUsed}, interval:1h`,
    "| fieldsAdd baseline = arrayMovingAvg(datapoints, 24)",
  ].join("\n");
}

function toMetricExpr(metricKey: string): string {
  return /^[a-zA-Z0-9_.]+$/.test(metricKey) ? metricKey : `\`${metricKey.replace(/`/g, "")}\``;
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 12,
  opacity: 0.9,
};

const inputStyle: React.CSSProperties = {
  padding: "6px 10px",
  background: "rgba(128,128,128,0.1)",
  border: "1px solid rgba(128,128,128,0.3)",
  borderRadius: 4,
  color: "inherit",
  fontSize: 12,
  boxSizing: "border-box",
};

const btnPrimary: React.CSSProperties = {
  padding: "7px 14px",
  borderRadius: 4,
  border: "1px solid #1496ff",
  background: "rgba(20,150,255,0.2)",
  color: "inherit",
  cursor: "pointer",
  fontSize: 12,
};

const btnSec: React.CSSProperties = {
  padding: "6px 12px",
  background: "transparent",
  border: "1px solid rgba(128,128,128,0.4)",
  borderRadius: 4,
  color: "inherit",
  cursor: "pointer",
  fontSize: 12,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  marginBottom: 4,
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 110,
  fontFamily: "Consolas, 'Courier New', monospace",
  fontSize: 12,
  padding: 8,
  borderRadius: 4,
  border: "1px solid rgba(128,128,128,0.35)",
  background: "rgba(128,128,128,0.08)",
  color: "inherit",
  boxSizing: "border-box",
};

const legendBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 8px",
  border: "1px solid rgba(128,128,128,0.35)",
  borderRadius: 999,
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
  fontSize: 11,
  maxWidth: 380,
};
