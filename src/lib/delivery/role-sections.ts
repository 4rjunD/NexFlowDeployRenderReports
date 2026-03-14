// ─────────────────────────────────────────────────────────────
// NexFlow — Role-Based Report Section Filtering
// Maps recipient roles to the report depth they receive.
// EXECUTIVE = health score + top 3 discoveries + action items
// STANDARD  = everything except contributor-level detail
// FULL      = complete report with all discoveries
// ─────────────────────────────────────────────────────────────

export type ReportDepth = "EXECUTIVE" | "STANDARD" | "FULL";

// Discovery labels that are always included regardless of depth
const ALWAYS_INCLUDE = [
  "Engineering Health Index",
  "What changed since last report",
];

// Discovery labels excluded from EXECUTIVE view (too detailed for C-suite)
const EXECUTIVE_EXCLUDE = [
  "Code Churn Analysis",
  "Communication Patterns",
  "Contributor Highlights",
  "Thread Response Time",
  "Benchmarks",
  "Progression Tracking",
  "Deliverable Progress",
  "Trend Signals",
];

// Discovery labels excluded from STANDARD view
const STANDARD_EXCLUDE = [
  "Communication Patterns",
  "Benchmarks",
  "Progression Tracking",
];

// Role → default depth mapping
export const ROLE_DEPTH_MAP: Record<string, ReportDepth> = {
  CTO: "EXECUTIVE",
  VP_ENG: "EXECUTIVE",
  ENG_DIRECTOR: "STANDARD",
  ENGINEERING_MANAGER: "STANDARD",
  TEAM_LEAD: "FULL",
  IC: "FULL",
  STAKEHOLDER: "EXECUTIVE",
};

/**
 * Filters discovery cards based on report depth.
 * Returns indices of discoveries to keep.
 */
export function filterDiscoveriesByDepth(
  discoveries: { label: string; color?: string }[],
  depth: ReportDepth
): number[] {
  if (depth === "FULL") {
    return discoveries.map((_, i) => i);
  }

  const excludeSet = depth === "EXECUTIVE" ? EXECUTIVE_EXCLUDE : STANDARD_EXCLUDE;

  return discoveries
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => {
      if (ALWAYS_INCLUDE.includes(d.label)) return true;
      if (excludeSet.includes(d.label)) return false;
      return true;
    })
    .map(({ i }) => i);
}

/**
 * Returns max discovery count for a given depth.
 * EXECUTIVE: 5 cards max (health + top 4 issues)
 * STANDARD: 12 cards max
 * FULL: unlimited
 */
export function maxDiscoveriesForDepth(depth: ReportDepth): number {
  switch (depth) {
    case "EXECUTIVE": return 5;
    case "STANDARD": return 12;
    case "FULL": return 999;
  }
}

/**
 * Get the email subject line prefix based on role.
 */
export function subjectForRole(role: string, reportTitle: string): string {
  switch (role) {
    case "CTO":
    case "VP_ENG":
    case "STAKEHOLDER":
      return `Executive Summary: ${reportTitle}`;
    case "ENG_DIRECTOR":
    case "ENGINEERING_MANAGER":
      return `Engineering Report: ${reportTitle}`;
    default:
      return `${reportTitle} — NexFlow Report`;
  }
}

/**
 * Get a brief role-specific intro line for the email body.
 */
export function introForRole(role: string, orgName: string): string {
  switch (role) {
    case "CTO":
    case "VP_ENG":
      return `Here's your executive overview of ${orgName}'s engineering health this week.`;
    case "ENG_DIRECTOR":
    case "ENGINEERING_MANAGER":
      return `Here's your engineering team report for ${orgName} — key metrics, risks, and recommended actions.`;
    case "TEAM_LEAD":
      return `Your weekly engineering report for ${orgName} is ready with detailed metrics and team insights.`;
    case "STAKEHOLDER":
      return `Here's the latest engineering health summary for ${orgName}.`;
    default:
      return `Your full engineering report for ${orgName} is ready.`;
  }
}
