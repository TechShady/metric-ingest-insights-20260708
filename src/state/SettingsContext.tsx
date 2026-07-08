import React, { createContext, useContext, useState } from "react";

export interface LogsPricing {
  ingestDduPerGb: number;
  retainDduPerGbDay: number;
  queryDduPerGbScanned: number;
}

export interface LogsUsage {
  ingestGbPerDay: number;
  retainGbPerDay: number;
  queryGbScannedPerDay: number;
}

export interface TracesPricing {
  ingestUsdPerGiB: number;
  retainUsdPerGiBDay: number;
  queryUsdPerGiBScanned: number;
}

export interface TracesUsage {
  ingestGiBPerDay: number;
  retainGiBPerDay: number;
  queryGiBScannedPerDay: number;
}

export interface BusinessAssumptions {
  incidentCostPerHourUSD: number;
  engineerHourlyCostUSD: number;
  metricsIncidentsPerMonth: number;
  metricsMttrBaselineMin: number;
  metricsMttdBaselineMin: number;
  logsIncidentsPerMonth: number;
  logsSecurityInvestigationsPerMonth: number;
  logsMttrBaselineMin: number;
  tracesIncidentsPerMonth: number;
  tracesMttrBaselineMin: number;
  tracesMttdBaselineMin: number;
  currentTraceSamplingPct: number;
}

interface SettingsCtx {
  topN: number;
  setTopN: (n: number) => void;
  rateCentsPerDp: number;
  setRateCentsPerDp: (n: number) => void;
  monthlyBudgetUSD: number;
  setMonthlyBudgetUSD: (n: number) => void;
  logsPricing: LogsPricing;
  setLogsPricing: (v: LogsPricing) => void;
  logsUsage: LogsUsage;
  setLogsUsage: (v: LogsUsage) => void;
  tracesPricing: TracesPricing;
  setTracesPricing: (v: TracesPricing) => void;
  tracesUsage: TracesUsage;
  setTracesUsage: (v: TracesUsage) => void;
  businessAssumptions: BusinessAssumptions;
  setBusinessAssumptions: (v: BusinessAssumptions) => void;
}

const Ctx = createContext<SettingsCtx>({
  topN: 20,
  setTopN: () => {},
  rateCentsPerDp: 0,
  setRateCentsPerDp: () => {},
  monthlyBudgetUSD: 0,
  setMonthlyBudgetUSD: () => {},
  logsPricing: { ingestDduPerGb: 100, retainDduPerGbDay: 0.3, queryDduPerGbScanned: 1.7 },
  setLogsPricing: () => {},
  logsUsage: { ingestGbPerDay: 100, retainGbPerDay: 100, queryGbScannedPerDay: 100 },
  setLogsUsage: () => {},
  tracesPricing: { ingestUsdPerGiB: 0.2, retainUsdPerGiBDay: 0.0007, queryUsdPerGiBScanned: 0.0035 },
  setTracesPricing: () => {},
  tracesUsage: { ingestGiBPerDay: 100, retainGiBPerDay: 100, queryGiBScannedPerDay: 100 },
  setTracesUsage: () => {},
  businessAssumptions: {
    incidentCostPerHourUSD: 6800,
    engineerHourlyCostUSD: 140,
    metricsIncidentsPerMonth: 14,
    metricsMttrBaselineMin: 92,
    metricsMttdBaselineMin: 18,
    logsIncidentsPerMonth: 15,
    logsSecurityInvestigationsPerMonth: 10,
    logsMttrBaselineMin: 118,
    tracesIncidentsPerMonth: 11,
    tracesMttrBaselineMin: 97,
    tracesMttdBaselineMin: 21,
    currentTraceSamplingPct: 10,
  },
  setBusinessAssumptions: () => {},
});

interface ProviderProps {
  defaultTopN: number;
  defaultRateCentsPerDp: number;
  defaultMonthlyBudgetUSD?: number;
  defaultLogsPricing: LogsPricing;
  defaultLogsUsage: LogsUsage;
  defaultTracesPricing: TracesPricing;
  defaultTracesUsage: TracesUsage;
  defaultBusinessAssumptions: BusinessAssumptions;
  children: React.ReactNode;
}

export const SettingsProvider: React.FC<ProviderProps> = ({
  defaultTopN,
  defaultRateCentsPerDp,
  defaultMonthlyBudgetUSD = 0,
  defaultLogsPricing,
  defaultLogsUsage,
  defaultTracesPricing,
  defaultTracesUsage,
  defaultBusinessAssumptions,
  children,
}) => {
  const [topN, setTopN] = useState<number>(defaultTopN);
  const [rateCentsPerDp, setRateCentsPerDp] = useState<number>(defaultRateCentsPerDp);
  const [monthlyBudgetUSD, setMonthlyBudgetUSD] = useState<number>(defaultMonthlyBudgetUSD);
  const [logsPricing, setLogsPricing] = useState<LogsPricing>(defaultLogsPricing);
  const [logsUsage, setLogsUsage] = useState<LogsUsage>(defaultLogsUsage);
  const [tracesPricing, setTracesPricing] = useState<TracesPricing>(defaultTracesPricing);
  const [tracesUsage, setTracesUsage] = useState<TracesUsage>(defaultTracesUsage);
  const [businessAssumptions, setBusinessAssumptions] = useState<BusinessAssumptions>(defaultBusinessAssumptions);
  return (
    <Ctx.Provider
      value={{
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
      }}
    >
      {children}
    </Ctx.Provider>
  );
};

export const useSettings = () => useContext(Ctx);
