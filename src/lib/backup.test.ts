import { describe, expect, it } from "vitest";
import { parseBackup, BACKUP_FORMAT } from "./backup";

const valid = {
  format: BACKUP_FORMAT,
  schemaVersion: 1,
  exportedAt: "2026-11-03T10:00:00.000Z",
  appVersion: "1.0.0",
  settings: { pinHash: "h", pinSalt: "s", pinIterations: 310000, payScheduleAnchors: ["2026-10-30"], appearance: "system", autoLockSeconds: 60 },
  data: {
    accounts: [{ id: "a", name: "Checking", type: "checking", startingBalanceCents: 100, sortOrder: 0 }],
    categories: [],
    transactions: [
      { id: "t1", type: "expense", amountCents: 50, date: "2026-11-01", accountId: "a", createdAt: "", updatedAt: "" },
      { id: "t2", type: "income", amountCents: 70, date: "2026-10-20", accountId: "a", createdAt: "", updatedAt: "" },
    ],
    budgetRules: [],
    recurring: [],
    goals: [],
    goalEntries: [],
  },
};

describe("backup validation", () => {
  it("accepts a valid backup and summarizes it", () => {
    const { summary } = parseBackup(JSON.stringify(valid));
    expect(summary).toMatchObject({ accounts: 1, transactions: 2, firstDate: "2026-10-20", lastDate: "2026-11-01" });
  });
  it("rejects files that aren't backups or are broken", () => {
    expect(() => parseBackup("not json")).toThrow(/isn't JSON/);
    expect(() => parseBackup(JSON.stringify({ hello: 1 }))).toThrow(/isn't a Pocket Ledger backup/);
    expect(() => parseBackup(JSON.stringify({ ...valid, schemaVersion: 99 }))).toThrow(/newer version/);
    const orphan = structuredClone(valid);
    orphan.data.transactions[0].accountId = "missing";
    expect(() => parseBackup(JSON.stringify(orphan))).toThrow(/missing account/);
    const badAmount = structuredClone(valid);
    (badAmount.data.transactions[0] as { amountCents: unknown }).amountCents = 1.5;
    expect(() => parseBackup(JSON.stringify(badAmount))).toThrow(/invalid amount/);
  });
});
