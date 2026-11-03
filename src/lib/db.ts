import Dexie, { type Table } from "dexie";
import type {
  Account,
  BudgetRule,
  Category,
  Goal,
  GoalEntry,
  RecurringItem,
  Settings,
  Transaction,
} from "./types";

export const SCHEMA_VERSION = 1;

// Migrations are additive: add a new db.version(n) block, never edit an old one.
export class LedgerDB extends Dexie {
  accounts!: Table<Account, string>;
  categories!: Table<Category, string>;
  transactions!: Table<Transaction, string>;
  budgetRules!: Table<BudgetRule, string>;
  recurring!: Table<RecurringItem, string>;
  goals!: Table<Goal, string>;
  goalEntries!: Table<GoalEntry, string>;
  settings!: Table<Settings, string>;

  constructor() {
    super("pocket-ledger");
    this.version(1).stores({
      accounts: "id, sortOrder",
      categories: "id, kind, sortOrder",
      transactions: "id, date, accountId, toAccountId, categoryId, recurringItemId",
      budgetRules: "id, categoryId, periodStart",
      recurring: "id, nextDueDate",
      goals: "id",
      goalEntries: "id, goalId, date, transactionId",
      settings: "id",
    });
  }
}

export const db = new LedgerDB();

export const DATA_TABLES = [
  "accounts",
  "categories",
  "transactions",
  "budgetRules",
  "recurring",
  "goals",
  "goalEntries",
] as const;

export type DataTable = (typeof DATA_TABLES)[number];

export const newId = () => crypto.randomUUID();
export const nowIso = () => new Date().toISOString();

export async function getSettings(): Promise<Settings | undefined> {
  return db.settings.get("settings");
}

/** Records that data changed since the last backup. */
export async function touch(): Promise<void> {
  await db.settings.update("settings", { lastChangeAt: nowIso() });
}

export async function eraseAll(): Promise<void> {
  await db.transaction("rw", db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });
}
