import type { RecurringItem } from "./types";
import { addDays, addMonthsClamped, daysInMonth, makeDate, parts } from "./dates";

/** Days of the month for a twice-a-month item, earliest first. 31 means the month's last day. */
export function twiceMonthlyDays(item: Pick<RecurringItem, "startDate" | "secondDay">): [number, number] {
  const first = parts(item.startDate).d;
  const second = item.secondDay ?? (first <= 15 ? Math.min(first + 15, 31) : first - 15);
  return first <= second ? [first, second] : [second, first];
}

/** The occurrence after `date`. Monthly and yearly items keep the start date's day of month. */
export function nextOccurrence(item: RecurringItem, date: string): string {
  const startDay = parts(item.startDate).d;
  switch (item.frequency) {
    case "weekly":
      return addDays(date, 7);
    case "biweekly":
      return addDays(date, 14);
    case "monthly":
      return addMonthsClamped(date, 1, startDay);
    case "yearly":
      return addMonthsClamped(date, 12, startDay);
    case "twiceMonthly": {
      const [a, b] = twiceMonthlyDays(item);
      const { y, m, d } = parts(date);
      const last = daysInMonth(y, m);
      const bThis = Math.min(b, last);
      if (d < Math.min(a, last)) return makeDate(y, m, Math.min(a, last));
      if (d < bThis) return makeDate(y, m, bThis);
      const nextMonth = addMonthsClamped(makeDate(y, m, 1), 1, 1);
      const np = parts(nextMonth);
      return makeDate(np.y, np.m, Math.min(a, daysInMonth(np.y, np.m)));
    }
  }
}

export function isActive(item: RecurringItem): boolean {
  return !item.pausedAt;
}

export function hasEnded(item: RecurringItem, due = item.nextDueDate): boolean {
  return !!item.endDate && due > item.endDate;
}

/** Due dates on or before `through`, starting from the item's next due date. */
export function dueDates(item: RecurringItem, through: string, limit = 500): string[] {
  const out: string[] = [];
  let d = item.nextDueDate;
  while (d <= through && !hasEnded(item, d) && out.length < limit) {
    out.push(d);
    d = nextOccurrence(item, d);
  }
  return out;
}

export const FREQUENCY_LABELS: Record<RecurringItem["frequency"], string> = {
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  twiceMonthly: "Twice a month",
  monthly: "Monthly",
  yearly: "Yearly",
};
