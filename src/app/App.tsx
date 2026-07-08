import React, { useState } from "react";
import { Page } from "@dynatrace/strato-components-preview/layouts";
import { OverviewPage } from "../pages/OverviewPage";
import { TopMetricsPage } from "../pages/TopMetricsPage";
import { SourcesPage } from "../pages/SourcesPage";
import { ForecastPage } from "../pages/ForecastPage";
import { ForecastTopNPage } from "../pages/ForecastTopNPage";
import { CostForecastPage } from "../pages/CostForecastPage";
import { CostPage } from "../pages/CostPage";
import { OptimizePage } from "../pages/OptimizePage";
import { UsagePage } from "../pages/UsagePage";
import { DiffPage } from "../pages/DiffPage";
import { CardinalityTrendsPage } from "../pages/CardinalityTrendsPage";
import { LogsPage } from "../pages/LogsPage";
import { TracesPage } from "../pages/TracesPage";
import { SettingsProvider, useSettings } from "../state/SettingsContext";
import { SettingsModal } from "../components/SettingsModal";
import { DisclaimerModal } from "../components/DisclaimerModal";
import {
  DEFAULT_BUSINESS_ASSUMPTIONS,
  DEFAULT_LOGS_PRICING,
  DEFAULT_LOGS_USAGE,
  DEFAULT_RATE_CENTS_PER_DP,
  DEFAULT_TRACES_PRICING,
  DEFAULT_TRACES_USAGE,
} from "../lib/cost";

type MainTab = "metrics" | "logs" | "traces";

type MetricsSubTab =
  | "overview"
  | "metrics"
  | "cost"
  | "sources"
  | "usage"
  | "cardinalityTrends"
  | "diff"
  | "forecast"
  | "forecastTopN"
  | "costForecast"
  | "optimize";

const MAIN_TABS: { id: MainTab; label: string }[] = [
  { id: "metrics", label: "Metrics" },
  { id: "logs", label: "Logs" },
  { id: "traces", label: "Traces" },
];

const METRICS_TABS: { id: MetricsSubTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "metrics", label: "Top Metrics" },
  { id: "cardinalityTrends", label: "Cardinality Trends" },
  { id: "cost", label: "Cost" },
  { id: "sources", label: "Sources" },
  { id: "usage", label: "Idle Metrics" },
  { id: "diff", label: "Weekly Diff" },
  { id: "forecast", label: "Forecast Overall" },
  { id: "forecastTopN", label: "Forecast Top N Metrics" },
  { id: "costForecast", label: "Cost Forecast" },
  { id: "optimize", label: "Optimize" },
];

const Shell: React.FC = () => {
  const [mainTab, setMainTab] = useState<MainTab>("metrics");
  const [metricsTab, setMetricsTab] = useState<MetricsSubTab>("overview");
  const [timeframe, setTimeframe] = useState<string>("now()-7d");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { topN, rateCentsPerDp } = useSettings();

  return (
    <Page>
      <DisclaimerModal />
      <Page.Main>
        <div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 22 }}>Telemetry Ingest Insight</h1>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                Understand metrics, logs, and traces ingest economics, forecasts, and optimization actions.
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <label style={{ fontSize: 12, opacity: 0.7 }}>Timeframe:</label>
                <select
                  value={timeframe}
                  onChange={(e) => setTimeframe(e.target.value)}
                  style={{
                    padding: "4px 8px",
                    background: "rgba(128,128,128,0.1)",
                    border: "1px solid rgba(128,128,128,0.3)",
                    borderRadius: 4,
                    color: "inherit",
                  }}
                >
                  <option value="now()-1h">Last 1 hour</option>
                  <option value="now()-6h">Last 6 hours</option>
                  <option value="now()-1d">Last 1 day</option>
                  <option value="now()-7d">Last 7 days</option>
                  <option value="now()-14d">Last 14 days</option>
                  <option value="now()-30d">Last 30 days</option>
                </select>
              </div>
              <button
                onClick={() => setSettingsOpen(true)}
                title={`Settings — Top N=${topN}, Cost=$${rateCentsPerDp}/DP`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 32,
                  height: 32,
                  background: "rgba(128,128,128,0.1)",
                  border: "1px solid rgba(128,128,128,0.3)",
                  borderRadius: 4,
                  color: "inherit",
                  cursor: "pointer",
                }}
                aria-label="Settings"
              >
                <GearIcon />
              </button>
            </div>
          </div>

          <div style={{ display: "flex", gap: 4, borderBottom: "1px solid rgba(128,128,128,0.3)", flexWrap: "wrap" }}>
            {MAIN_TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setMainTab(t.id)}
                style={{
                  padding: "8px 16px",
                  background: "transparent",
                  border: "none",
                  borderBottom: mainTab === t.id ? "2px solid #1496ff" : "2px solid transparent",
                  color: "inherit",
                  cursor: "pointer",
                  fontWeight: mainTab === t.id ? 600 : 400,
                  fontSize: 14,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {mainTab === "metrics" && (
            <div style={{ display: "flex", gap: 4, borderBottom: "1px solid rgba(128,128,128,0.2)", flexWrap: "wrap" }}>
              {METRICS_TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setMetricsTab(t.id)}
                  style={{
                    padding: "7px 14px",
                    background: "transparent",
                    border: "none",
                    borderBottom: metricsTab === t.id ? "2px solid #1496ff" : "2px solid transparent",
                    color: "inherit",
                    cursor: "pointer",
                    fontWeight: metricsTab === t.id ? 600 : 400,
                    fontSize: 13,
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}

          <div>
            {mainTab === "metrics" && (
              <>
                {metricsTab === "overview" && <OverviewPage timeframe={timeframe} />}
                {metricsTab === "metrics" && <TopMetricsPage timeframe={timeframe} />}
                {metricsTab === "cardinalityTrends" && <CardinalityTrendsPage timeframe={timeframe} />}
                {metricsTab === "cost" && <CostPage timeframe={timeframe} />}
                {metricsTab === "sources" && <SourcesPage timeframe={timeframe} />}
                {metricsTab === "usage" && <UsagePage />}
                {metricsTab === "diff" && <DiffPage />}
                {metricsTab === "forecast" && <ForecastPage timeframe={timeframe} />}
                {metricsTab === "forecastTopN" && <ForecastTopNPage topN={topN} />}
                {metricsTab === "costForecast" && <CostForecastPage topN={topN} />}
                {metricsTab === "optimize" && <OptimizePage />}
              </>
            )}
            {mainTab === "logs" && <LogsPage timeframe={timeframe} />}
            {mainTab === "traces" && <TracesPage timeframe={timeframe} />}
          </div>
        </div>
        {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      </Page.Main>
    </Page>
  );
};

const GearIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
);

export const App: React.FC = () => (
  <SettingsProvider
    defaultTopN={20}
    defaultRateCentsPerDp={DEFAULT_RATE_CENTS_PER_DP}
    defaultMonthlyBudgetUSD={0}
    defaultLogsPricing={DEFAULT_LOGS_PRICING}
    defaultLogsUsage={DEFAULT_LOGS_USAGE}
    defaultTracesPricing={DEFAULT_TRACES_PRICING}
    defaultTracesUsage={DEFAULT_TRACES_USAGE}
    defaultBusinessAssumptions={DEFAULT_BUSINESS_ASSUMPTIONS}
  >
    <Shell />
  </SettingsProvider>
);
