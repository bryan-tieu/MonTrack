export type AccountType = "checking" | "savings" | "cash" | "creditCard" | "other";

export type Account = {
  id: string;
  name: string;
  type: AccountType;
  startingBalanceCents: number; // For cards, the amount owed
  archivedAt?: string;
  sortOrder: number;
};

export type CategoryKind = "income" | "expense";

export type Category = {
  id: string;
  name: string;
  kind: CategoryKind;
  icon?: string;
  archivedAt?: string;
  sortOrder: number;
};

export type TxType = "expense" | "income" | "transfer";

export type Transaction = {
  id: string;
  type: TxType;
  amountCents: number; // Always positive
  date: string;
  accountId: string;
  toAccountId?: string; // Transfers only
  categoryId?: string; // Not used for transfers
  note?: string;
  isRefund?: boolean;
  recurringItemId?: string;
  createdAt: string;
  updatedAt: string;
};

export type BudgetRule = {
  id: string;
  categoryId: string;
  limitCents: number; // Per pay period; NO_BUDGET removes the budget from this period onward
  periodStart: string; // First pay period this applies to
  onlyThisPeriod?: boolean; // One-period override
};

export const NO_BUDGET = -1;

export type Frequency = "weekly" | "biweekly" | "twiceMonthly" | "monthly" | "yearly";

export type RecurringItem = {
  id: string;
  name: string;
  type: TxType;
  amountCents: number;
  accountId: string;
  toAccountId?: string;
  categoryId?: string;
  frequency: Frequency;
  secondDay?: number; // twiceMonthly only: the other day of the month (31 means the last day)
  startDate: string;
  endDate?: string;
  nextDueDate: string;
  mode: "confirm" | "automatic";
  pausedAt?: string;
};

export type Goal = {
  id: string;
  name: string;
  targetCents: number;
  targetDate?: string;
  linkedAccountId?: string;
  archivedAt?: string;
};

export type GoalEntry = {
  id: string;
  goalId: string;
  amountCents: number; // Negative for a withdrawal
  date: string;
  transactionId?: string;
};

export type Appearance = "system" | "light" | "dark";

export type Settings = {
  id: "settings";
  pinHash: string;
  pinSalt: string;
  pinIterations: number;
  payScheduleAnchors: string[]; // One payday per schedule, oldest first
  appearance: Appearance;
  autoLockSeconds: number;
  lastBackupAt?: string;
  lastChangeAt?: string;
  lastAccountId?: string;
  failedPinAttempts: number;
  pinLockedUntil?: number;
  setupComplete: boolean;
  schemaVersion: number;
};
