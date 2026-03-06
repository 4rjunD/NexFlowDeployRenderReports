// ─────────────────────────────────────────────────────────────
// Shared report HTML builder — used by both /pdf preview and email PDF
// ─────────────────────────────────────────────────────────────

import { format } from "date-fns";
import { HealthScore } from "@/lib/scoring/health-score";

function n(val: unknown): number {
  if (typeof val === "number") return val;
  if (typeof val === "string") return parseFloat(val) || 0;
  return 0;
}
function fmt(v: number, d = 1): string {
  if (v === 0) return "0";
  if (Number.isInteger(v)) return v.toLocaleString();
  return v.toFixed(d);
}
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function computeKPIs(integrationData: Record<string, any>) {
  const kpis: { label: string; value: string; detail: string }[] = [];
  const gh = integrationData.github;
  const sl = integrationData.slack;
  const ln = integrationData.linear;
  const cal = integrationData.googleCalendar;

  if (ln) {
    const issues = ln.issues || {};
    const total = n(issues.total);
    const completed = n(issues.completed);
    if (total > 0) {
      const pct = Math.round((completed / total) * 100);
      kpis.push({ label: "Issue Completion", value: `${pct}%`, detail: `${completed} of ${total} issues` });
    }
  }
  if (gh) {
    const pr = typeof gh.pullRequests === "object" ? gh.pullRequests : {};
    const mergeTime = n(pr.avgMergeTimeHours);
    if (mergeTime > 0) kpis.push({ label: "PR Cycle Time", value: mergeTime < 24 ? `${fmt(mergeTime)}h` : `${fmt(mergeTime / 24)}d`, detail: "avg time to merge" });
    const merged = n(pr.merged);
    if (merged > 0) kpis.push({ label: "PRs Merged", value: `${merged}`, detail: `of ${n(pr.opened)} opened` });
    const rev = typeof gh.reviews === "object" ? gh.reviews : {};
    const turnaround = n(rev.avgTurnaroundTimeHours);
    if (turnaround > 0) kpis.push({ label: "Review Turnaround", value: turnaround < 24 ? `${fmt(turnaround)}h` : `${fmt(turnaround / 24)}d`, detail: "avg first review" });
  }
  if (cal) {
    const m = cal.meetings || {};
    const ft = cal.focusTime || {};
    const avgFocus = n(typeof ft === "number" ? ft : ft.avgFocusHoursPerDay);
    if (avgFocus > 0) kpis.push({ label: "Focus Time", value: `${fmt(avgFocus)}h/day`, detail: "avg deep work" });
    const totalHours = n(m.totalHours);
    if (totalHours > 0) kpis.push({ label: "Meeting Load", value: `${fmt(totalHours)}h`, detail: `${n(m.total)} meetings total` });
  }
  if (sl) {
    const msgs = n(sl.totalMessages);
    if (msgs > 0) kpis.push({ label: "Slack Messages", value: msgs.toLocaleString(), detail: `across ${n(sl.activeChannels)} channels` });
  }

  return kpis.slice(0, 6);
}

function formatInline(text: string): string {
  let result = text.replace(/:::highlight\[([^\]]+)\]/g, '<span class="hl">$1</span>');
  result = result.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return result;
}

export function renderNarrative(text: string): string {
  const lines = text.split("\n");
  let html = "";
  let inCallout = false;
  let calloutType = "";
  let calloutContent = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith(":::callout-risk")) {
      inCallout = true; calloutType = "risk"; calloutContent = ""; continue;
    }
    if (trimmed.startsWith(":::callout-positive")) {
      inCallout = true; calloutType = "positive"; calloutContent = ""; continue;
    }
    if (trimmed.startsWith(":::callout-info")) {
      inCallout = true; calloutType = "info"; calloutContent = ""; continue;
    }
    if (trimmed === ":::" && inCallout) {
      const cls = calloutType === "risk" ? "callout-risk" : calloutType === "positive" ? "callout-pos" : "callout-info";
      const label = calloutType === "risk" ? "RISK" : calloutType === "positive" ? "FINDING" : "OBSERVATION";
      html += `<div class="callout ${cls}"><div class="callout-label">${label}</div><div class="callout-body">${formatInline(calloutContent.trim())}</div></div>`;
      inCallout = false; calloutContent = ""; continue;
    }
    if (inCallout) { calloutContent += line + "\n"; continue; }

    if (!trimmed) { html += '<div style="height:4px"></div>'; continue; }

    if (trimmed.startsWith("## ")) {
      const title = trimmed.slice(3);
      html += `<div class="page-break"></div>`;
      html += `<h2 class="s-title">${esc(title).replace(/&amp;/g, "&")}</h2><div class="s-rule"></div>`;
      continue;
    }

    if (trimmed.startsWith("### ")) {
      html += `<h3 class="ss-title">${formatInline(trimmed.slice(4))}</h3>`;
      continue;
    }

    const actionMatch = trimmed.match(/^(\d+)\.\s+\*\*(.+?)\*\*\s*[—–-]\s*(.+)/);
    if (actionMatch) {
      html += `<div class="rec"><div class="rec-num">${actionMatch[1]}</div><div class="rec-body"><strong>${esc(actionMatch[2])}</strong><span class="rec-detail"> — ${formatInline(actionMatch[3])}</span></div></div>`;
      continue;
    }

    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      const content = trimmed.slice(2);
      if (content.startsWith("[") || lines[i - 1]?.trim().toLowerCase().includes("action step")) {
        html += `<div class="step">${formatInline(content.replace(/^\[.\]\s*/, ""))}</div>`;
      } else {
        html += `<li class="bul">${formatInline(content)}</li>`;
      }
      continue;
    }

    if (trimmed.toLowerCase() === "action steps:" || trimmed.toLowerCase() === "action steps") {
      html += `<div class="steps-label">ACTION STEPS</div>`;
      continue;
    }

    html += `<p class="p">${formatInline(trimmed)}</p>`;
  }

  return html;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildDataTables(integrationData: Record<string, any>): string {
  let html = "";
  const gh = integrationData.github;
  const ln = integrationData.linear;

  if (gh) {
    const pr = typeof gh.pullRequests === "object" ? gh.pullRequests : {};
    const openedByAuthor = pr.openedByAuthor || {};
    const mergedByAuthor = pr.mergedByAuthor || {};
    const byReviewer = (typeof gh.reviews === "object" ? gh.reviews : {}).byReviewer || {};

    if (Object.keys(openedByAuthor).length > 0) {
      html += `<h3 class="ss-title">Exhibit A: PR Activity by Author</h3>`;
      html += `<table class="tbl"><thead><tr><th>Author</th><th>Opened</th><th>Merged</th></tr></thead><tbody>`;
      const authors = Array.from(new Set([...Object.keys(openedByAuthor), ...Object.keys(mergedByAuthor)]));
      for (const a of authors) {
        html += `<tr><td>${esc(a)}</td><td>${openedByAuthor[a] || 0}</td><td>${mergedByAuthor[a] || 0}</td></tr>`;
      }
      html += `</tbody></table>`;
    }

    if (Object.keys(byReviewer).length > 0) {
      html += `<h3 class="ss-title">Exhibit B: Review Load Distribution</h3>`;
      html += `<table class="tbl"><thead><tr><th>Reviewer</th><th>Reviews</th><th>Share</th></tr></thead><tbody>`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const totalR = Object.values(byReviewer).reduce((a: number, b: any) => a + n(b), 0);
      for (const [reviewer, count] of Object.entries(byReviewer).sort((a, b) => n(b[1]) - n(a[1]))) {
        const pct = totalR > 0 ? Math.round((n(count) / totalR) * 100) : 0;
        html += `<tr><td>${esc(reviewer)}</td><td>${count}</td><td>${pct}%</td></tr>`;
      }
      html += `</tbody></table>`;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (ln?.issues?.byAssignee && Object.keys(ln.issues.byAssignee).length > 0) {
    html += `<h3 class="ss-title">Exhibit C: Issue Workload by Assignee</h3>`;
    html += `<table class="tbl"><thead><tr><th>Assignee</th><th>Total</th><th>Done</th><th>In Progress</th></tr></thead><tbody>`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const [name, stats] of Object.entries(ln.issues.byAssignee) as [string, any][]) {
      html += `<tr><td>${esc(name)}</td><td>${stats.total}</td><td>${stats.completed}</td><td>${stats.inProgress}</td></tr>`;
    }
    html += `</tbody></table>`;
  }

  if (ln?.issues?.byPriority && Object.keys(ln.issues.byPriority).length > 0) {
    html += `<h3 class="ss-title">Exhibit D: Issues by Priority</h3>`;
    html += `<table class="tbl"><thead><tr><th>Priority</th><th>Count</th></tr></thead><tbody>`;
    for (const [pri, count] of Object.entries(ln.issues.byPriority)) {
      html += `<tr><td>${esc(pri)}</td><td>${count}</td></tr>`;
    }
    html += `</tbody></table>`;
  }

  return html;
}

function buildHealthScoreSection(hs: HealthScore): string {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const progress = (hs.overall / 100) * circumference;
  const dashOffset = circumference - progress;

  const dimensionRows = hs.dimensions.map((d) => `
    <tr>
      <td class="dim-name">${esc(d.label)}</td>
      <td class="dim-bar-cell"><div class="dim-track"><div class="dim-fill" style="width:${d.score}%"></div></div></td>
      <td class="dim-val">${d.score}</td>
      <td class="dim-desc">${esc(d.summary)}</td>
    </tr>
  `).join("");

  return `
  <div class="hs-section">
    <div class="hs-header">
      <div class="hs-score-block">
        <svg viewBox="0 0 100 100" class="hs-ring">
          <circle cx="50" cy="50" r="${radius}" fill="none" stroke="#e5e5e5" stroke-width="6"/>
          <circle cx="50" cy="50" r="${radius}" fill="none" stroke="#1a1a1a" stroke-width="6"
            stroke-dasharray="${circumference}" stroke-dashoffset="${dashOffset}"
            stroke-linecap="butt" transform="rotate(-90 50 50)"/>
        </svg>
        <div class="hs-inner">
          <div class="hs-num">${hs.overall}</div>
        </div>
      </div>
      <div class="hs-meta">
        <div class="hs-grade">${hs.grade}</div>
        <div class="hs-grade-sub">Engineering Health Index</div>
        <div class="hs-note">Scored 0–100 across 5 dimensions. This index is tracked period-over-period to measure your team's progression.</div>
      </div>
    </div>
    <table class="hs-dims">
      <thead><tr><th>Dimension</th><th style="width:30%"></th><th>Score</th><th>Detail</th></tr></thead>
      <tbody>${dimensionRows}</tbody>
    </table>
  </div>`;
}

function buildProgressionSection(): string {
  return `
  <div class="prog-section">
    <h3 class="ss-title">How This Report Tracks Your Progression</h3>
    <p class="p">Each report captures a snapshot of your engineering organization's operational health. Over successive reporting periods, NexFlow tracks the following to measure your progression:</p>
    <table class="tbl">
      <thead><tr><th>Metric</th><th>What We Measure</th><th>Why It Matters</th></tr></thead>
      <tbody>
        <tr><td>Health Index</td><td>Composite score across 5 dimensions, period-over-period delta</td><td>Single number to track overall engineering effectiveness over time</td></tr>
        <tr><td>Delivery Velocity</td><td>PRs merged, commit volume, merge time trend</td><td>Leading indicator of shipping capacity and process efficiency</td></tr>
        <tr><td>Code Quality</td><td>Review coverage, turnaround, reviewer distribution</td><td>Proxy for code quality gates and knowledge distribution</td></tr>
        <tr><td>Sprint Execution</td><td>Issue completion rate, cycle throughput</td><td>Measures predictability and ability to deliver against commitments</td></tr>
        <tr><td>Team Capacity</td><td>Focus time ratio, meeting load trend</td><td>Quantifies available engineering bandwidth for deep work</td></tr>
        <tr><td>Communication</td><td>Channel activity, contributor spread</td><td>Indicates collaboration health and information flow</td></tr>
      </tbody>
    </table>
    <p class="p">Recommended actions from each report carry forward. Subsequent reports will assess whether prior recommendations were addressed and measure the resulting impact on your metrics.</p>
  </div>`;
}

const CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1a1a1a; background: #fff; line-height: 1.5; font-size: 13px; }

  @media print {
    .no-print { display: none !important; }
    @page { margin: 0.5in; size: letter; }
    .page-break { page-break-before: always; }
  }

  .page { max-width: 780px; margin: 0 auto; padding: 28px 36px 24px; }

  /* ── Header ── */
  .rpt-header { margin-bottom: 0; }
  .rpt-header-top { display: flex; justify-content: space-between; align-items: flex-end; padding-bottom: 8px; border-bottom: 2px solid #1a1a1a; }
  .rpt-brand { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #1a1a1a; }
  .rpt-title { font-size: 22px; font-weight: 700; color: #1a1a1a; margin-top: 10px; line-height: 1.2; }
  .rpt-subtitle { font-size: 12px; color: #666; margin-top: 3px; }
  .rpt-org { text-align: right; }
  .rpt-org-name { font-size: 13px; font-weight: 700; color: #1a1a1a; }
  .rpt-date { font-size: 11px; color: #888; }
  .rpt-confidential { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: #aaa; margin-top: 2px; }

  /* ── Health Score ── */
  .hs-section { margin: 14px 0 10px; }
  .hs-header { display: flex; align-items: center; gap: 18px; margin-bottom: 10px; }
  .hs-score-block { position: relative; width: 80px; height: 80px; flex-shrink: 0; }
  .hs-ring { width: 80px; height: 80px; }
  .hs-inner { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; }
  .hs-num { font-size: 26px; font-weight: 700; color: #1a1a1a; line-height: 1; }
  .hs-meta { flex: 1; }
  .hs-grade { font-size: 20px; font-weight: 700; color: #1a1a1a; line-height: 1; }
  .hs-grade-sub { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-top: 2px; }
  .hs-note { font-size: 11px; color: #888; margin-top: 4px; line-height: 1.4; }
  .hs-dims { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 6px; }
  .hs-dims th { text-align: left; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #aaa; padding: 5px 8px; border-bottom: 1px solid #ddd; }
  .hs-dims td { padding: 4px 8px; border-bottom: 1px solid #eee; }
  .dim-name { font-weight: 600; color: #1a1a1a; width: 120px; }
  .dim-bar-cell { width: 28%; }
  .dim-track { height: 6px; background: #e5e5e5; }
  .dim-fill { height: 100%; background: #1a1a1a; }
  .dim-val { font-weight: 700; color: #1a1a1a; width: 40px; text-align: right; }
  .dim-desc { color: #666; font-size: 11px; }

  /* ── KPIs ── */
  .kpi-strip { display: flex; border-top: 1px solid #1a1a1a; border-bottom: 1px solid #ddd; margin: 10px 0; }
  .kpi-item { flex: 1; padding: 10px 12px; border-right: 1px solid #ddd; }
  .kpi-item:last-child { border-right: none; }
  .kpi-lbl { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #888; }
  .kpi-val { font-size: 20px; font-weight: 700; color: #1a1a1a; line-height: 1.2; margin-top: 2px; }
  .kpi-det { font-size: 11px; color: #888; }

  /* ── Sections ── */
  .s-title { font-size: 16px; font-weight: 700; color: #1a1a1a; margin: 14px 0 0; text-transform: uppercase; letter-spacing: 0.5px; }
  .s-rule { height: 1px; background: #1a1a1a; margin: 4px 0 10px; }
  .ss-title { font-size: 13px; font-weight: 700; color: #1a1a1a; margin: 12px 0 5px; }

  /* ── Body text ── */
  .p { font-size: 13px; line-height: 1.55; color: #333; margin-bottom: 8px; }
  .p strong { color: #1a1a1a; }
  .bul { font-size: 13px; line-height: 1.55; color: #333; margin: 0 0 4px 18px; list-style-type: disc; }
  .bul strong { color: #1a1a1a; }
  .hl { font-weight: 700; color: #1a1a1a; border-bottom: 1px solid #1a1a1a; }

  /* ── Callouts ── */
  .callout { border-left: 3px solid #1a1a1a; padding: 8px 12px; margin: 8px 0 10px; font-size: 12px; line-height: 1.5; color: #333; background: #fafafa; }
  .callout strong { color: #1a1a1a; }
  .callout-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-bottom: 3px; }
  .callout-body { }
  .callout-risk { border-left-color: #c00; }
  .callout-risk .callout-label { color: #c00; }
  .callout-pos { border-left-color: #1a1a1a; }
  .callout-info { border-left-color: #666; }
  .callout-info .callout-label { color: #666; }

  /* ── Recommendations ── */
  .rec { display: flex; align-items: flex-start; gap: 10px; margin: 6px 0; padding: 8px 0; border-bottom: 1px solid #eee; }
  .rec-num { font-size: 13px; font-weight: 700; color: #1a1a1a; min-width: 18px; }
  .rec-body { font-size: 13px; line-height: 1.5; color: #333; }
  .rec-detail { color: #666; }
  .steps-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #888; margin: 8px 0 4px; }
  .step { font-size: 12px; color: #333; margin: 3px 0; padding-left: 18px; line-height: 1.45; }
  .step::before { content: "—"; margin-left: -16px; margin-right: 6px; color: #888; }

  /* ── Tables ── */
  .tbl { width: 100%; border-collapse: collapse; font-size: 12px; margin: 6px 0 12px; }
  .tbl th { text-align: left; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #888; padding: 5px 10px; border-bottom: 1px solid #1a1a1a; }
  .tbl td { padding: 5px 10px; border-bottom: 1px solid #eee; color: #333; }
  .tbl tr:last-child td { border-bottom: none; }

  /* ── Progression ── */
  .prog-section { margin-top: 12px; }

  /* ── Footer ── */
  .rpt-footer { display: flex; justify-content: space-between; margin-top: 20px; padding-top: 8px; border-top: 1px solid #ddd; font-size: 9px; color: #aaa; text-transform: uppercase; letter-spacing: 0.5px; }

  /* ── Download bar ── */
  .download-bar { position: fixed; top: 0; left: 0; right: 0; background: #1a1a1a; color: white; padding: 10px 24px; display: flex; align-items: center; justify-content: center; gap: 16px; z-index: 50; }
  .download-bar button { background: #444; color: white; border: none; padding: 8px 24px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .download-bar button:hover { background: #555; }
  .download-bar + .page { margin-top: 48px; }
`;

interface ReportHtmlOptions {
  title: string;
  orgName: string;
  periodStart: Date;
  periodEnd: Date;
  generatedAt: Date | null;
  aiNarrative: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: Record<string, any>;
  showDownloadBar?: boolean;
  healthScore?: HealthScore | null;
}

export function buildReportHtml(opts: ReportHtmlOptions): string {
  const {
    title,
    orgName,
    periodStart,
    periodEnd,
    generatedAt,
    aiNarrative,
    content,
    showDownloadBar = false,
    healthScore = null,
  } = opts;

  const integrationData = content.integrationData || {};
  const kpis = computeKPIs(integrationData);
  const periodLabel = `${format(periodStart, "MMM d")} – ${format(periodEnd, "MMM d, yyyy")}`;
  const genDate = generatedAt ? format(generatedAt, "MMM d, yyyy") : format(new Date(), "MMM d, yyyy");

  const narrativeHtml = aiNarrative ? renderNarrative(aiNarrative) : "<p class=\"p\">Report content is being generated.</p>";
  const dataTablesHtml = buildDataTables(integrationData);
  const healthScoreHtml = healthScore ? buildHealthScoreSection(healthScore) : "";
  const progressionHtml = buildProgressionSection();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} — NexFlow</title>
<style>${CSS}</style>
</head>
<body>

${showDownloadBar ? `<div class="download-bar no-print">
  <span style="font-size:12px">Report Preview — ${esc(orgName)}</span>
  <button onclick="window.print()">Download PDF</button>
</div>` : ""}

<div class="page">

  <div class="rpt-header">
    <div class="rpt-header-top">
      <div>
        <div class="rpt-brand">NexFlow Engineering Intelligence</div>
      </div>
      <div class="rpt-org">
        <div class="rpt-org-name">${esc(orgName)}</div>
        <div class="rpt-date">${esc(genDate)}</div>
        <div class="rpt-confidential">Confidential</div>
      </div>
    </div>
    <div class="rpt-title">${esc(title)}</div>
    <div class="rpt-subtitle">Reporting Period: ${esc(periodLabel)}</div>
  </div>

  ${healthScoreHtml}

  ${kpis.length > 0 ? `
  <div class="kpi-strip">
    ${kpis.map((k) => `
    <div class="kpi-item">
      <div class="kpi-lbl">${esc(k.label)}</div>
      <div class="kpi-val">${esc(k.value)}</div>
      <div class="kpi-det">${esc(k.detail)}</div>
    </div>`).join("")}
  </div>` : ""}

  ${narrativeHtml}

  ${dataTablesHtml ? `<div class="page-break"></div><h2 class="s-title">Data Appendix</h2><div class="s-rule"></div>${dataTablesHtml}` : ""}

  <div class="page-break"></div>
  <h2 class="s-title">Methodology & Progression Tracking</h2>
  <div class="s-rule"></div>
  ${progressionHtml}

  <div class="rpt-footer">
    <span>NexFlow Engineering Intelligence</span>
    <span>${esc(orgName)} — Confidential</span>
  </div>

</div>
</body>
</html>`;
}
