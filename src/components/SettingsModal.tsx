import React, { useState } from "react";
import { createPortal } from "react-dom";
import { useSettings } from "../state/SettingsContext";
import {
  DEFAULT_BUSINESS_ASSUMPTIONS,
  DEFAULT_LOGS_PRICING,
  DEFAULT_LOGS_USAGE,
  DEFAULT_RATE_CENTS_PER_DP,
  DEFAULT_TRACES_PRICING,
  DEFAULT_TRACES_USAGE,
} from "../lib/cost";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  background: "rgba(128,128,128,0.15)",
  border: "1px solid rgba(128,128,128,0.4)",
  borderRadius: 4,
  color: "inherit",
  fontSize: 13,
  boxSizing: "border-box",
};

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 10000,
};

const dialogStyle: React.CSSProperties = {
  background: "rgba(128,128,128,0.12)",
  border: "1px solid rgba(128,128,128,0.35)",
  borderRadius: 8,
  padding: 20,
  width: 900,
  maxWidth: "95vw",
  maxHeight: "90vh",
  overflowY: "auto",
  boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
  color: "inherit",
};

const btnStyle: React.CSSProperties = {
  padding: "6px 16px",
  borderRadius: 4,
  border: "1px solid rgba(128,128,128,0.45)",
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
  fontSize: 13,
};

export const SettingsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const {
    topN,
    setTopN,
    rateCentsPerDp,
    setRateCentsPerDp,
    monthlyBudgetUSD,
    setMonthlyBudgetUSD,
    logsPricing,
    setLogsPricing,
    logsUsage,
    setLogsUsage,
    tracesPricing,
    setTracesPricing,
    tracesUsage,
    setTracesUsage,
    businessAssumptions,
    setBusinessAssumptions,
  } = useSettings();

  const [localTopN, setLocalTopN] = useState(topN);
  const [localMetricRate, setLocalMetricRate] = useState(rateCentsPerDp);
  const [localBudget, setLocalBudget] = useState(monthlyBudgetUSD);
  const [localLogsPricing, setLocalLogsPricing] = useState(logsPricing);
  const [localLogsUsage, setLocalLogsUsage] = useState(logsUsage);
  const [localTracesPricing, setLocalTracesPricing] = useState(tracesPricing);
  const [localTracesUsage, setLocalTracesUsage] = useState(tracesUsage);
  const [localBusinessAssumptions, setLocalBusinessAssumptions] = useState(businessAssumptions);
  const [presetKey, setPresetKey] = useState<keyof typeof ASSUMPTION_PRESETS | "">("");

  const apply = () => {
    setTopN(clamp(localTopN, 1, 200, topN));
    setRateCentsPerDp(nonNeg(localMetricRate, rateCentsPerDp));
    setMonthlyBudgetUSD(nonNeg(localBudget, monthlyBudgetUSD));
    setLogsPricing({
      ingestDduPerGb: nonNeg(localLogsPricing.ingestDduPerGb, logsPricing.ingestDduPerGb),
      retainDduPerGbDay: nonNeg(localLogsPricing.retainDduPerGbDay, logsPricing.retainDduPerGbDay),
      queryDduPerGbScanned: nonNeg(localLogsPricing.queryDduPerGbScanned, logsPricing.queryDduPerGbScanned),
    });
    setLogsUsage({
      ingestGbPerDay: nonNeg(localLogsUsage.ingestGbPerDay, logsUsage.ingestGbPerDay),
      retainGbPerDay: nonNeg(localLogsUsage.retainGbPerDay, logsUsage.retainGbPerDay),
      queryGbScannedPerDay: nonNeg(localLogsUsage.queryGbScannedPerDay, logsUsage.queryGbScannedPerDay),
    });
    setTracesPricing({
      ingestUsdPerGiB: nonNeg(localTracesPricing.ingestUsdPerGiB, tracesPricing.ingestUsdPerGiB),
      retainUsdPerGiBDay: nonNeg(localTracesPricing.retainUsdPerGiBDay, tracesPricing.retainUsdPerGiBDay),
      queryUsdPerGiBScanned: nonNeg(localTracesPricing.queryUsdPerGiBScanned, tracesPricing.queryUsdPerGiBScanned),
    });
    setTracesUsage({
      ingestGiBPerDay: nonNeg(localTracesUsage.ingestGiBPerDay, tracesUsage.ingestGiBPerDay),
      retainGiBPerDay: nonNeg(localTracesUsage.retainGiBPerDay, tracesUsage.retainGiBPerDay),
      queryGiBScannedPerDay: nonNeg(localTracesUsage.queryGiBScannedPerDay, tracesUsage.queryGiBScannedPerDay),
    });
    setBusinessAssumptions({
      incidentCostPerHourUSD: nonNeg(localBusinessAssumptions.incidentCostPerHourUSD, businessAssumptions.incidentCostPerHourUSD),
      engineerHourlyCostUSD: nonNeg(localBusinessAssumptions.engineerHourlyCostUSD, businessAssumptions.engineerHourlyCostUSD),
      metricsIncidentsPerMonth: nonNeg(localBusinessAssumptions.metricsIncidentsPerMonth, businessAssumptions.metricsIncidentsPerMonth),
      metricsMttrBaselineMin: nonNeg(localBusinessAssumptions.metricsMttrBaselineMin, businessAssumptions.metricsMttrBaselineMin),
      metricsMttdBaselineMin: nonNeg(localBusinessAssumptions.metricsMttdBaselineMin, businessAssumptions.metricsMttdBaselineMin),
      logsIncidentsPerMonth: nonNeg(localBusinessAssumptions.logsIncidentsPerMonth, businessAssumptions.logsIncidentsPerMonth),
      logsSecurityInvestigationsPerMonth: nonNeg(localBusinessAssumptions.logsSecurityInvestigationsPerMonth, businessAssumptions.logsSecurityInvestigationsPerMonth),
      logsMttrBaselineMin: nonNeg(localBusinessAssumptions.logsMttrBaselineMin, businessAssumptions.logsMttrBaselineMin),
      tracesIncidentsPerMonth: nonNeg(localBusinessAssumptions.tracesIncidentsPerMonth, businessAssumptions.tracesIncidentsPerMonth),
      tracesMttrBaselineMin: nonNeg(localBusinessAssumptions.tracesMttrBaselineMin, businessAssumptions.tracesMttrBaselineMin),
      tracesMttdBaselineMin: nonNeg(localBusinessAssumptions.tracesMttdBaselineMin, businessAssumptions.tracesMttdBaselineMin),
      currentTraceSamplingPct: clamp(localBusinessAssumptions.currentTraceSamplingPct, 1, 100, businessAssumptions.currentTraceSamplingPct),
    });
    onClose();
  };

  const reset = () => {
    setLocalTopN(20);
    setLocalMetricRate(DEFAULT_RATE_CENTS_PER_DP);
    setLocalBudget(0);
    setLocalLogsPricing({ ...DEFAULT_LOGS_PRICING });
    setLocalLogsUsage({ ...DEFAULT_LOGS_USAGE });
    setLocalTracesPricing({ ...DEFAULT_TRACES_PRICING });
    setLocalTracesUsage({ ...DEFAULT_TRACES_USAGE });
    setLocalBusinessAssumptions({ ...DEFAULT_BUSINESS_ASSUMPTIONS });
  };

  return createPortal(
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={dialogStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Settings</h2>
          <button onClick={onClose} style={{ ...btnStyle, border: "none", fontSize: 18, padding: "2px 8px" }}>x</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Section title="Assumption Presets">
            <div style={{ ...grid3, alignItems: "end" }}>
              <Field label="Industry/workload preset" hint="Apply a profile to business justification assumptions.">
                <select value={presetKey} onChange={(e) => setPresetKey(e.target.value as keyof typeof ASSUMPTION_PRESETS | "")} style={inputStyle}>
                  <option value="">Select preset</option>
                  {Object.entries(ASSUMPTION_PRESETS).map(([k, p]) => (
                    <option key={k} value={k}>{p.label}</option>
                  ))}
                </select>
              </Field>
              <button
                style={{ ...btnStyle, height: 36 }}
                disabled={!presetKey}
                onClick={() => {
                  if (!presetKey) return;
                  setLocalBusinessAssumptions({ ...ASSUMPTION_PRESETS[presetKey].values });
                }}
              >
                Apply preset
              </button>
              <div style={{ fontSize: 11, opacity: 0.7 }}>
                Presets tune incident rates, MTTR/MTTD baselines, and financial impact multipliers.
              </div>
            </div>
          </Section>

          <Section title="Metrics">
            <div style={grid3}>
              <Field label="Top N metrics" hint="Used by Top N and cardinality trend views.">
                <input type="number" min={1} max={200} value={localTopN} onChange={(e) => setLocalTopN(Number(e.target.value))} style={inputStyle} />
              </Field>
              <Field label="Cost per datapoint (USD)" hint="Default 4.55e-7 = $45.50 per 100M datapoints.">
                <input type="number" step="any" value={localMetricRate} onChange={(e) => setLocalMetricRate(Number(e.target.value))} style={inputStyle} />
              </Field>
              <Field label="Monthly budget (USD)" hint="0 disables budget tracking.">
                <input type="number" min={0} step="any" value={localBudget} onChange={(e) => setLocalBudget(Number(e.target.value))} style={inputStyle} />
              </Field>
            </div>
          </Section>

          <Section title="Logs Pricing (DDU)">
            <div style={grid3}>
              <Field label="Ingest and Process (DDU/GB)" hint="List: 100 DDU per GB ingested.">
                <input type="number" min={0} step="any" value={localLogsPricing.ingestDduPerGb} onChange={(e) => setLocalLogsPricing((p) => ({ ...p, ingestDduPerGb: Number(e.target.value) }))} style={inputStyle} />
              </Field>
              <Field label="Retain (DDU/GB-day)" hint="List: 0.30 DDU per GB retained per day.">
                <input type="number" min={0} step="any" value={localLogsPricing.retainDduPerGbDay} onChange={(e) => setLocalLogsPricing((p) => ({ ...p, retainDduPerGbDay: Number(e.target.value) }))} style={inputStyle} />
              </Field>
              <Field label="Query (DDU/GB scanned)" hint="List: 1.70 DDU per GB scanned.">
                <input type="number" min={0} step="any" value={localLogsPricing.queryDduPerGbScanned} onChange={(e) => setLocalLogsPricing((p) => ({ ...p, queryDduPerGbScanned: Number(e.target.value) }))} style={inputStyle} />
              </Field>
            </div>
          </Section>

          <Section title="Logs Daily Volume Assumptions">
            <div style={grid3}>
              <Field label="Ingested GB/day" hint="Baseline ingest volume used in logs forecasts.">
                <input type="number" min={0} step="any" value={localLogsUsage.ingestGbPerDay} onChange={(e) => setLocalLogsUsage((p) => ({ ...p, ingestGbPerDay: Number(e.target.value) }))} style={inputStyle} />
              </Field>
              <Field label="Retained GB/day" hint="Average GB retained each day.">
                <input type="number" min={0} step="any" value={localLogsUsage.retainGbPerDay} onChange={(e) => setLocalLogsUsage((p) => ({ ...p, retainGbPerDay: Number(e.target.value) }))} style={inputStyle} />
              </Field>
              <Field label="Queried GB/day" hint="Daily GB scanned by log queries.">
                <input type="number" min={0} step="any" value={localLogsUsage.queryGbScannedPerDay} onChange={(e) => setLocalLogsUsage((p) => ({ ...p, queryGbScannedPerDay: Number(e.target.value) }))} style={inputStyle} />
              </Field>
            </div>
          </Section>

          <Section title="Traces Pricing (USD)">
            <div style={grid3}>
              <Field label="Ingest and Process (USD/GiB)" hint="List: $0.20 per GiB.">
                <input type="number" min={0} step="any" value={localTracesPricing.ingestUsdPerGiB} onChange={(e) => setLocalTracesPricing((p) => ({ ...p, ingestUsdPerGiB: Number(e.target.value) }))} style={inputStyle} />
              </Field>
              <Field label="Retain (USD/GiB-day)" hint="List: $0.0007 per GiB-day.">
                <input type="number" min={0} step="any" value={localTracesPricing.retainUsdPerGiBDay} onChange={(e) => setLocalTracesPricing((p) => ({ ...p, retainUsdPerGiBDay: Number(e.target.value) }))} style={inputStyle} />
              </Field>
              <Field label="Query (USD/GiB scanned)" hint="List: $0.0035 per GiB scanned.">
                <input type="number" min={0} step="any" value={localTracesPricing.queryUsdPerGiBScanned} onChange={(e) => setLocalTracesPricing((p) => ({ ...p, queryUsdPerGiBScanned: Number(e.target.value) }))} style={inputStyle} />
              </Field>
            </div>
          </Section>

          <Section title="Traces Daily Volume Assumptions">
            <div style={grid3}>
              <Field label="Ingested GiB/day" hint="Baseline ingest volume used in traces forecasts.">
                <input type="number" min={0} step="any" value={localTracesUsage.ingestGiBPerDay} onChange={(e) => setLocalTracesUsage((p) => ({ ...p, ingestGiBPerDay: Number(e.target.value) }))} style={inputStyle} />
              </Field>
              <Field label="Retained GiB/day" hint="Average GiB retained each day.">
                <input type="number" min={0} step="any" value={localTracesUsage.retainGiBPerDay} onChange={(e) => setLocalTracesUsage((p) => ({ ...p, retainGiBPerDay: Number(e.target.value) }))} style={inputStyle} />
              </Field>
              <Field label="Queried GiB/day" hint="Daily GiB scanned by trace queries.">
                <input type="number" min={0} step="any" value={localTracesUsage.queryGiBScannedPerDay} onChange={(e) => setLocalTracesUsage((p) => ({ ...p, queryGiBScannedPerDay: Number(e.target.value) }))} style={inputStyle} />
              </Field>
            </div>
          </Section>

          <Section title="Business Justification Assumptions">
            <div style={grid3}>
              <Field label="Incident impact per hour (USD)" hint="Used to estimate avoided business impact from MTTR gains.">
                <input type="number" min={0} step="any" value={localBusinessAssumptions.incidentCostPerHourUSD} onChange={(e) => setLocalBusinessAssumptions((p) => ({ ...p, incidentCostPerHourUSD: Number(e.target.value) }))} style={inputStyle} />
              </Field>
              <Field label="Engineer hourly cost (USD)" hint="Used for productivity value in ROI estimates.">
                <input type="number" min={0} step="any" value={localBusinessAssumptions.engineerHourlyCostUSD} onChange={(e) => setLocalBusinessAssumptions((p) => ({ ...p, engineerHourlyCostUSD: Number(e.target.value) }))} style={inputStyle} />
              </Field>
              <Field label="Current trace sampling (%)" hint="Baseline sampling rate used by trace expansion presets.">
                <input type="number" min={1} max={100} step="1" value={localBusinessAssumptions.currentTraceSamplingPct} onChange={(e) => setLocalBusinessAssumptions((p) => ({ ...p, currentTraceSamplingPct: Number(e.target.value) }))} style={inputStyle} />
              </Field>
            </div>

            <div style={{ ...grid3, marginTop: 10 }}>
              <Field label="Metrics incidents / month" hint="Baseline major incidents tied to metrics observability domain.">
                <input type="number" min={0} step="1" value={localBusinessAssumptions.metricsIncidentsPerMonth} onChange={(e) => setLocalBusinessAssumptions((p) => ({ ...p, metricsIncidentsPerMonth: Number(e.target.value) }))} style={inputStyle} />
              </Field>
              <Field label="Metrics MTTR baseline (min)" hint="Before expansion baseline.">
                <input type="number" min={1} step="1" value={localBusinessAssumptions.metricsMttrBaselineMin} onChange={(e) => setLocalBusinessAssumptions((p) => ({ ...p, metricsMttrBaselineMin: Number(e.target.value) }))} style={inputStyle} />
              </Field>
              <Field label="Metrics MTTD baseline (min)" hint="Before expansion baseline.">
                <input type="number" min={1} step="1" value={localBusinessAssumptions.metricsMttdBaselineMin} onChange={(e) => setLocalBusinessAssumptions((p) => ({ ...p, metricsMttdBaselineMin: Number(e.target.value) }))} style={inputStyle} />
              </Field>
            </div>

            <div style={{ ...grid3, marginTop: 10 }}>
              <Field label="Logs incidents / month" hint="Baseline incidents where logs are primary diagnostic signal.">
                <input type="number" min={0} step="1" value={localBusinessAssumptions.logsIncidentsPerMonth} onChange={(e) => setLocalBusinessAssumptions((p) => ({ ...p, logsIncidentsPerMonth: Number(e.target.value) }))} style={inputStyle} />
              </Field>
              <Field label="Logs security investigations / month" hint="Baseline monthly investigations.">
                <input type="number" min={0} step="1" value={localBusinessAssumptions.logsSecurityInvestigationsPerMonth} onChange={(e) => setLocalBusinessAssumptions((p) => ({ ...p, logsSecurityInvestigationsPerMonth: Number(e.target.value) }))} style={inputStyle} />
              </Field>
              <Field label="Logs MTTR baseline (min)" hint="Before expansion baseline.">
                <input type="number" min={1} step="1" value={localBusinessAssumptions.logsMttrBaselineMin} onChange={(e) => setLocalBusinessAssumptions((p) => ({ ...p, logsMttrBaselineMin: Number(e.target.value) }))} style={inputStyle} />
              </Field>
            </div>

            <div style={{ ...grid3, marginTop: 10 }}>
              <Field label="Traces incidents / month" hint="Baseline incidents where traces are primary diagnostic signal.">
                <input type="number" min={0} step="1" value={localBusinessAssumptions.tracesIncidentsPerMonth} onChange={(e) => setLocalBusinessAssumptions((p) => ({ ...p, tracesIncidentsPerMonth: Number(e.target.value) }))} style={inputStyle} />
              </Field>
              <Field label="Traces MTTR baseline (min)" hint="Before expansion baseline.">
                <input type="number" min={1} step="1" value={localBusinessAssumptions.tracesMttrBaselineMin} onChange={(e) => setLocalBusinessAssumptions((p) => ({ ...p, tracesMttrBaselineMin: Number(e.target.value) }))} style={inputStyle} />
              </Field>
              <Field label="Traces MTTD baseline (min)" hint="Before expansion baseline.">
                <input type="number" min={1} step="1" value={localBusinessAssumptions.tracesMttdBaselineMin} onChange={(e) => setLocalBusinessAssumptions((p) => ({ ...p, tracesMttdBaselineMin: Number(e.target.value) }))} style={inputStyle} />
              </Field>
            </div>
          </Section>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
          <button onClick={reset} style={btnStyle}>Reset defaults</button>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} style={btnStyle}>Cancel</button>
            <button onClick={apply} style={{ ...btnStyle, background: "#1496ff", color: "#fff", borderColor: "#1496ff" }}>Apply</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{ border: "1px solid rgba(128,128,128,0.35)", borderRadius: 6, padding: 12 }}>
    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>{title}</div>
    {children}
  </div>
);

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    <div style={{ fontWeight: 600, fontSize: 12 }}>{label}</div>
    {children}
    {hint && <div style={{ fontSize: 11, opacity: 0.7 }}>{hint}</div>}
  </div>
);

const grid3: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 10,
};

function nonNeg(v: number, fallback: number): number {
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

function clamp(v: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, Math.round(v)));
}

const ASSUMPTION_PRESETS = {
  saas: {
    label: "SaaS / B2B Platform",
    values: {
      incidentCostPerHourUSD: 7600,
      engineerHourlyCostUSD: 155,
      metricsIncidentsPerMonth: 16,
      metricsMttrBaselineMin: 88,
      metricsMttdBaselineMin: 16,
      logsIncidentsPerMonth: 17,
      logsSecurityInvestigationsPerMonth: 12,
      logsMttrBaselineMin: 110,
      tracesIncidentsPerMonth: 13,
      tracesMttrBaselineMin: 92,
      tracesMttdBaselineMin: 19,
      currentTraceSamplingPct: 15,
    },
  },
  retail: {
    label: "Retail / eCommerce",
    values: {
      incidentCostPerHourUSD: 8900,
      engineerHourlyCostUSD: 145,
      metricsIncidentsPerMonth: 18,
      metricsMttrBaselineMin: 96,
      metricsMttdBaselineMin: 20,
      logsIncidentsPerMonth: 20,
      logsSecurityInvestigationsPerMonth: 9,
      logsMttrBaselineMin: 124,
      tracesIncidentsPerMonth: 14,
      tracesMttrBaselineMin: 101,
      tracesMttdBaselineMin: 24,
      currentTraceSamplingPct: 10,
    },
  },
  finserv: {
    label: "Financial Services / Regulated",
    values: {
      incidentCostPerHourUSD: 9800,
      engineerHourlyCostUSD: 170,
      metricsIncidentsPerMonth: 15,
      metricsMttrBaselineMin: 90,
      metricsMttdBaselineMin: 17,
      logsIncidentsPerMonth: 16,
      logsSecurityInvestigationsPerMonth: 18,
      logsMttrBaselineMin: 112,
      tracesIncidentsPerMonth: 12,
      tracesMttrBaselineMin: 95,
      tracesMttdBaselineMin: 20,
      currentTraceSamplingPct: 25,
    },
  },
} as const;
