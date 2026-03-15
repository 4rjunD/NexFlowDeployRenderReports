// ─────────────────────────────────────────────────────────────
// NexFlow Engineering Health Score — Consistent scoring system
// ─────────────────────────────────────────────────────────────
//
// Scores 0–100 across 5 dimensions, weighted:
//   Delivery Velocity (25%) — PRs merged, commits, merge time
//   Code Quality (20%)      — Review coverage, turnaround, review balance
//   Sprint Execution (20%)  — Issue completion rate, cycle throughput
//   Team Capacity (20%)     — Focus time vs meeting load, balance
//   Communication (15%)     — Slack activity, channel engagement
//
// Scoring is lenient with sparse data — even 1-2 connected sources
// should produce a useful, encouraging baseline score.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D = Record<string, any>;

function n(val: unknown): number {
  if (typeof val === "number") return val;
  if (typeof val === "string") return parseFloat(val) || 0;
  return 0;
}

function clamp(v: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, v));
}

interface DimensionScore {
  label: string;
  score: number;    // 0-100
  weight: number;
  color: string;
  summary: string;  // one-line description of what drove the score
}

export interface HealthScore {
  overall: number;         // 0-100, weighted average
  grade: string;           // A+, A, B+, B, C+, C, D, F
  gradeColor: string;      // hex color for the grade
  dimensions: DimensionScore[];
  isFirstReport: boolean;
}

function scoreDeliveryVelocity(gh: D | null): DimensionScore {
  if (!gh) return { label: "Delivery Velocity", score: 60, weight: 0.25, color: "#3b82f6", summary: "Connect GitHub for delivery insights" };

  const pr = gh.pullRequests || {};
  const merged = n(pr.merged);
  const opened = n(pr.opened);
  const mergeRate = opened > 0 ? merged / opened : 0;
  const mergeTime = n(pr.avgMergeTimeHours);
  const commits = n(gh.commits?.total);

  let score = 50; // baseline

  // Merge rate: >80% is great, <40% is concerning
  score += mergeRate > 0.8 ? 15 : mergeRate > 0.6 ? 8 : mergeRate > 0.4 ? 0 : -10;

  // Merge time: <24h excellent, <48h good, <96h okay, >96h bad
  if (mergeTime > 0) {
    score += mergeTime < 24 ? 15 : mergeTime < 48 ? 8 : mergeTime < 96 ? 0 : -15;
  }

  // Volume: having PRs and commits is positive signal
  score += merged > 20 ? 10 : merged > 10 ? 6 : merged > 5 ? 3 : 0;
  score += commits > 50 ? 10 : commits > 20 ? 5 : 0;

  const summary = merged > 0
    ? `${merged} PRs merged, ${mergeTime > 0 ? `${mergeTime < 24 ? '<24h' : mergeTime < 48 ? '<48h' : `${Math.round(mergeTime)}h`} avg merge time` : 'merge time unknown'}`
    : "Low PR activity detected";

  return { label: "Delivery Velocity", score: clamp(score), weight: 0.25, color: "#3b82f6", summary };
}

function scoreCodeQuality(gh: D | null): DimensionScore {
  if (!gh) return { label: "Code Quality", score: 60, weight: 0.20, color: "#8b5cf6", summary: "Connect GitHub for review insights" };

  const reviews = gh.reviews || {};
  const totalReviews = n(reviews.total);
  const turnaround = n(reviews.avgTurnaroundTimeHours);
  const byReviewer = reviews.byReviewer || {};
  const reviewerCount = Object.keys(byReviewer).length;

  let score = 50;

  // Review coverage: having reviews is essential
  score += totalReviews > 30 ? 15 : totalReviews > 15 ? 8 : totalReviews > 5 ? 3 : -10;

  // Turnaround: <12h great, <24h good, <48h okay, >48h bad
  if (turnaround > 0) {
    score += turnaround < 12 ? 15 : turnaround < 24 ? 8 : turnaround < 48 ? 0 : -10;
  }

  // Review distribution: >3 reviewers = balanced, 1 = bottleneck
  score += reviewerCount >= 4 ? 10 : reviewerCount >= 2 ? 5 : reviewerCount === 1 ? -5 : 0;

  // Comments signal engagement
  score += n(reviews.comments) > 20 ? 5 : 0;

  const summary = totalReviews > 0
    ? `${totalReviews} reviews by ${reviewerCount} reviewer${reviewerCount !== 1 ? 's' : ''}, ${turnaround > 0 ? `${Math.round(turnaround)}h avg turnaround` : ''}`
    : "Review process needs attention";

  return { label: "Code Quality", score: clamp(score), weight: 0.20, color: "#8b5cf6", summary };
}

function scoreSprintExecution(ln: D | null): DimensionScore {
  if (!ln) return { label: "Sprint Execution", score: 60, weight: 0.20, color: "#f59e0b", summary: "Connect Jira or Linear for sprint insights" };

  const issues = ln.issues || {};
  const total = n(issues.total);
  const completed = n(issues.completed || issues.done);
  const completionRate = total > 0 ? completed / total : 0;

  let score = 50;

  // Completion rate
  score += completionRate > 0.8 ? 20 : completionRate > 0.6 ? 10 : completionRate > 0.4 ? 0 : -15;

  // Volume
  score += total > 30 ? 10 : total > 15 ? 5 : 0;
  score += completed > 20 ? 10 : completed > 10 ? 5 : 0;

  const pct = Math.round(completionRate * 100);
  const summary = total > 0
    ? `${pct}% completion rate (${completed}/${total} issues)`
    : "No issue data available";

  return { label: "Sprint Execution", score: clamp(score), weight: 0.20, color: "#f59e0b", summary };
}

function scoreTeamCapacity(cal: D | null): DimensionScore {
  if (!cal) return { label: "Team Capacity", score: 55, weight: 0.20, color: "#10b981", summary: "No calendar data connected" };

  const meetings = cal.meetings || {};
  const focusTime = cal.focusTime || {};
  const totalMeetingHours = n(meetings.totalHours);
  const avgFocus = n(typeof focusTime === "number" ? focusTime : focusTime.avgFocusHoursPerDay);

  let score = 55;

  // Focus time: >5h/day great, >3h good, <2h bad
  if (avgFocus > 0) {
    score += avgFocus > 5 ? 15 : avgFocus > 3.5 ? 8 : avgFocus > 2 ? 0 : -15;
  }

  // Meeting load: <20h/week good, 20-30 okay, >30 too much
  if (totalMeetingHours > 0) {
    const weeklyMeetings = totalMeetingHours / 13; // ~13 weeks in 90 days
    score += weeklyMeetings < 15 ? 15 : weeklyMeetings < 25 ? 5 : weeklyMeetings < 35 ? -5 : -15;
  }

  const summary = avgFocus > 0
    ? `${avgFocus.toFixed(1)}h/day focus time, ${totalMeetingHours > 0 ? `${Math.round(totalMeetingHours)}h total meetings` : ''}`
    : "Calendar data limited";

  return { label: "Team Capacity", score: clamp(score), weight: 0.20, color: "#10b981", summary };
}

function scoreCommunication(sl: D | null): DimensionScore {
  if (!sl) return { label: "Communication", score: 55, weight: 0.15, color: "#ec4899", summary: "No Slack data connected" };

  const totalMessages = n(sl.totalMessages);
  const activeChannels = n(sl.activeChannels);
  const totalChannels = n(sl.totalChannels);
  const topContributors = sl.topContributors || [];

  let score = 55;

  // Activity level
  score += totalMessages > 1000 ? 10 : totalMessages > 500 ? 5 : totalMessages > 100 ? 0 : -5;

  // Channel engagement ratio
  const channelRatio = totalChannels > 0 ? activeChannels / totalChannels : 0;
  score += channelRatio > 0.6 ? 10 : channelRatio > 0.3 ? 5 : -5;

  // Contributor spread: more people contributing = healthier
  score += topContributors.length >= 8 ? 10 : topContributors.length >= 5 ? 5 : 0;

  // Check for over-concentration (top person > 40% of messages)
  if (topContributors.length > 0 && totalMessages > 0) {
    const topPct = topContributors[0].messageCount / totalMessages;
    if (topPct > 0.4) score -= 5;
  }

  const summary = totalMessages > 0
    ? `${totalMessages.toLocaleString()} messages across ${activeChannels} active channels`
    : "Low communication activity";

  return { label: "Communication", score: clamp(score), weight: 0.15, color: "#ec4899", summary };
}

function gradeFromScore(score: number): { grade: string; color: string } {
  if (score >= 92) return { grade: "A+", color: "#059669" };
  if (score >= 85) return { grade: "A", color: "#10b981" };
  if (score >= 78) return { grade: "B+", color: "#34d399" };
  if (score >= 70) return { grade: "B", color: "#fbbf24" };
  if (score >= 62) return { grade: "C+", color: "#f59e0b" };
  if (score >= 55) return { grade: "C", color: "#f97316" };
  if (score >= 45) return { grade: "D", color: "#ef4444" };
  return { grade: "F", color: "#dc2626" };
}

// Compute adaptive weights based on which sources are actually connected
function computeAdaptiveWeights(
  gh: D | null, issueSource: D | null, cal: D | null, sl: D | null
): { delivery: number; quality: number; execution: number; capacity: number; communication: number } {
  const hasGh = !!gh;
  const hasIssues = !!issueSource;
  const hasCal = !!cal;
  const hasSl = !!sl;

  const connected = [hasGh, hasIssues, hasCal, hasSl].filter(Boolean).length;

  // Default balanced weights
  if (connected >= 3) {
    return { delivery: 0.25, quality: 0.20, execution: 0.20, capacity: 0.20, communication: 0.15 };
  }

  // Adaptive: redistribute missing dimension weights to connected ones
  if (hasGh && !hasIssues && !hasCal && !hasSl) {
    // GitHub only — delivery + quality + communication from GH
    return { delivery: 0.40, quality: 0.40, execution: 0, capacity: 0, communication: 0.20 };
  }
  if (!hasGh && hasIssues && !hasCal && !hasSl) {
    // Jira/Linear only — execution-heavy
    return { delivery: 0, quality: 0, execution: 0.70, capacity: 0, communication: 0.30 };
  }
  if (!hasGh && !hasIssues && hasCal && !hasSl) {
    // Calendar only
    return { delivery: 0, quality: 0, execution: 0, capacity: 1.0, communication: 0 };
  }
  if (!hasGh && !hasIssues && !hasCal && hasSl) {
    // Slack only
    return { delivery: 0, quality: 0, execution: 0, capacity: 0, communication: 1.0 };
  }

  // Two sources
  if (hasGh && hasIssues) {
    return { delivery: 0.30, quality: 0.25, execution: 0.30, capacity: 0, communication: 0.15 };
  }
  if (hasGh && hasCal) {
    return { delivery: 0.35, quality: 0.35, execution: 0, capacity: 0.30, communication: 0 };
  }
  if (hasGh && hasSl) {
    return { delivery: 0.35, quality: 0.30, execution: 0, capacity: 0, communication: 0.35 };
  }
  if (hasIssues && hasSl) {
    return { delivery: 0, quality: 0, execution: 0.50, capacity: 0, communication: 0.50 };
  }
  if (hasIssues && hasCal) {
    return { delivery: 0, quality: 0, execution: 0.55, capacity: 0.45, communication: 0 };
  }
  if (hasCal && hasSl) {
    return { delivery: 0, quality: 0, execution: 0, capacity: 0.55, communication: 0.45 };
  }

  // Fallback: equal weights for whatever is connected
  return { delivery: 0.25, quality: 0.20, execution: 0.20, capacity: 0.20, communication: 0.15 };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function computeHealthScore(integrationData: Record<string, any>, isFirstReport: boolean): HealthScore {
  const gh = integrationData.github || null;
  const jr = integrationData.jira || null;
  const ln = integrationData.linear || null;
  const cal = integrationData.googleCalendar || null;
  const sl = integrationData.slack || null;

  // Use Jira if available, fall back to Linear
  const issueSource = jr || ln;

  const weights = computeAdaptiveWeights(gh, issueSource, cal, sl);

  const dimensions = [
    { ...scoreDeliveryVelocity(gh), weight: weights.delivery },
    { ...scoreCodeQuality(gh), weight: weights.quality },
    { ...scoreSprintExecution(issueSource), weight: weights.execution },
    { ...scoreTeamCapacity(cal), weight: weights.capacity },
    { ...scoreCommunication(sl), weight: weights.communication },
  ].filter(d => d.weight > 0); // Only include dimensions with weight

  // Weighted average
  const rawScore = dimensions.reduce((sum, d) => sum + d.score * d.weight, 0);

  const overall = Math.round(clamp(rawScore));
  const { grade, color } = gradeFromScore(overall);

  return {
    overall,
    grade,
    gradeColor: color,
    dimensions,
    isFirstReport,
  };
}
