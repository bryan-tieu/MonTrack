import { addDays, daysBetween, monthEnd, monthStart, addMonthsClamped } from "./dates";

// Pay periods are 14 days starting on payday. Each anchor starts a schedule that runs until the
// next anchor; the period running into a newer anchor is cut short so earlier periods never move.

export type Period = { start: string; end: string };

const LENGTH = 14;

function sortedAnchors(anchors: string[]): string[] {
  return [...anchors].sort();
}

export function periodFor(date: string, anchors: string[]): Period {
  const list = sortedAnchors(anchors);
  if (list.length === 0) throw new Error("No pay schedule set");
  let i = 0;
  for (let k = 0; k < list.length; k++) if (list[k] <= date) i = k;
  const anchor = list[i];
  const next = list[i + 1];
  const offset = Math.floor(daysBetween(anchor, date) / LENGTH) * LENGTH;
  const start = addDays(anchor, offset);
  let end = addDays(start, LENGTH - 1);
  if (next && end >= next) end = addDays(next, -1);
  // Before the first anchor, extend the schedule backward, still clipped to the first anchor.
  return { start, end };
}

export function nextPeriod(p: Period, anchors: string[]): Period {
  return periodFor(addDays(p.end, 1), anchors);
}

export function previousPeriod(p: Period, anchors: string[]): Period {
  return periodFor(addDays(p.start, -1), anchors);
}

/** The `count` periods ending with `p`, oldest first. */
export function periodsEndingWith(p: Period, count: number, anchors: string[]): Period[] {
  const out = [p];
  while (out.length < count) out.unshift(previousPeriod(out[0], anchors));
  return out;
}

/** Number of period starts from `from`'s period through `targetDate` (at least 1). */
export function periodsUntil(from: Period, targetDate: string, anchors: string[]): number {
  let n = 1;
  let p = from;
  while (p.end < targetDate && n < 1000) {
    p = nextPeriod(p, anchors);
    n++;
  }
  return n;
}

export function monthFor(date: string): Period {
  return { start: monthStart(date), end: monthEnd(date) };
}

export function shiftMonth(p: Period, months: number): Period {
  return monthFor(addMonthsClamped(p.start, months, 1));
}

export function contains(p: Period, date: string): boolean {
  return date >= p.start && date <= p.end;
}
