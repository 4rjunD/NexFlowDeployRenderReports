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
function esc(s: string | undefined | null): string {
  if (!s) return "";
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
    const isTextVal = isNaN(Number(d.bigNum.value.replace(/[,$%]/g, "")));
    html += `<div class="big-num ${d.color}${isTextVal ? " text-value" : ""}">${d.bigNum.value}</div>`;
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
        `<strong>${d.label}</strong> scored ${d.score}/100: ${d.summary.toLowerCase()}.`
      ).join(" ") +
      (delta != null && delta > 0 ? ` <strong>That's a ${delta}-point improvement since your last report.</strong>` : "") +
      (delta != null && delta < 0 ? ` That's a ${Math.abs(delta)}-point decline, worth investigating.` : ""),
    bigNum: { value: `${hs.overall}`, label: `Engineering Health Index · Grade ${hs.grade}${deltaStr ? ` · ${deltaStr} vs prior` : ""}` },
    dataGrid: grid,
  }];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function discoverCelebration(hs: HealthScore | null, content: Record<string, any>): Discovery[] {
  const wins: string[] = [];

  // Health score improved by 5+ points
  const priorReport = content.priorReport;
  const priorScore = priorReport?.keyMetrics?.healthScore as number | undefined;
  if (hs && priorScore != null) {
    const delta = hs.overall - priorScore;
    if (delta >= 5) {
      wins.push(`Your health score jumped <strong>${delta} points</strong> this period (${priorScore} → ${hs.overall}).`);
    }
    // Grade improved
    const priorGrade = priorReport?.keyMetrics?.healthGrade as string | undefined;
    if (priorGrade && hs.grade !== priorGrade && hs.overall > priorScore) {
      wins.push(`Grade upgraded from <strong>${esc(priorGrade)}</strong> to <strong>${hs.grade}</strong>.`);
    }
    // Any dimension improved by 10+ points
    if (hs.dimensions && priorReport?.keyMetrics) {
      for (const dim of hs.dimensions) {
        const priorDimKey = dim.label.toLowerCase().replace(/\s+/g, "");
        // Try to find prior dimension score by matching label patterns
        for (const [key, val] of Object.entries(priorReport.keyMetrics)) {
          if (key.toLowerCase().includes(priorDimKey.slice(0, 6)) && typeof val === "number" && dim.score - val >= 10) {
            wins.push(`<strong>${esc(dim.label)}</strong> improved by ${dim.score - val} points.`);
          }
        }
      }
    }
  }

  // Zero stale PRs
  const stalePrs = content.integrationData?.github?.pullRequests?.stalePrs;
  if (stalePrs && stalePrs.length === 0 && content.integrationData?.github?.pullRequests?.merged > 0) {
    wins.push(`Zero stale PRs. Every open PR is moving. That's rare and worth recognizing.`);
  }

  // Sprint completion > 90%
  const jira = content.integrationData?.jira;
  if (jira?.issues?.total > 0) {
    const completionRate = pct(n(jira.issues.completed), n(jira.issues.total));
    if (completionRate >= 90) {
      wins.push(`Sprint completion hit <strong>${completionRate}%</strong>. The team is executing at a high level.`);
    }
  }

  // No overdue tickets
  if (jira?.issues?.overdue && jira.issues.overdue.length === 0 && jira.issues?.total > 0) {
    wins.push(`Zero overdue tickets. Every commitment is being met on schedule.`);
  }

  if (wins.length === 0) return [];

  return [{
    color: "green",
    label: "Win of the week",
    sources: [],
    headline: wins.length === 1
      ? `Something worth celebrating this period.`
      : `${wins.length} things worth celebrating this period.`,
    body: wins.join("<br>"),
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
        : `${sprint.name} is tracking at ${predictedRate}% predicted completion with ${remaining} issues remaining.`,
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
      body: `These issues are still in "To Do" status late in the sprint. Historically, tickets in this state at this point carry over <strong>78% of the time</strong>. Each carry-over delays dependent work and reduces sprint predictability.`,
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
      headline: `Sprint completion has been ${trend}, averaging ${avgRate}% across the last ${sprints.length} sprints.`,
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
    headline: `${overdue.length} ticket${overdue.length > 1 ? "s are" : " is"} overdue. The oldest is ${overdue[0].daysOverdue} days past due.`,
    body: `These tickets have passed their due dates and are blocking downstream work. Overdue tickets that aren't addressed within 2 weeks have a <strong>3x higher probability</strong> of being deprioritized without resolution, creating invisible tech debt.`,
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
        reviewerNote = ` <strong>${assignedToTop} of ${stalePrs.length} stale PRs involve ${esc(topReviewer)} who handles ${topPct}% of all reviews.</strong> Consider redistributing review load.`;
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
    headline: `${stalePrs.length} PR${stalePrs.length > 1 ? "s have" : " has"} been open ${oldest.daysOpen}+ days. ${totalStuckLOC.toLocaleString()} lines of code are waiting to ship.`,
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

  // Skip if all values are zero — nothing meaningful to show
  if (n(churn.totalAdditions) === 0 && n(churn.totalDeletions) === 0 && n(churn.netLinesAdded) === 0) return [];

  const net = n(churn.netLinesAdded);
  const ratio = n(churn.churnRatio);
  const largePrs = churn.largePrs || [];

  const color: DiscoveryColor = ratio > 0.7 ? "amber" : net > 0 ? "green" : "blue";

  return [{
    color,
    label: "Code churn analysis",
    sources: ["github"],
    headline: ratio > 0.7
      ? `High code churn detected. ${fmt(ratio * 100)}% of code added this period was also deleted. Net: ${net > 0 ? "+" : ""}${net.toLocaleString()} LOC.`
      : `Net code growth of ${net > 0 ? "+" : ""}${net.toLocaleString()} lines with a healthy churn ratio of ${fmt(ratio, 2)}.`,
    body: `The team added <strong>+${n(churn.totalAdditions).toLocaleString()}</strong> and removed <strong>-${n(churn.totalDeletions).toLocaleString()}</strong> lines of code. ` +
      `Average PR size is <strong>${n(churn.avgPrSize).toLocaleString()} LOC</strong>. ` +
      (largePrs.length > 0
        ? `<strong>${largePrs.length} PR${largePrs.length > 1 ? "s" : ""} exceeded 500 lines.</strong> Large PRs take 2-3x longer to review and are more likely to introduce defects.`
        : `No PRs exceeded 500 lines. The team is shipping right-sized changes.`) +
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
      crossSourceNote = ` <strong>Low focus time (${fmt(focusHours)}h/day) may be contributing to slower review turnaround (${fmt(reviewTurnaround)}h).</strong> Less uninterrupted time means reviews sit in queue longer.`;
    } else if (focusHours >= 3.5 && reviewTurnaround < 12) {
      crossSourceNote = ` Higher focus time correlates with faster reviews. Your ${fmt(reviewTurnaround)}h turnaround benefits from ${fmt(focusHours)}h/day of uninterrupted work.`;
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
      (recurringPct > 40 ? `<strong>If you cancelled ${reclaimPct}% of recurring meetings, you'd reclaim ~${reclaimedWeekly}h this period, roughly ${reclaimedQuarterly} engineering hours per quarter.</strong> ` : "") +
      (focusHours < 3 ? `Focus time below 3h/day severely impacts ability to do deep technical work.` : focusHours < 4 ? `Focus time is below the recommended 4h/day threshold. Consider protecting morning blocks for deep work.` : `Focus time is healthy. The team has sufficient bandwidth for deep technical work.`) +
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
    headline: `${active.length} active deliverable${active.length !== 1 ? "s" : ""} at ${avgCompletion}% average progress${overdue.length > 0 ? `, ${overdue.length} overdue` : ""}.`,
    body: deliverables.slice(0, 6).map((d: { key: string; summary: string; completionPct: number; status: string; assignee: string; dueDate?: string; statusCategory: string }) => {
      const isOverdue = d.dueDate && new Date(d.dueDate) < new Date() && d.statusCategory !== "done";
      return `<strong>${esc(d.key)}</strong>: ${esc(d.summary)}, ${d.completionPct}% (${esc(d.status)})${isOverdue ? " <strong style='color:var(--red)'>OVERDUE</strong>" : ""}`;
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

  // Filter out comparisons where the current value is 0 (no real data)
  benchmarks.comparisons = benchmarks.comparisons.filter(
    (c: { currentValue: number }) => n(c.currentValue) > 0
  );
  if (benchmarks.comparisons.length === 0) return [];

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

  // Skip if there are no actual improvements to report — "being tracked" filler isn't useful
  if (improved.length === 0 && n(progression.estimatedCostSavings) === 0) return [];

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
        ? `${improved.length} key metric${improved.length > 1 ? "s have" : " has"} improved${progression.estimatedCostSavings > 0 ? `, saving an estimated $${Math.round(progression.estimatedCostSavings).toLocaleString()}` : ""}.`
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
    headline: `${blockerList.length} blocker signal${blockerList.length > 1 ? "s" : ""} detected across ${n(blockers.channelsScanned)} Slack channels${ticketCount > 0 ? `, referencing ${ticketCount} Jira ticket${ticketCount > 1 ? "s" : ""}` : ""}.`,
    body: `We scanned <strong>${n(blockers.totalMessagesScanned).toLocaleString()} messages</strong> and found ${blockerList.length} messages containing blocker language ("blocked by", "waiting on", "stuck on", etc.). ` +
      (highConfidence.length > 0 ? `<strong>${highConfidence.length} are high-confidence</strong> and reference known Jira tickets. ` : "") +
      `Unresolved blockers compound daily. Each blocked thread represents stalled work that may not be visible in your project tracker.`,
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
      headline: `Average thread response time is ${avgResponseHrs >= 1 ? fmt(avgResponseHrs) + " hours" : fmt(avgResponseMin) + " minutes"}. Async communication may be lagging.`,
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
      headline: `Team responds to threads in under ${Math.round(avgResponseMin)} minutes on average. That's a strong async communication culture.`,
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
      ? `${atRisk.length} contributor${atRisk.length > 1 ? "s show" : " shows"} burnout risk signals: high output combined with concentrated review load${afterHoursPct >= 20 ? " and after-hours activity" : ""}.`
      : `${watching.length} contributor${watching.length > 1 ? "s" : ""} worth monitoring for workload balance.`,
    body: `This analysis combines commit volume, review load, ticket completion, and Slack after-hours activity to identify contributors who may be overloaded or disengaged. ` +
      (atRisk.length > 0 ? `<strong>Contributors flagged "AT RISK" carry disproportionate load. Losing them would create critical knowledge gaps.</strong> ` : "") +
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
      headline: `${esc(topAuthor[0])} drove ${topPct}% of all commits this period: ${topAuthor[1]} commits and ${topPrs} PRs.`,
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

// GitHub overview — always generates useful cards for any GitHub data, even solo devs
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function discoverGitHubOverview(content: Record<string, any>): Discovery[] {
  const gh = content.integrationData?.github;
  if (!gh) return [];

  const discoveries: Discovery[] = [];
  const totalCommits = n(gh.commits?.total);
  const repos = gh.repositories || {};
  const activeRepos = n(repos.active);
  const totalRepos = n(repos.total);
  const pr = typeof gh.pullRequests === "object" ? gh.pullRequests : {};
  const merged = n(pr.merged);
  const opened = n(pr.opened);
  const reviewTotal = n(gh.reviews?.total);
  const byAuthor = (gh.commits?.byAuthor || {}) as Record<string, number>;
  const authorCount = Object.keys(byAuthor).length;

  // Solo dev / tiny team insights — business-focused for non-technical founders
  if (authorCount <= 1 && totalCommits > 0) {
    const soloName = Object.keys(byAuthor)[0] || "the sole contributor";

    // Get repo names for context
    const repoNames = (gh.repos || []) as string[];
    const shortRepoNames = repoNames.map((r: string) => r.split("/").pop() || r);

    // No change tracking = no visibility into what's shipping
    if (n(gh.issues?.total) === 0) {
      discoveries.push({
        color: "red",
        label: "No paper trail",
        sources: ["github"],
        headline: `${totalCommits} changes shipped with zero documentation of what was built or why. If a client asks "what did we ship this quarter?", there's no answer on file.`,
        body: `There are <strong>no issues, tickets, or project tracking</strong> connected to any of the ${totalCommits} commits across ` +
          `<strong>${shortRepoNames.join("</strong> and <strong>")}</strong>. ` +
          `This means no record of what features were prioritized, what bugs were fixed, or what decisions were made. ` +
          `For investor updates, client demos, or onboarding a contractor, you'd be starting from memory. ` +
          `<strong>We'll set up a lightweight tracking system on our next call that takes 2 minutes per feature, not 20.</strong>`,
        bigNum: { value: "None", label: "No tracked features or decisions. Everything lives in someone's head." },
        dataGrid: [
          { value: `${totalCommits}`, label: "Changes shipped" },
          { value: "0", label: "Documented decisions", color: "red" },
        ],
      });
    }

    // No PR / no review = no safety net + impossible to audit
    if (merged === 0 && opened === 0) {
      discoveries.push({
        color: "amber",
        label: "No safety net",
        sources: ["github"],
        headline: `Every change goes live instantly with no checkpoint. One bad update could take your product down with no easy way to undo it.`,
        body: `Right now, code goes from "written" to "live" in one step with no review, no staging, and no rollback plan. ` +
          `This matters because <strong>a single mistake can break your product for every user</strong>, ` +
          `and without change history, debugging takes 5-10x longer. ` +
          `The fix isn't about process overhead. It's a <strong>simple GitHub setting that creates an undo button for every change</strong>. ` +
          `<strong>We'll configure this together on the next call. Genuinely 10 minutes.</strong>`,
        bigNum: { value: "None", label: "No safety checkpoints between code and production" },
      });
    }

    // Two separate repos — architecture question
    if (shortRepoNames.length >= 2) {
      discoveries.push({
        color: "blue",
        label: "Architecture check",
        sources: ["github"],
        headline: `You're running ${shortRepoNames.length} separate codebases. Are they talking to each other the way they should be?`,
        body: `Your development is split across <strong>${shortRepoNames.join("</strong> and <strong>")}</strong>. ` +
          `The question worth asking: are these truly independent products, or are they pieces of the same thing? ` +
          `Keeping related code in separate repos adds coordination overhead. Updates in one might silently break the other. ` +
          `<strong>On our next call, we'll map out your architecture and recommend whether to consolidate or keep them separate.</strong>`,
        dataGrid: shortRepoNames.map((name: string) => ({
          value: name,
          label: "Repository",
        })),
      });
    }
  }

  // Commit velocity insight (works for any team size with commits)
  if (totalCommits > 0 && authorCount > 1) {
    const commitsPerWeek = totalCommits / 13; // ~90-day period
    discoveries.push({
      color: commitsPerWeek >= 5 ? "green" : commitsPerWeek >= 2 ? "blue" : "amber",
      label: "Development velocity",
      sources: ["github"],
      headline: `Team shipped ${totalCommits} commits across ${activeRepos} active ${activeRepos === 1 ? "repo" : "repos"}, averaging ${fmt(commitsPerWeek)} commits/week.`,
      body: `Your codebase spans ${totalRepos} ${totalRepos === 1 ? "repository" : "repositories"} with ${authorCount} active ${authorCount === 1 ? "contributor" : "contributors"}. ` +
        (merged > 0 ? `${merged} PRs were merged with an average merge time of ${fmt(n(pr.avgMergeTimeHours))}h. ` : "") +
        (reviewTotal > 0 ? `${reviewTotal} code reviews were completed. ` : ""),
      dataGrid: [
        { value: `${totalCommits}`, label: "Commits" },
        { value: `${activeRepos}`, label: "Active repos" },
        { value: `${authorCount}`, label: "Contributors" },
        ...(merged > 0 ? [{ value: `${merged}`, label: "PRs merged" }] : []),
      ],
    });
  }

  return discoveries;
}

// Upsell card: shows what connecting more tools would unlock
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function discoverConnectMore(content: Record<string, any>): Discovery[] {
  const connected = (content.connectedSources || []) as string[];
  const allSources = ["GITHUB", "JIRA", "LINEAR", "SLACK", "GOOGLE_CALENDAR"];
  const missing = allSources.filter(s => !connected.includes(s));

  // Only show if significantly limited — at least 2 sources missing
  if (missing.length < 2) return [];

  const unlocks: string[] = [];
  if (missing.includes("SLACK")) unlocks.push("how your team actually communicates: where bottlenecks form, who's overloaded, and whether work discussions are happening in the right channels");
  if (missing.includes("JIRA") || missing.includes("LINEAR")) unlocks.push("what's actually getting done vs what's planned: missed deadlines, scope creep, and where projects get stuck");
  if (missing.includes("GOOGLE_CALENDAR")) unlocks.push("how much time goes to meetings vs actual building. Most teams are shocked to learn they spend 40-60% of their week in calls");

  return [{
    color: "purple",
    label: "We can see more",
    sources: [],
    headline: `This brief is based on ${connected.length} data source. With ${missing.length} more connected, we can answer much bigger questions about your business.`,
    body: `Right now we can see <em>what</em> got built, but not <em>how</em> or <em>why</em>. With more integrations, we can tell you: <strong>${unlocks.join("</strong>. Also: <strong>")}</strong>. ` +
      `<strong>Connecting takes about 2 clicks each. We'll do it together on the next call.</strong>`,
    dataGrid: [
      { value: `${connected.length}`, label: "Connected", color: "green" },
      { value: `${missing.length}`, label: "Available", color: "purple" },
    ],
  }];
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
        return `<span style="color:var(--green)">&#10003;</span> <strong>[${esc(a.priority)}] ${esc(a.title)}</strong> · <span style="color:var(--green)">Done:</span> ${a.deltaText}`;
      } else if (a.partiallyAddressed) {
        return `<span style="color:var(--amber)">&#9679;</span> <strong>[${esc(a.priority)}] ${esc(a.title)}</strong> · <span style="color:var(--amber)">Partially:</span> ${a.deltaText}`;
      } else {
        return `<span style="color:var(--muted)">&#9675;</span> <strong>[${esc(a.priority)}] ${esc(a.title)}</strong> · <span style="color:var(--muted)">No change detected</span>`;
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

  let html = "";
  for (const item of actionItems.slice(0, 6)) {
    const priClass = item.priority === "P1" ? "p1" : item.priority === "P2" ? "p2" : "p3";
    const urgency = item.priority === "P1" ? "Do this week" : item.priority === "P2" ? "Do this sprint" : "When you can";
    html += `<div class="action ${priClass}">
      <div class="action-top">
        <div class="action-priority ${priClass}">${esc(item.priority)}</div>
        <div class="action-urgency">${urgency}</div>
      </div>
      <div class="action-title">${esc(item.title)}</div>
      <div class="action-desc">${esc(item.description)}</div>
      <div class="action-footer">
        ${item.suggestedOwner ? `<div class="action-meta-tag">Owner: ${esc(item.suggestedOwner)}</div>` : ""}
        ${item.timeEstimate ? `<div class="action-meta-tag">${esc(item.timeEstimate)}</div>` : ""}
        ${item.expectedImpact ? `<div class="action-roi">${esc(item.expectedImpact)}</div>` : ""}
      </div>
    </div>`;
  }
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
      html += `<div class="narrative-action"><span class="narrative-action-num">${actionMatch[1]}</span><strong>${esc(actionMatch[2])}</strong>: ${formatInline(actionMatch[3])}</div>`;
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

  if (gh?.commits) {
    const totalCommits = n(gh.commits.total);
    const priorCommits = prior?.totalCommits;
    if (totalCommits > 0) {
      stats.push({
        value: `${totalCommits}`,
        label: "Commits",
        delta: priorCommits != null ? `${totalCommits > priorCommits ? "↑" : totalCommits < priorCommits ? "↓" : ""} ${Math.abs(totalCommits - priorCommits)} vs prior` : "",
        direction: priorCommits != null ? (totalCommits > priorCommits ? "up" : totalCommits < priorCommits ? "down" : "flat") : "flat",
      });
    }

    const authorCount = Object.keys(gh.commits.byAuthor || {}).length;
    if (authorCount > 0) {
      stats.push({
        value: `${authorCount}`,
        label: "Contributors",
        delta: "",
        direction: "flat",
      });
    }
  }

  if (gh?.pullRequests) {
    const merged = n(gh.pullRequests.merged);
    const priorMerged = prior?.prsMerged;
    if (merged > 0) {
      stats.push({
        value: `${merged}`,
        label: "PRs Merged",
        delta: priorMerged != null ? `${merged > priorMerged ? "↑" : "↓"} ${Math.abs(merged - priorMerged)} vs prior` : "",
        direction: priorMerged != null ? (merged > priorMerged ? "up" : merged < priorMerged ? "down" : "flat") : "flat",
      });
    }

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
    --fg: #0f0f0f;
    --fg2: #3a3a3a;
    --muted: #8c8c8c;
    --border: #e5e5ea;
    --surface: #f7f7f8;
    --accent: #0f0f0f;
    --red: #e5484d;
    --amber: #e5940c;
    --green: #30a46c;
    --blue: #3b82f6;
    --purple: #8b5cf6;
    --red-bg: #fff0f0;
    --amber-bg: #fef6e7;
    --green-bg: #ebfaf1;
    --blue-bg: #eef4ff;
    --purple-bg: #f3f0ff;
    --radius: 14px;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', -apple-system, sans-serif; background: #eeeef0; color: var(--fg); line-height: 1.6; -webkit-font-smoothing: antialiased; }
  .page { max-width: 660px; margin: 0 auto; background: var(--bg); border-radius: 16px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.04); }

  /* ── Header ── */
  .header { padding: 44px 44px 32px; background: linear-gradient(135deg, #fafafa 0%, #f0f0f2 100%); border-bottom: 1px solid var(--border); position: relative; }
  .header::after { content: ''; position: absolute; bottom: 0; left: 44px; right: 44px; height: 3px; background: linear-gradient(90deg, var(--fg) 0%, var(--blue) 50%, var(--purple) 100%); border-radius: 3px 3px 0 0; }
  .header-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
  .brand { font-size: 10px; font-weight: 700; letter-spacing: 2.5px; color: var(--muted); text-transform: uppercase; }
  .tag { font-size: 10px; font-weight: 700; padding: 4px 12px; border-radius: 6px; background: var(--fg); color: white; margin-left: 10px; letter-spacing: 0.3px; }
  .period { font-size: 11px; color: var(--muted); font-weight: 500; }
  .header-company { font-size: 32px; font-weight: 900; letter-spacing: -1px; color: var(--fg); margin-bottom: 6px; line-height: 1.1; }
  .header-subtitle { font-size: 14px; color: var(--fg2); font-weight: 500; }
  .header-subtitle strong { color: var(--fg); font-weight: 700; }
  .sources { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 16px; }
  .source-pill { font-size: 10px; font-weight: 600; padding: 4px 12px; border-radius: 6px; border: 1px solid var(--border); color: var(--muted); background: white; }
  .source-pill.active { border-color: var(--green); color: var(--green); background: var(--green-bg); }

  /* ── Health strip ── */
  .health-strip { display: flex; align-items: center; gap: 20px; padding: 20px 44px; background: var(--surface); border-bottom: 1px solid var(--border); }
  .health-score-big { font-size: 44px; font-weight: 900; letter-spacing: -2px; line-height: 1; }
  .health-meta { display: flex; flex-direction: column; gap: 2px; }
  .health-meta .grade-line { font-size: 13px; font-weight: 700; color: var(--fg); }
  .health-meta .delta-line { font-size: 11px; font-weight: 600; }
  .health-dims { display: flex; flex-wrap: wrap; gap: 6px; flex: 1; justify-content: flex-end; }
  .health-dim { font-size: 10px; padding: 4px 10px; border-radius: 6px; background: white; color: var(--muted); font-weight: 600; border: 1px solid var(--border); }
  .health-dim .dim-score { font-weight: 800; margin-right: 3px; }

  /* ── Week stats ── */
  .week-bar { display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); border-bottom: 1px solid var(--border); }
  .week-stat { padding: 18px 12px; text-align: center; border-right: 1px solid var(--border); }
  .week-stat:last-child { border-right: none; }
  .week-stat .val { font-size: 24px; font-weight: 900; letter-spacing: -1px; color: var(--fg); }
  .week-stat .label { font-size: 9px; color: var(--muted); font-weight: 700; margin-top: 3px; text-transform: uppercase; letter-spacing: 0.5px; }
  .week-stat .delta { font-size: 10px; font-weight: 600; margin-top: 3px; }
  .week-stat .delta.up { color: var(--green); }
  .week-stat .delta.down { color: var(--red); }
  .week-stat .delta.flat { color: var(--muted); }

  /* ── TLDR ── */
  .tldr { padding: 28px 44px; background: linear-gradient(135deg, #fefce8 0%, #fff7ed 100%); border-bottom: 1px solid var(--border); }
  .tldr-label { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; color: var(--amber); margin-bottom: 8px; }
  .tldr-text { font-size: 15px; font-weight: 600; line-height: 1.55; color: var(--fg); }
  .tldr-text strong { font-weight: 800; }

  /* ── Overview ── */
  .overview { padding: 32px 44px; }
  .overview-title { font-size: 18px; font-weight: 800; letter-spacing: -0.5px; color: var(--fg); margin-bottom: 20px; }
  .overview-list { display: flex; flex-direction: column; gap: 2px; }
  .overview-item { display: flex; align-items: center; gap: 16px; padding: 16px 0; border-bottom: 1px solid var(--border); }
  .overview-item:last-child { border-bottom: none; }
  .overview-num { width: 38px; height: 38px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 17px; font-weight: 900; flex-shrink: 0; }
  .overview-num.red { background: var(--red-bg); color: var(--red); }
  .overview-num.amber { background: var(--amber-bg); color: var(--amber); }
  .overview-num.green { background: var(--green-bg); color: var(--green); }
  .overview-num.blue { background: var(--blue-bg); color: var(--blue); }
  .overview-num.purple { background: var(--purple-bg); color: var(--purple); }
  .overview-num.neutral { background: var(--surface); color: var(--muted); }
  .overview-content { flex: 1; min-width: 0; }
  .overview-headline { font-size: 14px; font-weight: 600; line-height: 1.4; color: var(--fg); }
  .overview-sub { font-size: 11px; color: var(--muted); margin-top: 3px; font-weight: 500; }
  .overview-pill { flex-shrink: 0; }

  /* ── Separator ── */
  .sep { height: 1px; background: var(--border); margin: 0 44px; }

  /* ── Finding cards ── */
  .findings { padding: 32px 44px 12px; }
  .findings-title { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 2.5px; color: var(--muted); margin-bottom: 24px; }

  .finding-hero { margin-bottom: 16px; padding: 28px; border-radius: var(--radius); border: 1px solid var(--border); background: white; position: relative; overflow: hidden; }
  .finding-hero::before { content: ''; position: absolute; top: 0; left: 0; bottom: 0; width: 4px; }
  .finding-hero.red::before { background: var(--red); }
  .finding-hero.amber::before { background: var(--amber); }
  .finding-hero.green::before { background: var(--green); }
  .finding-hero.blue::before { background: var(--blue); }
  .finding-hero.purple::before { background: var(--purple); }
  .finding-hero.neutral::before { background: var(--muted); }
  .finding-hero .finding-badge { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
  .finding-hero .finding-num { width: 38px; height: 38px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 17px; font-weight: 900; flex-shrink: 0; }
  .finding-hero .finding-num.red { background: var(--red-bg); color: var(--red); }
  .finding-hero .finding-num.amber { background: var(--amber-bg); color: var(--amber); }
  .finding-hero .finding-num.green { background: var(--green-bg); color: var(--green); }
  .finding-hero .finding-num.blue { background: var(--blue-bg); color: var(--blue); }
  .finding-hero .finding-num.purple { background: var(--purple-bg); color: var(--purple); }
  .finding-hero .disc-headline { font-size: 18px; font-weight: 800; line-height: 1.3; letter-spacing: -0.3px; margin-bottom: 10px; }

  .finding-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
  .finding-card { padding: 24px; border-radius: var(--radius); border: 1px solid var(--border); background: white; position: relative; overflow: hidden; }
  .finding-card::before { content: ''; position: absolute; top: 0; left: 0; bottom: 0; width: 3px; }
  .finding-card.red::before { background: var(--red); }
  .finding-card.amber::before { background: var(--amber); }
  .finding-card.green::before { background: var(--green); }
  .finding-card.blue::before { background: var(--blue); }
  .finding-card.purple::before { background: var(--purple); }
  .finding-card.neutral::before { background: var(--muted); }
  .finding-card .finding-badge { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
  .finding-card .finding-num { width: 30px; height: 30px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 900; flex-shrink: 0; }
  .finding-card .finding-num.red { background: var(--red-bg); color: var(--red); }
  .finding-card .finding-num.amber { background: var(--amber-bg); color: var(--amber); }
  .finding-card .finding-num.green { background: var(--green-bg); color: var(--green); }
  .finding-card .finding-num.blue { background: var(--blue-bg); color: var(--blue); }
  .finding-card .finding-num.purple { background: var(--purple-bg); color: var(--purple); }
  .finding-card .disc-headline { font-size: 14px; font-weight: 700; }
  .finding-card .big-num { font-size: 28px; }
  .finding-full { grid-column: 1 / -1; }

  /* ── Shared discovery internals ── */
  .disc-headline { font-size: 16px; font-weight: 800; line-height: 1.35; margin-bottom: 8px; letter-spacing: -0.3px; color: var(--fg); }
  .disc-body { font-size: 13px; color: var(--fg2); line-height: 1.7; }
  .disc-body strong { color: var(--fg); font-weight: 700; }
  .disc-num { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 6px; display: flex; align-items: center; gap: 6px; color: var(--muted); }

  .risk-pill { display: inline-flex; align-items: center; font-size: 10px; font-weight: 700; letter-spacing: 0.3px; padding: 3px 10px; border-radius: 6px; }
  .risk-pill.high { background: var(--red-bg); color: var(--red); }
  .risk-pill.medium { background: var(--amber-bg); color: var(--amber); }
  .risk-pill.low { background: var(--green-bg); color: var(--green); }
  .risk-pill.info { background: var(--blue-bg); color: var(--blue); }
  .risk-pill.win { background: var(--green-bg); color: var(--green); }
  .risk-pill.insight { background: var(--purple-bg); color: var(--purple); }

  .source-tag { display: inline-block; font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 4px; margin-right: 3px; margin-bottom: 4px; background: var(--surface); color: var(--muted); border: 1px solid var(--border); }

  .big-num { font-size: 40px; font-weight: 900; line-height: 1; margin-bottom: 4px; letter-spacing: -1.5px; color: var(--fg); }
  .big-num.text-value { font-size: 22px; letter-spacing: -0.5px; padding: 10px 18px; border-radius: 10px; display: inline-block; margin-bottom: 8px; }
  .big-num.text-value.red { background: var(--red-bg); color: var(--red); }
  .big-num.text-value.amber { background: var(--amber-bg); color: var(--amber); }
  .big-num.text-value.green { background: var(--green-bg); color: var(--green); }
  .big-num.text-value.blue { background: var(--blue-bg); color: var(--blue); }
  .big-num.text-value.purple { background: var(--purple-bg); color: var(--purple); }
  .big-num.red { color: var(--red); }
  .big-num.amber { color: var(--amber); }
  .big-num.green { color: var(--green); }
  .big-num.blue { color: var(--blue); }
  .big-num.purple { color: var(--purple); }
  .big-label { font-size: 11px; color: var(--muted); font-weight: 600; margin-bottom: 14px; letter-spacing: 0.2px; }

  .data-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 14px; }
  .data-grid.four { grid-template-columns: repeat(4, 1fr); }
  .data-grid.two { grid-template-columns: repeat(2, 1fr); }
  .data-cell { padding: 12px; background: var(--surface); border-radius: 8px; border: 1px solid var(--border); }
  .data-cell .val { font-size: 16px; font-weight: 800; letter-spacing: -0.5px; color: var(--fg); }
  .data-cell .label { font-size: 9px; color: var(--muted); margin-top: 2px; font-weight: 600; }

  .person-row { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--border); }
  .person-row:last-child { border-bottom: none; }
  .person-avatar { width: 28px; height: 28px; border-radius: 8px; background: var(--surface); display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; color: var(--muted); flex-shrink: 0; border: 1px solid var(--border); }
  .person-info { flex: 1; min-width: 0; }
  .person-name { font-size: 12px; font-weight: 700; }
  .person-detail { font-size: 11px; color: var(--muted); }
  .person-badge { font-size: 10px; font-weight: 700; padding: 3px 10px; border-radius: 6px; flex-shrink: 0; background: var(--surface); color: var(--muted); border: 1px solid var(--border); }
  .person-badge.red { color: var(--red); border-color: var(--red); background: var(--red-bg); }
  .person-badge.amber { color: var(--amber); border-color: var(--amber); background: var(--amber-bg); }
  .person-badge.green { color: var(--green); border-color: var(--green); background: var(--green-bg); }
  .person-badge.blue { color: var(--blue); }
  .person-badge.purple { color: var(--purple); }

  .timeline { margin-top: 10px; }
  .timeline-item { display: flex; gap: 10px; margin-bottom: 6px; }
  .timeline-dot { width: 6px; height: 6px; border-radius: 50%; margin-top: 7px; flex-shrink: 0; }
  .timeline-dot.red { background: var(--red); }
  .timeline-dot.amber { background: var(--amber); }
  .timeline-dot.green { background: var(--green); }
  .timeline-dot.blue { background: var(--blue); }
  .timeline-text { font-size: 12px; color: var(--fg2); line-height: 1.5; }

  /* ── Actions ── */
  .actions-section { padding: 32px 44px 12px; }
  .actions-title { font-size: 18px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 4px; }
  .actions-sub { font-size: 12px; color: var(--muted); margin-bottom: 20px; font-weight: 500; }
  .action { padding: 20px 24px; margin-bottom: 12px; border-radius: var(--radius); background: white; border: 1px solid var(--border); position: relative; overflow: hidden; }
  .action::before { content: ''; position: absolute; top: 0; left: 0; bottom: 0; width: 4px; }
  .action.p1::before { background: var(--red); }
  .action.p2::before { background: var(--amber); }
  .action.p3::before { background: var(--blue); }
  .action-top { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .action-priority { font-size: 10px; font-weight: 800; padding: 3px 10px; border-radius: 6px; flex-shrink: 0; letter-spacing: 0.5px; }
  .action-priority.p1 { background: var(--red-bg); color: var(--red); }
  .action-priority.p2 { background: var(--amber-bg); color: var(--amber); }
  .action-priority.p3 { background: var(--blue-bg); color: var(--blue); }
  .action-urgency { font-size: 11px; color: var(--muted); font-weight: 600; }
  .action-time { font-size: 11px; color: var(--fg2); font-weight: 700; background: var(--surface); padding: 2px 8px; border-radius: 4px; }
  .action-title { font-size: 15px; font-weight: 700; color: var(--fg); line-height: 1.35; margin-bottom: 6px; }
  .action-desc { font-size: 12px; color: var(--fg2); line-height: 1.65; }
  .action-footer { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; align-items: center; }
  .action-meta-tag { font-size: 10px; padding: 3px 10px; border-radius: 6px; background: var(--surface); color: var(--muted); font-weight: 600; border: 1px solid var(--border); }
  .action-roi { font-size: 10px; color: var(--green); font-weight: 700; padding: 3px 10px; background: var(--green-bg); border-radius: 6px; }

  /* ── Section separator ── */
  .section-sep { padding: 0 44px; margin: 32px 0 0; }
  .section-sep-line { height: 1px; background: var(--border); }
  .section-sep-label { font-size: 10px; font-weight: 800; letter-spacing: 2px; color: var(--muted); margin-top: 12px; text-transform: uppercase; }

  /* ── Agenda section ── */
  .agenda-section { padding: 32px 44px 16px; }
  .agenda-card { padding: 28px; border-radius: var(--radius); background: linear-gradient(135deg, #f8f7ff 0%, #f0f4ff 100%); border: 1px solid #e0e0ef; }
  .agenda-title { font-size: 16px; font-weight: 800; color: var(--fg); margin-bottom: 4px; letter-spacing: -0.3px; }
  .agenda-sub { font-size: 12px; color: var(--muted); margin-bottom: 20px; font-weight: 500; }
  .agenda-item { display: flex; align-items: flex-start; gap: 12px; padding: 12px 0; border-bottom: 1px solid rgba(0,0,0,0.06); }
  .agenda-item:last-child { border-bottom: none; }
  .agenda-num { width: 24px; height: 24px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; flex-shrink: 0; background: var(--fg); color: white; }
  .agenda-text { font-size: 13px; font-weight: 600; color: var(--fg); line-height: 1.5; }
  .agenda-detail { font-size: 11px; color: var(--muted); margin-top: 2px; font-weight: 500; }

  /* ── Detail section ── */
  .detail-section { padding: 24px 44px 8px; }
  .detail-title { font-size: 13px; font-weight: 800; letter-spacing: -0.2px; margin-bottom: 14px; }
  .discoveries { padding: 0; }
  .disc-label { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; color: var(--muted); padding-top: 20px; margin-bottom: 14px; }

  .discovery { margin-bottom: 12px; padding: 22px 24px; border-radius: var(--radius); border: 1px solid var(--border); background: white; position: relative; overflow: hidden; }
  .discovery::before { content: ''; position: absolute; top: 0; left: 0; bottom: 0; width: 3px; }
  .discovery.red::before { background: var(--red); }
  .discovery.amber::before { background: var(--amber); }
  .discovery.green::before { background: var(--green); }
  .discovery.blue::before { background: var(--blue); }
  .discovery.purple::before { background: var(--purple); }
  .discovery.neutral::before { background: var(--muted); }

  /* ── CTA ── */
  .cta-banner { margin: 32px 44px; padding: 32px; border-radius: var(--radius); background: linear-gradient(135deg, #0f0f0f 0%, #1a1a2e 100%); color: white; text-align: center; position: relative; overflow: hidden; }
  .cta-banner::before { content: ''; position: absolute; top: -50%; right: -20%; width: 200px; height: 200px; background: radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%); border-radius: 50%; }
  .cta-banner::after { content: ''; position: absolute; bottom: -50%; left: -20%; width: 200px; height: 200px; background: radial-gradient(circle, rgba(59,130,246,0.1) 0%, transparent 70%); border-radius: 50%; }
  .cta-banner h3 { font-size: 18px; font-weight: 800; margin-bottom: 8px; position: relative; letter-spacing: -0.3px; }
  .cta-banner p { font-size: 13px; color: rgba(255,255,255,0.55); margin-bottom: 20px; line-height: 1.6; position: relative; }
  .cta-btn { display: inline-block; padding: 12px 28px; background: white; color: var(--fg); font-size: 14px; font-weight: 700; border-radius: 8px; text-decoration: none; position: relative; letter-spacing: -0.2px; }

  /* ── Narrative ── */
  .narrative-heading { font-size: 15px; font-weight: 800; margin: 18px 0 6px; color: var(--fg); }
  .narrative-subheading { font-size: 13px; font-weight: 700; margin: 12px 0 4px; color: var(--fg); }
  .narrative-p { font-size: 13px; line-height: 1.7; color: var(--fg2); margin-bottom: 6px; }
  .narrative-p strong { color: var(--fg); }
  .narrative-bullet { font-size: 13px; line-height: 1.6; color: var(--fg2); margin: 0 0 4px 16px; padding-left: 8px; border-left: 2px solid var(--border); }
  .narrative-action { display: flex; gap: 8px; font-size: 13px; color: var(--fg2); margin: 4px 0; padding: 10px 14px; border-radius: 8px; background: var(--surface); }
  .narrative-action-num { font-weight: 800; color: var(--fg); min-width: 18px; }
  .callout { border-left: 3px solid; padding: 14px 18px; margin: 12px 0; border-radius: 0 8px 8px 0; font-size: 13px; line-height: 1.6; }
  .callout.red { border-left-color: var(--red); background: var(--red-bg); }
  .callout.green { border-left-color: var(--green); background: var(--green-bg); }
  .callout.blue { border-left-color: var(--blue); background: var(--blue-bg); }
  .callout-tag { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
  .callout.red .callout-tag { color: var(--red); }
  .callout.green .callout-tag { color: var(--green); }
  .callout.blue .callout-tag { color: var(--blue); }
  .callout-body { color: var(--fg2); }

  /* ── Footer ── */
  .footer { padding: 28px 44px 32px; border-top: 1px solid var(--border); background: var(--surface); }
  .footer-text { font-size: 10px; color: var(--muted); font-weight: 500; }
  .footer-brand { font-size: 10px; font-weight: 700; letter-spacing: 2px; color: var(--muted); text-transform: uppercase; margin-bottom: 6px; }

  /* ── Download bar ── */
  .download-bar { position: fixed; top: 0; left: 0; right: 0; background: var(--fg); color: white; padding: 10px 20px; display: flex; align-items: center; justify-content: center; gap: 12px; z-index: 50; font-size: 12px; font-weight: 600; }
  .download-bar button { background: white; color: var(--fg); border: none; padding: 6px 18px; font-size: 12px; font-weight: 700; border-radius: 6px; cursor: pointer; }
  .download-bar + .page { margin-top: 44px; }

  @media print {
    body { background: white; }
    .page { border: none; box-shadow: none; border-radius: 0; }
    .download-bar { display: none !important; }
    .cta-banner { display: none !important; }
    .agenda-section { break-inside: avoid; }
    .discovery, .finding-hero, .finding-card, .action { break-inside: avoid; }
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
  meetingLink?: string | null;
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
    meetingLink = "https://calendly.com/arjundixit3508/30min",
  } = opts;

  const periodLabel = `${format(periodStart, "MMM d")} to ${format(periodEnd, "MMM d, yyyy")}`;
  const genDate = generatedAt ? format(generatedAt, "MMM d, yyyy") : format(new Date(), "MMM d, yyyy");
  const connectedSources = (content.connectedSources || []) as string[];
  const reportNumber = content.reportNumber || 1;

  // ── Generate all discoveries ──
  const allDiscoveries: Discovery[] = [
    ...discoverHealthScore(healthScore, content),
    ...discoverCelebration(healthScore, content),
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
    ...discoverGitHubOverview(content),
    ...discoverConnectMore(content),
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
  const celebrationDiscovery = allDiscoveries.length > 0 && allDiscoveries[0].label === "Win of the week" ? allDiscoveries.shift()! : null;
  const priorActionsDiscovery = allDiscoveries.length > 0 && allDiscoveries[0].label === "What changed since last report" ? allDiscoveries.shift()! : null;

  allDiscoveries.sort((a, b) => (colorOrder[a.color] ?? 5) - (colorOrder[b.color] ?? 5));

  // Cap discovery count by depth
  const maxCards = reportDepth === "EXECUTIVE" ? 5 : reportDepth === "STANDARD" ? 12 : 999;

  const orderedDiscoveries: Discovery[] = [];
  if (healthDiscovery) orderedDiscoveries.push(healthDiscovery);
  if (celebrationDiscovery) orderedDiscoveries.push(celebrationDiscovery);
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
  const headlineSources = connectedSources.length;

  // ── Separate discoveries into sections ──
  const changesDisc = orderedDiscoveries.find(d => d.label === "What changed since last report");
  const celebrationDisc = orderedDiscoveries.find(d => d.label === "Win of the week");

  // All findings except health score, changes, celebration — these become the numbered insights
  const findings = orderedDiscoveries
    .filter(d => d.label !== "Engineering Health Index" && d.label !== "What changed since last report" && d.label !== "Win of the week");

  // Top 5 for the overview + detail cards, rest go to detail section
  const topFindings = findings.slice(0, 5);
  const detailDiscoveries = findings.slice(5);

  // Risk pill helper
  function riskPill(d: Discovery): string {
    const pillMap: Record<DiscoveryColor, { cls: string; text: string }> = {
      red: { cls: "high", text: "High Risk" },
      amber: { cls: "medium", text: "Medium Risk" },
      green: { cls: "low", text: "Low Risk" },
      blue: { cls: "info", text: "Info" },
      purple: { cls: "insight", text: "Insight" },
      neutral: { cls: "info", text: "Info" },
    };
    const pill = pillMap[d.color] || pillMap.neutral;
    return `<span class="risk-pill ${pill.cls}">${pill.text}</span>`;
  }

  // Helper: render a finding card's inner content (shared between hero and grid cards)
  function findingInner(d: Discovery): string {
    let html = "";
    if (d.sources.length > 0) html += `<div style="margin-bottom:8px">${sourceTags(d.sources)}</div>`;
    if (d.bigNum) {
      const isTextVal = isNaN(Number(d.bigNum.value.replace(/[,$%]/g, "")));
      html += `<div class="big-num ${d.color}${isTextVal ? " text-value" : ""}">${d.bigNum.value}</div>`;
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
      html += `<div style="margin-top:14px">`;
      for (const p of d.personRows) {
        html += `<div class="person-row"><div class="person-avatar">${esc(p.initials)}</div><div class="person-info"><div class="person-name">${p.name}</div><div class="person-detail">${p.detail}</div></div><div class="person-badge ${p.badgeColor}">${esc(p.badge)}</div></div>`;
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
    return html;
  }

  // Health strip
  function healthStripHtml(): string {
    if (!healthScore) return "";
    const score = healthScore.overall;
    const scoreColor = score >= 80 ? "var(--green)" : score >= 60 ? "var(--blue)" : score >= 40 ? "var(--amber)" : "var(--red)";
    const priorScore = content.priorReport?.keyMetrics?.healthScore as number | undefined;
    const delta = priorScore != null ? score - priorScore : null;
    const deltaText = delta != null
      ? (delta > 0 ? `<span class="delta-line" style="color:var(--green)">+${delta} vs last report</span>` : delta < 0 ? `<span class="delta-line" style="color:var(--red)">${delta} vs last report</span>` : `<span class="delta-line" style="color:var(--muted)">No change</span>`)
      : `<span class="delta-line" style="color:var(--muted)">First report</span>`;

    return `
    <div class="health-strip">
      <div class="health-score-big" style="color:${scoreColor}">${score}</div>
      <div class="health-meta">
        <div class="grade-line">Grade ${healthScore.grade} · Health Index</div>
        ${deltaText}
      </div>
      <div class="health-dims">
        ${healthScore.dimensions.map(d => {
          const c = d.score >= 80 ? "var(--green)" : d.score >= 60 ? "var(--blue)" : d.score >= 40 ? "var(--amber)" : "var(--red)";
          return `<div class="health-dim"><span class="dim-score" style="color:${c}">${d.score}</span> ${esc(d.label)}</div>`;
        }).join("")}
      </div>
    </div>`;
  }

  // ROI context per discovery
  function roiHint(d: Discovery): string {
    if (d.color === "red") return "Fix this first";
    if (d.color === "amber") return "Costing you hours every week";
    if (d.color === "green") return "Working well, keep it up";
    if (d.color === "purple") return "Opportunity to level up";
    return "Worth knowing";
  }

  // TLDR builder
  function buildTldr(): string {
    const redCount = topFindings.filter(d => d.color === "red").length;
    const amberCount = topFindings.filter(d => d.color === "amber").length;
    const actionCount = content.actionItems?.length || 0;

    if (redCount > 0) {
      return `We found <strong>${redCount} ${redCount === 1 ? "thing" : "things"} that could hurt your business</strong>${amberCount > 0 ? ` and ${amberCount} ${amberCount === 1 ? "area" : "areas"} to tighten up` : ""}. ` +
        `The good news: the most important fixes are quick. <strong>${actionCount} action items</strong> below. ` +
        `We'll handle the technical ones together on your next call.`;
    } else if (amberCount > 0) {
      return `Your product is shipping, but we spotted <strong>${amberCount} ${amberCount === 1 ? "gap" : "gaps"}</strong> that will matter more as you grow. ` +
        `<strong>${actionCount} recommendations</strong> below, ordered by business impact.`;
    }
    return `<strong>${topFindings.length} findings</strong> and <strong>${actionCount} recommendations</strong> from this period. Things are moving, and here's how to keep the momentum.`;
  }

  // Agenda builder
  function buildAgendaItems(): { text: string; detail: string }[] {
    const items: { text: string; detail: string }[] = [];
    const redFindings = topFindings.filter(d => d.color === "red");
    const amberFindings = topFindings.filter(d => d.color === "amber");
    const purpleFindings = topFindings.filter(d => d.color === "purple");
    const actionItems = content.actionItems || [];
    const p1Actions = actionItems.filter((a: any) => a.priority === "P1");

    if (redFindings.length > 0) {
      items.push({
        text: `Address ${redFindings.length} critical ${redFindings.length === 1 ? "risk" : "risks"}`,
        detail: redFindings.map((d: Discovery) => d.headline.replace(/<[^>]+>/g, "").slice(0, 120)).join("; "),
      });
    }
    if (p1Actions.length > 0) {
      items.push({
        text: `Implement P1 action items together`,
        detail: p1Actions.map((a: any) => a.title).join(", "),
      });
    }
    if (amberFindings.length > 0) {
      items.push({
        text: `Review process improvements`,
        detail: amberFindings.map((d: Discovery) => d.label).join(", "),
      });
    }
    if (purpleFindings.length > 0) {
      items.push({
        text: `Connect additional data sources for deeper insights`,
        detail: "5 min per integration, unlocks cross-source analysis",
      });
    }
    if (items.length === 0) {
      items.push({ text: "Review findings and plan next steps", detail: "30-minute strategy session" });
    }
    return items.slice(0, 4);
  }

  // Overview: numbered 1-5 summary
  function overviewHtml(): string {
    if (topFindings.length === 0) return "";
    return `
    <div class="overview">
      <div class="overview-title">Your ${topFindings.length} Key Findings</div>
      <div class="overview-list">
        ${topFindings.map((d, i) => `
        <div class="overview-item">
          <div class="overview-num ${d.color}">${i + 1}</div>
          <div class="overview-content">
            <div class="overview-headline">${d.headline.replace(/<[^>]+>/g, "").slice(0, 140)}</div>
            <div class="overview-sub">${roiHint(d)}${d.sources.length > 0 ? ` · ${d.sources.map(s => (SOURCE_META[s]?.label || s)).join(", ")}` : ""}</div>
          </div>
          <div class="overview-pill">${riskPill(d)}</div>
        </div>`).join("")}
      </div>
    </div>`;
  }

  // ── Build HTML ──
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} | NexFlow</title>
<style>${CSS}</style>
</head>
<body>

${showDownloadBar ? `<div class="download-bar">
  Report Preview · ${esc(orgName)}
  <button onclick="window.print()">Download PDF</button>
</div>` : ""}

<div class="page">

  <div class="header">
    <div class="header-top">
      <div><span class="brand">NexFlow</span><span class="tag">Brief #${reportNumber}</span></div>
      <div class="period">${esc(periodLabel)}</div>
    </div>
    <div class="header-company">${esc(orgName)}</div>
    <div class="header-subtitle">Your engineering consulting brief · <strong>${headlineSources} source${headlineSources !== 1 ? "s" : ""}</strong> analyzed</div>
    <div class="sources">
      ${connectedSources.map((s) => `<div class="source-pill active">${sourceMap[s] || s}</div>`).join("")}
    </div>
  </div>

  ${healthStripHtml()}

  ${weekStats.length > 0 ? `
  <div class="week-bar">
    ${weekStats.map((s) => `
    <div class="week-stat">
      <div class="val">${s.value}</div>
      <div class="label">${esc(s.label)}</div>
      <div class="delta ${s.direction}">${s.delta}</div>
    </div>`).join("")}
  </div>` : ""}

  <div class="tldr">
    <div class="tldr-label">The bottom line</div>
    <div class="tldr-text">${buildTldr()}</div>
  </div>

  ${overviewHtml()}

  <div class="sep"></div>

  ${topFindings.length > 0 ? `
  <div class="findings">
    <div class="findings-title">What We Found</div>

    ${topFindings[0] ? `
    <div class="finding-hero ${topFindings[0].color}">
      <div class="finding-badge">
        <div class="finding-num ${topFindings[0].color}">1</div>
        ${riskPill(topFindings[0])}
        <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:inherit;opacity:0.7">${esc(topFindings[0].label)}</span>
      </div>
      ${findingInner(topFindings[0])}
    </div>` : ""}

    ${topFindings.length > 1 ? `
    <div class="finding-grid">
      ${topFindings.slice(1).map((d, i) => {
        const needsFull = (d.dataGrid && d.dataGrid.length > 0) || (d.personRows && d.personRows.length > 0) || (d.bigNum);
        return `
        <div class="finding-card ${d.color}${needsFull ? " finding-full" : ""}">
          <div class="finding-badge">
            <div class="finding-num ${d.color}">${i + 2}</div>
            ${riskPill(d)}
            <span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;opacity:0.6">${esc(d.label)}</span>
          </div>
          ${findingInner(d)}
        </div>`;
      }).join("")}
    </div>` : ""}
  </div>` : ""}

  ${celebrationDisc ? `
  <div style="padding: 0 44px 16px;">
    <div class="finding-card green" style="border-left: 4px solid var(--green);">
      <div class="finding-badge">
        <span class="risk-pill win">Win</span>
        <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--green)">${esc(celebrationDisc.label)}</span>
      </div>
      <div class="disc-headline">${celebrationDisc.headline}</div>
      <div class="disc-body">${celebrationDisc.body}</div>
    </div>
  </div>` : ""}

  ${changesDisc ? `
  <div class="section-sep"><div class="section-sep-line"></div><div class="section-sep-label">What Changed</div></div>
  <div style="padding: 16px 44px;">
    ${renderDiscovery(changesDisc, 0)}
  </div>` : ""}

  ${content.actionItems?.length > 0 ? `
  <div class="sep"></div>
  <div class="actions-section">
    <div class="actions-title">Your Action Plan</div>
    <div class="actions-sub">Do the top ones this week. We'll check progress on our next call.</div>
    ${renderActionItems(content.actionItems)}
  </div>` : ""}

  <div class="sep"></div>
  <div class="agenda-section">
    <div class="agenda-card">
      <div class="agenda-title">Next Consulting Call Agenda</div>
      <div class="agenda-sub">Here's what we'll cover together. Book your slot below.</div>
      ${buildAgendaItems().map((item, i) => `
      <div class="agenda-item">
        <div class="agenda-num">${i + 1}</div>
        <div>
          <div class="agenda-text">${item.text}</div>
          <div class="agenda-detail">${item.detail}</div>
        </div>
      </div>`).join("")}
    </div>
  </div>

  <div class="cta-banner">
    <h3>Let's fix these together</h3>
    <p>Book a 30-minute call with your NexFlow advisor. We'll implement the P1 actions live and plan the rest.</p>
    <a href="${meetingLink || "https://calendly.com/arjundixit3508/30min"}" class="cta-btn">Book Your Call</a>
  </div>

  <div class="footer">
    <div class="footer-brand">NexFlow</div>
    <div class="footer-text">Confidential consulting brief · Prepared for ${esc(orgName)} · ${esc(genDate)}</div>
  </div>

</div>
</body>
</html>`;
}
