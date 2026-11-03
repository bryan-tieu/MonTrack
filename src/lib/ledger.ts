import type { Account, BudgetRule, Category, Transaction } from "./types";
import { NO_BUDGET } from "./types";
import type { Period } from "./periods";
import { contains } from "./periods";

export const isCard = (a: Pick<Account, "type">) => a.type === "creditCard";

/** Future-dated transactions are scheduled and don't count until their date arrives. */
export const isScheduled = (t: Transaction, asOf: string) => t.date > asOf;

/**
 * How a transaction changes an account's value (money you have). For a card, the amount owed
 * moves the opposite way: a purchase lowers value and so raises what is owed.
 */
export function valueDelta(t: Transaction, accountId: string): number {
  const a = t.amountCents;
  switch (t.type) {
    case "expense":
      return t.accountId === accountId ? (t.isRefund ? a : -a) : 0;
    case "income":
      return t.accountId === accountId ? a : 0;
    case "transfer": {
      let d = 0;
      if (t.accountId === accountId) d -= a;
      if (t.toAccountId === accountId) d += a;
      return d;
    }
  }
}

/** Current balance: money held, or for a card the amount owed. */
export function balances(
  accounts: Account[],
  txns: Transaction[],
  asOf: string,
): Map<string, number> {
  const value = new Map<string, number>(accounts.map((a) => [a.id, 0]));
  for (const t of txns) {
    if (isScheduled(t, asOf)) continue;
    for (const id of [t.accountId, t.toAccountId]) {
      if (id && value.has(id)) value.set(id, value.get(id)! + valueDelta(t, id));
    }
  }
  const out = new Map<string, number>();
  for (const acc of accounts) {
    const v = value.get(acc.id)!;
    out.set(acc.id, isCard(acc) ? acc.startingBalanceCents - v : acc.startingBalanceCents + v);
  }
  return out;
}

export function cashSummary(accounts: Account[], bal: Map<string, number>) {
  let cash = 0;
  let owed = 0;
  for (const a of accounts) {
    if (a.archivedAt) continue;
    if (isCard(a)) owed += bal.get(a.id) ?? 0;
    else cash += bal.get(a.id) ?? 0;
  }
  return { cash, owed };
}

/** Net spending a transaction contributes: refunds are negative. Transfers and income are zero. */
export function spendingOf(t: Transaction): number {
  if (t.type !== "expense") return 0;
  return t.isRefund ? -t.amountCents : t.amountCents;
}

export function incomeOf(t: Transaction): number {
  return t.type === "income" ? t.amountCents : 0;
}

export function inRange(txns: Transaction[], p: Period, asOf: string): Transaction[] {
  return txns.filter((t) => contains(p, t.date) && !isScheduled(t, asOf));
}

export function totals(txns: Transaction[]) {
  let income = 0;
  let spending = 0;
  for (const t of txns) {
    income += incomeOf(t);
    spending += spendingOf(t);
  }
  return { income, spending, net: income - spending };
}

export function spendingByCategory(txns: Transaction[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const t of txns) {
    if (t.type !== "expense" || !t.categoryId) continue;
    out.set(t.categoryId, (out.get(t.categoryId) ?? 0) + spendingOf(t));
  }
  return out;
}

/**
 * The limit for a category in the period starting `periodStart`, or null for no budget.
 * A one-period override wins; otherwise the newest ongoing rule at or before the period applies.
 */
export function budgetLimit(
  rules: BudgetRule[],
  categoryId: string,
  periodStart: string,
): number | null {
  let ongoing: BudgetRule | undefined;
  for (const r of rules) {
    if (r.categoryId !== categoryId || r.periodStart > periodStart) continue;
    if (r.onlyThisPeriod) {
      if (r.periodStart === periodStart) return r.limitCents === NO_BUDGET ? null : r.limitCents;
      continue;
    }
    if (!ongoing || r.periodStart > ongoing.periodStart) ongoing = r;
  }
  if (!ongoing || ongoing.limitCents === NO_BUDGET) return null;
  return ongoing.limitCents;
}

export type BudgetStatus = {
  category: Category;
  limit: number;
  spent: number;
  remaining: number;
  ratio: number;
  level: "ok" | "warn" | "over";
};

export function budgetStatuses(
  categories: Category[],
  rules: BudgetRule[],
  periodTxns: Transaction[],
  periodStart: string,
): BudgetStatus[] {
  const spent = spendingByCategory(periodTxns);
  const out: BudgetStatus[] = [];
  for (const c of categories) {
    if (c.kind !== "expense") continue;
    const limit = budgetLimit(rules, c.id, periodStart);
    if (limit === null) continue;
    const s = spent.get(c.id) ?? 0;
    const ratio = limit > 0 ? s / limit : s > 0 ? Infinity : 0;
    out.push({
      category: c,
      limit,
      spent: s,
      remaining: limit - s,
      ratio,
      level: ratio >= 1 && s > 0 ? "over" : ratio >= 0.8 ? "warn" : "ok",
    });
  }
  return out;
}

export function budgetLabel(b: BudgetStatus, fmt: (c: number) => string): string {
  if (b.remaining < 0) return `Over by ${fmt(-b.remaining)}`;
  return `${fmt(b.remaining)} left`;
}
