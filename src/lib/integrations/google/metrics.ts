import { fetchCalendarEvents } from "./client";
import type { GoogleCalendarEvent } from "./client";

export interface GoogleCalendarMetrics {
  meetings: {
    total: number;
    totalHours: number;
    avgPerWeek: number;
    hoursPerWeek: Record<string, number>;
    byDay: Record<string, number>;
  };
  focusTime: {
    avgFocusBlocksPerDay: number;
    avgFocusHoursPerDay: number;
    longestFocusBlockHours: number;
  };
  frequency: {
    oneOnOnes: number;
    groupMeetings: number;
    allDayEvents: number;
    recurring: number;
  };
  meetingCostEstimate: number;
  recurringMeetingPct: number;
  peakMeetingDay: string;
  externalMeetingPct: number;
  period: { since: string; until: string };
}

function getEventDurationHours(event: GoogleCalendarEvent): number {
  const start = event.start.dateTime ? new Date(event.start.dateTime) : null;
  const end = event.end.dateTime ? new Date(event.end.dateTime) : null;

  if (!start || !end) return 0; // all-day events

  return (end.getTime() - start.getTime()) / (1000 * 60 * 60);
}

function getWeekKey(date: Date): string {
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const weekNumber = Math.ceil(
    ((date.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24) + startOfYear.getDay() + 1) / 7
  );
  return `${date.getFullYear()}-W${String(weekNumber).padStart(2, "0")}`;
}

function getDayKey(date: Date): string {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()];
}

export async function collectGoogleCalendarMetrics(
  accessToken: string,
  since: string
): Promise<GoogleCalendarMetrics> {
  const now = new Date().toISOString();
  const events = await fetchCalendarEvents(accessToken, since, now);

  // Filter to accepted/confirmed events only
  const relevantEvents = events.filter(
    (e) => e.status !== "cancelled"
  );

  // Separate timed events from all-day events
  const timedEvents = relevantEvents.filter((e) => e.start.dateTime);
  const allDayEvents = relevantEvents.filter((e) => e.start.date && !e.start.dateTime);

  // Total meeting hours
  let totalHours = 0;
  const hoursPerWeek: Record<string, number> = {};
  const byDay: Record<string, number> = {};

  for (const event of timedEvents) {
    const duration = getEventDurationHours(event);
    totalHours += duration;

    const date = new Date(event.start.dateTime!);
    const week = getWeekKey(date);
    hoursPerWeek[week] = (hoursPerWeek[week] || 0) + duration;

    const day = getDayKey(date);
    byDay[day] = (byDay[day] || 0) + 1;
  }

  // Weeks in period
  const sinceDate = new Date(since);
  const nowDate = new Date();
  const weeksInPeriod = Math.max(
    1,
    (nowDate.getTime() - sinceDate.getTime()) / (1000 * 60 * 60 * 24 * 7)
  );

  // Focus time calculation
  // Group events by date, find gaps between meetings during work hours (9am-6pm)
  const eventsByDate: Record<string, { start: Date; end: Date }[]> = {};

  for (const event of timedEvents) {
    const start = new Date(event.start.dateTime!);
    const dateKey = start.toISOString().split("T")[0];
    const end = new Date(event.end.dateTime!);

    if (!eventsByDate[dateKey]) eventsByDate[dateKey] = [];
    eventsByDate[dateKey].push({ start, end });
  }

  let totalFocusBlocks = 0;
  let totalFocusHours = 0;
  let longestFocusBlock = 0;
  const workDays = Object.keys(eventsByDate).length || 1;

  for (const [dateStr, dayEvents] of Object.entries(eventsByDate)) {
    // Sort by start time
    dayEvents.sort((a, b) => a.start.getTime() - b.start.getTime());

    const workStart = new Date(dateStr + "T09:00:00");
    const workEnd = new Date(dateStr + "T18:00:00");

    // Find gaps
    let cursor = workStart;
    for (const evt of dayEvents) {
      if (evt.start > cursor && evt.start <= workEnd) {
        const gapHours = (evt.start.getTime() - cursor.getTime()) / (1000 * 60 * 60);
        if (gapHours >= 0.5) {
          // Count blocks >= 30 min as focus time
          totalFocusBlocks++;
          totalFocusHours += gapHours;
          if (gapHours > longestFocusBlock) longestFocusBlock = gapHours;
        }
      }
      if (evt.end > cursor) cursor = evt.end;
    }
    // Gap after last meeting to end of work day
    if (cursor < workEnd) {
      const gapHours = (workEnd.getTime() - cursor.getTime()) / (1000 * 60 * 60);
      if (gapHours >= 0.5) {
        totalFocusBlocks++;
        totalFocusHours += gapHours;
        if (gapHours > longestFocusBlock) longestFocusBlock = gapHours;
      }
    }
  }

  // Meeting frequency categories
  const oneOnOnes = timedEvents.filter(
    (e) => e.attendees && e.attendees.length === 2
  ).length;

  const groupMeetings = timedEvents.filter(
    (e) => e.attendees && e.attendees.length > 2
  ).length;

  const recurring = timedEvents.filter((e) => e.recurringEventId).length;

  // Meeting cost estimate at $150/hr default rate
  const roundedTotalHours = Math.round(totalHours * 10) / 10;
  const meetingCostEstimate = Math.round(roundedTotalHours * 150);

  // Recurring meeting percentage
  const recurringMeetingPct = timedEvents.length > 0
    ? Math.round((recurring / timedEvents.length) * 100)
    : 0;

  // Peak meeting day — day of week with most meeting hours
  // byDay currently stores meeting counts; compute hours by day for peak detection
  const hoursByDay: Record<string, number> = {};
  for (const event of timedEvents) {
    const duration = getEventDurationHours(event);
    const date = new Date(event.start.dateTime!);
    const day = getDayKey(date);
    hoursByDay[day] = (hoursByDay[day] || 0) + duration;
  }
  let peakMeetingDay = "";
  let peakHours = 0;
  for (const [day, hours] of Object.entries(hoursByDay)) {
    if (hours > peakHours) {
      peakHours = hours;
      peakMeetingDay = day;
    }
  }

  // External meeting percentage — meetings with attendees from different domains
  // Determine owner domain from organizer or self-attendee
  let ownerDomain = "";
  for (const event of timedEvents) {
    if (event.organizer?.self && event.organizer.email) {
      ownerDomain = event.organizer.email.split("@")[1] || "";
      break;
    }
    if (event.attendees) {
      const selfAttendee = event.attendees.find((a) => a.self);
      if (selfAttendee) {
        ownerDomain = selfAttendee.email.split("@")[1] || "";
        break;
      }
    }
  }

  let externalMeetingCount = 0;
  if (ownerDomain) {
    for (const event of timedEvents) {
      if (event.attendees && event.attendees.length > 0) {
        const hasExternal = event.attendees.some(
          (a) => !a.self && a.email && a.email.split("@")[1] !== ownerDomain
        );
        if (hasExternal) externalMeetingCount++;
      }
    }
  }
  const externalMeetingPct = timedEvents.length > 0 && ownerDomain
    ? Math.round((externalMeetingCount / timedEvents.length) * 100)
    : 0;

  return {
    meetings: {
      total: timedEvents.length,
      totalHours: roundedTotalHours,
      avgPerWeek: Math.round((timedEvents.length / weeksInPeriod) * 10) / 10,
      hoursPerWeek,
      byDay,
    },
    focusTime: {
      avgFocusBlocksPerDay: Math.round((totalFocusBlocks / workDays) * 10) / 10,
      avgFocusHoursPerDay: Math.round((totalFocusHours / workDays) * 10) / 10,
      longestFocusBlockHours: Math.round(longestFocusBlock * 10) / 10,
    },
    frequency: {
      oneOnOnes,
      groupMeetings,
      allDayEvents: allDayEvents.length,
      recurring,
    },
    meetingCostEstimate,
    recurringMeetingPct,
    peakMeetingDay,
    externalMeetingPct,
    period: { since, until: now },
  };
}
