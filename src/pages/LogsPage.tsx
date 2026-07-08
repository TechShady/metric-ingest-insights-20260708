import React, { useMemo, useState } from "react";
import { Card, Stat } from "../components/Common";
import { BarList } from "../components/BarList";
import { LineChart } from "../components/LineChart";
import { SortableTable } from "../components/SortableTable";
import { BusinessJustificationPanel } from "../components/BusinessJustificationPanel";
import { fmtNum } from "../lib/forecast";
import { fmtUSD } from "../lib/cost";
import { timeframeDays } from "../lib/timeframe";
import { useSettings } from "../state/SettingsContext";

interface Props {
  timeframe: string;
}

type LogsSubTab = "overview" | "forecast" | "optimize";

export const LogsPage: React.FC<Props> = ({ timeframe }) => {
  const [tab, setTab] = useState<LogsSubTab>("overview");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid rgba(128,128,128,0.3)", flexWrap: "wrap" }}>
        {[
          { id: "overview", label: "Overview" },
          { id: "forecast", label: "Forecast" },
          { id: "optimize", label: "Optimize" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as LogsSubTab)}
            style={{
              padding: "8px 16px",
              background: "transparent",
              border: "none",
              borderBottom: tab === t.id ? "2px solid #1496ff" : "2px solid transparent",
              color: "inherit",
              cursor: "pointer",
              fontWeight: tab === t.id ? 600 : 400,
              fontSize: 14,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "overview" && <LogsOverview timeframe={timeframe} />}
      {tab === "forecast" && <LogsForecast timeframe={timeframe} />}
      {tab === "optimize" && <LogsOptimize timeframe={timeframe} />}
    </div>
  );
};

const LogsOverview: React.FC<Props> = ({ timeframe }) => {
  const { logsPricing, logsUsage } = useSettings();
  const days = Math.max(1, timeframeDays(timeframe));

  const ingestDduDay = logsUsage.ingestGbPerDay * logsPricing.ingestDduPerGb;
  const retainDduDay = logsUsage.retainGbPerDay * logsPricing.retainDduPerGbDay;
  const queryDduDay = logsUsage.queryGbScannedPerDay * logsPricing.queryDduPerGbScanned;
  const totalDduDay = ingestDduDay + retainDduDay + queryDduDay;

  const rows = [
    { label: "Ingest and Process", value: ingestDduDay },
    { label: "Retain", value: retainDduDay },
    { label: "Query", value: queryDduDay },
  ];
  const total = rows.reduce((a, b) => a + b.value, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <Stat label="Total logs DDU/day" value={fmtNum(totalDduDay)} />
        <Stat label={`DDU in selected timeframe (${Math.round(days)}d)`} value={fmtNum(totalDduDay * days)} />
        <Stat label="Monthly run-rate (DDU)" value={fmtNum(totalDduDay * 30)} />
        <Stat label="Annual run-rate (DDU)" value={fmtNum(totalDduDay * 365)} />
      </div>

      <Card title="Logs DDU Drivers">
        <BarList
          rows={rows.map((r) => ({ label: r.label, value: r.value, pct: total > 0 ? (r.value / total) * 100 : 0 }))}
          valueFmt={(v) => `${fmtNum(v)} DDU/day`}
        />
      </Card>

      <Card title="Unit Economics">
        <SortableTable
          columns={[
            { key: "activity", header: "Activity", render: (r: any) => r.activity, sortValue: (r: any) => r.activity },
            { key: "rate", header: "Rate", align: "right", render: (r: any) => r.rate, sortValue: (r: any) => r.rateRaw },
            { key: "volume", header: "Configured daily volume", align: "right", render: (r: any) => r.volume, sortValue: (r: any) => r.volumeRaw },
            { key: "ddu", header: "DDU/day", align: "right", render: (r: any) => fmtNum(r.ddu), sortValue: (r: any) => r.ddu },
          ]}
          data={[
            {
              activity: "Ingest and Process",
              rate: `${logsPricing.ingestDduPerGb} DDU/GB`,
              rateRaw: logsPricing.ingestDduPerGb,
              volume: `${fmtNum(logsUsage.ingestGbPerDay)} GB/day`,
              volumeRaw: logsUsage.ingestGbPerDay,
              ddu: ingestDduDay,
            },
            {
              activity: "Retain",
              rate: `${logsPricing.retainDduPerGbDay} DDU/GB-day`,
              rateRaw: logsPricing.retainDduPerGbDay,
              volume: `${fmtNum(logsUsage.retainGbPerDay)} GB/day`,
              volumeRaw: logsUsage.retainGbPerDay,
              ddu: retainDduDay,
            },
            {
              activity: "Query",
              rate: `${logsPricing.queryDduPerGbScanned} DDU/GB scanned`,
              rateRaw: logsPricing.queryDduPerGbScanned,
              volume: `${fmtNum(logsUsage.queryGbScannedPerDay)} GB/day`,
              volumeRaw: logsUsage.queryGbScannedPerDay,
              ddu: queryDduDay,
            },
          ]}
          rowKey={(r: any) => r.activity}
          defaultSortKey="ddu"
          defaultSortDir="desc"
          maxHeight={260}
        />
      </Card>
    </div>
  );
};

const LogsForecast: React.FC<Props> = ({ timeframe }) => {
  const { logsPricing, logsUsage } = useSettings();
  const days = Math.max(7, Math.round(timeframeDays(timeframe)));

  const [horizonDays, setHorizonDays] = useState(30);
  const [ingestGrowthPct, setIngestGrowthPct] = useState(2);
  const [retainGrowthPct, setRetainGrowthPct] = useState(1);
  const [queryGrowthPct, setQueryGrowthPct] = useState(3);

  const ingestBase = logsUsage.ingestGbPerDay * logsPricing.ingestDduPerGb;
  const retainBase = logsUsage.retainGbPerDay * logsPricing.retainDduPerGbDay;
  const queryBase = logsUsage.queryGbScannedPerDay * logsPricing.queryDduPerGbScanned;

  const ingestHist = buildHistorySeries(ingestBase, days, ingestGrowthPct);
  const retainHist = buildHistorySeries(retainBase, days, retainGrowthPct);
  const queryHist = buildHistorySeries(queryBase, days, queryGrowthPct);
  const totalHist = ingestHist.map((v, i) => v + retainHist[i] + queryHist[i]);

  const ingestFc = buildForecastSeries(ingestBase, horizonDays, ingestGrowthPct);
  const retainFc = buildForecastSeries(retainBase, horizonDays, retainGrowthPct);
  const queryFc = buildForecastSeries(queryBase, horizonDays, queryGrowthPct);
  const totalFc = ingestFc.map((v, i) => v + retainFc[i] + queryFc[i]);

  const currentDaily = totalHist[totalHist.length - 1] ?? 0;
  const projectedDaily = totalFc[totalFc.length - 1] ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
          <label style={labelStyle}>Forecast horizon (days)
            <input type="number" min={7} max={365} value={horizonDays} onChange={(e) => setHorizonDays(clamp(Number(e.target.value), 7, 365, 30))} style={inputStyle} />
          </label>
          <label style={labelStyle}>Ingest monthly growth (%)
            <input type="number" step="0.1" value={ingestGrowthPct} onChange={(e) => setIngestGrowthPct(Number(e.target.value))} style={inputStyle} />
          </label>
          <label style={labelStyle}>Retain monthly growth (%)
            <input type="number" step="0.1" value={retainGrowthPct} onChange={(e) => setRetainGrowthPct(Number(e.target.value))} style={inputStyle} />
          </label>
          <label style={labelStyle}>Query monthly growth (%)
            <input type="number" step="0.1" value={queryGrowthPct} onChange={(e) => setQueryGrowthPct(Number(e.target.value))} style={inputStyle} />
          </label>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <Stat label="Current DDU/day" value={fmtNum(currentDaily)} />
        <Stat label={`Projected DDU/day (+${horizonDays}d)`} value={fmtNum(projectedDaily)} />
        <Stat label="Current monthly run-rate" value={fmtNum(currentDaily * 30)} />
        <Stat label={`Projected monthly (+${horizonDays}d)`} value={fmtNum(projectedDaily * 30)} />
      </div>

      <Card title="Logs DDU Forecast">
        <LineChart history={totalHist} forecast={totalFc} historyPortion={0.72} yLabel="DDU / day" />
      </Card>

      <Card title="Component Contribution in Forecast Window">
        <BarList
          rows={[
            { label: "Ingest and Process", value: ingestFc.reduce((a, b) => a + b, 0) },
            { label: "Retain", value: retainFc.reduce((a, b) => a + b, 0) },
            { label: "Query", value: queryFc.reduce((a, b) => a + b, 0) },
          ].map((r, _i, arr) => {
            const total = arr.reduce((a, b) => a + b.value, 0);
            return { ...r, pct: total > 0 ? (r.value / total) * 100 : 0 };
          })}
          valueFmt={(v) => `${fmtNum(v)} DDU`}
        />
      </Card>
    </div>
  );
};

const LogsOptimize: React.FC<Props> = ({ timeframe }) => {
  const { logsPricing, logsUsage, businessAssumptions } = useSettings();
  const days = Math.max(1, timeframeDays(timeframe));

  const [ingestReductionPct, setIngestReductionPct] = useState(15);
  const [retainReductionPct, setRetainReductionPct] = useState(10);
  const [queryReductionPct, setQueryReductionPct] = useState(20);
  const [ingestExpansionPct, setIngestExpansionPct] = useState(50);
  const [retainExpansionPct, setRetainExpansionPct] = useState(35);
  const [queryExpansionPct, setQueryExpansionPct] = useState(60);
  const [showBizJustification, setShowBizJustification] = useState(false);

  const current = {
    ingest: logsUsage.ingestGbPerDay * logsPricing.ingestDduPerGb,
    retain: logsUsage.retainGbPerDay * logsPricing.retainDduPerGbDay,
    query: logsUsage.queryGbScannedPerDay * logsPricing.queryDduPerGbScanned,
  };
  const optimized = {
    ingest: current.ingest * (1 - ingestReductionPct / 100),
    retain: current.retain * (1 - retainReductionPct / 100),
    query: current.query * (1 - queryReductionPct / 100),
  };

  const currentTotal = current.ingest + current.retain + current.query;
  const optimizedTotal = optimized.ingest + optimized.retain + optimized.query;
  const dduSavedDaily = currentTotal - optimizedTotal;
  const expanded = {
    ingest: current.ingest * (1 + ingestExpansionPct / 100),
    retain: current.retain * (1 + retainExpansionPct / 100),
    query: current.query * (1 + queryExpansionPct / 100),
  };
  const expandedTotal = expanded.ingest + expanded.retain + expanded.query;
  const dduAddedDaily = expandedTotal - currentTotal;

  const logsBiz = useMemo(() => {
    const expansionFactor = 1 + (ingestExpansionPct + queryExpansionPct) / 200;
    const searchCoverageBefore = 68;
    const searchCoverageAfter = Math.min(96, searchCoverageBefore + Math.log2(expansionFactor + 1) * 15);
    const mttrBeforeMin = businessAssumptions.logsMttrBaselineMin;
    const mttrAfterMin = Math.max(42, mttrBeforeMin * (1 - Math.min(0.52, (searchCoverageAfter - searchCoverageBefore) / 100)));
    const falseNegativeBefore = 16;
    const falseNegativeAfter = Math.max(4, falseNegativeBefore * (1 - (searchCoverageAfter - searchCoverageBefore) / 100));
    const incidentsPerMonth = businessAssumptions.logsIncidentsPerMonth;
    const serviceHrsSaved = ((mttrBeforeMin - mttrAfterMin) / 60) * incidentsPerMonth;
    const secInvestigationsPerMonth = businessAssumptions.logsSecurityInvestigationsPerMonth;
    const secHoursSaved = secInvestigationsPerMonth * 1.8;
    const avoidedSlaRiskMonthly = serviceHrsSaved * businessAssumptions.incidentCostPerHourUSD;
    const productivityValueMonthly = secHoursSaved * businessAssumptions.engineerHourlyCostUSD;
    const monthlyBenefit = avoidedSlaRiskMonthly + productivityValueMonthly;
    return {
      searchCoverageBefore,
      searchCoverageAfter,
      mttrBeforeMin,
      mttrAfterMin,
      falseNegativeBefore,
      falseNegativeAfter,
      incidentsPerMonth,
      serviceHrsSaved,
      secInvestigationsPerMonth,
      secHoursSaved,
      avoidedSlaRiskMonthly,
      productivityValueMonthly,
      monthlyBenefit,
    };
  }, [ingestExpansionPct, queryExpansionPct, businessAssumptions]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card title="Reduction Scenario">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          <label style={labelStyle}>Ingest reduction (%)
            <input type="number" min={0} max={100} step="1" value={ingestReductionPct} onChange={(e) => setIngestReductionPct(clamp(Number(e.target.value), 0, 100, 15))} style={inputStyle} />
          </label>
          <label style={labelStyle}>Retain reduction (%)
            <input type="number" min={0} max={100} step="1" value={retainReductionPct} onChange={(e) => setRetainReductionPct(clamp(Number(e.target.value), 0, 100, 10))} style={inputStyle} />
          </label>
          <label style={labelStyle}>Query scan reduction (%)
            <input type="number" min={0} max={100} step="1" value={queryReductionPct} onChange={(e) => setQueryReductionPct(clamp(Number(e.target.value), 0, 100, 20))} style={inputStyle} />
          </label>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <Stat label="Current DDU/day" value={fmtNum(currentTotal)} />
        <Stat label="Optimized DDU/day" value={fmtNum(optimizedTotal)} />
        <Stat label="DDU saved/day" value={fmtNum(dduSavedDaily)} />
        <Stat label={`DDU saved (${Math.round(days)}d)`} value={fmtNum(dduSavedDaily * days)} />
      </div>

      <Card title="Savings by Capability">
        <SortableTable
          columns={[
            { key: "cap", header: "Capability", render: (r: any) => r.capability, sortValue: (r: any) => r.capability },
            { key: "now", header: "Current DDU/day", align: "right", render: (r: any) => fmtNum(r.current), sortValue: (r: any) => r.current },
            { key: "new", header: "Optimized DDU/day", align: "right", render: (r: any) => fmtNum(r.optimized), sortValue: (r: any) => r.optimized },
            { key: "save", header: "Saved DDU/day", align: "right", render: (r: any) => fmtNum(r.saved), sortValue: (r: any) => r.saved },
          ]}
          data={[
            { capability: "Ingest and Process", current: current.ingest, optimized: optimized.ingest, saved: current.ingest - optimized.ingest },
            { capability: "Retain", current: current.retain, optimized: optimized.retain, saved: current.retain - optimized.retain },
            { capability: "Query", current: current.query, optimized: optimized.query, saved: current.query - optimized.query },
          ]}
          rowKey={(r: any) => r.capability}
          defaultSortKey="save"
          defaultSortDir="desc"
          maxHeight={260}
        />
      </Card>

      <Card title="Expansion Scenario">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          <label style={labelStyle}>Ingest increase (%)
            <input type="number" min={0} max={1000} step="1" value={ingestExpansionPct} onChange={(e) => setIngestExpansionPct(clamp(Number(e.target.value), 0, 1000, 50))} style={inputStyle} />
          </label>
          <label style={labelStyle}>Retain increase (%)
            <input type="number" min={0} max={1000} step="1" value={retainExpansionPct} onChange={(e) => setRetainExpansionPct(clamp(Number(e.target.value), 0, 1000, 35))} style={inputStyle} />
          </label>
          <label style={labelStyle}>Query scan increase (%)
            <input type="number" min={0} max={1000} step="1" value={queryExpansionPct} onChange={(e) => setQueryExpansionPct(clamp(Number(e.target.value), 0, 1000, 60))} style={inputStyle} />
          </label>
        </div>

        <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
          <button onClick={() => setShowBizJustification((s) => !s)} style={btnSec}>
            {showBizJustification ? "Hide Business Justification" : "Business Justification"}
          </button>
        </div>

        {showBizJustification && (
          <BusinessJustificationPanel
            scenarioName={`Logs expansion ingest +${ingestExpansionPct}% / query +${queryExpansionPct}%`}
            summary="Logs expansion often pays back through faster fault isolation, better forensic continuity, and lower uncertainty during customer-impact incidents and audits."
            keyMetrics={[
              { label: "Search Coverage", value: `${logsBiz.searchCoverageBefore.toFixed(0)}% -> ${logsBiz.searchCoverageAfter.toFixed(0)}%`, note: "fewer blind spots" },
              { label: "MTTR", value: `${logsBiz.mttrBeforeMin.toFixed(0)}m -> ${logsBiz.mttrAfterMin.toFixed(0)}m`, note: `${((1 - logsBiz.mttrAfterMin / logsBiz.mttrBeforeMin) * 100).toFixed(1)}% faster` },
              { label: "False-Negative Rate", value: `${logsBiz.falseNegativeBefore.toFixed(0)}% -> ${logsBiz.falseNegativeAfter.toFixed(0)}%`, note: "better signal confidence" },
              { label: "Service Hours Restored", value: `${logsBiz.serviceHrsSaved.toFixed(1)}h/mo`, note: `${logsBiz.incidentsPerMonth} incidents modeled` },
              { label: "Security Investigation Time Saved", value: `${logsBiz.secHoursSaved.toFixed(1)}h/mo`, note: `${logsBiz.secInvestigationsPerMonth} investigations modeled` },
              { label: "Estimated Monthly Benefit", value: fmtUSD(logsBiz.monthlyBenefit), note: "modeled business impact" },
            ]}
            analysis={[
              `1) Incident response: ${logsBiz.serviceHrsSaved.toFixed(1)} service-hours/month recovered via stronger log completeness and query breadth.`,
              `2) Operational confidence: False-negative risk drops by ${(logsBiz.falseNegativeBefore - logsBiz.falseNegativeAfter).toFixed(1)} points, reducing escaped incidents.`,
              `3) Security and compliance: Faster evidence retrieval shortens investigation cycles by ${logsBiz.secHoursSaved.toFixed(1)} hours/month.`,
              `4) Customer impact reduction: Lower mean outage duration improves SLA performance and lowers churn risk for high-value tenants.`,
              `5) Root-cause certainty: Denser log context improves correlation with traces/metrics and reduces rework during postmortems.`,
              `6) Decision aid: Expansion is strategically strong where support queues, incident volume, or audit obligations are growing.`
            ]}
            assumptions={[
              `Incident baseline: ${logsBiz.incidentsPerMonth.toFixed(0)} incidents/month`,
              `Security baseline: ${logsBiz.secInvestigationsPerMonth.toFixed(0)} investigations/month`,
              `Avoided impact rate: ${fmtUSD(businessAssumptions.incidentCostPerHourUSD)}/service-hour`,
              `Engineer hourly rate: ${fmtUSD(businessAssumptions.engineerHourlyCostUSD)}/hour`
            ]}
          />
        )}
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <Stat label="Current DDU/day" value={fmtNum(currentTotal)} />
        <Stat label="Expanded DDU/day" value={fmtNum(expandedTotal)} />
        <Stat label="Additional DDU/day" value={fmtNum(dduAddedDaily)} />
        <Stat label={`Additional DDU (${Math.round(days)}d)`} value={fmtNum(dduAddedDaily * days)} />
      </div>

      <Card title="Additional Load by Capability">
        <SortableTable
          columns={[
            { key: "cap", header: "Capability", render: (r: any) => r.capability, sortValue: (r: any) => r.capability },
            { key: "now", header: "Current DDU/day", align: "right", render: (r: any) => fmtNum(r.current), sortValue: (r: any) => r.current },
            { key: "new", header: "Expanded DDU/day", align: "right", render: (r: any) => fmtNum(r.expanded), sortValue: (r: any) => r.expanded },
            { key: "add", header: "Additional DDU/day", align: "right", render: (r: any) => fmtNum(r.added), sortValue: (r: any) => r.added },
          ]}
          data={[
            { capability: "Ingest and Process", current: current.ingest, expanded: expanded.ingest, added: expanded.ingest - current.ingest },
            { capability: "Retain", current: current.retain, expanded: expanded.retain, added: expanded.retain - current.retain },
            { capability: "Query", current: current.query, expanded: expanded.query, added: expanded.query - current.query },
          ]}
          rowKey={(r: any) => r.capability}
          defaultSortKey="add"
          defaultSortDir="desc"
          maxHeight={260}
        />
      </Card>
    </div>
  );
};

function buildForecastSeries(currentValue: number, days: number, monthlyGrowthPct: number): number[] {
  const dailyFactor = Math.pow(1 + monthlyGrowthPct / 100, 1 / 30);
  const out: number[] = [];
  for (let i = 1; i <= days; i++) out.push(currentValue * Math.pow(dailyFactor, i));
  return out;
}

function buildHistorySeries(currentValue: number, days: number, monthlyGrowthPct: number): number[] {
  const dailyFactor = Math.pow(1 + monthlyGrowthPct / 100, 1 / 30);
  const out: number[] = [];
  for (let i = days - 1; i >= 0; i--) out.push(currentValue / Math.pow(dailyFactor, i));
  return out;
}

function clamp(v: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, Math.round(v)));
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

const btnSec: React.CSSProperties = {
  padding: "6px 12px",
  background: "transparent",
  border: "1px solid rgba(128,128,128,0.4)",
  borderRadius: 4,
  color: "inherit",
  cursor: "pointer",
  fontSize: 12,
};
