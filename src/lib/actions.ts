import { db, newId, nowIso, touch } from "./db";
import type {
  Account,
  BudgetRule,
  Category,
  CategoryKind,
  Goal,
  GoalEntry,
  RecurringItem,
  Settings,
  Transaction,
} from "./types";
import { dueDates, nextOccurrence } from "./recurring";
import { today } from "./dates";

// Every write goes through here so the backup reminder knows data changed. Each returns only
// after IndexedDB confirms the write.

export const DEFAULT_EXPENSE_CATEGORIES = [
  "Housing", "Utilities", "Groceries", "Dining", "Transport", "Health", "Insurance",
  "Subscriptions", "Shopping", "Entertainment", "Personal", "Travel", "Gifts", "Fees", "Other",
];
export const DEFAULT_INCOME_CATEGORIES = ["Paycheck", "Side Income", "Interest", "Gift", "Other"];

export async function seedCategories(): Promise<void> {
  if ((await db.categories.count()) > 0) return;
  const rows: Category[] = [
    ...DEFAULT_EXPENSE_CATEGORIES.map((name, i) => ({ id: newId(), name, kind: "expense" as const, sortOrder: i })),
    ...DEFAULT_INCOME_CATEGORIES.map((name, i) => ({ id: newId(), name, kind: "income" as const, sortOrder: i })),
  ];
  await db.categories.bulkAdd(rows);
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  await db.settings.update("settings", patch);
}

// Transactions

export type TxInput = Omit<Transaction, "id" | "createdAt" | "updatedAt">;

function cleanTx(input: TxInput): TxInput {
  const t: TxInput = { ...input };
  if (t.type === "transfer") {
    delete t.categoryId;
    delete t.isRefund;
  } else {
    delete t.toAccountId;
  }
  if (t.type !== "expense") delete t.isRefund;
  if (!t.note?.trim()) delete t.note;
  else t.note = t.note.trim();
  return t;
}

export async function saveTransaction(input: TxInput, id?: string): Promise<string> {
  const data = cleanTx(input);
  const now = nowIso();
  return db.transaction("rw", db.transactions, db.settings, async () => {
    if (id) {
      const existing = await db.transactions.get(id);
      if (!existing) throw new Error("This transaction no longer exists.");
      await db.transactions.put({ ...data, id, createdAt: existing.createdAt, updatedAt: now });
    } else {
      id = newId();
      await db.transactions.add({ ...data, id, createdAt: now, updatedAt: now });
    }
    await db.settings.update("settings", { lastAccountId: data.accountId, lastChangeAt: now });
    return id;
  });
}

/** Deletes a transaction and returns a function that puts it back (for Undo). */
export async function deleteTransaction(id: string): Promise<() => Promise<void>> {
  const tx = await db.transactions.get(id);
  if (!tx) return async () => {};
  const entries = await db.goalEntries.where("transactionId").equals(id).toArray();
  await db.transaction("rw", db.transactions, db.goalEntries, db.settings, async () => {
    await db.transactions.delete(id);
    await db.goalEntries.bulkDelete(entries.map((e) => e.id));
    await db.settings.update("settings", { lastChangeAt: nowIso() });
  });
  return async () => {
    await db.transaction("rw", db.transactions, db.goalEntries, async () => {
      await db.transactions.put(tx);
      await db.goalEntries.bulkPut(entries);
    });
    await touch();
  };
}

// Accounts

export async function saveAccount(input: Omit<Account, "id" | "sortOrder">, id?: string): Promise<string> {
  if (id) {
    await db.accounts.update(id, input);
  } else {
    id = newId();
    const sortOrder = await db.accounts.count();
    await db.accounts.add({ ...input, id, sortOrder });
  }
  await touch();
  return id;
}

export async function accountInUse(id: string): Promise<boolean> {
  const [a, b, r] = await Promise.all([
    db.transactions.where("accountId").equals(id).count(),
    db.transactions.where("toAccountId").equals(id).count(),
    db.recurring.filter((i) => i.accountId === id || i.toAccountId === id).count(),
  ]);
  return a + b + r > 0;
}

/** Deletes an unused account. Accounts with history can only be archived. */
export async function deleteAccount(id: string): Promise<void> {
  if (await accountInUse(id)) throw new Error("This account has history. Archive it instead.");
  await db.accounts.delete(id);
  await touch();
}

export async function setArchived(table: "accounts" | "categories" | "goals", id: string, archived: boolean) {
  await db.table(table).update(id, { archivedAt: archived ? nowIso() : undefined });
  await touch();
}

export async function moveItem(table: "accounts" | "categories", ids: string[], id: string, dir: -1 | 1) {
  const i = ids.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return;
  const order = [...ids];
  [order[i], order[j]] = [order[j], order[i]];
  await db.transaction("rw", db.table(table), async () => {
    await Promise.all(order.map((itemId, sortOrder) => db.table(table).update(itemId, { sortOrder })));
  });
  await touch();
}

// Categories

export async function addCategory(name: string, kind: CategoryKind): Promise<string> {
  const id = newId();
  const sortOrder = await db.categories.where("kind").equals(kind).count();
  await db.categories.add({ id, name: name.trim(), kind, sortOrder });
  await touch();
  return id;
}

export async function renameCategory(id: string, name: string) {
  await db.categories.update(id, { name: name.trim() });
  await touch();
}

// Budgets

/** Sets a limit from `periodStart` onward, or for that period only. Past periods keep their rules. */
export async function setBudget(categoryId: string, periodStart: string, limitCents: number, onlyThisPeriod: boolean) {
  await db.transaction("rw", db.budgetRules, async () => {
    const same = await db.budgetRules
      .where("categoryId")
      .equals(categoryId)
      .filter((r) => r.periodStart === periodStart && !!r.onlyThisPeriod === onlyThisPeriod)
      .toArray();
    await db.budgetRules.bulkDelete(same.map((r) => r.id));
    if (!onlyThisPeriod) {
      // A new ongoing limit replaces any later ongoing rules so "from now on" really holds.
      const later = await db.budgetRules
        .where("categoryId")
        .equals(categoryId)
        .filter((r) => r.periodStart > periodStart && !r.onlyThisPeriod)
        .toArray();
      await db.budgetRules.bulkDelete(later.map((r) => r.id));
    }
    const rule: BudgetRule = { id: newId(), categoryId, limitCents, periodStart };
    if (onlyThisPeriod) rule.onlyThisPeriod = true;
    await db.budgetRules.add(rule);
  });
  await touch();
}

export async function clearOverride(categoryId: string, periodStart: string) {
  const rows = await db.budgetRules
    .where("categoryId")
    .equals(categoryId)
    .filter((r) => r.periodStart === periodStart && !!r.onlyThisPeriod)
    .toArray();
  await db.budgetRules.bulkDelete(rows.map((r) => r.id));
  await touch();
}

// Recurring items

export async function saveRecurring(item: Omit<RecurringItem, "id">, id?: string): Promise<string> {
  const data = { ...item };
  if (data.type === "transfer") delete data.categoryId;
  else delete data.toAccountId;
  if (data.frequency !== "twiceMonthly") delete data.secondDay;
  if (!data.endDate) delete data.endDate;
  if (id) await db.recurring.put({ ...data, id });
  else {
    id = newId();
    await db.recurring.add({ ...data, id });
  }
  await touch();
  return id;
}

export async function deleteRecurring(id: string) {
  await db.recurring.delete(id);
  await touch();
}

function txFromItem(item: RecurringItem, date: string, amountCents = item.amountCents): Transaction {
  const now = nowIso();
  const t: Transaction = {
    id: newId(),
    type: item.type,
    amountCents,
    date,
    accountId: item.accountId,
    note: item.name,
    recurringItemId: item.id,
    createdAt: now,
    updatedAt: now,
  };
  if (item.type === "transfer") t.toAccountId = item.toAccountId;
  else t.categoryId = item.categoryId;
  return t;
}

let processing: Promise<number> | null = null;

/**
 * Adds every automatic item that came due, including any missed while the app was closed.
 * Runs inside one database transaction and re-reads each item, so opening the app repeatedly
 * (or twice at once) never adds an occurrence twice. Confirm-first items are left due for Home.
 */
export function processRecurring(asOf = today()): Promise<number> {
  if (processing) return processing;
  processing = db
    .transaction("rw", db.recurring, db.transactions, db.settings, async () => {
      let added = 0;
      const items = await db.recurring.where("nextDueDate").belowOrEqual(asOf).toArray();
      for (const item of items) {
        if (item.mode !== "automatic" || item.pausedAt) continue;
        const dates = dueDates(item, asOf);
        if (dates.length === 0) continue;
        await db.transactions.bulkAdd(dates.map((d) => txFromItem(item, d)));
        await db.recurring.update(item.id, { nextDueDate: nextOccurrence(item, dates[dates.length - 1]) });
        added += dates.length;
      }
      if (added) await db.settings.update("settings", { lastChangeAt: nowIso() });
      return added;
    })
    .finally(() => {
      processing = null;
    });
  return processing;
}

/** Records one confirm-first occurrence (or skips it) and moves the item to its next date. */
export async function resolveDue(
  itemId: string,
  dueDate: string,
  action: { save: { amountCents: number; date: string; accountId: string } } | "skip",
) {
  await db.transaction("rw", db.recurring, db.transactions, db.settings, async () => {
    const item = await db.recurring.get(itemId);
    if (!item || item.nextDueDate !== dueDate) return; // Already handled.
    if (action !== "skip") {
      const t = txFromItem(item, action.save.date, action.save.amountCents);
      t.accountId = action.save.accountId;
      await db.transactions.add(t);
    }
    await db.recurring.update(itemId, { nextDueDate: nextOccurrence(item, dueDate) });
    await db.settings.update("settings", { lastChangeAt: nowIso() });
  });
}

// Goals

export async function saveGoal(goal: Omit<Goal, "id">, id?: string): Promise<string> {
  const data = { ...goal };
  if (!data.targetDate) delete data.targetDate;
  if (!data.linkedAccountId) delete data.linkedAccountId;
  if (id) await db.goals.put({ ...data, id });
  else {
    id = newId();
    await db.goals.add({ ...data, id });
  }
  await touch();
  return id;
}

export async function deleteGoal(id: string) {
  await db.transaction("rw", db.goals, db.goalEntries, async () => {
    await db.goalEntries.where("goalId").equals(id).delete();
    await db.goals.delete(id);
  });
  await touch();
}

/** Adds (positive) or withdraws (negative) goal money, optionally with a matching transfer. */
export async function addGoalEntry(
  goalId: string,
  amountCents: number,
  date: string,
  transfer?: { fromAccountId: string; toAccountId: string; note: string },
) {
  const now = nowIso();
  await db.transaction("rw", db.goalEntries, db.transactions, db.settings, async () => {
    const entry: GoalEntry = { id: newId(), goalId, amountCents, date };
    if (transfer) {
      const t: Transaction = {
        id: newId(),
        type: "transfer",
        amountCents: Math.abs(amountCents),
        date,
        accountId: transfer.fromAccountId,
        toAccountId: transfer.toAccountId,
        note: transfer.note,
        createdAt: now,
        updatedAt: now,
      };
      await db.transactions.add(t);
      entry.transactionId = t.id;
    }
    await db.goalEntries.add(entry);
    await db.settings.update("settings", { lastChangeAt: now });
  });
}
