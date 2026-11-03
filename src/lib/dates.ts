// Dates are local calendar days stored as "YYYY-MM-DD". Arithmetic goes through UTC day numbers
// so daylight saving changes never shift a date.

const DAY_MS = 86_400_000;

export function toDayNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function fromDayNumber(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return fromDayNumber(toDayNumber(date) + days);
}

export function daysBetween(from: string, to: string): number {
  return toDayNumber(to) - toDayNumber(from);
}

export function today(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isValidDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  return fromDayNumber(toDayNumber(date)) === date;
}

export function parts(date: string): { y: number; m: number; d: number } {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d };
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function makeDate(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Same day-of-month `months` later, clamped to the last day of a shorter month. */
export function addMonthsClamped(date: string, months: number, dayOfMonth?: number): string {
  const { y, m, d } = parts(date);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return makeDate(ny, nm, Math.min(dayOfMonth ?? d, daysInMonth(ny, nm)));
}

export function monthStart(date: string): string {
  const { y, m } = parts(date);
  return makeDate(y, m, 1);
}

export function monthEnd(date: string): string {
  const { y, m } = parts(date);
  return makeDate(y, m, daysInMonth(y, m));
}

const UTC = { timeZone: "UTC" } as const;
const asUtc = (date: string) => new Date(toDayNumber(date) * DAY_MS);

/** "Oct 30" */
export function shortDate(date: string): string {
  return asUtc(date).toLocaleDateString("en-US", { ...UTC, month: "short", day: "numeric" });
}

/** "Oct 30 – Nov 12" */
export function rangeLabel(start: string, end: string): string {
  return `${shortDate(start)} – ${shortDate(end)}`;
}

/** "October 2026" */
export function monthLabel(date: string): string {
  return asUtc(date).toLocaleDateString("en-US", { ...UTC, month: "long", year: "numeric" });
}

/** "Today", "Yesterday", or "Friday, Oct 30" (with the year when not this year). */
export function dayHeading(date: string, now = today()): string {
  const diff = daysBetween(date, now);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff === -1) return "Tomorrow";
  const sameYear = date.slice(0, 4) === now.slice(0, 4);
  return asUtc(date).toLocaleDateString("en-US", {
    ...UTC,
    weekday: "long",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export function friendlyDate(date: string, now = today()): string {
  const diff = daysBetween(date, now);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff === -1) return "Tomorrow";
  const sameYear = date.slice(0, 4) === now.slice(0, 4);
  return asUtc(date).toLocaleDateString("en-US", {
    ...UTC,
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}
