import React, { useEffect, useMemo, useState } from "react";
import { Card, Loader, Stat } from "../components/Common";
import { SortableTable } from "../components/SortableTable";
import { BarList } from "../components/BarList";
import { BusinessJustificationPanel } from "../components/BusinessJustificationPanel";
import { fetchAllMetricCardinality, fetchAllSeriesFor, MetricKeyRow } from "../lib/queries";
import { fmtNum } from "../lib/forecast";
import { costUSD, fmtUSD } from "../lib/cost";
import { useSettings } from "../state/SettingsContext";

const ASSUMED_DP_PER_SERIES_PER_DAY = 1440; // 1-min resolution heuristic

interface DimStat {
  field: string;
  distinct: number;
  fillRate: number; // fraction of series where dim is non-null
  topValues: { value: string; count: number }[];
}

export const OptimizePage: React.FC = () => {
  const { rateCentsPerDp, businessAssumptions } = useSettings();
  const [loading, setLoading] = useState(true);
  const [allMetrics, setAllMetrics] = useState<MetricKeyRow[]>([]);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [dropped, setDropped] = useState<Set<string>>(new Set());
  const [expansionPct, setExpansionPct] = useState<number>(50);
  const [expansionScope, setExpansionScope] = useState<"all" | "filtered">("all");
  const [showBizJustification, setShowBizJustification] = useState(false);

  useEffect(() => {
    let abort = false;
    setLoading(true);
    (async () => {
      const r = await fetchAllMetricCardinality("now()-2h");
      if (abort) return;
      setAllMetrics(r);
      if (r.length) setSelected(r[0].metric_key);
      setLoading(false);
    })();
    return () => { abort = true; };
  }, []);

  const filtered = useMemo(() => {
    if (!filter) return allMetrics;
    const f = filter.toLowerCase();
    return allMetrics.filter((m) => m.metric_key.toLowerCase().includes(f));
  }, [allMetrics, filter]);

  // What-if totals
  const dailyCostPerSeries = costUSD(ASSUMED_DP_PER_SERIES_PER_DAY, rateCentsPerDp);
  const totalSeriesAll = allMetrics.reduce((a, m) => a + m.series, 0);
  const droppedSeries = allMetrics
    .filter((m) => dropped.has(m.metric_key))
    .reduce((a, m) => a + m.series, 0);
  const remainingSeries = totalSeriesAll - droppedSeries;
  const annualSavings = dailyCostPerSeries * droppedSeries * 365;
  const monthlySavings = dailyCostPerSeries * droppedSeries * 30;
  const annualTotal = dailyCostPerSeries * totalSeriesAll * 365;
  const annualRemaining = dailyCostPerSeries * remainingSeries * 365;
  const savingsPct = annualTotal > 0 ? (annualSavings / annualTotal) * 100 : 0;

  const baseSeriesForExpansion = expansionScope === "filtered"
    ? filtered.reduce((a, m) => a + m.series, 0)
    : totalSeriesAll;
  const addedSeries = baseSeriesForExpansion * (expansionPct / 100);
  const addedMonthlyCost = dailyCostPerSeries * addedSeries * 30;
  const addedAnnualCost = dailyCostPerSeries * addedSeries * 365;
  const expandedAnnualCost = annualTotal + addedAnnualCost;

  const metricsBiz = useMemo(() => {
    const expansionFactor = 1 + expansionPct / 100;
    const obsLift = Math.min(0.62, Math.log2(expansionFactor + 1) * 0.2);
    const mttrBeforeMin = businessAssumptions.metricsMttrBaselineMin;
    const mttrAfterMin = Math.max(34, mttrBeforeMin * (1 - obsLift));
    const mttdBeforeMin = businessAssumptions.metricsMttdBaselineMin;
    const mttdAfterMin = Math.max(6, mttdBeforeMin * (1 - obsLift * 0.85));
    const incidentsPerMonth = expansionScope === "all"
      ? businessAssumptions.metricsIncidentsPerMonth
      : Math.max(1, Math.round(businessAssumptions.metricsIncidentsPerMonth * 0.65));
    const serviceHrsSaved = ((mttrBeforeMin - mttrAfterMin) / 60) * incidentsPerMonth;
    const engineerHrsSaved = serviceHrsSaved * 5.5;
    const avoidedRevenueRiskMonthly = serviceHrsSaved * businessAssumptions.incidentCostPerHourUSD;
    const productivityValueMonthly = engineerHrsSaved * businessAssumptions.engineerHourlyCostUSD;
    const monthlyBenefit = avoidedRevenueRiskMonthly + productivityValueMonthly;
    const paybackMonths = addedMonthlyCost > 0 ? addedMonthlyCost / Math.max(1, monthlyBenefit) : 0;
    const releaseLeadBeforeHrs = 22;
    const releaseLeadAfterHrs = Math.max(8, releaseLeadBeforeHrs * (1 - obsLift * 0.45));
    const falsePositiveBefore = 17;
    const falsePositiveAfter = Math.max(6, falsePositiveBefore * (1 - obsLift * 0.5));

    return {
      mttrBeforeMin,
      mttrAfterMin,
      mttdBeforeMin,
      mttdAfterMin,
      incidentsPerMonth,
      serviceHrsSaved,
      engineerHrsSaved,
      avoidedRevenueRiskMonthly,
      productivityValueMonthly,
      monthlyBenefit,
      paybackMonths,
      releaseLeadBeforeHrs,
      releaseLeadAfterHrs,
      falsePositiveBefore,
      falsePositiveAfter,
    };
  }, [expansionPct, expansionScope, addedMonthlyCost, businessAssumptions]);

  if (loading) return <Loader msg="Loading metric cardinality..." />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* What-if simulator */}
      <Card title='"What if I drop these?" simulator'>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 12 }}>
          <Stat label="Selected to drop" value={String(dropped.size)} sub={`${fmtNum(droppedSeries)} series`} />
          <Stat label="Remaining series" value={fmtNum(remainingSeries)}
                sub={`of ${fmtNum(totalSeriesAll)} total`} />
          <Stat label="Monthly savings" value={fmtUSD(monthlySavings)} />
          <Stat label="Annual savings" value={fmtUSD(annualSavings)}
                sub={`${savingsPct.toFixed(1)}% of $${annualTotal.toFixed(0)}`} />
          <Stat label="Annual cost after" value={fmtUSD(annualRemaining)} />
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
          <button onClick={() => setDropped(new Set())} style={btnSec}>Clear selection</button>
          <button
            onClick={() => {
              const next = new Set<string>();
              filtered.slice(0, 10).forEach((m) => next.add(m.metric_key));
              setDropped(next);
            }}
            style={btnSec}
          >
            Select top 10 (filtered)
          </button>
          <span style={{ fontSize: 11, opacity: 0.65, marginLeft: "auto" }}>
            Cost basis: {ASSUMED_DP_PER_SERIES_PER_DAY} DP/series/day × {rateCentsPerDp}¢/DP
          </span>
        </div>
      </Card>

      <Card title="Expansion Scenario">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginBottom: 12 }}>
          <label style={labelStyle}>
            Expansion scope
            <select
              value={expansionScope}
              onChange={(e) => setExpansionScope(e.target.value as "all" | "filtered")}
              style={inputStyle}
            >
              <option value="all">All metrics</option>
              <option value="filtered">Filtered metrics only</option>
            </select>
          </label>
          <label style={labelStyle}>
            Volume increase (%)
            <input
              type="number"
              min={0}
              max={1000}
              step={1}
              value={expansionPct}
              onChange={(e) => setExpansionPct(Math.max(0, Math.min(1000, Number(e.target.value) || 0)))}
              style={inputStyle}
            />
          </label>
          <div style={{ fontSize: 11, opacity: 0.7, alignSelf: "end" }}>
            Models increased sampling/telemetry volume as proportional increase in effective series load.
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <Stat label="Base series in scope" value={fmtNum(baseSeriesForExpansion)} />
          <Stat label="Additional series equivalent" value={fmtNum(addedSeries)} />
          <Stat label="Additional monthly cost" value={fmtUSD(addedMonthlyCost)} />
          <Stat label="Additional annual cost" value={fmtUSD(addedAnnualCost)} />
          <Stat label="Annual cost after expansion" value={fmtUSD(expandedAnnualCost)} />
        </div>

        <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
          <button onClick={() => setShowBizJustification((s) => !s)} style={btnSec}>
            {showBizJustification ? "Hide Business Justification" : "Business Justification"}
          </button>
        </div>

        {showBizJustification && (
          <BusinessJustificationPanel
            scenarioName={`Metrics expansion ${expansionPct}% (${expansionScope})`}
            summary={`Increasing metrics telemetry depth can materially improve incident triage speed, reduce blind spots in high-cardinality workflows, and lower engineering toil. This scenario models whether additional observability spend is justified by operational and business impact.`}
            keyMetrics={[
              { label: "MTTR", value: `${metricsBiz.mttrBeforeMin.toFixed(0)}m -> ${metricsBiz.mttrAfterMin.toFixed(0)}m`, note: `${((1 - metricsBiz.mttrAfterMin / metricsBiz.mttrBeforeMin) * 100).toFixed(1)}% faster` },
              { label: "MTTD", value: `${metricsBiz.mttdBeforeMin.toFixed(0)}m -> ${metricsBiz.mttdAfterMin.toFixed(0)}m`, note: "earlier anomaly detection" },
              { label: "Monthly Benefit", value: fmtUSD(metricsBiz.monthlyBenefit), note: `Risk + productivity value` },
              { label: "Payback", value: `${metricsBiz.paybackMonths.toFixed(1)} months`, note: `vs ${fmtUSD(addedMonthlyCost)}/mo added cost` },
              { label: "Release Lead Time", value: `${metricsBiz.releaseLeadBeforeHrs.toFixed(1)}h -> ${metricsBiz.releaseLeadAfterHrs.toFixed(1)}h`, note: "faster confidence to deploy" },
              { label: "False Positives", value: `${metricsBiz.falsePositiveBefore.toFixed(0)}% -> ${metricsBiz.falsePositiveAfter.toFixed(0)}%`, note: "cleaner signal quality" },
            ]}
            analysis={[
              `1) Faster restoration: At ~${metricsBiz.incidentsPerMonth} incidents/month, MTTR improvement yields ${metricsBiz.serviceHrsSaved.toFixed(1)} service-hours restored monthly.`,
              `2) Engineering capacity gain: ~${metricsBiz.engineerHrsSaved.toFixed(0)} engineer-hours/month can be redirected from triage to feature delivery and reliability engineering.`,
              `3) Business risk reduction: Estimated avoided impact ~${fmtUSD(metricsBiz.avoidedRevenueRiskMonthly)}/month from shorter high-impact incidents.`,
              `4) Delivery acceleration: Better high-cardinality telemetry reduces release hold time by ~${(metricsBiz.releaseLeadBeforeHrs - metricsBiz.releaseLeadAfterHrs).toFixed(1)} hours per major release cycle.`,
              `5) Governance value: Additional dimensions improve auditability and SLA/SLO explainability for customer-facing and regulated workflows.`,
              `6) Decision threshold: If realized operational benefit exceeds ${fmtUSD(addedMonthlyCost)}/month, expansion is financially justified.`
            ]}
            assumptions={[
              `Baseline MTTR/MTTD: ${metricsBiz.mttrBeforeMin.toFixed(0)}m / ${metricsBiz.mttdBeforeMin.toFixed(0)}m`,
              `Incident baseline: ${metricsBiz.incidentsPerMonth.toFixed(0)} incidents/month`,
              `Avoided impact rate: ${fmtUSD(businessAssumptions.incidentCostPerHourUSD)}/service-hour`,
              `Engineer hourly rate: ${fmtUSD(businessAssumptions.engineerHourlyCostUSD)}/hour`
            ]}
          />
        )}
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
        {/* Metric picker with checkboxes */}
        <Card title={`Metrics (${allMetrics.length})`}>
          <input
            placeholder="Filter metric keys..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ ...inputStyle, width: "100%", marginBottom: 8 }}
          />
          <div style={{ maxHeight: 600, overflowY: "auto", border: "1px solid rgba(128,128,128,0.2)", borderRadius: 4 }}>
            {filtered.slice(0, 300).map((m) => {
              const annual = dailyCostPerSeries * m.series * 365;
              const isSel = selected === m.metric_key;
              const isDropped = dropped.has(m.metric_key);
              return (
                <div
                  key={m.metric_key}
                  style={{
                    padding: "6px 10px",
                    background: isSel ? "rgba(20,150,255,0.12)" : "transparent",
                    borderBottom: "1px solid rgba(128,128,128,0.15)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 12,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isDropped}
                    onChange={(e) => {
                      const next = new Set(dropped);
                      if (e.target.checked) next.add(m.metric_key);
                      else next.delete(m.metric_key);
                      setDropped(next);
                    }}
                    title="Mark as dropped (what-if)"
                  />
                  <div
                    onClick={() => setSelected(m.metric_key)}
                    style={{ flex: 1, cursor: "pointer", minWidth: 0 }}
                  >
                    <div style={{
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      textDecoration: isDropped ? "line-through" : "none",
                      opacity: isDropped ? 0.5 : 1,
                    }}>
                      <code>{m.metric_key}</code>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, opacity: 0.7 }}>
                      <span>{fmtNum(m.series)} series</span>
                      <span>{fmtUSD(annual)}/yr</span>
                    </div>
                  </div>
                </div>
              );
            })}
            {filtered.length > 300 && (
              <div style={{ padding: 8, fontSize: 11, opacity: 0.7, textAlign: "center" }}>
                Showing first 300 of {filtered.length}. Use filter to narrow.
              </div>
            )}
          </div>
        </Card>

        {/* Dimension explorer */}
        <Card title={selected ? `Dimension cardinality: ${selected}` : "Select a metric"}>
          {selected && <DimensionExplorer metricKey={selected} />}
        </Card>
      </div>
    </div>
  );
};

const DimensionExplorer: React.FC<{ metricKey: string }> = ({ metricKey }) => {
  const { rateCentsPerDp } = useSettings();
  const [loading, setLoading] = useState(true);
  const [series, setSeries] = useState<any[]>([]);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    let abort = false;
    setLoading(true);
    (async () => {
      const recs = await fetchAllSeriesFor(metricKey, "now()-2h", 100000);
      if (abort) return;
      setSeries(recs);
      setTruncated(recs.length === 100000);
      setLoading(false);
    })();
    return () => { abort = true; };
  }, [metricKey]);

  const stats: DimStat[] = useMemo(() => {
    if (!series.length) return [];
    // Discover field names (excluding metric.key itself which is constant)
    const fields = new Set<string>();
    for (const s of series) {
      for (const k of Object.keys(s)) {
        if (k === "metric.key") continue;
        fields.add(k);
      }
    }
    const out: DimStat[] = [];
    for (const f of fields) {
      const counts = new Map<string, number>();
      let nonNull = 0;
      for (const s of series) {
        const v = s[f];
        if (v == null || v === "") continue;
        nonNull++;
        const sv = String(v);
        counts.set(sv, (counts.get(sv) ?? 0) + 1);
      }
      const top = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([value, count]) => ({ value, count }));
      out.push({
        field: f,
        distinct: counts.size,
        fillRate: series.length > 0 ? nonNull / series.length : 0,
        topValues: top,
      });
    }
    out.sort((a, b) => b.distinct - a.distinct);
    return out;
  }, [series]);

  const topDimsRows = useMemo(() => {
    const total = series.length;
    return stats.slice(0, 8).map((d) => ({
      label: d.field,
      value: d.distinct,
      pct: total > 0 ? (d.distinct / total) * 100 : 0,
    }));
  }, [stats, series.length]);

  if (loading) return <Loader msg="Fetching all series for this metric..." />;
  if (!series.length) return <div style={{ opacity: 0.7 }}>No series found.</div>;

  const totalSeries = series.length;
  const dailyCostPerSeries = costUSD(ASSUMED_DP_PER_SERIES_PER_DAY, rateCentsPerDp);
  const annualCost = dailyCostPerSeries * totalSeries * 365;

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8, marginBottom: 12 }}>
        <Stat label="Series" value={fmtNum(totalSeries)}
              sub={truncated ? "⚠ truncated at 100k" : "complete"} />
        <Stat label="Dimensions" value={String(stats.length)} />
        <Stat label="Annual cost (this metric)" value={fmtUSD(annualCost)} />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, gap: 8 }}>
        <div style={{ fontSize: 12, opacity: 0.75 }}>
          Cardinality of each dimension. <strong>If you removed a high-cardinality dimension</strong>, series count would collapse to roughly the number of distinct combinations of remaining dimensions. Look for dims with high distinct count and high fill rate — they drive cost.
        </div>
        <button
          onClick={() => downloadCsvDimStats(metricKey, stats, totalSeries, dailyCostPerSeries)}
          style={btnSecSm}
        >
          Export CSV
        </button>
      </div>

      <SortableTable
        columns={[
          { key: "field", header: "Dimension", render: (d: DimStat) => {
            const isHotspot = d.distinct > 50 && d.fillRate > 0.5;
            return <><code>{d.field}</code>{isHotspot && <span style={{ marginLeft: 6, fontSize: 10, padding: "1px 6px", background: "#ff6b35", color: "#fff", borderRadius: 3 }}>hotspot</span>}</>;
          }, sortValue: (d: DimStat) => d.field },
          { key: "distinct", header: "Distinct values", align: "right", render: (d: DimStat) => <span style={{ fontWeight: 600 }}>{fmtNum(d.distinct)}</span>, sortValue: (d: DimStat) => d.distinct },
          { key: "fillRate", header: "Fill rate", align: "right", render: (d: DimStat) => `${(d.fillRate * 100).toFixed(0)}%`, sortValue: (d: DimStat) => d.fillRate },
          { key: "ifRemoved", header: "If removed", align: "right", render: (d: DimStat) => {
            const collapseFactor = d.distinct > 0 ? 1 / d.distinct : 1;
            const newSeriesEstimate = Math.ceil(totalSeries * collapseFactor);
            const savings = annualCost - dailyCostPerSeries * newSeriesEstimate * 365;
            return <span title="Upper-bound estimate">~{fmtNum(newSeriesEstimate)} series<div style={{ fontSize: 10, opacity: 0.7 }}>\u2264 {fmtUSD(savings)}/yr saved</div></span>;
          }, sortValue: (d: DimStat) => d.distinct },
          { key: "topValues", header: "Top values", render: (d: DimStat) => <div style={{ fontSize: 11, opacity: 0.85 }}>{d.topValues.map((t) => (
            <div key={t.value} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 320 }}>
              <code>{t.value.length > 50 ? t.value.slice(0, 50) + "\u2026" : t.value}</code>
              <span style={{ opacity: 0.6, marginLeft: 4 }}>({t.count})</span>
            </div>
          ))}</div> },
        ]}
        data={stats}
        rowKey={(d) => d.field}
        maxHeight={500}
        fontSize={12}
        defaultSortKey="distinct"
        defaultSortDir="desc"
        rowStyle={(d) => ({
          background: d.distinct > 50 && d.fillRate > 0.5 ? "rgba(255,107,53,0.07)" : undefined,
        })}
      />

      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Top dimension hotspots</div>
        <BarList rows={topDimsRows} />
      </div>
    </>
  );
};

function downloadCsvDimStats(metricKey: string, stats: DimStat[], totalSeries: number, dailyCostPerSeries: number) {
  const annualCost = dailyCostPerSeries * totalSeries * 365;
  const header = ["dimension", "distinct_values", "fill_rate_pct", "est_series_if_removed", "est_annual_savings_usd", "top_values"];
  const lines = [header.join(",")];
  for (const d of stats) {
    const collapseFactor = d.distinct > 0 ? 1 / d.distinct : 1;
    const newSeries = Math.ceil(totalSeries * collapseFactor);
    const savings = annualCost - dailyCostPerSeries * newSeries * 365;
    const topVals = d.topValues.map((t) => `${t.value}(${t.count})`).join("|");
    lines.push([`"${d.field}"`, d.distinct, (d.fillRate * 100).toFixed(1), newSeries, savings.toFixed(6), `"${topVals}"`].join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `dim-cardinality-${metricKey.replace(/[^a-zA-Z0-9._-]/g, "_")}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const inputStyle: React.CSSProperties = {
  padding: "6px 10px",
  background: "rgba(128,128,128,0.1)",
  border: "1px solid rgba(128,128,128,0.3)",
  borderRadius: 4,
  color: "inherit",
  fontSize: 12,
  boxSizing: "border-box",
};
const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 12,
};
const btnSec: React.CSSProperties = {
  padding: "4px 12px",
  background: "transparent",
  border: "1px solid rgba(128,128,128,0.4)",
  borderRadius: 4,
  color: "inherit",
  cursor: "pointer",
  fontSize: 12,
};
const btnSecSm: React.CSSProperties = {
  ...btnSec,
  whiteSpace: "nowrap",
  flexShrink: 0,
};
