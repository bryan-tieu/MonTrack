import { db, DATA_TABLES, nowIso, SCHEMA_VERSION } from "./db";
import type { Settings } from "./types";
import { isValidDate, today } from "./dates";

export const BACKUP_FORMAT = "pocket-ledger-backup";

// Device-specific security state stays out of backups' settings section; the PIN hash travels
// with the backup so a restored phone unlocks with the same PIN.
type BackupSettings = Pick<
  Settings,
  "pinHash" | "pinSalt" | "pinIterations" | "payScheduleAnchors" | "appearance" | "autoLockSeconds"
>;

export type Backup = {
  format: typeof BACKUP_FORMAT;
  schemaVersion: number;
  exportedAt: string;
  appVersion: string;
  settings: BackupSettings;
  data: Record<(typeof DATA_TABLES)[number], unknown[]>;
};

export async function buildBackup(appVersion: string): Promise<Backup> {
  const s = await db.settings.get("settings");
  if (!s) throw new Error("Nothing to back up yet.");
  const data = {} as Backup["data"];
  for (const t of DATA_TABLES) data[t] = await db.table(t).toArray();
  return {
    format: BACKUP_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: nowIso(),
    appVersion,
    settings: {
      pinHash: s.pinHash,
      pinSalt: s.pinSalt,
      pinIterations: s.pinIterations,
      payScheduleAnchors: s.payScheduleAnchors,
      appearance: s.appearance,
      autoLockSeconds: s.autoLockSeconds,
    },
    data,
  };
}

export type BackupSummary = {
  exportedAt: string;
  accounts: number;
  transactions: number;
  categories: number;
  budgets: number;
  recurring: number;
  goals: number;
  firstDate?: string;
  lastDate?: string;
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isStr = (v: unknown): v is string => typeof v === "string";
const isInt = (v: unknown): v is number => Number.isSafeInteger(v);

function check(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`This backup file isn't valid: ${msg}.`);
}

/** Parses and validates a backup file, throwing a readable error if anything is off. */
export function parseBackup(text: string): { backup: Backup; summary: BackupSummary } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("This file isn't a Pocket Ledger backup (it isn't JSON).");
  }
  check(isObj(raw) && raw.format === BACKUP_FORMAT, "it isn't a Pocket Ledger backup");
  check(isInt(raw.schemaVersion), "missing schema version");
  check(
    (raw.schemaVersion as number) <= SCHEMA_VERSION,
    "it was made by a newer version of the app. Update the app and try again",
  );
  const s = raw.settings;
  check(isObj(s), "missing settings");
  check(isStr(s.pinHash) && isStr(s.pinSalt) && isInt(s.pinIterations), "missing PIN data");
  check(
    Array.isArray(s.payScheduleAnchors) && s.payScheduleAnchors.length > 0 && s.payScheduleAnchors.every((d) => isStr(d) && isValidDate(d)),
    "invalid pay schedule",
  );
  const data = raw.data;
  check(isObj(data), "missing data");
  for (const t of DATA_TABLES) check(Array.isArray(data[t]), `missing ${t}`);
  const d = data as Backup["data"];

  const ids = (rows: unknown[]) => new Set(rows.map((r) => (r as { id: string }).id));
  for (const t of DATA_TABLES) {
    for (const row of d[t]) check(isObj(row) && isStr(row.id), `a ${t} row has no id`);
  }
  const accountIds = ids(d.accounts);
  for (const a of d.accounts as Record<string, unknown>[]) {
    check(isStr(a.name) && isStr(a.type) && isInt(a.startingBalanceCents), "an account is incomplete");
  }
  const dates: string[] = [];
  for (const t of d.transactions as Record<string, unknown>[]) {
    check(["expense", "income", "transfer"].includes(t.type as string), "a transaction has an unknown type");
    check(isInt(t.amountCents) && (t.amountCents as number) >= 0, "a transaction has an invalid amount");
    check(isStr(t.date) && isValidDate(t.date), "a transaction has an invalid date");
    check(accountIds.has(t.accountId as string), "a transaction points to a missing account");
    if (t.type === "transfer") check(accountIds.has(t.toAccountId as string), "a transfer points to a missing account");
    dates.push(t.date as string);
  }
  dates.sort();
  return {
    backup: raw as Backup,
    summary: {
      exportedAt: raw.exportedAt as string,
      accounts: d.accounts.length,
      transactions: d.transactions.length,
      categories: d.categories.length,
      budgets: d.budgetRules.length,
      recurring: d.recurring.length,
      goals: d.goals.length,
      firstDate: dates[0],
      lastDate: dates[dates.length - 1],
    },
  };
}

/** Replaces all data with the backup's contents in a single transaction. */
export async function restoreBackup(backup: Backup): Promise<void> {
  const current = await db.settings.get("settings");
  await db.transaction("rw", db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    for (const t of DATA_TABLES) await db.table(t).bulkAdd(backup.data[t]);
    const settings: Settings = {
      id: "settings",
      ...backup.settings,
      appearance: backup.settings.appearance ?? current?.appearance ?? "system",
      autoLockSeconds: backup.settings.autoLockSeconds ?? 60,
      failedPinAttempts: 0,
      setupComplete: true,
      schemaVersion: SCHEMA_VERSION,
      lastBackupAt: backup.exportedAt,
    };
    await db.settings.put(settings);
  });
}

export function backupFileName(): string {
  return `pocket-ledger-backup-${today()}.json`;
}

/** Opens the share sheet with the file (so it can be saved to Files), or downloads it. */
export async function shareFile(name: string, type: string, content: string): Promise<"shared" | "downloaded" | "cancelled"> {
  const file = new File([content], name, { type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return "shared";
    } catch (e) {
      if ((e as DOMException).name === "AbortError") return "cancelled";
      throw e;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "downloaded";
}
