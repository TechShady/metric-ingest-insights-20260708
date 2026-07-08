import React, { useState } from "react";
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

const FULL_STACK_CAPTURE_DASHBOARD_URL = "https://guu84124.apps.dynatrace.com/ui/apps/dynatrace.dashboards/dashboard/dynatrace.distributedtracing.full-stack-atm-and-trace-capture#from=now%28%29-7d&to=now%28%29&vfilter_CalculatorExtraIngestFactor=1.0&vfilter_CurrentExtraIngestFactor=2";
const TRACE_USAGE_DASHBOARD_URL = "https://guu84124.apps.dynatrace.com/ui/apps/dynatrace.dashboards/dashboard/dynatrace.distributedtracing.usage-traces#vfilter_Application=3420b2ac-f1cf-4b24-b62d-61ba1ba8ed05*&vfilter_User=3420b2ac-f1cf-4b24-b62d-61ba1ba8ed05*&from=now%28%29-2h&to=now%28%29";

type TracesSubTab = "overview" | "forecast" | "optimize" | "captureDash" | "usageDash";

export const TracesPage: React.FC<Props> = ({ timeframe }) => {
  const [tab, setTab] = useState<TracesSubTab>("overview");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid rgba(128,128,128,0.3)", flexWrap: "wrap" }}>
        {[
          { id: "overview", label: "Overview" },
          { id: "forecast", label: "Forecast" },
          { id: "optimize", label: "Optimize" },
          { id: "captureDash", label: "Capture Insights" },
          { id: "usageDash", label: "Usage Insights" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as TracesSubTab)}
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
      {tab === "overview" && <TracesOverview timeframe={timeframe} />}
      {tab === "forecast" && <TracesForecast timeframe={timeframe} />}
      {tab === "optimize" && <TracesOptimize timeframe={timeframe} />}
      {tab === "captureDash" && <TracesCaptureInsights timeframe={timeframe} />}
      {tab === "usageDash" && <TracesUsageInsights timeframe={timeframe} />}
    </div>
  );
};

const TracesCaptureInsights: React.FC<Props> = ({ timeframe }) => {
  const { tracesPricing, tracesUsage, businessAssumptions } = useSettings();
  const [calculatorExtraIngestFactor, setCalculatorExtraIngestFactor] = useState(1);
  const [currentExtraIngestFactor, setCurrentExtraIngestFactor] = useState(2);

  const baselineSamplingPct = businessAssumptions.currentTraceSamplingPct;
  const projectedSamplingPct = Math.min(100, baselineSamplingPct * currentExtraIngestFactor);
  const baselineIngestGiB = tracesUsage.ingestGiBPerDay;
  const projectedIngestGiB = baselineIngestGiB * currentExtraIngestFactor;
  const extraIngestGiB = Math.max(0, projectedIngestGiB - baselineIngestGiB);
  const extraIngestUsdDaily = extraIngestGiB * tracesPricing.ingestUsdPerGiB;
  const calculatorProjectedIngestGiB = baselineIngestGiB * calculatorExtraIngestFactor;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card title="Dashboard 1: Full-Stack ATM and Trace Capture">
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontSize: 12, opacity: 0.78 }}>
            This sub-tab mirrors the core calculator intent from the Full-Stack ATM + trace capture dashboard, using your configured traces economics as the local what-if model.
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <a href={FULL_STACK_CAPTURE_DASHBOARD_URL} target="_blank" rel="noreferrer" style={linkBtn}>Open Dynatrace Dashboard</a>
          </div>
        </div>
      </Card>

      <Card title="Capture Factor Controls (Dashboard Variable Mirror)">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          <label style={labelStyle}>Calculator extra ingest factor
            <input
              type="number"
              min={0.1}
              max={10}
              step="0.1"
              value={calculatorExtraIngestFactor}
              onChange={(e) => setCalculatorExtraIngestFactor(clampFloat(Number(e.target.value), 0.1, 10, 1))}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>Current extra ingest factor
            <input
              type="number"
              min={0.1}
              max={10}
              step="0.1"
              value={currentExtraIngestFactor}
              onChange={(e) => setCurrentExtraIngestFactor(clampFloat(Number(e.target.value), 0.1, 10, 2))}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>Timeframe context
            <input type="text" readOnly value={timeframe} style={{ ...inputStyle, opacity: 0.75 }} />
          </label>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <Stat label="Baseline sampling" value={`${baselineSamplingPct.toFixed(0)}%`} />
        <Stat label="Projected sampling" value={`${projectedSamplingPct.toFixed(0)}%`} />
        <Stat label="Extra ingest" value={`${fmtNum(extraIngestGiB)} GiB/day`} />
        <Stat label="Extra ingest cost/day" value={fmtUSD(extraIngestUsdDaily)} />
      </div>

      <Card title="Capture Uplift Summary">
        <SortableTable
          columns={[
            { key: "metric", header: "Metric", render: (r: any) => r.metric, sortValue: (r: any) => r.metric },
            { key: "baseline", header: "Baseline", align: "right", render: (r: any) => r.baseline, sortValue: (r: any) => r.baselineRaw },
            { key: "scenario", header: "Current factor scenario", align: "right", render: (r: any) => r.scenario, sortValue: (r: any) => r.scenarioRaw },
            { key: "calc", header: "Calculator factor scenario", align: "right", render: (r: any) => r.calc, sortValue: (r: any) => r.calcRaw },
          ]}
          data={[
            {
              metric: "Ingest volume",
              baseline: `${fmtNum(baselineIngestGiB)} GiB/day`,
              baselineRaw: baselineIngestGiB,
              scenario: `${fmtNum(projectedIngestGiB)} GiB/day`,
              scenarioRaw: projectedIngestGiB,
              calc: `${fmtNum(calculatorProjectedIngestGiB)} GiB/day`,
              calcRaw: calculatorProjectedIngestGiB,
            },
            {
              metric: "Trace completeness proxy",
              baseline: `${baselineSamplingPct.toFixed(0)}%`,
              baselineRaw: baselineSamplingPct,
              scenario: `${projectedSamplingPct.toFixed(0)}%`,
              scenarioRaw: projectedSamplingPct,
              calc: `${Math.min(100, baselineSamplingPct * calculatorExtraIngestFactor).toFixed(0)}%`,
              calcRaw: Math.min(100, baselineSamplingPct * calculatorExtraIngestFactor),
            },
            {
              metric: "Ingest cost/day",
              baseline: fmtUSD(baselineIngestGiB * tracesPricing.ingestUsdPerGiB),
              baselineRaw: baselineIngestGiB * tracesPricing.ingestUsdPerGiB,
              scenario: fmtUSD(projectedIngestGiB * tracesPricing.ingestUsdPerGiB),
              scenarioRaw: projectedIngestGiB * tracesPricing.ingestUsdPerGiB,
              calc: fmtUSD(calculatorProjectedIngestGiB * tracesPricing.ingestUsdPerGiB),
              calcRaw: calculatorProjectedIngestGiB * tracesPricing.ingestUsdPerGiB,
            },
          ]}
          rowKey={(r: any) => r.metric}
          defaultSortKey="scenario"
          defaultSortDir="desc"
          maxHeight={260}
        />
      </Card>
    </div>
  );
};

const TracesUsageInsights: React.FC<Props> = ({ timeframe }) => {
  const { tracesPricing, tracesUsage } = useSettings();
  const days = Math.max(1, timeframeDays(timeframe));

  const ingestDaily = tracesUsage.ingestGiBPerDay;
  const retainDaily = tracesUsage.retainGiBPerDay;
  const queryDaily = tracesUsage.queryGiBScannedPerDay;

  const ingestMonthlyCost = ingestDaily * tracesPricing.ingestUsdPerGiB * 30;
  const retainMonthlyCost = retainDaily * tracesPricing.retainUsdPerGiBDay * 30;
  const queryMonthlyCost = queryDaily * tracesPricing.queryUsdPerGiBScanned * 30;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card title="Dashboard 2: Usage Traces (Application/User)">
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontSize: 12, opacity: 0.78 }}>
            This sub-tab provides an in-app usage summary and a direct jump to the Usage Traces dashboard for the detailed Application/User breakdown.
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <a href={TRACE_USAGE_DASHBOARD_URL} target="_blank" rel="noreferrer" style={linkBtn}>Open Dynatrace Usage Dashboard</a>
          </div>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <Stat label="Configured ingest" value={`${fmtNum(ingestDaily)} GiB/day`} />
        <Stat label="Configured retain" value={`${fmtNum(retainDaily)} GiB/day`} />
        <Stat label="Configured query scan" value={`${fmtNum(queryDaily)} GiB/day`} />
        <Stat label={`Configured usage over ${Math.round(days)}d`} value={`${fmtNum((ingestDaily + retainDaily + queryDaily) * days)} GiB`} />
      </div>

      <Card title="Usage and Cost Footprint (Local Model)">
        <SortableTable
          columns={[
            { key: "cap", header: "Capability", render: (r: any) => r.cap, sortValue: (r: any) => r.cap },
            { key: "volume", header: "Volume/day", align: "right", render: (r: any) => r.volume, sortValue: (r: any) => r.volumeRaw },
            { key: "rate", header: "Rate", align: "right", render: (r: any) => r.rate, sortValue: (r: any) => r.rateRaw },
            { key: "monthly", header: "Monthly cost", align: "right", render: (r: any) => r.monthly, sortValue: (r: any) => r.monthlyRaw },
          ]}
          data={[
            {
              cap: "Ingest",
              volume: `${fmtNum(ingestDaily)} GiB/day`,
              volumeRaw: ingestDaily,
              rate: `${fmtUSD(tracesPricing.ingestUsdPerGiB)}/GiB`,
              rateRaw: tracesPricing.ingestUsdPerGiB,
              monthly: fmtUSD(ingestMonthlyCost),
              monthlyRaw: ingestMonthlyCost,
            },
            {
              cap: "Retain",
              volume: `${fmtNum(retainDaily)} GiB/day`,
              volumeRaw: retainDaily,
              rate: `${fmtUSD(tracesPricing.retainUsdPerGiBDay)}/GiB-day`,
              rateRaw: tracesPricing.retainUsdPerGiBDay,
              monthly: fmtUSD(retainMonthlyCost),
              monthlyRaw: retainMonthlyCost,
            },
            {
              cap: "Query",
              volume: `${fmtNum(queryDaily)} GiB/day`,
              volumeRaw: queryDaily,
              rate: `${fmtUSD(tracesPricing.queryUsdPerGiBScanned)}/GiB scanned`,
              rateRaw: tracesPricing.queryUsdPerGiBScanned,
              monthly: fmtUSD(queryMonthlyCost),
              monthlyRaw: queryMonthlyCost,
            },
          ]}
          rowKey={(r: any) => r.cap}
          defaultSortKey="monthly"
          defaultSortDir="desc"
          maxHeight={260}
        />
      </Card>
    </div>
  );
};

const TracesOverview: React.FC<Props> = ({ timeframe }) => {
  const { tracesPricing, tracesUsage } = useSettings();
  const days = Math.max(1, timeframeDays(timeframe));

  const ingestUsdDay = tracesUsage.ingestGiBPerDay * tracesPricing.ingestUsdPerGiB;
  const retainUsdDay = tracesUsage.retainGiBPerDay * tracesPricing.retainUsdPerGiBDay;
  const queryUsdDay = tracesUsage.queryGiBScannedPerDay * tracesPricing.queryUsdPerGiBScanned;
  const totalUsdDay = ingestUsdDay + retainUsdDay + queryUsdDay;

  const rows = [
    { label: "Ingest and Process", value: ingestUsdDay },
    { label: "Retain", value: retainUsdDay },
    { label: "Query", value: queryUsdDay },
  ];
  const total = rows.reduce((a, b) => a + b.value, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <Stat label="Total traces cost/day" value={fmtUSD(totalUsdDay)} />
        <Stat label={`Cost in selected timeframe (${Math.round(days)}d)`} value={fmtUSD(totalUsdDay * days)} />
        <Stat label="Monthly run-rate" value={fmtUSD(totalUsdDay * 30)} />
        <Stat label="Annual run-rate" value={fmtUSD(totalUsdDay * 365)} />
      </div>

      <Card title="Traces Cost Drivers">
        <BarList
          rows={rows.map((r) => ({ label: r.label, value: r.value, pct: total > 0 ? (r.value / total) * 100 : 0 }))}
          valueFmt={(v) => `${fmtUSD(v)}/day`}
        />
      </Card>

      <Card title="Unit Economics">
        <SortableTable
          columns={[
            { key: "activity", header: "Capability", render: (r: any) => r.activity, sortValue: (r: any) => r.activity },
            { key: "rate", header: "Rate", align: "right", render: (r: any) => r.rate, sortValue: (r: any) => r.rateRaw },
            { key: "volume", header: "Configured daily volume", align: "right", render: (r: any) => r.volume, sortValue: (r: any) => r.volumeRaw },
            { key: "usd", header: "USD/day", align: "right", render: (r: any) => fmtUSD(r.usd), sortValue: (r: any) => r.usd },
          ]}
          data={[
            {
              activity: "Ingest and Process",
              rate: `${fmtUSD(tracesPricing.ingestUsdPerGiB)}/GiB`,
              rateRaw: tracesPricing.ingestUsdPerGiB,
              volume: `${fmtNum(tracesUsage.ingestGiBPerDay)} GiB/day`,
              volumeRaw: tracesUsage.ingestGiBPerDay,
              usd: ingestUsdDay,
            },
            {
              activity: "Retain",
              rate: `${fmtUSD(tracesPricing.retainUsdPerGiBDay)}/GiB-day`,
              rateRaw: tracesPricing.retainUsdPerGiBDay,
              volume: `${fmtNum(tracesUsage.retainGiBPerDay)} GiB/day`,
              volumeRaw: tracesUsage.retainGiBPerDay,
              usd: retainUsdDay,
            },
            {
              activity: "Query",
              rate: `${fmtUSD(tracesPricing.queryUsdPerGiBScanned)}/GiB scanned`,
              rateRaw: tracesPricing.queryUsdPerGiBScanned,
              volume: `${fmtNum(tracesUsage.queryGiBScannedPerDay)} GiB/day`,
              volumeRaw: tracesUsage.queryGiBScannedPerDay,
              usd: queryUsdDay,
            },
          ]}
          rowKey={(r: any) => r.activity}
          defaultSortKey="usd"
          defaultSortDir="desc"
          maxHeight={260}
        />
      </Card>
    </div>
  );
};

const TracesForecast: React.FC<Props> = ({ timeframe }) => {
  const { tracesPricing, tracesUsage } = useSettings();
  const days = Math.max(7, Math.round(timeframeDays(timeframe)));

  const [horizonDays, setHorizonDays] = useState(30);
  const [ingestGrowthPct, setIngestGrowthPct] = useState(2);
  const [retainGrowthPct, setRetainGrowthPct] = useState(1);
  const [queryGrowthPct, setQueryGrowthPct] = useState(4);

  const ingestBase = tracesUsage.ingestGiBPerDay * tracesPricing.ingestUsdPerGiB;
  const retainBase = tracesUsage.retainGiBPerDay * tracesPricing.retainUsdPerGiBDay;
  const queryBase = tracesUsage.queryGiBScannedPerDay * tracesPricing.queryUsdPerGiBScanned;

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
        <Stat label="Current cost/day" value={fmtUSD(currentDaily)} />
        <Stat label={`Projected cost/day (+${horizonDays}d)`} value={fmtUSD(projectedDaily)} />
        <Stat label="Current monthly run-rate" value={fmtUSD(currentDaily * 30)} />
        <Stat label={`Projected monthly (+${horizonDays}d)`} value={fmtUSD(projectedDaily * 30)} />
      </div>

      <Card title="Traces Cost Forecast">
        <LineChart history={totalHist} forecast={totalFc} historyPortion={0.72} yLabel="USD / day" />
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
          valueFmt={(v) => fmtUSD(v)}
        />
      </Card>
    </div>
  );
};

const TracesOptimize: React.FC<Props> = ({ timeframe }) => {
  const { tracesPricing, tracesUsage, businessAssumptions } = useSettings();
  const days = Math.max(1, timeframeDays(timeframe));

  const [ingestReductionPct, setIngestReductionPct] = useState(12);
  const [retainReductionPct, setRetainReductionPct] = useState(8);
  const [queryReductionPct, setQueryReductionPct] = useState(18);
  const [ingestExpansionPct, setIngestExpansionPct] = useState(50);
  const [retainExpansionPct, setRetainExpansionPct] = useState(35);
  const [queryExpansionPct, setQueryExpansionPct] = useState(60);
  const [samplingProfile, setSamplingProfile] = useState("custom");
  const [showBizJustification, setShowBizJustification] = useState(false);

  const current = {
    ingest: tracesUsage.ingestGiBPerDay * tracesPricing.ingestUsdPerGiB,
    retain: tracesUsage.retainGiBPerDay * tracesPricing.retainUsdPerGiBDay,
    query: tracesUsage.queryGiBScannedPerDay * tracesPricing.queryUsdPerGiBScanned,
  };
  const optimized = {
    ingest: current.ingest * (1 - ingestReductionPct / 100),
    retain: current.retain * (1 - retainReductionPct / 100),
    query: current.query * (1 - queryReductionPct / 100),
  };

  const currentTotal = current.ingest + current.retain + current.query;
  const optimizedTotal = optimized.ingest + optimized.retain + optimized.query;
  const usdSavedDaily = currentTotal - optimizedTotal;
  const expanded = {
    ingest: current.ingest * (1 + ingestExpansionPct / 100),
    retain: current.retain * (1 + retainExpansionPct / 100),
    query: current.query * (1 + queryExpansionPct / 100),
  };
  const expandedTotal = expanded.ingest + expanded.retain + expanded.query;
  const usdAddedDaily = expandedTotal - currentTotal;

  const currentSamplingPct = businessAssumptions.currentTraceSamplingPct;
  const projectedSamplingPct = Math.min(100, currentSamplingPct * (1 + ingestExpansionPct / 100));
  const traceCompletenessBefore = currentSamplingPct;
  const traceCompletenessAfter = projectedSamplingPct;
  const mttrBeforeMin = businessAssumptions.tracesMttrBaselineMin;
  const mttrAfterMin = Math.max(28, mttrBeforeMin * (1 - ((traceCompletenessAfter - traceCompletenessBefore) / 100) * 0.65));
  const mttdBeforeMin = businessAssumptions.tracesMttdBaselineMin;
  const mttdAfterMin = Math.max(7, mttdBeforeMin * (1 - ((traceCompletenessAfter - traceCompletenessBefore) / 100) * 0.72));
  const p95RegressionsDetectedBefore = 63;
  const p95RegressionsDetectedAfter = Math.min(96, p95RegressionsDetectedBefore + (traceCompletenessAfter - traceCompletenessBefore) * 0.25);
  const highImpactIncidentsPerMonth = businessAssumptions.tracesIncidentsPerMonth;
  const serviceHrsSaved = ((mttrBeforeMin - mttrAfterMin) / 60) * highImpactIncidentsPerMonth;
  const avoidedImpactMonthly = serviceHrsSaved * businessAssumptions.incidentCostPerHourUSD;
  const engineerHrsSaved = serviceHrsSaved * 4.8;
  const productivityValueMonthly = engineerHrsSaved * businessAssumptions.engineerHourlyCostUSD;
  const monthlyBenefit = avoidedImpactMonthly + productivityValueMonthly;
  const addedMonthlyCost = usdAddedDaily * 30;
  const paybackMonths = addedMonthlyCost > 0 ? addedMonthlyCost / Math.max(1, monthlyBenefit) : 0;

  const applySamplingProfile = (profile: string) => {
    setSamplingProfile(profile);
    if (profile === "custom") return;
    const targetPct = Number(profile);
    const currentPct = businessAssumptions.currentTraceSamplingPct;
    const multiplier = targetPct / currentPct;
    const pctIncrease = Math.max(0, Math.round((multiplier - 1) * 100));

    // Sampling primarily affects ingest and query scanned volume.
    setIngestExpansionPct(pctIncrease);
    setQueryExpansionPct(pctIncrease);
    // Retention generally scales with ingest, but often slightly lower due to TTL/suppression.
    setRetainExpansionPct(Math.round(pctIncrease * 0.9));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card title="Reduction Scenario">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          <label style={labelStyle}>Ingest reduction (%)
            <input type="number" min={0} max={100} step="1" value={ingestReductionPct} onChange={(e) => setIngestReductionPct(clamp(Number(e.target.value), 0, 100, 12))} style={inputStyle} />
          </label>
          <label style={labelStyle}>Retain reduction (%)
            <input type="number" min={0} max={100} step="1" value={retainReductionPct} onChange={(e) => setRetainReductionPct(clamp(Number(e.target.value), 0, 100, 8))} style={inputStyle} />
          </label>
          <label style={labelStyle}>Query scan reduction (%)
            <input type="number" min={0} max={100} step="1" value={queryReductionPct} onChange={(e) => setQueryReductionPct(clamp(Number(e.target.value), 0, 100, 18))} style={inputStyle} />
          </label>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <Stat label="Current cost/day" value={fmtUSD(currentTotal)} />
        <Stat label="Optimized cost/day" value={fmtUSD(optimizedTotal)} />
        <Stat label="Savings/day" value={fmtUSD(usdSavedDaily)} />
        <Stat label={`Savings (${Math.round(days)}d)`} value={fmtUSD(usdSavedDaily * days)} />
      </div>

      <Card title="Savings by Capability">
        <SortableTable
          columns={[
            { key: "cap", header: "Capability", render: (r: any) => r.capability, sortValue: (r: any) => r.capability },
            { key: "now", header: "Current USD/day", align: "right", render: (r: any) => fmtUSD(r.current), sortValue: (r: any) => r.current },
            { key: "new", header: "Optimized USD/day", align: "right", render: (r: any) => fmtUSD(r.optimized), sortValue: (r: any) => r.optimized },
            { key: "save", header: "Saved USD/day", align: "right", render: (r: any) => fmtUSD(r.saved), sortValue: (r: any) => r.saved },
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
          <label style={labelStyle}>Trace sampling profile
            <select value={samplingProfile} onChange={(e) => applySamplingProfile(e.target.value)} style={inputStyle}>
              <option value="custom">Custom</option>
              <option value="10">10% (current baseline)</option>
              <option value="25">25%</option>
              <option value="50">50%</option>
              <option value="100">100%</option>
            </select>
          </label>
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
        <div style={{ marginTop: 8, fontSize: 11, opacity: 0.72 }}>
          Presets assume a current {currentSamplingPct.toFixed(0)}% trace sampling baseline. Example: 100% implies roughly +{Math.max(0, Math.round((100 / Math.max(1, currentSamplingPct) - 1) * 100))}% ingest/query expansion.
        </div>

        <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
          <button onClick={() => setShowBizJustification((s) => !s)} style={btnSec}>
            {showBizJustification ? "Hide Business Justification" : "Business Justification"}
          </button>
        </div>

        {showBizJustification && (
          <BusinessJustificationPanel
            scenarioName={`Trace sampling ${traceCompletenessBefore.toFixed(0)}% -> ${traceCompletenessAfter.toFixed(0)}%`}
            summary="Higher trace sampling improves transaction-path completeness, making cross-service root cause isolation faster and more reliable during customer-impact incidents."
            keyMetrics={[
              { label: "Trace Completeness", value: `${traceCompletenessBefore.toFixed(0)}% -> ${traceCompletenessAfter.toFixed(0)}%`, note: "request-path coverage" },
              { label: "MTTR", value: `${mttrBeforeMin.toFixed(0)}m -> ${mttrAfterMin.toFixed(0)}m`, note: `${((1 - mttrAfterMin / mttrBeforeMin) * 100).toFixed(1)}% faster` },
              { label: "MTTD", value: `${mttdBeforeMin.toFixed(0)}m -> ${mttdAfterMin.toFixed(0)}m`, note: "earlier anomaly recognition" },
              { label: "p95 Regression Detection", value: `${p95RegressionsDetectedBefore.toFixed(0)}% -> ${p95RegressionsDetectedAfter.toFixed(0)}%`, note: "more regressions caught early" },
              { label: "Monthly Benefit", value: fmtUSD(monthlyBenefit), note: `vs ${fmtUSD(addedMonthlyCost)}/mo added cost` },
              { label: "Payback", value: `${paybackMonths.toFixed(1)} months`, note: "estimated" },
            ]}
            analysis={[
              `1) Faster recovery: ${(mttrBeforeMin - mttrAfterMin).toFixed(1)} minutes less per major incident, restoring ${serviceHrsSaved.toFixed(1)} service-hours/month.`,
              `2) Faster detection: MTTD improves by ${(mttdBeforeMin - mttdAfterMin).toFixed(1)} minutes, reducing customer-visible error windows.`,
              `3) Better release safety: p95 regression detection improves by ${(p95RegressionsDetectedAfter - p95RegressionsDetectedBefore).toFixed(1)} points before broad blast radius.`,
              `4) Lower triage toil: ${engineerHrsSaved.toFixed(1)} engineer-hours/month recovered from fewer blind handoffs across teams.`,
              `5) Financial impact: Estimated avoided impact ${fmtUSD(avoidedImpactMonthly)}/month plus productivity benefit ${fmtUSD(productivityValueMonthly)}/month.`,
              `6) Executive framing: If you are increasing sampling to de-risk high-revenue workflows, this profile typically justifies itself when outage impact exceeds added trace cost.`
            ]}
            assumptions={[
              `Current sampling baseline: ${currentSamplingPct.toFixed(0)}%`,
              `Incident baseline: ${highImpactIncidentsPerMonth.toFixed(0)} high-impact incidents/month`,
              `Avoided impact rate: ${fmtUSD(businessAssumptions.incidentCostPerHourUSD)}/service-hour`,
              `Engineer hourly rate: ${fmtUSD(businessAssumptions.engineerHourlyCostUSD)}/hour`
            ]}
          />
        )}
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <Stat label="Current cost/day" value={fmtUSD(currentTotal)} />
        <Stat label="Expanded cost/day" value={fmtUSD(expandedTotal)} />
        <Stat label="Additional cost/day" value={fmtUSD(usdAddedDaily)} />
        <Stat label={`Additional cost (${Math.round(days)}d)`} value={fmtUSD(usdAddedDaily * days)} />
      </div>

      <Card title="Additional Cost by Capability">
        <SortableTable
          columns={[
            { key: "cap", header: "Capability", render: (r: any) => r.capability, sortValue: (r: any) => r.capability },
            { key: "now", header: "Current USD/day", align: "right", render: (r: any) => fmtUSD(r.current), sortValue: (r: any) => r.current },
            { key: "new", header: "Expanded USD/day", align: "right", render: (r: any) => fmtUSD(r.expanded), sortValue: (r: any) => r.expanded },
            { key: "add", header: "Additional USD/day", align: "right", render: (r: any) => fmtUSD(r.added), sortValue: (r: any) => r.added },
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

const btnSec: React.CSSProperties = {
  padding: "6px 12px",
  background: "transparent",
  border: "1px solid rgba(128,128,128,0.4)",
  borderRadius: 4,
  color: "inherit",
  cursor: "pointer",
  fontSize: 12,
};

const linkBtn: React.CSSProperties = {
  ...btnSec,
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};
