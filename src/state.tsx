import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./lib/db";
import type { Account, BudgetRule, Category, Goal, GoalEntry, RecurringItem, Settings, Transaction, TxType } from "./lib/types";
import { today } from "./lib/dates";
import { periodFor, type Period } from "./lib/periods";
import { balances } from "./lib/ledger";

export type Data = {
  settings: Settings;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgetRules: BudgetRule[];
  recurring: RecurringItem[];
  goals: Goal[];
  goalEntries: GoalEntry[];
};

async function loadAll(): Promise<Data | null> {
  const settings = await db.settings.get("settings");
  if (!settings) return null;
  const [accounts, categories, transactions, budgetRules, recurring, goals, goalEntries] = await Promise.all([
    db.accounts.orderBy("sortOrder").toArray(),
    db.categories.orderBy("sortOrder").toArray(),
    db.transactions.toArray(),
    db.budgetRules.toArray(),
    db.recurring.toArray(),
    db.goals.toArray(),
    db.goalEntries.toArray(),
  ]);
  return { settings, accounts, categories, transactions, budgetRules, recurring, goals, goalEntries };
}

/** Everything is small enough to keep in memory; any write re-runs this query. */
export function useAllData(enabled: boolean): Data | null | undefined {
  return useLiveQuery(() => (enabled ? loadAll() : Promise.resolve(undefined)), [enabled]);
}

export type Tab = "home" | "activity" | "plan" | "reports";

export type ActivityFilter = {
  start?: string;
  end?: string;
  type?: TxType;
  accountId?: string;
  categoryId?: string;
  query?: string;
};

export type TxDraft = Partial<Transaction>;

type AppCtx = {
  data: Data;
  asOf: string;
  period: Period;
  balances: Map<string, number>;
  accountById: Map<string, Account>;
  categoryById: Map<string, Category>;
  tab: Tab;
  setTab: (t: Tab) => void;
  activityFilter: ActivityFilter;
  showActivity: (f: ActivityFilter) => void;
  setActivityFilter: (f: ActivityFilter) => void;
  openTx: (draft?: TxDraft) => void;
  openSettings: () => void;
  toast: (message: string, undo?: () => void) => void;
};

const Ctx = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside provider");
  return v;
}

export function AppProvider(props: {
  data: Data;
  children: ReactNode;
  openTx: AppCtx["openTx"];
  openSettings: () => void;
  toast: AppCtx["toast"];
  day: string;
}) {
  const { data, day } = props;
  const [tab, setTab] = useState<Tab>("home");
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>({});
  const value = useMemo<AppCtx>(() => {
    const asOf = day || today();
    return {
      data,
      asOf,
      period: periodFor(asOf, data.settings.payScheduleAnchors),
      balances: balances(data.accounts, data.transactions, asOf),
      accountById: new Map(data.accounts.map((a) => [a.id, a])),
      categoryById: new Map(data.categories.map((c) => [c.id, c])),
      tab,
      setTab: (t) => {
        setTab(t);
        window.scrollTo(0, 0);
      },
      activityFilter,
      setActivityFilter,
      showActivity: (f) => {
        setActivityFilter(f);
        setTab("activity");
        window.scrollTo(0, 0);
      },
      openTx: props.openTx,
      openSettings: props.openSettings,
      toast: props.toast,
    };
  }, [data, day, tab, activityFilter, props.openTx, props.openSettings, props.toast]);
  return <Ctx.Provider value={value}>{props.children}</Ctx.Provider>;
}
