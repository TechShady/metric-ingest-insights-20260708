import React, { useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import { DYNATRACE_LOGO_DATA_URI } from "../assets/dynatraceLogoData";

export interface BusinessDatum {
  label: string;
  value: string;
  note?: string;
}

interface Props {
  scenarioName: string;
  summary: string;
  keyMetrics: BusinessDatum[];
  analysis: string[];
  assumptions: string[];
}

type Confidence = "High" | "Medium" | "Low";
type Decision = "Proceed" | "Pilot" | "Reassess";

interface BenchmarkDatum {
  metric: string;
  before: number;
  target: number;
  industry: number;
  unit: string;
}

interface Recommendation {
  action: string;
  effort: "Low" | "Medium" | "High";
  confidence: Confidence;
  roiScore: number;
  rationale: string;
}

interface SavedScenario {
  id: string;
  name: string;
  monthlyBenefit: number;
  paybackMonths: number;
  recommendation: Decision;
  confidenceScore: number;
  createdAt: string;
}

const STORAGE_KEY = "telemetry-insight-scenario-compare-v1";

export const BusinessJustificationPanel: React.FC<Props> = ({
  scenarioName,
  summary,
  keyMetrics,
  analysis,
  assumptions,
}) => {
  const [visibleLines, setVisibleLines] = useState(0);
  const [dotTick, setDotTick] = useState(0);
  const [phaseTick, setPhaseTick] = useState(0);
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([]);

  const signals = useMemo(() => deriveSignals(keyMetrics, assumptions), [keyMetrics, assumptions]);
  const recommendations = useMemo(() => buildRecommendations(signals), [signals]);
  const benchmark = useMemo(() => buildBenchmarkStrip(keyMetrics), [keyMetrics]);
  const sensitivity = useMemo(() => buildSensitivity(signals.paybackMonths), [signals.paybackMonths]);
  const risks = useMemo(() => buildRisks(assumptions), [assumptions]);
  const decision = useMemo(() => decide(signals.paybackMonths, signals.confidenceScore), [signals.paybackMonths, signals.confidenceScore]);

  const lineScheduleMs = useMemo(() => {
    if (!analysis.length) return [] as number[];
    return analysis.map((_, idx) => {
      if (idx === 0) return 700;
      if (idx === analysis.length - 1) return 860;
      return 250 + (idx % 3) * 90;
    });
  }, [analysis]);

  useEffect(() => {
    setVisibleLines(0);
    if (!analysis.length || !lineScheduleMs.length) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let idx = 0;

    const revealNext = () => {
      if (cancelled || idx >= lineScheduleMs.length) return;
      timer = setTimeout(() => {
        if (cancelled) return;
        setVisibleLines((prev) => Math.min(prev + 1, analysis.length));
        idx += 1;
        revealNext();
      }, lineScheduleMs[idx]);
    };

    revealNext();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [analysis, lineScheduleMs]);

  useEffect(() => {
    if (visibleLines >= analysis.length) return;
    const timer = setInterval(() => {
      setDotTick((prev) => (prev + 1) % 4);
    }, 360);
    return () => clearInterval(timer);
  }, [visibleLines, analysis.length]);

  useEffect(() => {
    if (visibleLines >= analysis.length) return;
    const timer = setInterval(() => {
      setPhaseTick((prev) => (prev + 1) % 4);
    }, 1200);
    return () => clearInterval(timer);
  }, [visibleLines, analysis.length]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as SavedScenario[];
      if (Array.isArray(parsed)) setSavedScenarios(parsed.slice(0, 3));
    } catch {
      // Ignore malformed local storage.
    }
  }, []);

  const isStreaming = visibleLines < analysis.length;
  const typingDots = useMemo(() => ".".repeat(dotTick), [dotTick]);
  const liveStatus = useMemo(() => {
    const phases = [
      "Let me walk through this",
      "Connecting cost and reliability signals",
      "Estimating financial impact",
      "Framing recommendation",
    ];
    return phases[phaseTick] ?? phases[0];
  }, [phaseTick]);

  const saveScenario = () => {
    const next: SavedScenario = {
      id: `${Date.now()}`,
      name: scenarioName,
      monthlyBenefit: signals.monthlyBenefit,
      paybackMonths: signals.paybackMonths,
      recommendation: decision.decision,
      confidenceScore: signals.confidenceScore,
      createdAt: new Date().toISOString(),
    };
    const merged = [next, ...savedScenarios].slice(0, 3);
    setSavedScenarios(merged);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  };

  const clearSavedScenarios = () => {
    setSavedScenarios([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  const exportPdf = async () => {
    const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 24;
    const contentW = pageW - margin * 2;
    const headerH = 56;
    const metaH = 24;
    const topY = margin;

    const fitLines = (text: string, width: number, maxLines: number): string[] => {
      const lines = doc.splitTextToSize(text, width) as string[];
      if (lines.length <= maxLines) return lines;
      const trimmed = lines.slice(0, maxLines);
      trimmed[maxLines - 1] = `${trimmed[maxLines - 1].replace(/[.\s]*$/, "")}...`;
      return trimmed;
    };

    const confidenceBadgeColors = (confidence: Confidence): { fill: [number, number, number]; text: [number, number, number] } => {
      if (confidence === "High") return { fill: [224, 246, 233], text: [28, 96, 49] };
      if (confidence === "Medium") return { fill: [255, 244, 214], text: [125, 87, 20] };
      return { fill: [253, 236, 236], text: [125, 36, 36] };
    };

    const imageToDataUrl = (imageUrl: string): Promise<{ dataUrl: string; width: number; height: number } | null> =>
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(null);
            return;
          }
          ctx.drawImage(img, 0, 0);
          resolve({
            dataUrl: canvas.toDataURL("image/jpeg", 0.92),
            width: img.naturalWidth,
            height: img.naturalHeight,
          });
        };
        img.onerror = () => resolve(null);
        img.src = imageUrl;
      });

    const miniSummaryRows = [
      { label: "Monthly Benefit", value: fmtUsd(signals.monthlyBenefit), note: "Estimated business value" },
      { label: "Payback", value: `${signals.paybackMonths.toFixed(1)} months`, note: "Lower is better" },
      { label: "Decision", value: decision.decision, note: decision.rationale },
    ];

    doc.setFillColor(15, 126, 220);
    doc.rect(margin, topY, contentW, headerH, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Telemetry Ingest Insight", margin + 12, topY + 23);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.text("Business Justification Executive Brief", margin + 12, topY + 41);

    const logoW = 220;
    const logoH = 34;
    const logoX = margin + contentW - logoW - 10;
    const logoY = topY + 10;
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(logoX, logoY, logoW, logoH, 6, 6, "F");
    const logoImage = await imageToDataUrl(DYNATRACE_LOGO_DATA_URI);
    if (logoImage) {
      const innerW = logoW - 6;
      const innerH = logoH - 6;
      const sourceRatio = logoImage.width / Math.max(1, logoImage.height);
      const boxRatio = innerW / innerH;
      const drawW = sourceRatio > boxRatio ? innerW : innerH * sourceRatio;
      const drawH = sourceRatio > boxRatio ? innerW / sourceRatio : innerH;
      const drawX = logoX + 3 + (innerW - drawW) / 2;
      const drawY = logoY + 3 + (innerH - drawH) / 2;
      doc.addImage(logoImage.dataUrl, "JPEG", drawX, drawY, drawW, drawH);
    }

    doc.setFillColor(234, 243, 253);
    doc.rect(margin, topY + headerH, contentW, metaH, "F");
    doc.setTextColor(29, 47, 73);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.3);
    doc.text(`Scenario: ${scenarioName}`, margin + 10, topY + headerH + 16);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated: ${new Date().toLocaleString()}`, margin + contentW - 210, topY + headerH + 16);

    const benchY = topY + headerH + metaH + 6;
    doc.setFillColor(241, 248, 255);
    doc.setDrawColor(205, 220, 235);
    doc.roundedRect(margin, benchY, contentW, 24, 4, 4, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.2);
    doc.setTextColor(20, 56, 90);
    let bx = margin + 8;
    benchmark.slice(0, 3).forEach((b, i) => {
      const text = `${b.metric}: ${fmtShort(b.before, b.unit)} -> ${fmtShort(b.target, b.unit)} (industry ${fmtShort(b.industry, b.unit)})`;
      doc.text(fitLines(text, contentW / 3.4, 1), bx, benchY + 15);
      bx += contentW / 3.2;
      if (i < 2) {
        doc.setDrawColor(190, 210, 230);
        doc.line(bx - 8, benchY + 5, bx - 8, benchY + 19);
      }
    });

    const bodyY = benchY + 30;
    const gap = 12;
    const colW = (contentW - gap) / 2;
    const leftX = margin;
    const rightX = leftX + colW + gap;

    const summaryH = 92;
    doc.setFillColor(247, 251, 255);
    doc.setDrawColor(204, 218, 236);
    doc.roundedRect(leftX, bodyY, colW, summaryH, 6, 6, "FD");
    doc.setTextColor(18, 52, 86);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Executive Summary", leftX + 8, bodyY + 15);
    doc.setTextColor(42, 48, 58);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(fitLines(summary, colW - 16, 5), leftX + 8, bodyY + 31);

    const tableH = summaryH;
    const tX = rightX;
    const tY = bodyY;
    const tW = colW;
    const hH = 22;
    const rowHeights = [20, 20, tableH - hH - 40];
    const c1 = tW * 0.36;
    const c2 = tW * 0.22;
    const c3 = tW - c1 - c2;
    doc.setFillColor(217, 232, 247);
    doc.setDrawColor(190, 205, 220);
    doc.rect(tX, tY, tW, hH, "FD");
    doc.setTextColor(22, 52, 86);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Mini Cost Summary", tX + 6, tY + 14);
    doc.text("Value", tX + c1 + 6, tY + 14);
    doc.text("Context", tX + c1 + c2 + 6, tY + 14);
    let rowCursor = tY + hH;
    miniSummaryRows.forEach((row, i) => {
      const rowH = rowHeights[i] ?? 20;
      const rowY = rowCursor;
      if (i % 2 === 0) {
        doc.setFillColor(246, 250, 255);
        doc.rect(tX, rowY, tW, rowH, "F");
      }
      doc.setDrawColor(212, 222, 236);
      doc.line(tX, rowY, tX + tW, rowY);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.3);
      doc.setTextColor(45, 48, 56);
      doc.text(fitLines(row.label, c1 - 10, 1), tX + 6, rowY + 12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 126, 220);
      doc.text(fitLines(row.value, c2 - 10, 1), tX + c1 + 6, rowY + 12);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(45, 48, 56);
      doc.text(fitLines(row.note ?? "-", c3 - 10, i === 2 ? 3 : 1), tX + c1 + c2 + 6, rowY + 12);
      rowCursor += rowH;
    });
    doc.line(tX, tY + tableH, tX + tW, tY + tableH);
    doc.line(tX + c1, tY, tX + c1, tY + tableH);
    doc.line(tX + c1 + c2, tY, tX + c1 + c2, tY + tableH);
    doc.rect(tX, tY, tW, tableH);

    const metricsY = bodyY + summaryH + 10;
    const metricsH = 208;
    doc.setFillColor(249, 252, 255);
    doc.setDrawColor(211, 224, 239);
    doc.roundedRect(leftX, metricsY, colW, metricsH, 6, 6, "FD");
    doc.setTextColor(18, 52, 86);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Key Metrics", leftX + 8, metricsY + 15);

    const mRowH = 24;
    keyMetrics.slice(0, 5).forEach((m, i) => {
      const rowY = metricsY + 20 + i * mRowH;
      doc.setFillColor(i % 2 === 0 ? 245 : 252, i % 2 === 0 ? 249 : 253, 255);
      doc.roundedRect(leftX + 6, rowY, colW - 12, mRowH - 3, 3, 3, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.7);
      doc.setTextColor(28, 36, 48);
      doc.text(fitLines(m.label, (colW - 12) * 0.34, 1), leftX + 10, rowY + 11);
      doc.setTextColor(15, 126, 220);
      doc.text(fitLines(m.value, (colW - 12) * 0.26, 1), leftX + (colW - 12) * 0.36, rowY + 11);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(80, 88, 99);
      doc.text(fitLines(m.note ?? "", (colW - 12) * 0.34, 1), leftX + (colW - 12) * 0.63, rowY + 11);
    });

    const riskY = metricsY + 20 + 5 * mRowH + 8;
    const riskH = 58;
    doc.setFillColor(252, 245, 239);
    doc.setDrawColor(235, 215, 194);
    doc.roundedRect(leftX + 6, riskY, colW - 12, riskH, 4, 4, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(117, 62, 26);
    doc.text("Risks and Caveats", leftX + 10, riskY + 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(92, 60, 42);
    risks.slice(0, 3).forEach((r, i) => {
      doc.text(fitLines(`${r.level}: ${r.text}`, colW - 26, 1), leftX + 10, riskY + 24 + i * 11);
    });

    const analysisY = metricsY;
    const analysisH = 208;
    doc.setFillColor(249, 252, 255);
    doc.setDrawColor(211, 224, 239);
    doc.roundedRect(rightX, analysisY, colW, analysisH, 6, 6, "FD");
    doc.setTextColor(18, 52, 86);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Recommendations", rightX + 8, analysisY + 15);

    const aRowH = 24;
    recommendations.slice(0, 3).forEach((r, i) => {
      const rowY = analysisY + 20 + i * aRowH;
      doc.setFillColor(242, 248, 255);
      doc.setDrawColor(205, 220, 235);
      doc.roundedRect(rightX + 6, rowY, colW - 12, aRowH - 3, 3, 3, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.3);
      doc.setTextColor(35, 42, 52);
      doc.text(fitLines(`${i + 1}. ${r.action}`, colW - 130, 1), rightX + 10, rowY + 11);
      doc.setTextColor(15, 126, 220);
      doc.text(`ROI ${r.roiScore.toFixed(0)}`, rightX + colW - 122, rowY + 11);
      const badge = confidenceBadgeColors(r.confidence);
      const badgeX = rightX + colW - 82;
      const badgeY = rowY + 4;
      const badgeW = 64;
      const badgeH = 14;
      doc.setFillColor(badge.fill[0], badge.fill[1], badge.fill[2]);
      doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 4, 4, "F");
      doc.setFont("helvetica", "bold");
      doc.setTextColor(badge.text[0], badge.text[1], badge.text[2]);
      doc.text(`Confidence ${r.confidence}`, badgeX + 5, rowY + 14);
    });

    const sensY = analysisY + 122;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(18, 52, 86);
    doc.text("Sensitivity Scenario Test (NOT tied to recommendation rank)", rightX + 10, sensY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.6);
    doc.setTextColor(74, 83, 97);
    doc.text("This shows business risk: if incident volume changes, payback speed changes.", rightX + 10, sensY + 10);
    const sX = rightX + 10;
    const sY = sensY + 14;
    const sW = colW - 20;
    const sH = 58;
    const sh = 18;
    const sr = (sH - sh) / 3;
    const sc1 = sW * 0.33;
    const sc2 = sW * 0.27;
    const sc3 = sW - sc1 - sc2;
    doc.setDrawColor(205, 220, 235);
    doc.setFillColor(238, 246, 255);
    doc.rect(sX, sY, sW, sh, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.8);
    doc.setTextColor(24, 56, 91);
    doc.text("Scenario", sX + 6, sY + 12);
    doc.text("Incident Volume", sX + sc1 + 6, sY + 12);
    doc.text("Expected Payback", sX + sc1 + sc2 + 6, sY + 12);
    sensitivity.slice(0, 3).forEach((p, i) => {
      const y = sY + sh + i * sr;
      if (i % 2 === 0) {
        doc.setFillColor(248, 251, 255);
        doc.rect(sX, y, sW, sr, "F");
      }
      doc.setDrawColor(220, 229, 239);
      doc.line(sX, y, sX + sW, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.6);
      doc.setTextColor(44, 52, 63);
      const scenarioName = p.incidentDeltaPct < 0 ? "Lower incidents" : p.incidentDeltaPct > 0 ? "Higher incidents" : "Expected baseline";
      doc.text(scenarioName, sX + 6, y + 11);
      doc.text(`${p.incidentDeltaPct > 0 ? "+" : ""}${p.incidentDeltaPct}%`, sX + sc1 + 6, y + 11);
      doc.text(formatPaybackDetailed(p.paybackMonths), sX + sc1 + sc2 + 6, y + 11);
    });
    doc.line(sX, sY + sH, sX + sW, sY + sH);
    doc.line(sX + sc1, sY, sX + sc1, sY + sH);
    doc.line(sX + sc1 + sc2, sY, sX + sc1 + sc2, sY + sH);
    doc.rect(sX, sY, sW, sH);

    const assumptionsY = metricsY + metricsH + 8;
    const assumptionsH = 42;
    doc.setFillColor(238, 246, 255);
    doc.setDrawColor(205, 220, 235);
    doc.roundedRect(margin, assumptionsY, contentW, assumptionsH, 6, 6, "FD");
    doc.setTextColor(18, 52, 86);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Assumptions", margin + 8, assumptionsY + 14);
    doc.setTextColor(45, 52, 60);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.1);
    const assumptionsLine = assumptions.map((a) => `- ${a}`).join("   ");
    doc.text(fitLines(assumptionsLine, contentW - 16, 2), margin + 8, assumptionsY + 27);

    const decisionY = assumptionsY + assumptionsH + 6;
    const decisionColor = decision.decision === "Proceed" ? [224, 246, 233] : decision.decision === "Pilot" ? [255, 244, 214] : [253, 236, 236];
    const decisionText = decision.decision === "Proceed" ? [28, 96, 49] : decision.decision === "Pilot" ? [125, 87, 20] : [125, 36, 36];
    doc.setFillColor(decisionColor[0], decisionColor[1], decisionColor[2]);
    doc.setDrawColor(205, 220, 235);
    doc.roundedRect(margin, decisionY, contentW, 36, 5, 5, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(decisionText[0], decisionText[1], decisionText[2]);
    doc.text(`Executive Decision: ${decision.decision}`, margin + 8, decisionY + 14);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(55, 62, 72);
    doc.text(fitLines(decision.rationale, contentW - 195, 2), margin + 180, decisionY + 14);

    const methodologyY = pageH - 13;
    const methodology = "Methodology: Payback and ROI are modeled from current ingest economics, estimated monthly benefit, and incident-volume sensitivity (+/-20%). Recommendation rank uses ROI, effort, and confidence score.";
    doc.setDrawColor(214, 224, 236);
    doc.line(margin, methodologyY - 9, margin + contentW, methodologyY - 9);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.2);
    doc.setTextColor(86, 94, 106);
    doc.text(fitLines(methodology, contentW, 2), margin, methodologyY - 1);

    const safeScenario = scenarioName.replace(/[^a-zA-Z0-9]+/g, "-").replace(/(^-|-$)/g, "").toLowerCase();
    const datePart = new Date().toISOString().slice(0, 10);
    doc.save(`business-justification-${safeScenario || "report"}-${datePart}.pdf`);
  };

  return (
    <div
      style={{
        marginTop: 12,
        border: "1px solid rgba(20,150,255,0.45)",
        borderRadius: 8,
        background: "linear-gradient(180deg, rgba(20,150,255,0.10), rgba(20,150,255,0.03))",
        padding: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span
          style={{
            display: "inline-flex",
            width: 20,
            height: 20,
            borderRadius: 99,
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(20,150,255,0.25)",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          AI
        </span>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Business Justification</div>
        <button onClick={() => { void exportPdf(); }} style={btnReport}>Report PDF</button>
        <button onClick={saveScenario} style={btnSecondary}>Save Scenario</button>
        <button onClick={clearSavedScenarios} style={btnSecondary}>Clear Compare</button>
        <div style={{ marginLeft: "auto", fontSize: 11, opacity: 0.75 }}>{scenarioName}</div>
      </div>

      <div style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 8 }}>{summary}</div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8, marginBottom: 10 }}>
        {keyMetrics.map((m) => (
          <div key={m.label} style={metricCard}>
            <div style={{ fontSize: 11, opacity: 0.7 }}>{m.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>{m.value}</div>
            {m.note && <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>{m.note}</div>}
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700 }}>Benchmark Strip (Before / Target / Industry)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 6 }}>
          {benchmark.map((b) => (
            <div key={b.metric} style={benchmarkCard}>
              <div style={{ fontSize: 11, fontWeight: 700 }}>{b.metric}</div>
              <div style={{ fontSize: 11, opacity: 0.85 }}>
                {fmtShort(b.before, b.unit)} {"->"} {fmtShort(b.target, b.unit)}
              </div>
              <div style={{ fontSize: 10, opacity: 0.7 }}>Industry ref: {fmtShort(b.industry, b.unit)}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 10, marginBottom: 10 }}>
        <div style={sectionCard}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>AI Analysis</div>
          <div style={{ fontSize: 11, marginBottom: 6, opacity: 0.78, color: "#1496ff" }}>
            {isStreaming ? `${liveStatus}${typingDots}` : "AI analysis complete"}
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            {analysis.slice(0, visibleLines).map((line, idx) => {
              const conf = confidenceForRecommendation(idx, signals.confidenceScore);
              return (
                <div key={idx} style={analysisRow}>
                  <span style={confidencePill(conf)}>{conf}</span>
                  <span>{line}</span>
                </div>
              );
            })}
            {isStreaming && <div style={thinkingRow}>Thinking{typingDots}</div>}
          </div>
        </div>

        <div style={sectionCard}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Recommendation Engine (Ranked)</div>
          <div style={{ display: "grid", gap: 6, marginBottom: 8 }}>
            {recommendations.map((r, idx) => (
              <div key={r.action} style={recommendationRow}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700 }}>{idx + 1}. {r.action}</div>
                  <span style={confidencePill(r.confidence)}>Confidence {r.confidence}</span>
                </div>
                <div style={{ fontSize: 10, opacity: 0.8 }}>{r.rationale}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 3 }}>
                  <span style={chip}>ROI {r.roiScore.toFixed(0)}</span>
                  <span style={chip}>Effort {r.effort}</span>
                </div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>Sensitivity Scenario Test (NOT tied to recommendation rank)</div>
          <SensitivityScenarioTable points={sensitivity} />
        </div>
      </div>

      {savedScenarios.length > 0 && (
        <div style={{ ...sectionCard, marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Scenario Compare Mode</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ background: "rgba(20,150,255,0.1)" }}>
                <th style={th}>Scenario</th>
                <th style={th}>Monthly Benefit</th>
                <th style={th}>Payback</th>
                <th style={th}>Decision</th>
                <th style={th}>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {savedScenarios.map((s) => (
                <tr key={s.id}>
                  <td style={td}>{s.name}</td>
                  <td style={td}>{fmtUsd(s.monthlyBenefit)}</td>
                  <td style={td}>{s.paybackMonths.toFixed(1)} months</td>
                  <td style={td}>{s.recommendation}</td>
                  <td style={td}>{s.confidenceScore.toFixed(0)} / 100</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ ...sectionCard, background: "rgba(255,190,80,0.12)", borderColor: "rgba(255,180,50,0.35)", marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 5 }}>Risks and Caveats</div>
        {risks.map((r, i) => (
          <div key={i} style={{ fontSize: 11, marginBottom: 3 }}><strong>{r.level}:</strong> {r.text}</div>
        ))}
      </div>

      <div style={{ ...sectionCard, background: decisionBg(decision.decision), borderColor: decisionBorder(decision.decision), marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700 }}>Executive Decision: {decision.decision}</div>
        <div style={{ fontSize: 11, marginTop: 4 }}>{decision.rationale}</div>
      </div>

      <div style={{ fontSize: 11, opacity: 0.74 }}>
        <strong>Assumptions:</strong> {assumptions.join(" | ")}
      </div>
    </div>
  );
};

const SensitivityScenarioTable: React.FC<{ points: { label: string; paybackMonths: number; incidentDeltaPct: number }[] }> = ({ points }) => {
  const display = points.slice(0, 3);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: 10, opacity: 0.78 }}>Simple read: if incidents go up, payback gets faster; if incidents go down, payback slows.</div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10.5 }}>
        <thead>
          <tr style={{ background: "rgba(20,150,255,0.10)" }}>
            <th style={th}>Scenario</th>
            <th style={th}>Incident Volume</th>
            <th style={th}>Expected Payback</th>
          </tr>
        </thead>
        <tbody>
          {display.map((p) => (
            <tr key={`${p.label}-${p.incidentDeltaPct}`}>
              <td style={td}>{p.incidentDeltaPct < 0 ? "Lower incidents" : p.incidentDeltaPct > 0 ? "Higher incidents" : "Expected baseline"}</td>
              <td style={td}>{p.incidentDeltaPct > 0 ? "+" : ""}{p.incidentDeltaPct}%</td>
              <td style={td}>{formatPaybackDetailed(p.paybackMonths)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

function deriveSignals(metrics: BusinessDatum[], assumptions: string[]) {
  const paybackRaw = metrics.find((m) => /payback/i.test(m.label))?.value ?? "";
  const monthlyRaw = metrics.find((m) => /monthly benefit/i.test(m.label))?.value ?? "";
  const mttrRaw = metrics.find((m) => /^MTTR$/i.test(m.label))?.value ?? "";
  const paybackMonths = parseNumber(paybackRaw) ?? 12;
  const monthlyBenefit = parseCurrency(monthlyRaw) ?? 0;
  const mttrDelta = parseArrowDelta(mttrRaw);
  const confidenceScore = Math.max(40, Math.min(95,
    60
    + (paybackMonths <= 2 ? 18 : paybackMonths <= 6 ? 8 : -6)
    + (mttrDelta > 20 ? 10 : mttrDelta > 8 ? 4 : -3)
    + (monthlyBenefit > 10000 ? 7 : monthlyBenefit > 3000 ? 3 : -2)
  ));

  return { paybackMonths, monthlyBenefit, confidenceScore, assumptions };
}

function buildRecommendations(signals: { paybackMonths: number; monthlyBenefit: number; confidenceScore: number }): Recommendation[] {
  const base: Recommendation[] = [
    {
      action: "Expand telemetry only for high-revenue transaction paths",
      effort: "Low",
      confidence: confidenceForRecommendation(0, signals.confidenceScore),
      roiScore: 100 / Math.max(0.5, signals.paybackMonths),
      rationale: "Targets highest financial impact first while controlling ingest growth.",
    },
    {
      action: "Apply selective retention and query controls on low-value signals",
      effort: "Medium",
      confidence: confidenceForRecommendation(1, signals.confidenceScore),
      roiScore: (signals.monthlyBenefit / 1000) * 0.6,
      rationale: "Protects ROI by reducing avoidable scanned/retained volume.",
    },
    {
      action: "Operationalize rollout with a 30-day pilot and KPI gates",
      effort: "Medium",
      confidence: confidenceForRecommendation(2, signals.confidenceScore),
      roiScore: 35,
      rationale: "De-risks adoption while proving MTTR and detection improvements.",
    },
  ];

  return base.sort((a, b) => b.roiScore - a.roiScore);
}

function buildBenchmarkStrip(metrics: BusinessDatum[]): BenchmarkDatum[] {
  return metrics.slice(0, 3).map((m, i) => {
    const parsed = parseArrowValues(m.value);
    const before = parsed.before ?? (parseNumber(m.value) ?? 0);
    const target = parsed.after ?? before;
    const direction = target >= before ? 1 : -1;
    const industry = target + direction * Math.abs(target - before) * 0.2;
    const unit = /%/.test(m.value) ? "%" : /m/.test(m.value) ? "m" : /h/.test(m.value) ? "h" : "";
    return { metric: cleanMetricName(m.label, i), before, target, industry, unit };
  });
}

function buildSensitivity(paybackMonths: number) {
  const base = Math.max(0.1, paybackMonths);
  const deltas = [-20, 0, 20];
  return deltas.map((d) => {
    const factor = 1 + d / 100;
    return {
      label: `${d > 0 ? "+" : ""}${d}%`,
      paybackMonths: base / Math.max(0.35, factor),
      incidentDeltaPct: d,
    };
  });
}

function formatPaybackDetailed(months: number): string {
  if (months < 1) {
    const days = Math.max(1, Math.round(months * 30));
    return `${months.toFixed(2)} months (~${days} days)`;
  }
  return `${months.toFixed(2)} months`;
}

function buildRisks(assumptions: string[]) {
  return assumptions.slice(0, 3).map((a, i) => ({
    level: i === 0 ? "High" : i === 1 ? "Medium" : "Medium",
    text: a,
  }));
}

function decide(paybackMonths: number, confidenceScore: number): { decision: Decision; rationale: string } {
  if (paybackMonths <= 3 && confidenceScore >= 70) {
    return { decision: "Proceed", rationale: `Modeled payback (${paybackMonths.toFixed(1)} months) and confidence (${confidenceScore.toFixed(0)}/100) meet rollout criteria.` };
  }
  if (paybackMonths <= 8 || confidenceScore >= 58) {
    return { decision: "Pilot", rationale: `Economic signal is positive but should be validated via limited-scope deployment before broad rollout.` };
  }
  return { decision: "Reassess", rationale: `Current assumptions suggest weak or uncertain return; refine scope and assumptions before investment.` };
}

function confidenceForRecommendation(idx: number, base: number): Confidence {
  const value = base - idx * 8;
  if (value >= 75) return "High";
  if (value >= 58) return "Medium";
  return "Low";
}

function parseArrowValues(v: string): { before: number | null; after: number | null } {
  const m = v.match(/(-?\d+(?:\.\d+)?)\s*[a-zA-Z%]*\s*[-=]+>\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return { before: null, after: null };
  return { before: Number(m[1]), after: Number(m[2]) };
}

function parseArrowDelta(v: string): number {
  const parsed = parseArrowValues(v);
  if (parsed.before == null || parsed.after == null || parsed.before === 0) return 0;
  return Math.abs((parsed.before - parsed.after) / parsed.before) * 100;
}

function parseNumber(v: string): number | null {
  const m = v.match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  return Number(m[0]);
}

function parseCurrency(v: string): number | null {
  const m = v.replace(/,/g, "").match(/\$\s*(-?\d+(?:\.\d+)?)([KMB])?/i);
  if (!m) return null;
  const n = Number(m[1]);
  const scale = (m[2] || "").toUpperCase();
  if (scale === "K") return n * 1e3;
  if (scale === "M") return n * 1e6;
  if (scale === "B") return n * 1e9;
  return n;
}

function fmtUsd(v: number): string {
  return `$${Math.round(v).toLocaleString()}`;
}

function fmtShort(v: number, unit: string): string {
  return `${Number.isFinite(v) ? v.toFixed(v >= 100 ? 0 : 1) : "0"}${unit}`;
}

function cleanMetricName(label: string, idx: number): string {
  if (label.length <= 24) return label;
  return `${idx + 1}. ${label.slice(0, 22)}...`;
}

function decisionBg(d: Decision): string {
  if (d === "Proceed") return "rgba(130,220,160,0.16)";
  if (d === "Pilot") return "rgba(255,210,100,0.18)";
  return "rgba(255,140,140,0.18)";
}

function decisionBorder(d: Decision): string {
  if (d === "Proceed") return "rgba(70,160,95,0.35)";
  if (d === "Pilot") return "rgba(180,130,35,0.35)";
  return "rgba(175,70,70,0.35)";
}

const btnReport: React.CSSProperties = {
  marginLeft: 8,
  padding: "4px 10px",
  borderRadius: 4,
  border: "1px solid rgba(20,150,255,0.55)",
  background: "rgba(20,150,255,0.14)",
  color: "inherit",
  fontSize: 11,
  cursor: "pointer",
};

const btnSecondary: React.CSSProperties = {
  ...btnReport,
  border: "1px solid rgba(128,128,128,0.35)",
  background: "rgba(128,128,128,0.08)",
};

const sectionCard: React.CSSProperties = {
  border: "1px solid rgba(128,128,128,0.35)",
  borderRadius: 6,
  padding: 8,
  background: "rgba(128,128,128,0.05)",
};

const metricCard: React.CSSProperties = {
  border: "1px solid rgba(128,128,128,0.35)",
  borderRadius: 6,
  padding: "8px 10px",
  background: "rgba(128,128,128,0.07)",
};

const benchmarkCard: React.CSSProperties = {
  border: "1px solid rgba(20,150,255,0.25)",
  borderRadius: 6,
  padding: 6,
  background: "rgba(20,150,255,0.08)",
};

const analysisRow: React.CSSProperties = {
  fontSize: 12,
  lineHeight: 1.4,
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid rgba(20,150,255,0.25)",
  background: "linear-gradient(90deg, rgba(20,150,255,0.14), rgba(20,150,255,0.04))",
  display: "flex",
  gap: 8,
  alignItems: "center",
};

const thinkingRow: React.CSSProperties = {
  fontSize: 12,
  lineHeight: 1.45,
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px dashed rgba(20,150,255,0.35)",
  background: "rgba(20,150,255,0.07)",
  color: "rgba(128,128,128,0.95)",
};

const recommendationRow: React.CSSProperties = {
  border: "1px solid rgba(128,128,128,0.28)",
  borderRadius: 6,
  padding: "6px 8px",
  background: "rgba(128,128,128,0.05)",
};

const chip: React.CSSProperties = {
  fontSize: 10,
  border: "1px solid rgba(128,128,128,0.32)",
  borderRadius: 99,
  padding: "1px 6px",
  background: "rgba(128,128,128,0.08)",
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "5px 6px",
  borderBottom: "1px solid rgba(128,128,128,0.3)",
};

const td: React.CSSProperties = {
  padding: "5px 6px",
  borderBottom: "1px solid rgba(128,128,128,0.2)",
};

function confidencePill(c: Confidence): React.CSSProperties {
  if (c === "High") return { ...chip, background: "rgba(130,220,160,0.24)", borderColor: "rgba(70,160,95,0.35)", fontWeight: 700 };
  if (c === "Medium") return { ...chip, background: "rgba(255,210,100,0.23)", borderColor: "rgba(180,130,35,0.35)", fontWeight: 700 };
  return { ...chip, background: "rgba(255,140,140,0.22)", borderColor: "rgba(175,70,70,0.35)", fontWeight: 700 };
}
