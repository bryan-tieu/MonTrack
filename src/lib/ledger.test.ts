import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { periodFor, nextPeriod, previousPeriod, periodsUntil } from "./periods";
import { balances, budgetLimit, budgetStatuses, cashSummary, inRange, spendingByCategory, totals } from "./ledger";
import { dueDates, nextOccurrence } from "./recurring";
import { parseCents, centsToInput, formatSigned } from "./money";
import type { Account, BudgetRule, Category, RecurringItem, Transaction } from "./types";
import { NO_BUDGET } from "./types";

const tx = (p: Partial<Transaction> & Pick<Transaction, "type" | "amountCents" | "accountId">): Transaction => ({
  id: Math.random().toString(36),
  date: "2026-11-01",
  createdAt: "",
  updatedAt: "",
  ...p,
});

describe("pay periods", () => {
  const anchors = ["2026-10-30"];
  it("matches the spec example", () => {
    expect(periodFor("2026-10-30", anchors)).toEqual({ start: "2026-10-30", end: "2026-11-12" });
    expect(periodFor("2026-11-12", anchors)).toEqual({ start: "2026-10-30", end: "2026-11-12" });
    expect(periodFor("2026-11-13", anchors)).toEqual({ start: "2026-11-13", end: "2026-11-26" });
  });
  it("extends backward before the anchor", () => {
    expect(periodFor("2026-10-29", anchors)).toEqual({ start: "2026-10-16", end: "2026-10-29" });
  });
  it("puts every date in exactly one period", () => {
    let p = periodFor("2025-12-20", anchors);
    for (let i = 0; i < 60; i++) {
      const n = nextPeriod(p, anchors);
      expect(n.start).toBe(addDays(p.end, 1));
      expect(previousPeriod(n, anchors)).toEqual(p);
      p = n;
    }
  });
  it("applies a new schedule from the new payday without changing earlier periods", () => {
    const changed = ["2026-10-30", "2026-11-20"];
    expect(periodFor("2026-11-05", changed)).toEqual({ start: "2026-10-30", end: "2026-11-12" });
    expect(periodFor("2026-11-15", changed)).toEqual({ start: "2026-11-13", end: "2026-11-19" });
    expect(periodFor("2026-11-20", changed)).toEqual({ start: "2026-11-20", end: "2026-12-03" });
  });
  it("counts periods until a target date", () => {
    const p = periodFor("2026-11-01", anchors);
    expect(periodsUntil(p, "2026-11-10", anchors)).toBe(1);
    expect(periodsUntil(p, "2026-11-20", anchors)).toBe(2);
  });
});

describe("balances and spending", () => {
  const accounts: Account[] = [
    { id: "chk", name: "Checking", type: "checking", startingBalanceCents: 100_000, sortOrder: 0 },
    { id: "cc", name: "Card", type: "creditCard", startingBalanceCents: 5_000, sortOrder: 1 },
  ];
  const txns = [
    tx({ type: "income", amountCents: 200_000, accountId: "chk", categoryId: "pay" }),
    tx({ type: "expense", amountCents: 3_000, accountId: "chk", categoryId: "food" }),
    tx({ type: "expense", amountCents: 10_000, accountId: "cc", categoryId: "food" }),
    tx({ type: "expense", amountCents: 2_000, accountId: "cc", categoryId: "food", isRefund: true }),
    tx({ type: "transfer", amountCents: 8_000, accountId: "chk", toAccountId: "cc" }),
    tx({ type: "expense", amountCents: 99_999, accountId: "chk", categoryId: "food", date: "2026-12-01" }),
  ];
  const asOf = "2026-11-02";

  it("computes account and card balances, skipping scheduled items", () => {
    const b = balances(accounts, txns, asOf);
    expect(b.get("chk")).toBe(100_000 + 200_000 - 3_000 - 8_000);
    expect(b.get("cc")).toBe(5_000 + 10_000 - 2_000 - 8_000);
    expect(cashSummary(accounts, b)).toEqual({ cash: 289_000, owed: 5_000 });
  });

  it("counts card purchases once and never counts transfers or refunds as income", () => {
    const current = inRange(txns, { start: "2026-10-30", end: "2026-11-12" }, asOf);
    expect(totals(current)).toEqual({ income: 200_000, spending: 11_000, net: 189_000 });
    expect(spendingByCategory(current).get("food")).toBe(11_000);
  });
});

describe("budgets", () => {
  const rules: BudgetRule[] = [
    { id: "1", categoryId: "rent", limitCents: 0, periodStart: "2026-01-02" },
    { id: "2", categoryId: "rent", limitCents: 150_000, periodStart: "2026-10-30", onlyThisPeriod: true },
    { id: "3", categoryId: "food", limitCents: 10_000, periodStart: "2026-01-02" },
    { id: "4", categoryId: "food", limitCents: 12_000, periodStart: "2026-11-13" },
    { id: "5", categoryId: "food", limitCents: NO_BUDGET, periodStart: "2027-01-08" },
  ];
  it("uses overrides and keeps past periods unchanged", () => {
    expect(budgetLimit(rules, "rent", "2026-10-30")).toBe(150_000);
    expect(budgetLimit(rules, "rent", "2026-11-13")).toBe(0);
    expect(budgetLimit(rules, "food", "2026-10-30")).toBe(10_000);
    expect(budgetLimit(rules, "food", "2026-11-13")).toBe(12_000);
    expect(budgetLimit(rules, "food", "2027-01-08")).toBeNull();
    expect(budgetLimit(rules, "food", "2025-12-01")).toBeNull();
  });
  it("sets warning levels", () => {
    const cats: Category[] = [{ id: "food", name: "Dining", kind: "expense", sortOrder: 0 }];
    const level = (spent: number) =>
      budgetStatuses(cats, rules, [tx({ type: "expense", amountCents: spent, accountId: "a", categoryId: "food" })], "2026-10-30")[0].level;
    expect(level(7_999)).toBe("ok");
    expect(level(8_000)).toBe("warn");
    expect(level(10_000)).toBe("over");
  });
});

describe("recurring", () => {
  const base: RecurringItem = {
    id: "r", name: "Rent", type: "expense", amountCents: 1, accountId: "a", frequency: "monthly",
    startDate: "2026-01-31", nextDueDate: "2026-01-31", mode: "automatic",
  };
  it("clamps monthly items to short months and recovers the original day", () => {
    expect(nextOccurrence(base, "2026-01-31")).toBe("2026-02-28");
    expect(nextOccurrence(base, "2026-02-28")).toBe("2026-03-31");
  });
  it("handles twice a month", () => {
    const item = { ...base, frequency: "twiceMonthly" as const, startDate: "2026-01-15", secondDay: 31 };
    expect(nextOccurrence(item, "2026-01-15")).toBe("2026-01-31");
    expect(nextOccurrence(item, "2026-01-31")).toBe("2026-02-15");
    expect(nextOccurrence(item, "2026-02-15")).toBe("2026-02-28");
  });
  it("lists missed occurrences and respects end dates", () => {
    const item = { ...base, frequency: "weekly" as const, startDate: "2026-11-01", nextDueDate: "2026-11-01", endDate: "2026-11-15" };
    expect(dueDates(item, "2026-12-01")).toEqual(["2026-11-01", "2026-11-08", "2026-11-15"]);
  });
  it("handles yearly leap days", () => {
    const item = { ...base, frequency: "yearly" as const, startDate: "2028-02-29" };
    expect(nextOccurrence(item, "2028-02-29")).toBe("2029-02-28");
    expect(nextOccurrence(item, "2031-02-28")).toBe("2032-02-29");
  });
});

describe("money", () => {
  it("parses and formats cents without float errors", () => {
    expect(parseCents("24.5")).toBe(2450);
    expect(parseCents("$1,024.05")).toBe(102405);
    expect(parseCents("0.1")).toBe(10);
    expect(parseCents("abc")).toBeNull();
    expect(parseCents(".")).toBeNull();
    expect(centsToInput(-1205)).toBe("-12.05");
    expect(formatSigned(125400)).toBe("+$1,254.00");
  });
});
