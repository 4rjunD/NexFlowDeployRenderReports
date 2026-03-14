// ─────────────────────────────────────────────────────────────
// NexFlow Report HTML — Discovery-Based Storytelling Design
// Each report section is a "discovery card" that tells a story
// with big numbers, color-coded severity, and narrative context.
// ─────────────────────────────────────────────────────────────

import { format } from "date-fns";
import { HealthScore } from "@/lib/scoring/health-score";

// ── Helpers ──

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
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function pct(a: number, b: number): number {
  return b > 0 ? Math.round((a / b) * 100) : 0;
}

// ── Types ──

type DiscoveryColor = "red" | "amber" | "green" | "blue" | "purple" | "neutral";

interface Discovery {
  color: DiscoveryColor;
  label: string; // e.g. "Attention needed", "Bright spot"
  sources: string[]; // e.g. ["github", "jira"]
  headline: string;
  body: string; // HTML allowed
  bigNum?: { value: string; label: string };
  dataGrid?: { value: string; label: string; color?: string }[];
  personRows?: { initials: string; name: string; detail: string; badge: string; badgeColor: DiscoveryColor }[];
  timeline?: { color: DiscoveryColor; text: string }[];
}

interface WeekStat {
  value: string;
  label: string;
  delta: string;
  direction: "up" | "down" | "flat";
}

// ── KPI computation (exported for email use) ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function computeKPIs(integrationData: Record<string, any>) {
  const kpis: { label: string; value: string; detail: string }[] = [];
  const gh = integrationData.github;
  const sl = integrationData.slack;
  const ln = integrationData.linear;
  const jr = integrationData.jira;
  const cal = integrationData.googleCalendar;

  const issueSource = jr || ln;
  if (issueSource) {
    const issues = issueSource.issues || {};
    const total = n(issues.total);
    const completed = n(issues.completed);
    if (total > 0) {
      kpis.push({ label: "Issue Completion", value: `${pct(completed, total)}%`, detail: `${completed} of ${total} issues` });
    }
  }
  if (gh) {
    const pr = typeof gh.pullRequests === "object" ? gh.pullRequests : {};
    const mergeTime = n(pr.avgMergeTimeHours);
    if (mergeTime > 0) kpis.push({ label: "PR Cycle Time", value: mergeTime < 24 ? `${fmt(mergeTime)}h` : `${fmt(mergeTime / 24)}d`, detail: "avg time to merge" });
    const merged = n(pr.merged);
    if (merged > 0) kpis.push({ label: "PRs Merged", value: `${merged}`, detail: `of ${n(pr.opened)} opened` });
  }
  if (cal) {
    const ft = cal.focusTime || {};
    const avgFocus = n(typeof ft === "number" ? ft : ft.avgFocusHoursPerDay);
    if (avgFocus > 0) kpis.push({ label: "Focus Time", value: `${fmt(avgFocus)}h/day`, detail: "avg deep work" });
    const meetingCost = n(cal.meetingCostEstimate);
    if (meetingCost > 0) kpis.push({ label: "Meeting Cost", value: `$${meetingCost.toLocaleString()}`, detail: "at $150/hr estimate" });
  }
  if (sl) {
    const msgs = n(sl.totalMessages);
    if (msgs > 0) kpis.push({ label: "Slack Messages", value: msgs.toLocaleString(), detail: `across ${n(sl.activeChannels)} channels` });
  }
  return kpis.slice(0, 6);
}

// ── Source tag helper ──

const SOURCE_META: Record<string, { css: string; label: string }> = {
  github: { css: "gh", label: "GitHub" },
  GITHUB: { css: "gh", label: "GitHub" },
  jira: { css: "jira", label: "Jira" },
  JIRA: { css: "jira", label: "Jira" },
  linear: { css: "linear", label: "Linear" },
  LINEAR: { css: "linear", label: "Linear" },
  slack: { css: "slack", label: "Slack" },
  SLACK: { css: "slack", label: "Slack" },
  googleCalendar: { css: "cal", label: "Calendar" },
  GOOGLE_CALENDAR: { css: "cal", label: "Calendar" },
  google: { css: "cal", label: "Calendar" },
};

function sourceTag(src: string): string {
  const meta = SOURCE_META[src] || { css: "neutral", label: src };
  return `<span class="source-tag ${meta.css}">${meta.label}</span>`;
}

function sourceTags(sources: string[]): string {
  return sources.map(sourceTag).join("");
}

// ── Discovery card renderer ──

function renderDiscovery(d: Discovery, index: number): string {
  let html = `<div class="discovery ${d.color}">`;
  html += `<div class="disc-num ${d.color}">${esc(d.label)}</div>`;

  if (d.sources.length > 0) {
    html += `<div>${sourceTags(d.sources)}</div>`;
  }

  if (d.bigNum) {
    html += `<div class="big-num ${d.color}">${d.bigNum.value}</div>`;
    html += `<div class="big-label">${esc(d.bigNum.label)}</div>`;
  }

  html += `<div class="disc-headline">${d.headline}</div>`;
  html += `<div class="disc-body">${d.body}</div>`;

  if (d.dataGrid && d.dataGrid.length > 0) {
    const cols = d.dataGrid.length >= 4 ? "four" : "";
    html += `<div class="data-grid ${cols}">`;
    for (const cell of d.dataGrid) {
      const colorStyle = cell.color ? ` style="color:var(--${cell.color})"` : "";
      html += `<div class="data-cell"><div class="val"${colorStyle}>${cell.value}</div><div class="label">${esc(cell.label)}</div></div>`;
    }
    html += `</div>`;
  }

  if (d.personRows && d.personRows.length > 0) {
    html += `<div style="margin-top:16px">`;
    for (const p of d.personRows) {
      html += `<div class="person-row">
        <div class="person-avatar">${esc(p.initials)}</div>
        <div class="person-info">
          <div class="person-name">${p.name}</div>
          <div class="person-detail">${p.detail}</div>
        </div>
        <div class="person-badge ${p.badgeColor}">${esc(p.badge)}</div>
      </div>`;
    }
    html += `</div>`;
  }

  if (d.timeline && d.timeline.length > 0) {
    html += `<div class="timeline">`;
    for (const t of d.timeline) {
      html += `<div class="timeline-item"><div class="timeline-dot ${t.color}"></div><div class="timeline-text">${t.text}</div></div>`;
    }
    html += `</div>`;
  }

  html += `</div>`;
  return html;
}

// ── Discovery generators ──
// Each function examines the data and returns 0+ discoveries

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function discoverHealthScore(hs: HealthScore | null, content: Record<string, any>): Discovery[] {
  if (!hs) return [];

  const priorReport = content.priorReport;
  const priorScore = priorReport?.keyMetrics?.healthScore as number | undefined;
  const delta = priorScore != null ? hs.overall - priorScore : null;
  const deltaStr = delta != null ? (delta > 0 ? `+${delta}` : `${delta}`) : null;

  const color: DiscoveryColor = hs.overall >= 80 ? "green" : hs.overall >= 60 ? "blue" : hs.overall >= 40 ? "amber" : "red";
  const label = hs.overall >= 80 ? "Strong performance" : hs.overall >= 60 ? "Good with room to grow" : hs.overall >= 40 ? "Needs attention" : "Urgent attention needed";

  const grid = hs.dimensions.map((d) => ({
    value: `${d.score}`,
    label: d.label,
    color: d.score >= 80 ? "green" : d.score >= 60 ? undefined : d.score >= 40 ? "amber" : "red",
  }));

  return [{
    color,
    label: "Engineering Health Index",
    sources: [],
    headline: delta != null
      ? `Your engineering health is ${hs.overall}/100 (${deltaStr} since last report). Grade: ${hs.grade}.`
      : `Your engineering health is ${hs.overall}/100. Grade: ${hs.grade}.`,
    body: `<strong>This composite score tracks 5 dimensions of engineering effectiveness.</strong> ` +
      hs.dimensions.map((d) =>
        `<strong>${d.label}</strong> scored ${d.score}/100 — ${d.summary.toLowerCase()}.`
      ).join(" ") +
      (delta != null && delta > 0 ? ` <strong>That's a ${delta}-point improvement since your last report.</strong>` : "") +
      (delta != null && delta < 0 ? ` That's a ${Math.abs(delta)}-point decline — worth investigating.` : ""),
    bigNum: { value: `${hs.overall}`, label: `Engineering Health Index · Grade ${hs.grade}${deltaStr ? ` · ${deltaStr} vs prior` : ""}` },
    dataGrid: grid,
  }];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function discoverSprintRisk(content: Record<string, any>): Discovery[] {
  const discoveries: Discovery[] = [];
  const jira = content.integrationData?.jira;
  const forecast = content.sprintForecast;
  const carryOver = content.sprintCarryOver;

  if (forecast && jira?.sprints?.active) {
    const sprint = jira.sprints.active;
    const predictedRate = n(forecast.predictedCompletionRate);
    const remaining = n(sprint.totalIssues) - n(sprint.completedIssues);
    const daysLeft = n(sprint.daysRemaining);
    const missProb = 100 - predictedRate;
    const color: DiscoveryColor = predictedRate < 70 ? "red" : predictedRate < 85 ? "amber" : "green";
    const label = predictedRate < 70 ? "Sprint risk" : predictedRate < 85 ? "Sprint forecast" : "Sprint on track";

    discoveries.push({
      color,
      label,
      sources: ["jira", "github"],
      headline: predictedRate < 80
        ? `${sprint.name} has a ${missProb}% chance of missing its target. ${remaining} issues remain with ${daysLeft} days left.`
        : `${sprint.name} is tracking at ${predictedRate}% predicted completion — ${remaining} issues remain.`,
      body: `<strong>${sprint.name}</strong>${sprint.goal ? ` ("${esc(sprint.goal)}")` : ""} has <strong>${sprint.completedIssues}/${sprint.totalIssues} issues completed</strong> with ${daysLeft} days remaining. ` +
        `Based on trailing velocity of <strong>${fmt(forecast.avgIssuesPerSprint)} issues/sprint</strong> (${forecast.confidence} confidence), ` +
        `we predict <strong>${forecast.predictedCompletion} of ${forecast.currentSprintPlanned}</strong> issues will be completed.` +
        (forecast.recommendation ? ` <strong>${esc(forecast.recommendation)}</strong>` : ""),
      bigNum: { value: `${predictedRate}%`, label: `Predicted sprint completion · ${forecast.confidence} confidence` },
      dataGrid: [
        { value: `${sprint.completedIssues}/${sprint.totalIssues}`, label: "Issues completed" },
        { value: `${daysLeft}`, label: "Days remaining" },
        { value: fmt(forecast.avgIssuesPerSprint), label: "Avg velocity (issues/sprint)" },
        { value: `${forecast.avgCompletionRate}%`, label: "Historical avg completion" },
      ],
    });
  }

  // Sprint carry-over
  if (carryOver?.carryOverCount > 0) {
    const issues = carryOver.carryOverIssues || [];
    discoveries.push({
      color: "amber",
      label: "Carry-over risk",
      sources: ["jira"],
      headline: `${carryOver.carryOverCount} issue${carryOver.carryOverCount > 1 ? "s are" : " is"} likely carrying over from the previous sprint.`,
      body: `These issues are still in "To Do" status late in the sprint — historically, tickets in this state at this point carry over <strong>78% of the time</strong>. Each carry-over delays dependent work and reduces sprint predictability.`,
      personRows: issues.slice(0, 5).map((i: { key: string; summary: string; assignee: string }) => ({
        initials: i.assignee.split(" ").map((w: string) => w[0]).join("").slice(0, 2),
        name: `${i.key}: ${i.summary}`,
        detail: `Assigned to ${i.assignee}`,
        badge: "Likely carry-over",
        badgeColor: "amber" as DiscoveryColor,
      })),
    });
  }

  // Sprint history
  if (jira?.sprints?.recentClosed?.length > 0) {
    const sprints = jira.sprints.recentClosed.slice(0, 5);
    const avgRate = Math.round(sprints.reduce((s: number, sp: { completionRate: number }) => s + sp.completionRate, 0) / sprints.length);
    const trend = sprints.length >= 2
      ? sprints[0].completionRate > sprints[sprints.length - 1].completionRate ? "improving" : "declining"
      : "stable";

    discoveries.push({
      color: avgRate >= 85 ? "green" : avgRate >= 70 ? "blue" : "amber",
      label: "Sprint velocity trend",
      sources: ["jira"],
      headline: `Sprint completion has been ${trend} — averaging ${avgRate}% across the last ${sprints.length} sprints.`,
      body: sprints.map((s: { name: string; completedIssues: number; totalIssues: number; completionRate: number }) =>
        `<strong>${esc(s.name)}</strong>: ${s.completedIssues}/${s.totalIssues} issues (${s.completionRate}%)`
      ).join(" · "),
      dataGrid: sprints.map((s: { name: string; completionRate: number }) => ({
        value: `${s.completionRate}%`,
        label: s.name,
        color: s.completionRate >= 85 ? "green" : s.completionRate >= 70 ? undefined : "red",
      })),
    });
  }

  return discoveries;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function discoverOverdueTickets(content: Record<string, any>): Discovery[] {
  const jira = content.integrationData?.jira;
  if (!jira?.issues?.overdue?.length) return [];

  const overdue = jira.issues.overdue;
  return [{
    color: "red",
    label: "Attention needed",
    sources: ["jira"],
    headline: `${overdue.length} ticket${overdue.length > 1 ? "s are" : " is"} overdue — the oldest by ${overdue[0].daysOverdue} days.`,
    body: `These tickets have passed their due dates and are blocking downstream work. Overdue tickets that aren't addressed within 2 weeks have a <strong>3x higher probability</strong> of being deprioritized without resolution — creating invisible tech debt.`,
    personRows: overdue.slice(0, 5).map((o: { key: string; summary: string; assignee: string; daysOverdue: number }) => ({
      initials: o.assignee.split(" ").map((w: string) => w[0]).join("").slice(0, 2),
      name: `${o.key}: ${o.summary}`,
      detail: `${o.assignee} · ${o.daysOverdue} days overdue`,
      badge: `${o.daysOverdue}d overdue`,
      badgeColor: (o.daysOverdue >= 10 ? "red" : "amber") as DiscoveryColor,
    })),
  }];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function discoverStalePRs(content: Record<string, any>): Discovery[] {
  const stalePrs = content.integrationData?.github?.pullRequests?.stalePrs;
  if (!stalePrs?.length) return [];

  const oldest = stalePrs[0];

  // A5: PR Aging Radar — bucket by age
  const bucket3to5 = stalePrs.filter((pr: { daysOpen: number }) => pr.daysOpen >= 3 && pr.daysOpen < 5);
  const bucket5to10 = stalePrs.filter((pr: { daysOpen: number }) => pr.daysOpen >= 5 && pr.daysOpen < 10);
  const bucket10plus = stalePrs.filter((pr: { daysOpen: number }) => pr.daysOpen >= 10);
  const totalStuckLOC = stalePrs.reduce((sum: number, pr: { additions: number; deletions: number }) => sum + n(pr.additions) + n(pr.deletions), 0);

  // Cross-reference with reviewer load
  const reviews = content.integrationData?.github?.reviews;
  let reviewerNote = "";
  if (reviews?.byReviewer && stalePrs.length >= 2) {
    const reviewerCounts = reviews.byReviewer as Record<string, number>;
    const totalReviews = n(reviews.total);
    const sorted = Object.entries(reviewerCounts).sort((a, b) => n(b[1]) - n(a[1]));
    if (sorted.length > 0) {
      const topReviewer = sorted[0][0];
      const topPct = pct(n(sorted[0][1]), totalReviews);
      const assignedToTop = stalePrs.filter((pr: { author: string }) => pr.author === topReviewer).length;
      if (assignedToTop > 0 && topPct >= 20) {
        reviewerNote = ` <strong>${assignedToTop} of ${stalePrs.length} stale PRs involve ${esc(topReviewer)} who handles ${topPct}% of all reviews</strong> — consider redistributing review load.`;
      }
    }
  }

  const agingGrid: { value: string; label: string; color?: string }[] = [];
  if (bucket3to5.length > 0) agingGrid.push({ value: `${bucket3to5.length}`, label: "3–5 days", color: "amber" });
  if (bucket5to10.length > 0) agingGrid.push({ value: `${bucket5to10.length}`, label: "5–10 days", color: "amber" });
  if (bucket10plus.length > 0) agingGrid.push({ value: `${bucket10plus.length}`, label: "10+ days", color: "red" });
  agingGrid.push({ value: totalStuckLOC.toLocaleString(), label: "LOC stuck in review" });

  return [{
    color: stalePrs.length >= 3 ? "red" : "amber",
    label: "PR aging radar",
    sources: ["github"],
    headline: `${stalePrs.length} PR${stalePrs.length > 1 ? "s have" : " has"} been open ${oldest.daysOpen}+ days — ${totalStuckLOC.toLocaleString()} lines of code are waiting to ship.`,
    body: `Stale PRs accumulate merge conflicts, increase context-switching costs, and delay feature delivery. PRs open longer than 7 days are <strong>4x more likely to be abandoned</strong> than merged.` +
      reviewerNote,
    bigNum: { value: totalStuckLOC.toLocaleString(), label: "Lines of code stuck in review" },
    dataGrid: agingGrid,
    personRows: stalePrs.slice(0, 5).map((pr: { title: string; author: string; daysOpen: number; additions: number; deletions: number }) => ({
      initials: pr.author.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase(),
      name: pr.title,
      detail: `@${pr.author} · +${pr.additions}/-${pr.deletions} LOC`,
      badge: `${pr.daysOpen}d open`,
      badgeColor: (pr.daysOpen >= 14 ? "red" : pr.daysOpen >= 7 ? "amber" : "blue") as DiscoveryColor,
    })),
  }];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function discoverReviewBottleneck(content: Record<string, any>): Discovery[] {
  const gh = content.integrationData?.github;
  if (!gh?.reviews?.byReviewer) return [];

  const byReviewer = gh.reviews.byReviewer;
  const totalReviews = n(gh.reviews.total);
  if (totalReviews < 5) return [];

  const sorted = Object.entries(byReviewer).sort((a, b) => n(b[1]) - n(a[1]));
  if (sorted.length < 2) return [];

  const top2Count = n(sorted[0][1]) + n(sorted[1][1]);
  const top2Pct = pct(top2Count, totalReviews);

  if (top2Pct < 55) return [];

  const topReviewer = sorted[0][0];
  const topPct = pct(n(sorted[0][1]), totalReviews);
  const turnaround = n(gh.reviews.avgTurnaroundTimeHours);

  return [{
    color: top2Pct >= 70 ? "amber" : "blue",
    label: top2Pct >= 70 ? "Pattern detected" : "Worth watching",
    sources: ["github"],
    headline: `${topReviewer} handles ${topPct}% of all code reviews. Top 2 reviewers cover ${top2Pct}%.`,
    body: `Code review concentration creates bus-factor risk and slows the team when key reviewers are unavailable. ` +
      `Your team's review turnaround is <strong>${turnaround < 24 ? fmt(turnaround) + "h" : fmt(turnaround / 24) + " days"}</strong>. ` +
      `Distributing reviews more evenly would reduce wait times and improve knowledge sharing across the team. ` +
      `<strong>If ${esc(topReviewer)} takes PTO, ${topPct}% of your review pipeline stalls.</strong>`,
    bigNum: { value: `${top2Pct}%`, label: `of all reviews handled by 2 people` },
    dataGrid: sorted.slice(0, 4).map(([name, count]) => ({
      value: `${count}`,
      label: `${name} (${pct(n(count), totalReviews)}%)`,
    })),
  }];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function discoverCodeChurn(content: Record<string, any>): Discovery[] {
  const churn = content.codeChurn;
  if (!churn) return [];

  const net = n(churn.netLinesAdded);
  const ratio = n(churn.churnRatio);
  const largePrs = churn.largePrs || [];

  const color: DiscoveryColor = ratio > 0.7 ? "amber" : net > 0 ? "green" : "blue";

  return [{
    color,
    label: "Code churn analysis",
    sources: ["github"],
    headline: ratio > 0.7
      ? `High code churn detected — ${fmt(ratio * 100)}% of code added this period was also deleted. Net: ${net > 0 ? "+" : ""}${net.toLocaleString()} LOC.`
      : `Net code growth of ${net > 0 ? "+" : ""}${net.toLocaleString()} lines with a healthy churn ratio of ${fmt(ratio, 2)}.`,
    body: `The team added <strong>+${n(churn.totalAdditions).toLocaleString()}</strong> and removed <strong>-${n(churn.totalDeletions).toLocaleString()}</strong> lines of code. ` +
      `Average PR size is <strong>${n(churn.avgPrSize).toLocaleString()} LOC</strong>. ` +
      (largePrs.length > 0
        ? `<strong>${largePrs.length} PR${largePrs.length > 1 ? "s" : ""} exceeded 500 lines</strong> — large PRs take 2-3x longer to review and are more likely to introduce defects.`
        : `No PRs exceeded 500 lines — the team is shipping right-sized changes.`) +
      (ratio > 0.7 ? ` A churn ratio above 0.7 may indicate rework, frequent reverts, or rapidly changing requirements.` : ""),
    dataGrid: [
      { value: `+${n(churn.totalAdditions).toLocaleString()}`, label: "Lines added", color: "green" },
      { value: `-${n(churn.totalDeletions).toLocaleString()}`, label: "Lines deleted", color: "red" },
      { value: fmt(ratio, 2), label: "Churn ratio", color: ratio > 0.7 ? "amber" : undefined },
      { value: `${largePrs.length}`, label: "Large PRs (>500 LOC)", color: largePrs.length > 0 ? "amber" : "green" },
    ],
  }];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function discoverCrossSource(content: Record<string, any>): Discovery[] {
  const crossSource = content.crossSource;
  if (!crossSource?.insights?.length) return [];

  return crossSource.insights.map((insight: { severity: string; title: string; description: string; sources: string[]; metrics: Record<string, number | string> }) => {
    const color: DiscoveryColor = insight.severity === "warning" ? "amber" : insight.severity === "positive" ? "green" : "blue";
    const label = insight.severity === "warning" ? "Cross-source warning" : insight.severity === "positive" ? "Cross-source positive" : "Cross-source insight";

    const grid = Object.entries(insight.metrics)
      .filter(([, v]) => typeof v === "number")
      .slice(0, 4)
      .map(([key, value]) => ({
        value: typeof value === "number" ? fmt(value) : String(value),
        label: key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()),
      }));

    return {
      color,
      label,
      sources: insight.sources,
      headline: insight.title + ".",
      body: esc(insight.description),
      dataGrid: grid.length > 0 ? grid : undefined,
    } as Discovery;
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function discoverMeetingCost(content: Record<string, any>): Discovery[] {
  const cal = content.integrationData?.googleCalendar;
  if (!cal?.meetings) return [];

  const totalHours = n(cal.meetings.totalHours);
  const totalMeetings = n(cal.meetings.total);
  const focusHours = n(typeof cal.focusTime === "number" ? cal.focusTime : cal.focusTime?.avgFocusHoursPerDay);
  const recurringPct = n(cal.recurringMeetingPct);
  const cost = n(cal.meetingCostEstimate);

  if (totalHours < 10) return [];

  const color: DiscoveryColor = focusHours < 3 ? "amber" : focusHours < 4 ? "blue" : "green";

  // A3: Meeting ROI — break down recurring vs one-off
  const recurringHours = Math.round(totalHours * (recurringPct / 100));
  const oneOffHours = totalHours - recurringHours;
  const recurringCost = Math.round(cost * (recurringPct / 100));
  const oneOffCost = cost - recurringCost;
  // If you cancelled X% of recurring meetings, you'd reclaim Y hours/quarter
  const reclaimPct = recurringPct > 50 ? 30 : 20;
  const reclaimedHoursPerQuarter = Math.round(recurringHours * (reclaimPct / 100) * (13 / (totalHours > 0 ? 1 : 1))); // ~13 weeks/quarter, scale to weekly
  const reclaimedWeekly = Math.round(recurringHours * (reclaimPct / 100));
  const reclaimedQuarterly = Math.round(reclaimedWeekly * (90 / 7)); // scale period to ~quarterly

  // Cross-source: correlate focus time with PR review speed
  const gh = content.integrationData?.github;
  let crossSourceNote = "";
  if (gh?.reviews?.avgTurnaroundTimeHours && focusHours > 0) {
    const reviewTurnaround = n(gh.reviews.avgTurnaroundTimeHours);
    if (focusHours < 3 && reviewTurnaround > 12) {
      crossSourceNote = ` <strong>Low focus time (${fmt(focusHours)}h/day) may be contributing to slower review turnaround (${fmt(reviewTurnaround)}h)</strong> — less uninterrupted time means reviews sit in queue longer.`;
    } else if (focusHours >= 3.5 && reviewTurnaround < 12) {
      crossSourceNote = ` Higher focus time correlates with faster reviews — your ${fmt(reviewTurnaround)}h turnaround benefits from ${fmt(focusHours)}h/day of uninterrupted work.`;
    }
  }

  return [{
    color,
    label: focusHours < 3 ? "Meeting ROI concern" : "Meeting ROI",
    sources: focusHours < 3 && gh ? ["googleCalendar", "github"] : ["googleCalendar"],
    headline: focusHours < 3
      ? `Engineers average only ${fmt(focusHours)}h/day of focus time. ${recurringPct}% of ${fmt(totalHours)}h in meetings are recurring.`
      : `Team averages ${fmt(focusHours)}h/day of focus time. ${fmt(recurringHours)}h in recurring meetings, ${fmt(oneOffHours)}h in one-offs.`,
    body: (cost > 0 ? `At $150/hr engineering cost, recurring meetings alone cost <strong>$${recurringCost.toLocaleString()}</strong>, one-off meetings cost <strong>$${oneOffCost.toLocaleString()}</strong>. ` : "") +
      (recurringPct > 40 ? `<strong>If you cancelled ${reclaimPct}% of recurring meetings, you'd reclaim ~${reclaimedWeekly}h this period — approximately ${reclaimedQuarterly} engineering hours per quarter.</strong> ` : "") +
      (focusHours < 3 ? `Focus time below 3h/day severely impacts ability to do deep technical work.` : focusHours < 4 ? `Focus time is below the recommended 4h/day threshold. Consider protecting morning blocks for deep work.` : `Focus time is healthy — the team has sufficient bandwidth for deep technical work.`) +
      crossSourceNote,
    bigNum: cost > 0 ? { value: `$${Math.round(cost / 1000)}K`, label: `Total meeting cost · ${fmt(recurringHours)}h recurring + ${fmt(oneOffHours)}h one-off` } : undefined,
    dataGrid: [
      { value: `${fmt(recurringHours)}h`, label: `Recurring (${recurringPct}%)`, color: recurringPct > 60 ? "amber" : undefined },
      { value: `${fmt(oneOffHours)}h`, label: `One-off (${100 - recurringPct}%)` },
      { value: `${fmt(focusHours)}h/day`, label: "Avg focus time", color: focusHours < 3 ? "red" : focusHours < 4 ? "amber" : "green" },
      { value: recurringPct > 40 ? `~${reclaimedWeekly}h` : `${totalMeetings}`, label: recurringPct > 40 ? "Reclaimable this period" : "Total meetings", color: recurringPct > 40 ? "green" : undefined },
    ],
  }];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function discoverCommunicationPatterns(content: Record<string, any>): Discovery[] {
  const sl = content.integrationData?.slack;
  if (!sl) return [];
  const discoveries: Discovery[] = [];

  const afterHours = n(sl.afterHoursMessagePct);
  if (afterHours >= 15) {
    discoveries.push({
      color: afterHours >= 30 ? "red" : afterHours >= 20 ? "amber" : "blue",
      label: afterHours >= 25 ? "Burnout signal" : "Worth monitoring",
      sources: ["slack"],
      headline: `${afterHours}% of Slack messages are sent outside business hours.`,
      body: `After-hours messaging above 25% correlates with increased burnout risk and lower retention. ` +
        (sl.peakDay ? `Peak messaging day is <strong>${esc(sl.peakDay)}</strong>. ` : "") +
        (sl.quietestDay ? `Quietest day is <strong>${esc(sl.quietestDay)}</strong>. ` : "") +
        `Total Slack volume: <strong>${n(sl.totalMessages).toLocaleString()}</strong> messages across <strong>${n(sl.activeChannels)}</strong> channels.` +
        (afterHours >= 25 ? ` <strong>Consider discussing team norms around async communication boundaries.</strong>` : ""),
      bigNum: { value: `${afterHours}%`, label: "After-hours messages (before 9 AM or after 6 PM)" },
    });
  }

  // Silent channels
  const silentChannels = sl.silentChannels as string[] | undefined;
  if (silentChannels && silentChannels.length >= 3) {
    discoveries.push({
      color: "neutral",
      label: "Channel hygiene",
      sources: ["slack"],
      headline: `${silentChannels.length} Slack channels had zero messages this period.`,
      body: `Dead channels add noise and make it harder to find relevant conversations. Consider archiving: <strong>${silentChannels.map((c: string) => "#" + esc(c)).join(", ")}</strong>.`,
    });
  }

  return discoveries;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function discoverDeliverableProgress(content: Record<string, any>): Discovery[] {
  const jira = content.integrationData?.jira;
  if (!jira?.deliverables?.length) return [];

  const deliverables = jira.deliverables;
  const overdue = deliverables.filter((d: { dueDate?: string; statusCategory: string }) =>
    d.dueDate && new Date(d.dueDate) < new Date() && d.statusCategory !== "done"
  );
  const active = deliverables.filter((d: { statusCategory: string }) => d.statusCategory !== "done");
  const done = deliverables.filter((d: { statusCategory: string }) => d.statusCategory === "done");

  if (active.length === 0 && done.length === 0) return [];

  const avgCompletion = Math.round(active.reduce((s: number, d: { completionPct: number }) => s + d.completionPct, 0) / (active.length || 1));

  return [{
    color: overdue.length > 0 ? "amber" : avgCompletion >= 70 ? "green" : "blue",
    label: "Deliverable tracking",
    sources: ["jira"],
    headline: `${active.length} active deliverable${active.length !== 1 ? "s" : ""} at ${avgCompletion}% average progress${overdue.length > 0 ? ` — ${overdue.length} overdue` : ""}.`,
    body: deliverables.slice(0, 6).map((d: { key: string; summary: string; completionPct: number; status: string; assignee: string; dueDate?: string; statusCategory: string }) => {
      const isOverdue = d.dueDate && new Date(d.dueDate) < new Date() && d.statusCategory !== "done";
      return `<strong>${esc(d.key)}</strong>: ${esc(d.summary)} — ${d.completionPct}% (${esc(d.status)})${isOverdue ? " <strong style='color:var(--red)'>OVERDUE</strong>" : ""}`;
    }).join("<br>"),
    personRows: active.slice(0, 5).map((d: { key: string; summary: string; assignee: string; completionPct: number; dueDate?: string; statusCategory: string }) => {
      const isOverdue = d.dueDate && new Date(d.dueDate) < new Date() && d.statusCategory !== "done";
      return {
        initials: d.assignee.split(" ").map((w: string) => w[0]).join("").slice(0, 2),
        name: `${d.key}: ${d.summary}`,
        detail: `${d.assignee} · ${d.completionPct}% complete${d.dueDate ? ` · Due ${d.dueDate}` : ""}`,
        badge: isOverdue ? "OVERDUE" : `${d.completionPct}%`,
        badgeColor: (isOverdue ? "red" : d.completionPct >= 80 ? "green" : "amber") as DiscoveryColor,
      };
    }),
  }];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function discoverBenchmarks(content: Record<string, any>): Discovery[] {
  const benchmarks = content.benchmarks;
  if (!benchmarks?.comparisons?.length) return [];

  const above = benchmarks.comparisons.filter((c: { performance: string }) => c.performance === "above");
  const below = benchmarks.comparisons.filter((c: { performance: string }) => c.performance === "below");
  const total = benchmarks.comparisons.length;

  const color: DiscoveryColor = above.length >= total * 0.6 ? "green" : below.length >= total * 0.6 ? "amber" : "blue";

  return [{
    color,
    label: "Industry benchmarks",
    sources: [],
    headline: `Your team is above benchmark on ${above.length} of ${total} metrics, below on ${below.length}.`,
    body: benchmarks.comparisons.map((c: { label: string; currentValue: number; benchmarkValue: number; performance: string; gap: number }) => {
      const icon = c.performance === "above" ? "&#9650;" : c.performance === "below" ? "&#9660;" : "&#9644;";
      const clr = c.performance === "above" ? "var(--green)" : c.performance === "below" ? "var(--red)" : "var(--muted)";
      return `<span style="color:${clr}">${icon}</span> <strong>${esc(c.label)}</strong>: ${fmt(c.currentValue)} vs ${fmt(c.benchmarkValue)} benchmark (${c.gap > 0 ? "+" : ""}${Math.round(c.gap)}%)`;
    }).join("<br>"),
  }];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function discoverProgression(content: Record<string, any>): Discovery[] {
  const progression = content.progression;
  if (!progression) return [];

  const improved = (progression.metrics || []).filter((m: { direction: string }) => m.direction === "improved");

  const grid: { value: string; label: string; color?: string }[] = [
    { value: `${progression.reportCount}`, label: "Reports generated" },
    { value: `${progression.weeksTracked}`, label: "Weeks tracked" },
  ];
  if (progression.estimatedCostSavings > 0) {
    grid.push({ value: `$${Math.round(progression.estimatedCostSavings / 1000)}K`, label: "Estimated savings", color: "green" });
  }
  if (progression.estimatedTimeSavedHours > 0) {
    grid.push({ value: `${Math.round(progression.estimatedTimeSavedHours)}h`, label: "Time saved" });
  }

  return [{
    color: "blue",
    label: "Since you started",
    sources: [],
    headline: `Over ${progression.reportCount} reports and ${progression.weeksTracked} weeks, ` +
      (improved.length > 0
        ? `${improved.length} key metric${improved.length > 1 ? "s have" : " has"} improved${progression.estimatedCostSavings > 0 ? ` — saving an estimated $${Math.round(progression.estimatedCostSavings).toLocaleString()}` : ""}.`
        : `NexFlow has been tracking your engineering health.`),
    body: improved.length > 0
      ? `<strong>Key improvements since report #1:</strong><br>` +
        improved.slice(0, 6).map((m: { label: string; firstValue: number; currentValue: number; totalPctChange: number }) =>
          `<strong>${esc(m.label)}</strong>: ${fmt(m.firstValue)} → ${fmt(m.currentValue)} (<span style="color:var(--green)">${m.totalPctChange > 0 ? "+" : ""}${Math.round(m.totalPctChange)}%</span>)`
        ).join("<br>")
      : "Metrics are being tracked and will show improvements once enough data points are collected.",
    dataGrid: grid,
  }];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function discoverTrends(content: Record<string, any>): Discovery[] {
  const trends = content.trends;
  if (!trends?.trends?.length) return [];

  const improving = trends.trends.filter((t: { isPositive: boolean; direction: string }) => t.isPositive && t.direction !== "stable");
  const declining = trends.trends.filter((t: { isPositive: boolean; direction: string }) => !t.isPositive && t.direction !== "stable");

  const discoveries: Discovery[] = [];

  if (improving.length > 0) {
    discoveries.push({
      color: "green",
      label: "Bright spot",
      sources: [],
      headline: `${improving.length} metric${improving.length > 1 ? "s" : ""} improved since your last report.`,
      body: improving.slice(0, 6).map((t: { label: string; currentValue: number; priorValue: number; pctChange: number }) =>
        `<strong>${esc(t.label)}</strong>: ${fmt(t.priorValue)} → ${fmt(t.currentValue)} (<span style="color:var(--green)">+${t.pctChange}%</span>)`
      ).join("<br>"),
    });
  }

  if (declining.length > 0) {
    discoveries.push({
      color: "amber",
      label: "Declining metrics",
      sources: [],
      headline: `${declining.length} metric${declining.length > 1 ? "s" : ""} declined since your last report.`,
      body: declining.slice(0, 6).map((t: { label: string; currentValue: number; priorValue: number; pctChange: number }) =>
        `<span style="color:var(--red)">&#9660;</span> <strong>${esc(t.label)}</strong>: ${fmt(t.priorValue)} → ${fmt(t.currentValue)} (<span style="color:var(--red)">${t.pctChange}%</span>)`
      ).join("<br>"),
    });
  }

  return discoveries;
}

// A1: Slack Blocker Discovery — wires content.blockers into a red discovery card
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function discoverSlackBlockers(content: Record<string, any>): Discovery[] {
  const blockers = content.blockers;
  if (!blockers?.blockers?.length) return [];

  const blockerList = blockers.blockers as {
    channelName: string; userId: string; messageSnippet: string;
    timestamp: string; matchedKeyword: string; referencedTickets: string[];
    confidence: "high" | "medium";
  }[];

  const highConfidence = blockerList.filter((b) => b.confidence === "high");
  const allTickets = new Set<string>();
  for (const b of blockerList) {
    for (const t of b.referencedTickets) allTickets.add(t);
  }
  const ticketCount = allTickets.size;

  return [{
    color: blockerList.length >= 5 ? "red" : "amber",
    label: blockerList.length >= 5 ? "Blockers detected" : "Blocker signals",
    sources: ticketCount > 0 ? ["slack", "jira"] : ["slack"],
    headline: `${blockerList.length} blocker signal${blockerList.length > 1 ? "s" : ""} detected across ${n(blockers.channelsScanned)} Slack channels${ticketCount > 0 ? ` — referencing ${ticketCount} Jira ticket${ticketCount > 1 ? "s" : ""}` : ""}.`,
    body: `We scanned <strong>${n(blockers.totalMessagesScanned).toLocaleString()} messages</strong> and found ${blockerList.length} messages containing blocker language ("blocked by", "waiting on", "stuck on", etc.). ` +
      (highConfidence.length > 0 ? `<strong>${highConfidence.length} are high-confidence</strong> — they reference known Jira tickets. ` : "") +
      `Unresolved blockers compound daily — each blocked thread represents stalled work that may not be visible in your project tracker.`,
    bigNum: { value: `${blockerList.length}`, label: `Blocker signals · ${n(blockers.channelsScanned)} channels scanned` },
    dataGrid: [
      { value: `${blockerList.length}`, label: "Blocker signals" },
      { value: `${highConfidence.length}`, label: "High confidence", color: highConfidence.length > 0 ? "red" : undefined },
      { value: `${ticketCount}`, label: "Jira tickets referenced" },
      { value: n(blockers.totalMessagesScanned).toLocaleString(), label: "Messages scanned" },
    ],
    personRows: blockerList.slice(0, 5).map((b) => {
      const date = new Date(b.timestamp);
      const dateStr = `${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
      const ticketStr = b.referencedTickets.length > 0 ? ` · ${b.referencedTickets.join(", ")}` : "";
      return {
        initials: b.channelName.slice(0, 2).toUpperCase(),
        name: b.messageSnippet.length > 80 ? b.messageSnippet.slice(0, 77) + "..." : b.messageSnippet,
        detail: `#${b.channelName} · ${dateStr} · "${b.matchedKeyword}"${ticketStr}`,
        badge: b.confidence === "high" ? "HIGH" : "MEDIUM",
        badgeColor: (b.confidence === "high" ? "red" : "amber") as DiscoveryColor,
      };
    }),
  }];
}

// A2: Thread Response Time Discovery
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function discoverResponseTime(content: Record<string, any>): Discovery[] {
  const sl = content.integrationData?.slack;
  if (!sl) return [];

  const avgResponseMin = n(sl.avgThreadResponseMinutes);
  if (avgResponseMin <= 0) return [];

  const avgResponseHrs = avgResponseMin / 60;

  if (avgResponseMin > 60) {
    return [{
      color: "amber",
      label: "Async lag detected",
      sources: ["slack"],
      headline: `Average thread response time is ${avgResponseHrs >= 1 ? fmt(avgResponseHrs) + " hours" : fmt(avgResponseMin) + " minutes"} — async communication may be lagging.`,
      body: `When thread responses take over an hour on average, it creates invisible queues. Each slow response can block a decision or a code review by hours. ` +
        `Teams with sub-30-minute response times ship <strong>40% faster</strong> on average. ` +
        `Consider setting team norms around response windows for active threads, especially during core hours.`,
      bigNum: { value: avgResponseHrs >= 1 ? `${fmt(avgResponseHrs)}h` : `${fmt(avgResponseMin)}m`, label: "Average thread response time" },
    }];
  }

  if (avgResponseMin <= 20) {
    return [{
      color: "green",
      label: "Strong async culture",
      sources: ["slack"],
      headline: `Team responds to threads in under ${Math.round(avgResponseMin)} minutes on average — strong async communication culture.`,
      body: `Fast thread response times indicate the team is highly responsive and reduces invisible queuing time. ` +
        `The industry benchmark for high-performing teams is under 30 minutes. Your team is well under that threshold.`,
      bigNum: { value: `${Math.round(avgResponseMin)}m`, label: "Average thread response time" },
    }];
  }

  return [];
}

// A4: Contributor Risk / Workload Heatmap Discovery
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function discoverContributorRisk(content: Record<string, any>): Discovery[] {
  const gh = content.integrationData?.github;
  if (!gh?.commits?.byAuthor) return [];

  const byAuthor = gh.commits.byAuthor as Record<string, number>;
  const authors = Object.keys(byAuthor);
  if (authors.length < 2) return [];

  const totalCommits = n(gh.commits.total);
  const prsByAuthor = (gh.pullRequests?.openedByAuthor || {}) as Record<string, number>;
  const reviewsByAuthor = (gh.reviews?.byReviewer || {}) as Record<string, number>;
  const totalReviews = n(gh.reviews?.total);
  const sl = content.integrationData?.slack;
  const afterHoursPct = n(sl?.afterHoursMessagePct);
  const jira = content.integrationData?.jira;
  const jiraByAssignee = (jira?.issues?.byAssignee || {}) as Record<string, { total: number; completed: number; inProgress: number }>;

  const contributors: {
    name: string; commits: number; prs: number; reviews: number;
    reviewPct: number; jiraTotal: number; jiraCompleted: number;
    risk: "at_risk" | "watch" | "strong";
    riskReason: string;
  }[] = [];

  for (const author of authors) {
    const commits = n(byAuthor[author]);
    const prs = n(prsByAuthor[author]);
    const reviews = n(reviewsByAuthor[author]);
    const reviewPct = pct(reviews, totalReviews);
    const commitPct = pct(commits, totalCommits);
    const jiraInfo = jiraByAssignee[author];
    const jiraTotal = jiraInfo ? n(jiraInfo.total) : 0;
    const jiraCompleted = jiraInfo ? n(jiraInfo.completed) : 0;

    // Risk signals
    let risk: "at_risk" | "watch" | "strong" = "strong";
    let riskReason = "High output, balanced workload";

    // High output + high after-hours + high review load = burnout risk
    if (commitPct >= 20 && reviewPct >= 25 && afterHoursPct >= 20) {
      risk = "at_risk";
      riskReason = `${commitPct}% of commits + ${reviewPct}% of reviews + ${afterHoursPct}% after-hours`;
    }
    // High review concentration alone
    else if (reviewPct >= 30 && commitPct >= 15) {
      risk = "at_risk";
      riskReason = `Heavy dual load: ${commitPct}% of commits + ${reviewPct}% of reviews`;
    }
    // Low output + low activity = potential disengagement
    else if (commitPct <= 8 && prs <= 3 && jiraTotal > 0 && pct(jiraCompleted, jiraTotal) < 50) {
      risk = "watch";
      riskReason = `Low output (${commits} commits, ${prs} PRs) with ${pct(jiraCompleted, jiraTotal)}% ticket completion`;
    }
    // Moderate indicators
    else if (reviewPct >= 20 && afterHoursPct >= 25) {
      risk = "watch";
      riskReason = `${reviewPct}% review load + elevated after-hours activity`;
    }
    // Strong performer
    else if (commitPct >= 15 && (totalReviews === 0 || reviewPct < 30)) {
      risk = "strong";
      riskReason = `${commits} commits, ${prs} PRs${reviews > 0 ? `, ${reviews} reviews` : ""}`;
    }

    contributors.push({ name: author, commits, prs, reviews, reviewPct, jiraTotal, jiraCompleted, risk, riskReason });
  }

  // Sort: at_risk first, then watch, then strong
  const riskOrder = { at_risk: 0, watch: 1, strong: 2 };
  contributors.sort((a, b) => riskOrder[a.risk] - riskOrder[b.risk]);

  const atRisk = contributors.filter((c) => c.risk === "at_risk");
  const watching = contributors.filter((c) => c.risk === "watch");
  const strong = contributors.filter((c) => c.risk === "strong");

  if (atRisk.length === 0 && watching.length === 0) return [];

  const color: DiscoveryColor = atRisk.length >= 2 ? "red" : atRisk.length >= 1 ? "purple" : "purple";

  return [{
    color,
    label: atRisk.length > 0 ? "Contributor risk detected" : "Workload distribution",
    sources: totalReviews > 0 && sl ? ["github", "slack", "jira"] : ["github", "jira"],
    headline: atRisk.length > 0
      ? `${atRisk.length} contributor${atRisk.length > 1 ? "s show" : " shows"} burnout risk signals — high output combined with concentrated review load${afterHoursPct >= 20 ? " and after-hours activity" : ""}.`
      : `${watching.length} contributor${watching.length > 1 ? "s" : ""} worth monitoring for workload balance.`,
    body: `This analysis combines commit volume, review load, ticket completion, and Slack after-hours activity to identify contributors who may be overloaded or disengaged. ` +
      (atRisk.length > 0 ? `<strong>Contributors flagged "AT RISK" carry disproportionate load — losing them would create critical knowledge gaps.</strong> ` : "") +
      (watching.length > 0 ? `Contributors flagged "WATCH" show early signals worth monitoring.` : ""),
    dataGrid: [
      { value: `${atRisk.length}`, label: "At risk", color: atRisk.length > 0 ? "red" : undefined },
      { value: `${watching.length}`, label: "Watch", color: watching.length > 0 ? "amber" : undefined },
      { value: `${strong.length}`, label: "Strong", color: "green" },
    ],
    personRows: contributors.slice(0, 6).map((c) => ({
      initials: c.name.split(" ").map((w: string) => w[0]).join("").slice(0, 2),
      name: c.name,
      detail: c.riskReason,
      badge: c.risk === "at_risk" ? "AT RISK" : c.risk === "watch" ? "WATCH" : "STRONG",
      badgeColor: (c.risk === "at_risk" ? "red" : c.risk === "watch" ? "amber" : "green") as DiscoveryColor,
    })),
  }];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function discoverContributorHighlights(content: Record<string, any>): Discovery[] {
  const gh = content.integrationData?.github;
  if (!gh?.commits?.byAuthor) return [];

  const discoveries: Discovery[] = [];
  const byAuthor = gh.commits.byAuthor as Record<string, number>;
  const sorted = Object.entries(byAuthor).sort((a, b) => b[1] - a[1]);

  if (sorted.length < 2) return discoveries;

  // Top contributor callout
  const topAuthor = sorted[0];
  const totalCommits = n(gh.commits.total);
  const topPct = pct(topAuthor[1], totalCommits);
  const totalPrs = n(gh.pullRequests?.merged);

  // Find their PR count
  const prsByAuthor = gh.pullRequests?.openedByAuthor || {};
  const topPrs = n(prsByAuthor[topAuthor[0]]);

  if (topPct >= 25 && sorted.length >= 3) {
    discoveries.push({
      color: "green",
      label: "Top contributor",
      sources: ["github"],
      headline: `${esc(topAuthor[0])} drove ${topPct}% of all commits this period — ${topAuthor[1]} commits and ${topPrs} PRs.`,
      body: `The team shipped <strong>${totalCommits} total commits</strong> and merged <strong>${totalPrs} PRs</strong>. ` +
        `Here's how the contribution breaks down:`,
      dataGrid: sorted.slice(0, 4).map(([name, count]) => ({
        value: `${count}`,
        label: `${name} (${pct(count, totalCommits)}%)`,
      })),
    });
  }

  return discoveries;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function discoverPriorActions(content: Record<string, any>): Discovery[] {
  const priorReport = content.priorReport;
  if (!priorReport?.actionItems?.length) return [];

  const priorActions = priorReport.actionItems as { priority: string; title: string; description: string; relatedMetrics?: string[] }[];
  const priorMetrics = priorReport.keyMetrics as Record<string, number> || {};

  // Check current metrics to determine if actions were addressed
  const currentMetrics = extractCurrentMetrics(content);

  // A6: Show actual metric deltas instead of just checkmark/circle
  const items = priorActions.map((a) => {
    let addressed = false;
    let deltaText = "";
    let partiallyAddressed = false;

    if (a.relatedMetrics?.length) {
      const deltas: string[] = [];
      for (const m of a.relatedMetrics) {
        const prior = priorMetrics[m];
        const current = currentMetrics[m];
        if (prior != null && current != null && current !== prior) {
          addressed = true;
          const pctDelta = prior !== 0 ? Math.round(((current - prior) / Math.abs(prior)) * 100) : 0;
          const direction = current < prior ? "↓" : "↑";
          // Determine if this is a "lower is better" metric
          const lowerIsBetter = m.includes("MergeTime") || m.includes("Turnaround") || m.includes("overdue") || m.includes("MeetingHours");
          const isPositive = lowerIsBetter ? current < prior : current > prior;
          const clr = isPositive ? "var(--green)" : "var(--red)";
          const metricLabel = m.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()).trim();
          deltas.push(`<span style="color:${clr}">${direction} ${fmt(prior)} → ${fmt(current)} (${pctDelta > 0 ? "+" : ""}${pctDelta}%)</span>`);

          // Check if improvement is partial (e.g., overdue went from 7 to 3 but 3 remain)
          if (isPositive && current > 0 && lowerIsBetter) {
            partiallyAddressed = true;
          }
        }
      }
      deltaText = deltas.join(", ");
    }

    return { ...a, addressed, deltaText, partiallyAddressed };
  });

  const fullyAddressed = items.filter((i) => i.addressed && !i.partiallyAddressed).length;
  const partial = items.filter((i) => i.partiallyAddressed).length;
  const unchanged = items.filter((i) => !i.addressed).length;

  return [{
    color: fullyAddressed >= items.length / 2 ? "green" : partial > 0 ? "blue" : "amber",
    label: "What changed since last report",
    sources: [],
    headline: fullyAddressed > 0
      ? `${fullyAddressed} recommendation${fullyAddressed > 1 ? "s" : ""} fully addressed${partial > 0 ? `, ${partial} partially` : ""}${unchanged > 0 ? `, ${unchanged} unchanged` : ""}.`
      : `${partial > 0 ? `${partial} recommendation${partial > 1 ? "s" : ""} partially addressed` : "No recommendations fully addressed yet"}, ${unchanged} unchanged.`,
    body: items.map((a) => {
      if (a.addressed && !a.partiallyAddressed) {
        return `<span style="color:var(--green)">&#10003;</span> <strong>[${esc(a.priority)}] ${esc(a.title)}</strong> — <span style="color:var(--green)">Done:</span> ${a.deltaText}`;
      } else if (a.partiallyAddressed) {
        return `<span style="color:var(--amber)">&#9679;</span> <strong>[${esc(a.priority)}] ${esc(a.title)}</strong> — <span style="color:var(--amber)">Partially:</span> ${a.deltaText}`;
      } else {
        return `<span style="color:var(--muted)">&#9675;</span> <strong>[${esc(a.priority)}] ${esc(a.title)}</strong> — <span style="color:var(--muted)">No change detected</span>`;
      }
    }).join("<br>"),
    dataGrid: [
      { value: `${fullyAddressed}`, label: "Fully addressed", color: fullyAddressed > 0 ? "green" : undefined },
      { value: `${partial}`, label: "Partially addressed", color: partial > 0 ? "amber" : undefined },
      { value: `${unchanged}`, label: "Unchanged" },
    ],
  }];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractCurrentMetrics(content: Record<string, any>): Record<string, number> {
  const m: Record<string, number> = {};
  const id = content.integrationData || {};
  if (id.github?.commits?.total) m.totalCommits = id.github.commits.total;
  if (id.github?.pullRequests?.merged) m.prsMerged = id.github.pullRequests.merged;
  if (id.github?.pullRequests?.avgMergeTimeHours) m.avgPrMergeTimeHours = id.github.pullRequests.avgMergeTimeHours;
  if (id.github?.reviews?.total) m.totalReviews = id.github.reviews.total;
  if (id.github?.reviews?.avgTurnaroundTimeHours) m.avgReviewTurnaroundHours = id.github.reviews.avgTurnaroundTimeHours;
  if (id.jira?.issues?.total > 0) m.jiraCompletionRate = pct(id.jira.issues.completed, id.jira.issues.total);
  if (id.jira?.issues?.overdue) m.overdueIssues = id.jira.issues.overdue.length;
  if (id.slack?.totalMessages) m.slackMessages = id.slack.totalMessages;
  if (id.googleCalendar?.meetings?.totalHours) m.totalMeetingHours = id.googleCalendar.meetings.totalHours;
  const ft = id.googleCalendar?.focusTime;
  if (ft) m.avgFocusHoursPerDay = typeof ft === "number" ? ft : n(ft.avgFocusHoursPerDay);
  return m;
}

// ── Action items renderer ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderActionItems(actionItems: any[]): string {
  if (!actionItems?.length) return "";

  let html = `<div class="disc-label">Recommended actions</div>`;
  html += `<div style="margin-bottom:32px">`;
  for (const item of actionItems.slice(0, 8)) {
    const priClass = item.priority === "P1" ? "p1" : item.priority === "P2" ? "p2" : "p3";
    html += `<div class="action">
      <div class="action-priority ${priClass}">${esc(item.priority)}</div>
      <div class="action-text"><strong>${esc(item.title)}</strong> — ${esc(item.description)}${item.suggestedOwner ? ` <span style="color:var(--muted);font-size:12px">(Owner: ${esc(item.suggestedOwner)})</span>` : ""}</div>
    </div>`;
  }
  html += `</div>`;
  return html;
}

// ── AI Narrative renderer ──

export function renderNarrative(text: string): string {
  const lines = text.split("\n");
  let html = "";
  let inCallout = false;
  let calloutType = "";
  let calloutContent = "";

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith(":::callout-risk")) { inCallout = true; calloutType = "risk"; calloutContent = ""; continue; }
    if (trimmed.startsWith(":::callout-positive")) { inCallout = true; calloutType = "positive"; calloutContent = ""; continue; }
    if (trimmed.startsWith(":::callout-info")) { inCallout = true; calloutType = "info"; calloutContent = ""; continue; }
    if (trimmed === ":::" && inCallout) {
      const cls = calloutType === "risk" ? "red" : calloutType === "positive" ? "green" : "blue";
      const label = calloutType === "risk" ? "RISK" : calloutType === "positive" ? "FINDING" : "OBSERVATION";
      html += `<div class="callout ${cls}"><div class="callout-tag">${label}</div><div class="callout-body">${formatInline(calloutContent.trim())}</div></div>`;
      inCallout = false; calloutContent = ""; continue;
    }
    if (inCallout) { calloutContent += line + "\n"; continue; }
    if (!trimmed) { html += '<div style="height:6px"></div>'; continue; }
    if (trimmed.startsWith("## ")) { html += `<div class="narrative-heading">${esc(trimmed.slice(3))}</div>`; continue; }
    if (trimmed.startsWith("### ")) { html += `<div class="narrative-subheading">${formatInline(trimmed.slice(4))}</div>`; continue; }
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) { html += `<div class="narrative-bullet">${formatInline(trimmed.slice(2))}</div>`; continue; }

    const actionMatch = trimmed.match(/^(\d+)\.\s+\*\*(.+?)\*\*\s*[—–-]\s*(.+)/);
    if (actionMatch) {
      html += `<div class="narrative-action"><span class="narrative-action-num">${actionMatch[1]}</span><strong>${esc(actionMatch[2])}</strong> — ${formatInline(actionMatch[3])}</div>`;
      continue;
    }

    html += `<p class="narrative-p">${formatInline(trimmed)}</p>`;
  }

  return html;
}

function formatInline(text: string): string {
  let result = text.replace(/:::highlight\[([^\]]+)\]/g, '<strong style="color:var(--blue)">$1</strong>');
  result = result.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return result;
}

// ── Week-at-a-Glance bar builder ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildWeekStats(content: Record<string, any>, healthScore: HealthScore | null): WeekStat[] {
  const stats: WeekStat[] = [];
  const prior = content.priorReport?.keyMetrics as Record<string, number> | undefined;
  const gh = content.integrationData?.github;
  const jr = content.integrationData?.jira;
  const sl = content.integrationData?.slack;
  const cal = content.integrationData?.googleCalendar;

  if (healthScore) {
    const priorHS = prior?.healthScore;
    const delta = priorHS != null ? healthScore.overall - priorHS : null;
    stats.push({
      value: `${healthScore.overall}`,
      label: `Health (${healthScore.grade})`,
      delta: delta != null ? `${delta > 0 ? "+" : ""}${delta} vs prior` : "First report",
      direction: delta != null ? (delta > 0 ? "up" : delta < 0 ? "down" : "flat") : "flat",
    });
  }

  if (gh?.pullRequests) {
    const merged = n(gh.pullRequests.merged);
    const priorMerged = prior?.prsMerged;
    stats.push({
      value: `${merged}`,
      label: "PRs Merged",
      delta: priorMerged != null ? `${merged > priorMerged ? "↑" : "↓"} ${Math.abs(merged - priorMerged)} vs prior` : "",
      direction: priorMerged != null ? (merged > priorMerged ? "up" : merged < priorMerged ? "down" : "flat") : "flat",
    });

    const mergeTime = n(gh.pullRequests.avgMergeTimeHours);
    const priorMerge = prior?.avgPrMergeTimeHours;
    if (mergeTime > 0) {
      stats.push({
        value: mergeTime < 24 ? `${fmt(mergeTime)}h` : `${fmt(mergeTime / 24)}d`,
        label: "Avg Merge Time",
        delta: priorMerge != null ? `${mergeTime < priorMerge ? "↓" : "↑"} ${fmt(Math.abs(mergeTime - priorMerge))}h` : "",
        direction: priorMerge != null ? (mergeTime < priorMerge ? "up" : mergeTime > priorMerge ? "down" : "flat") : "flat",
      });
    }
  }

  if (jr?.issues) {
    const completionRate = pct(jr.issues.completed, jr.issues.total);
    const priorRate = prior?.jiraCompletionRate;
    stats.push({
      value: `${completionRate}%`,
      label: "Issue Completion",
      delta: priorRate != null ? `${completionRate > priorRate ? "↑" : "↓"} ${Math.abs(completionRate - priorRate)}%` : "",
      direction: priorRate != null ? (completionRate > priorRate ? "up" : completionRate < priorRate ? "down" : "flat") : "flat",
    });
  }

  if (cal?.focusTime) {
    const focus = n(typeof cal.focusTime === "number" ? cal.focusTime : cal.focusTime.avgFocusHoursPerDay);
    const priorFocus = prior?.avgFocusHoursPerDay;
    if (focus > 0) {
      stats.push({
        value: `${fmt(focus)}h`,
        label: "Focus Time/Day",
        delta: priorFocus != null ? `${focus > priorFocus ? "↑" : "↓"} ${fmt(Math.abs(focus - priorFocus))}h` : "",
        direction: priorFocus != null ? (focus > priorFocus ? "up" : focus < priorFocus ? "down" : "flat") : "flat",
      });
    }
  }

  return stats.slice(0, 5);
}

// ── Data tables (exported for backward compatibility) ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildDataTables(integrationData: Record<string, any>): string {
  // Kept for backward compat but no longer used in main report
  return "";
}

// ── CSS ──

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
  :root {
    --bg: #ffffff;
    --fg: #0a0a0a;
    --muted: #6b7280;
    --border: #e5e7eb;
    --surface: #f9fafb;
    --blue: #2563eb;
    --blue-bg: #eff6ff;
    --amber: #d97706;
    --amber-bg: #fffbeb;
    --red: #dc2626;
    --red-bg: #fef2f2;
    --green: #16a34a;
    --green-bg: #f0fdf4;
    --purple: #7c3aed;
    --purple-bg: #f5f3ff;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', -apple-system, sans-serif; background: var(--surface); color: var(--fg); line-height: 1.6; }
  .page { max-width: 820px; margin: 0 auto; background: var(--bg); }

  /* ── Header ── */
  .header { padding: 48px 48px 40px; border-bottom: 1px solid var(--border); }
  .header-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; }
  .brand { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: var(--muted); }
  .tag { display: inline-block; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; padding: 3px 10px; border-radius: 4px; background: var(--purple-bg); color: var(--purple); margin-left: 12px; }
  .period { font-size: 12px; color: var(--muted); }
  .header h1 { font-size: 28px; font-weight: 900; line-height: 1.15; letter-spacing: -0.5px; margin-bottom: 12px; }
  .header h1 span { color: var(--blue); }
  .header-sub { font-size: 15px; color: var(--muted); line-height: 1.55; max-width: 650px; }
  .sources { display: flex; gap: 8px; margin-top: 16px; flex-wrap: wrap; }
  .source-pill { font-size: 11px; font-weight: 600; padding: 4px 12px; border-radius: 20px; border: 1px solid var(--border); color: var(--muted); }
  .source-pill.active { border-color: var(--green); color: var(--green); background: var(--green-bg); }

  /* ── Week bar ── */
  .week-bar { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 0; margin: 0 48px; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
  .week-stat { padding: 20px; text-align: center; border-right: 1px solid var(--border); }
  .week-stat:last-child { border-right: none; }
  .week-stat .val { font-size: 28px; font-weight: 900; letter-spacing: -0.5px; }
  .week-stat .label { font-size: 11px; color: var(--muted); font-weight: 500; margin-top: 4px; }
  .week-stat .delta { font-size: 11px; font-weight: 700; margin-top: 4px; }
  .week-stat .delta.up { color: var(--green); }
  .week-stat .delta.down { color: var(--red); }
  .week-stat .delta.flat { color: var(--muted); }

  /* ── Discoveries ── */
  .discoveries { padding: 0 48px 48px; }
  .disc-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: var(--muted); padding-top: 40px; margin-bottom: 28px; }

  .discovery { margin-bottom: 32px; padding: 28px; border-radius: 12px; border: 1px solid var(--border); }
  .discovery.blue { background: var(--blue-bg); border-color: #bfdbfe; }
  .discovery.amber { background: var(--amber-bg); border-color: #fde68a; }
  .discovery.red { background: var(--red-bg); border-color: #fecaca; }
  .discovery.green { background: var(--green-bg); border-color: #bbf7d0; }
  .discovery.purple { background: var(--purple-bg); border-color: #c4b5fd; }
  .discovery.neutral { background: var(--surface); }

  .disc-num { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 10px; }
  .disc-num.blue { color: var(--blue); }
  .disc-num.amber { color: var(--amber); }
  .disc-num.red { color: var(--red); }
  .disc-num.green { color: var(--green); }
  .disc-num.purple { color: var(--purple); }
  .disc-num.neutral { color: var(--muted); }

  .disc-headline { font-size: 19px; font-weight: 800; line-height: 1.25; margin-bottom: 14px; letter-spacing: -0.2px; }
  .disc-body { font-size: 14px; color: #374151; line-height: 1.7; }
  .disc-body strong { color: var(--fg); font-weight: 700; }

  .source-tag { display: inline-block; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding: 2px 8px; border-radius: 3px; margin-right: 6px; margin-bottom: 8px; }
  .source-tag.gh { background: #f0fdf4; color: #16a34a; }
  .source-tag.jira { background: #eff6ff; color: #2563eb; }
  .source-tag.slack { background: #faf5ff; color: #7c3aed; }
  .source-tag.linear { background: #faf5ff; color: #7c3aed; }
  .source-tag.cal { background: #fffbeb; color: #d97706; }
  .source-tag.neutral { background: var(--surface); color: var(--muted); }

  .big-num { font-size: 48px; font-weight: 900; line-height: 1; margin-bottom: 8px; letter-spacing: -1px; }
  .big-num.blue { color: var(--blue); }
  .big-num.amber { color: var(--amber); }
  .big-num.red { color: var(--red); }
  .big-num.green { color: var(--green); }
  .big-num.purple { color: var(--purple); }
  .big-num.neutral { color: var(--muted); }
  .big-label { font-size: 13px; color: var(--muted); font-weight: 500; margin-bottom: 16px; }

  .data-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 20px; }
  .data-grid.four { grid-template-columns: repeat(4, 1fr); }
  .data-cell { padding: 14px; background: rgba(255,255,255,0.7); border-radius: 8px; }
  .data-cell .val { font-size: 20px; font-weight: 800; letter-spacing: -0.5px; }
  .data-cell .label { font-size: 11px; color: var(--muted); margin-top: 3px; line-height: 1.3; }

  .person-row { display: flex; align-items: center; gap: 16px; padding: 12px 0; border-bottom: 1px solid var(--border); }
  .person-row:last-child { border-bottom: none; }
  .person-avatar { width: 36px; height: 36px; border-radius: 50%; background: var(--surface); display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; color: var(--muted); flex-shrink: 0; border: 1px solid var(--border); }
  .person-info { flex: 1; min-width: 0; }
  .person-name { font-size: 14px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .person-detail { font-size: 13px; color: var(--muted); }
  .person-badge { font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 4px; flex-shrink: 0; }
  .person-badge.green { background: var(--green-bg); color: var(--green); }
  .person-badge.amber { background: var(--amber-bg); color: var(--amber); }
  .person-badge.red { background: var(--red-bg); color: var(--red); }
  .person-badge.blue { background: var(--blue-bg); color: var(--blue); }
  .person-badge.purple { background: var(--purple-bg); color: var(--purple); }
  .person-badge.neutral { background: var(--surface); color: var(--muted); }

  .timeline { margin-top: 20px; }
  .timeline-item { display: flex; gap: 16px; margin-bottom: 12px; }
  .timeline-dot { width: 10px; height: 10px; border-radius: 50%; margin-top: 6px; flex-shrink: 0; }
  .timeline-dot.red { background: var(--red); }
  .timeline-dot.amber { background: var(--amber); }
  .timeline-dot.green { background: var(--green); }
  .timeline-dot.blue { background: var(--blue); }
  .timeline-text { font-size: 14px; color: #374151; line-height: 1.5; }
  .timeline-text strong { color: var(--fg); }

  /* ── Actions ── */
  .action { display: flex; gap: 12px; padding: 12px 16px; margin-bottom: 8px; border-radius: 8px; background: var(--surface); border: 1px solid var(--border); }
  .action-priority { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; padding: 2px 8px; border-radius: 3px; height: fit-content; margin-top: 2px; flex-shrink: 0; }
  .action-priority.p1 { background: var(--red-bg); color: var(--red); }
  .action-priority.p2 { background: var(--amber-bg); color: var(--amber); }
  .action-priority.p3 { background: var(--blue-bg); color: var(--blue); }
  .action-text { font-size: 14px; color: #374151; line-height: 1.5; }
  .action-text strong { color: var(--fg); }

  /* ── Narrative ── */
  .narrative-section { padding: 0 48px 48px; }
  .narrative-heading { font-size: 17px; font-weight: 800; margin: 24px 0 8px; letter-spacing: -0.2px; }
  .narrative-subheading { font-size: 15px; font-weight: 700; margin: 16px 0 6px; }
  .narrative-p { font-size: 14px; line-height: 1.7; color: #374151; margin-bottom: 8px; }
  .narrative-p strong { color: var(--fg); }
  .narrative-bullet { font-size: 14px; line-height: 1.7; color: #374151; margin: 0 0 4px 18px; padding-left: 8px; border-left: 2px solid var(--border); }
  .narrative-action { display: flex; gap: 8px; font-size: 14px; color: #374151; margin: 6px 0; padding: 8px 12px; border-radius: 6px; background: var(--surface); }
  .narrative-action-num { font-weight: 800; color: var(--blue); min-width: 20px; }

  .callout { border-left: 3px solid; padding: 14px 18px; margin: 12px 0; border-radius: 0 8px 8px 0; font-size: 14px; line-height: 1.6; }
  .callout.red { border-left-color: var(--red); background: var(--red-bg); }
  .callout.green { border-left-color: var(--green); background: var(--green-bg); }
  .callout.blue { border-left-color: var(--blue); background: var(--blue-bg); }
  .callout-tag { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
  .callout.red .callout-tag { color: var(--red); }
  .callout.green .callout-tag { color: var(--green); }
  .callout.blue .callout-tag { color: var(--blue); }
  .callout-body { color: #374151; }
  .callout-body strong { color: var(--fg); }

  /* ── Footer ── */
  .divider { height: 1px; background: var(--border); margin: 0 48px; }
  .footer { padding: 32px 48px; }
  .footer-text { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; }

  /* ── Download bar ── */
  .download-bar { position: fixed; top: 0; left: 0; right: 0; background: var(--fg); color: white; padding: 12px 24px; display: flex; align-items: center; justify-content: center; gap: 16px; z-index: 50; }
  .download-bar button { background: var(--blue); color: white; border: none; padding: 8px 24px; font-size: 13px; font-weight: 600; border-radius: 6px; cursor: pointer; }
  .download-bar button:hover { opacity: 0.9; }
  .download-bar + .page { margin-top: 48px; }

  @media print {
    body { background: white; }
    .page { box-shadow: none; }
    .download-bar { display: none !important; }
    .discovery { break-inside: avoid; }
    @page { margin: 0.5in; size: letter; }
  }
`;

// ── Main export ──

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
  reportDepth?: "EXECUTIVE" | "STANDARD" | "FULL" | null;
  recipientName?: string | null;
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
    reportDepth = null,
    recipientName = null,
  } = opts;

  const periodLabel = `${format(periodStart, "MMM d")} — ${format(periodEnd, "MMM d, yyyy")}`;
  const genDate = generatedAt ? format(generatedAt, "MMM d, yyyy") : format(new Date(), "MMM d, yyyy");
  const connectedSources = (content.connectedSources || []) as string[];
  const reportNumber = content.reportNumber || 1;

  // ── Generate all discoveries ──
  const allDiscoveries: Discovery[] = [
    ...discoverHealthScore(healthScore, content),
    ...discoverPriorActions(content),
    ...discoverSlackBlockers(content),
    ...discoverContributorRisk(content),
    ...discoverSprintRisk(content),
    ...discoverOverdueTickets(content),
    ...discoverStalePRs(content),
    ...discoverReviewBottleneck(content),
    ...discoverResponseTime(content),
    ...discoverCrossSource(content),
    ...discoverMeetingCost(content),
    ...discoverCodeChurn(content),
    ...discoverCommunicationPatterns(content),
    ...discoverDeliverableProgress(content),
    ...discoverTrends(content),
    ...discoverContributorHighlights(content),
    ...discoverBenchmarks(content),
    ...discoverProgression(content),
  ];

  // ── Apply depth-based filtering ──
  const EXECUTIVE_EXCLUDE_LABELS = new Set([
    "Code Churn Analysis", "Communication Patterns", "Contributor Highlights",
    "Thread Response Time", "Benchmarks", "Progression Tracking",
    "Deliverable Progress", "Trend Signals",
  ]);
  const STANDARD_EXCLUDE_LABELS = new Set([
    "Communication Patterns", "Benchmarks", "Progression Tracking",
  ]);
  const ALWAYS_KEEP = new Set(["Engineering Health Index", "What changed since last report"]);

  if (reportDepth === "EXECUTIVE" || reportDepth === "STANDARD") {
    const excludeSet = reportDepth === "EXECUTIVE" ? EXECUTIVE_EXCLUDE_LABELS : STANDARD_EXCLUDE_LABELS;
    for (let i = allDiscoveries.length - 1; i >= 0; i--) {
      if (!ALWAYS_KEEP.has(allDiscoveries[i].label) && excludeSet.has(allDiscoveries[i].label)) {
        allDiscoveries.splice(i, 1);
      }
    }
  }

  // Sort: red first, then amber, purple, blue, green, neutral
  const colorOrder: Record<string, number> = { red: 0, amber: 1, purple: 2, blue: 3, green: 4, neutral: 5 };
  // But keep health score first always, and "What changed" second
  const healthDiscovery = allDiscoveries.length > 0 && allDiscoveries[0].label === "Engineering Health Index" ? allDiscoveries.shift()! : null;
  const priorActionsDiscovery = allDiscoveries.length > 0 && allDiscoveries[0].label === "What changed since last report" ? allDiscoveries.shift()! : null;

  allDiscoveries.sort((a, b) => (colorOrder[a.color] ?? 5) - (colorOrder[b.color] ?? 5));

  // Cap discovery count by depth
  const maxCards = reportDepth === "EXECUTIVE" ? 5 : reportDepth === "STANDARD" ? 12 : 999;

  const orderedDiscoveries: Discovery[] = [];
  if (healthDiscovery) orderedDiscoveries.push(healthDiscovery);
  if (priorActionsDiscovery) orderedDiscoveries.push(priorActionsDiscovery);
  orderedDiscoveries.push(...allDiscoveries.slice(0, maxCards - orderedDiscoveries.length));

  const discoveryCount = orderedDiscoveries.length;

  // ── Week stats bar ──
  const weekStats = buildWeekStats(content, healthScore);

  // ── Source pills ──
  const sourceMap: Record<string, string> = {
    GITHUB: "GitHub",
    JIRA: "Jira",
    LINEAR: "Linear",
    SLACK: "Slack",
    GOOGLE_CALENDAR: "Calendar",
  };

  // ── Build headline ──
  const headlineCount = discoveryCount;
  const headlineSources = connectedSources.length;

  // ── Build HTML ──
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} — NexFlow</title>
<style>${CSS}</style>
</head>
<body>

${showDownloadBar ? `<div class="download-bar">
  <span style="font-size:12px">Report Preview — ${esc(orgName)}</span>
  <button onclick="window.print()">Download PDF</button>
</div>` : ""}

<div class="page">

  <div class="header">
    <div class="header-top">
      <div><span class="brand">NexFlow Engineering Intelligence</span><span class="tag">Report #${reportNumber}</span></div>
      <div class="period">${esc(periodLabel)}</div>
    </div>
    <h1>${headlineCount} things we found across <span>${esc(orgName)}'s</span> engineering org</h1>
    <div class="header-sub">We analyzed ${headlineSources} data source${headlineSources !== 1 ? "s" : ""} and ${periodLabel} of activity. Here's what stood out — and what needs your attention.</div>
    <div class="sources">
      ${connectedSources.map((s) => `<div class="source-pill active">${sourceMap[s] || s}</div>`).join("")}
    </div>
  </div>

  ${weekStats.length > 0 ? `
  <div class="week-bar">
    ${weekStats.map((s) => `
    <div class="week-stat">
      <div class="val">${s.value}</div>
      <div class="label">${esc(s.label)}</div>
      <div class="delta ${s.direction}">${s.delta}</div>
    </div>`).join("")}
  </div>` : ""}

  <div class="discoveries">
    <div class="disc-label">The discoveries</div>
    ${orderedDiscoveries.map((d, i) => renderDiscovery(d, i + 1)).join("\n")}

    ${content.actionItems?.length > 0 ? renderActionItems(content.actionItems) : ""}

    ${aiNarrative ? `
    <div class="disc-label">Detailed analysis</div>
    <div class="discovery neutral" style="padding:32px">
      ${renderNarrative(aiNarrative)}
    </div>` : ""}
  </div>

  <div class="divider"></div>

  <div class="footer">
    <div class="footer-text">Confidential · NexFlow Engineering Intelligence · Generated for ${esc(orgName)} · ${esc(genDate)}</div>
  </div>

</div>
</body>
</html>`;
}
