// All money is integer cents.

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const usdWhole = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function formatCents(cents: number): string {
  return usd.format(cents / 100);
}

/** Compact labels: "$2,100" for whole dollars, "$24.50" otherwise, so cents are never rounded away. */
export function formatWhole(cents: number): string {
  return cents % 100 === 0 ? usdWhole.format(cents / 100) : usd.format(cents / 100);
}

export function formatSigned(cents: number): string {
  if (cents === 0) return formatCents(0);
  return (cents > 0 ? "+" : "−") + formatCents(Math.abs(cents));
}

/** Parses "24.5", "$1,024.50", "-3" into cents. Returns null for anything that isn't money. */
export function parseCents(input: string): number | null {
  const s = input.replace(/[$,\s]/g, "");
  const m = /^(-)?(\d*)(?:\.(\d{0,2}))?$/.exec(s);
  if (!m || (m[2] === "" && !m[3])) return null;
  const whole = Number(m[2] || "0");
  const frac = Number((m[3] ?? "").padEnd(2, "0") || "0");
  const cents = whole * 100 + frac;
  if (!Number.isSafeInteger(cents)) return null;
  return m[1] ? -cents : cents;
}

/** Plain decimal for form fields and CSV: "1024.50". */
export function centsToInput(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
