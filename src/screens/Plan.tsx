import { useMemo, useState } from "react";
import { useApp } from "../state";
import { Confirm, Empty, Icon, MoneyInput, ProgressBar, Segmented, Sheet, Switch } from "../components/ui";
import { budgetLabel, budgetLimit, budgetStatuses, inRange, spendingByCategory, type BudgetStatus } from "../lib/ledger";
import { nextPeriod, previousPeriod, periodsUntil, type Period } from "../lib/periods";
import { friendlyDate, isValidDate, rangeLabel, today } from "../lib/dates";
import { centsToInput, formatCents, formatWhole, parseCents } from "../lib/money";
import {
  addGoalEntry,
  clearOverride,
  deleteGoal,
  deleteRecurring,
  saveGoal,
  saveRecurring,
  setArchived,
  setBudget,
} from "../lib/actions";
import { FREQUENCY_LABELS, hasEnded, twiceMonthlyDays } from "../lib/recurring";
import type { Category, Frequency, Goal, RecurringItem, TxType } from "../lib/types";
import { NO_BUDGET } from "../lib/types";

type Section = "budgets" | "recurring" | "goals";

export function Plan() {
  const [section, setSection] = useState<Section>("budgets");
  return (
    <div className="screen">
      <h1 className="title" style={{ marginTop: 8 }}>Plan</h1>
      <Segmented
        label="Plan section"
        value={section}
        onChange={setSection}
        options={[
          { value: "budgets", label: "Budgets" },
          { value: "recurring", label: "Recurring" },
          { value: "goals", label: "Goals" },
        ]}
      />
      <div style={{ marginTop: 16 }}>
        {section === "budgets" && <Budgets />}
        {section === "recurring" && <Recurring />}
        {section === "goals" && <Goals />}
      </div>
    </div>
  );
}

export function PeriodStepper({ period, onChange, isCurrent }: { period: Period; onChange: (dir: -1 | 1) => void; isCurrent: boolean }) {
  return (
    <div className="row-flex" style={{ justifyContent: "space-between" }}>
      <button className="icon-btn" onClick={() => onChange(-1)} aria-label="Previous period">
        <Icon name="left" />
      </button>
      <div className="center">
        <div style={{ fontWeight: 600 }}>{rangeLabel(period.start, period.end)}</div>
        <div className="caption">{isCurrent ? "Current pay period" : period.end < today() ? "Past" : "Upcoming"}</div>
      </div>
      <button className="icon-btn" onClick={() => onChange(1)} aria-label="Next period">
        <Icon name="right" />
      </button>
    </div>
  );
}

// Budgets

function Budgets() {
  const { data, asOf, period: current, showActivity } = useApp();
  const anchors = data.settings.payScheduleAnchors;
  const [period, setPeriod] = useState(current);
  const [editing, setEditing] = useState<Category | null>(null);
  const [adding, setAdding] = useState(false);

  const txns = useMemo(() => inRange(data.transactions, period, asOf), [data.transactions, period, asOf]);
  const statuses = budgetStatuses(data.categories, data.budgetRules, txns, period.start);
  const budgeted = new Set(statuses.map((s) => s.category.id));
  const unbudgeted = data.categories.filter((c) => c.kind === "expense" && !c.archivedAt && !budgeted.has(c.id));
  const totalLimit = statuses.reduce((s, b) => s + b.limit, 0);
  const totalSpent = statuses.reduce((s, b) => s + b.spent, 0);

  return (
    <>
      <PeriodStepper
        period={period}
        isCurrent={period.start === current.start}
        onChange={(d) => setPeriod(d < 0 ? previousPeriod(period, anchors) : nextPeriod(period, anchors))}
      />
      {statuses.length === 0 ? (
        <Empty title="No budgets yet">
          Set a limit for a category, like Dining or Groceries. Each limit repeats every pay period until you change it.
        </Empty>
      ) : (
        <>
          <div className="card padded section" style={{ marginTop: 16 }}>
            <div className="row-flex">
              <span className="grow muted">Spent of budgeted</span>
              <span className="nowrap">
                {formatWhole(totalSpent)} <span className="muted">of {formatWhole(totalLimit)}</span>
              </span>
            </div>
          </div>
          <ul className="list section" style={{ marginTop: 16 }}>
            {statuses.map((b) => (
              <BudgetRow
                key={b.category.id}
                b={b}
                override={data.budgetRules.some((r) => r.categoryId === b.category.id && r.onlyThisPeriod && r.periodStart === period.start)}
                onEdit={() => setEditing(b.category)}
                onShow={() => showActivity({ start: period.start, end: period.end, categoryId: b.category.id, type: "expense" })}
              />
            ))}
          </ul>
        </>
      )}
      {unbudgeted.length > 0 && (
        <button className="btn secondary block section" onClick={() => setAdding(true)}>
          Add budget
        </button>
      )}
      {adding && (
        <Sheet title="Add budget" onClose={() => setAdding(false)}>
          <ul className="list">
            {unbudgeted.map((c) => (
              <li key={c.id}>
                <button
                  className="item"
                  onClick={() => {
                    setAdding(false);
                    setEditing(c);
                  }}
                >
                  <span className="main">{c.name}</span>
                  <Icon name="chevron" size={16} />
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
      )}
      {editing && <BudgetSheet category={editing} period={period} onClose={() => setEditing(null)} spent={spendingByCategory(txns).get(editing.id) ?? 0} />}
    </>
  );
}

function BudgetRow({ b, override, onEdit, onShow }: { b: BudgetStatus; override: boolean; onEdit: () => void; onShow: () => void }) {
  const label = budgetLabel(b, formatCents);
  return (
    <li style={{ padding: "12px 0" }}>
      <div className="row-flex" style={{ marginBottom: 6 }}>
        <button className="grow" style={{ textAlign: "left", minHeight: 32 }} onClick={onShow}>
          <span style={{ fontWeight: 500 }}>{b.category.name}</span>
          {override && <span className="tag" style={{ marginLeft: 6 }}>This period</span>}
        </button>
        <button className="link" onClick={onEdit} aria-label={`Edit ${b.category.name} budget`}>
          {formatWhole(b.spent)}&nbsp;<span className="muted">of {formatWhole(b.limit)}</span>
        </button>
      </div>
      <ProgressBar ratio={b.ratio} level={b.level} label={`${b.category.name}: ${label}`} />
      <div className={`caption ${b.level === "over" ? "over" : b.level === "warn" ? "warn" : ""}`} style={{ marginTop: 4 }}>
        {label}
      </div>
    </li>
  );
}

function BudgetSheet({ category, period, spent, onClose }: { category: Category; period: Period; spent: number; onClose: () => void }) {
  const { data } = useApp();
  const current = budgetLimit(data.budgetRules, category.id, period.start);
  const hasOverride = data.budgetRules.some((r) => r.categoryId === category.id && r.onlyThisPeriod && r.periodStart === period.start);
  const [amount, setAmount] = useState(current !== null ? centsToInput(current) : "");
  const [onlyThis, setOnlyThis] = useState(false);
  const cents = parseCents(amount);
  const ok = cents !== null && cents >= 0;

  return (
    <Sheet
      title={category.name}
      onClose={onClose}
      right={
        <button
          className="link"
          style={{ fontWeight: 600 }}
          disabled={!ok}
          onClick={async () => {
            await setBudget(category.id, period.start, cents!, onlyThis);
            onClose();
          }}
        >
          Save
        </button>
      }
    >
      <p className="muted">
        {rangeLabel(period.start, period.end)} · {formatCents(spent)} spent so far
      </p>
      <div className="field">
        <label className="label" htmlFor="budget-amt">Limit per pay period</label>
        <MoneyInput id="budget-amt" value={amount} onChange={setAmount} />
      </div>
      <Segmented
        label="Applies to"
        value={onlyThis ? "only" : "onward"}
        onChange={(v) => setOnlyThis(v === "only")}
        options={[
          { value: "onward", label: "This period onward" },
          { value: "only", label: "This period only" },
        ]}
      />
      <p className="caption">
        {onlyThis
          ? "Use this for a bill that lands in some pay periods, like monthly rent. Other periods keep their usual limit."
          : "Past periods keep the limits they had."}
      </p>
      {hasOverride && (
        <button
          className="btn secondary block section"
          onClick={async () => {
            await clearOverride(category.id, period.start);
            onClose();
          }}
        >
          Remove this period's override
        </button>
      )}
      {current !== null && (
        <button
          className="btn danger block section"
          onClick={async () => {
            await setBudget(category.id, period.start, NO_BUDGET, onlyThis);
            onClose();
          }}
        >
          {onlyThis ? "No budget this period" : "Stop budgeting from this period"}
        </button>
      )}
    </Sheet>
  );
}

// Recurring

function Recurring() {
  const { data, asOf, accountById, categoryById } = useApp();
  const [editing, setEditing] = useState<RecurringItem | "new" | null>(null);
  const items = [...data.recurring].sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate));
  const active = items.filter((i) => !i.pausedAt && !hasEnded(i));
  const inactive = items.filter((i) => i.pausedAt || hasEnded(i));

  const row = (i: RecurringItem) => {
    const what =
      i.type === "transfer"
        ? `${accountById.get(i.accountId)?.name} → ${accountById.get(i.toAccountId ?? "")?.name}`
        : `${categoryById.get(i.categoryId ?? "")?.name ?? ""} · ${accountById.get(i.accountId)?.name ?? ""}`;
    return (
      <li key={i.id}>
        <button className="item" onClick={() => setEditing(i)}>
          <span className="main">
            <div>{i.name}</div>
            <div className="caption">
              {FREQUENCY_LABELS[i.frequency]} · {what}
            </div>
            <div className="caption">
              {i.pausedAt ? "Paused" : hasEnded(i) ? "Ended" : `Next ${friendlyDate(i.nextDueDate, asOf)}`} ·{" "}
              {i.mode === "automatic" ? "Adds automatically" : "Confirm first"}
            </div>
          </span>
          <span className={`amt ${i.type === "income" ? "income" : ""}`}>{formatCents(i.amountCents)}</span>
        </button>
      </li>
    );
  };

  return (
    <>
      {items.length === 0 ? (
        <Empty title="No recurring items">
          Add paychecks, rent, and subscriptions. Confirm-first items show up on Home when due; automatic ones are added
          for you.
        </Empty>
      ) : (
        <>
          <ul className="list">{active.map(row)}</ul>
          {inactive.length > 0 && (
            <div className="section">
              <h2 style={{ marginBottom: 4 }}>Paused or ended</h2>
              <ul className="list">{inactive.map(row)}</ul>
            </div>
          )}
        </>
      )}
      <button className="btn secondary block section" onClick={() => setEditing("new")}>
        Add recurring item
      </button>
      {editing && <RecurringSheet item={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function RecurringSheet({ item, onClose }: { item: RecurringItem | null; onClose: () => void }) {
  const { data, asOf } = useApp();
  const accounts = data.accounts.filter((a) => !a.archivedAt || a.id === item?.accountId || a.id === item?.toAccountId);
  const [name, setName] = useState(item?.name ?? "");
  const [type, setType] = useState<TxType>(item?.type ?? "expense");
  const [amount, setAmount] = useState(item ? centsToInput(item.amountCents) : "");
  const [accountId, setAccountId] = useState(item?.accountId ?? accounts[0]?.id ?? "");
  const [toAccountId, setToAccountId] = useState(item?.toAccountId ?? "");
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? "");
  const [frequency, setFrequency] = useState<Frequency>(item?.frequency ?? "monthly");
  const [startDate, setStartDate] = useState(item?.startDate ?? asOf);
  const [secondDay, setSecondDay] = useState<number>(item ? twiceMonthlyDays(item)[1] : 31);
  const [endDate, setEndDate] = useState(item?.endDate ?? "");
  const [nextDue, setNextDue] = useState(item?.nextDueDate ?? "");
  const [mode, setMode] = useState<"confirm" | "automatic">(item?.mode ?? "confirm");
  const [paused, setPaused] = useState(!!item?.pausedAt);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");

  const kind = type === "income" ? "income" : "expense";
  const cats = data.categories.filter((c) => c.kind === kind && (!c.archivedAt || c.id === categoryId));
  const cents = parseCents(amount);
  const valid =
    name.trim() &&
    cents !== null &&
    cents > 0 &&
    accountId &&
    isValidDate(startDate) &&
    (!endDate || (isValidDate(endDate) && endDate >= startDate)) &&
    (type === "transfer" ? toAccountId && toAccountId !== accountId : cats.some((c) => c.id === categoryId));

  async function save() {
    if (!valid) return;
    try {
      const startChanged = !item || startDate !== item.startDate;
      await saveRecurring(
        {
          name: name.trim(),
          type,
          amountCents: cents!,
          accountId,
          toAccountId: type === "transfer" ? toAccountId : undefined,
          categoryId: type === "transfer" ? undefined : categoryId,
          frequency,
          secondDay: frequency === "twiceMonthly" ? secondDay : undefined,
          startDate,
          endDate: endDate || undefined,
          // Changing the start date restarts the schedule there; otherwise keep (or use the edited) next date.
          nextDueDate: startChanged ? startDate : isValidDate(nextDue) ? nextDue : item!.nextDueDate,
          mode,
          pausedAt: paused ? item?.pausedAt ?? new Date().toISOString() : undefined,
        },
        item?.id,
      );
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Sheet
      title={item ? "Edit recurring" : "New recurring"}
      onClose={onClose}
      right={
        <button className="link" style={{ fontWeight: 600 }} disabled={!valid} onClick={save}>
          Save
        </button>
      }
    >
      <Segmented
        label="Type"
        value={type}
        onChange={setType}
        options={[
          { value: "expense", label: "Expense" },
          { value: "income", label: "Income" },
          { value: "transfer", label: "Transfer" },
        ]}
      />
      <div style={{ height: 16 }} />
      <label className="field">
        <span className="label">Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rent" maxLength={40} />
      </label>
      <div className="field">
        <label className="label" htmlFor="rec-amt">{type === "income" ? "Usual amount" : "Amount"}</label>
        <MoneyInput id="rec-amt" value={amount} onChange={setAmount} />
      </div>
      <label className="field">
        <span className="label">{type === "transfer" ? "From account" : "Account"}</span>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </label>
      {type === "transfer" ? (
        <label className="field">
          <span className="label">To account</span>
          <select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
            <option value="">Choose…</option>
            {accounts.filter((a) => a.id !== accountId).map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </label>
      ) : (
        <label className="field">
          <span className="label">Category</span>
          <select value={cats.some((c) => c.id === categoryId) ? categoryId : ""} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Choose…</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
      )}
      <label className="field">
        <span className="label">Repeats</span>
        <select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
          {(Object.keys(FREQUENCY_LABELS) as Frequency[]).map((f) => (
            <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="label">{frequency === "twiceMonthly" ? "First date" : "Start date"}</span>
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      </label>
      {frequency === "twiceMonthly" && (
        <label className="field">
          <span className="label">Other day each month</span>
          <select value={secondDay} onChange={(e) => setSecondDay(Number(e.target.value))}>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>{d === 31 ? "Last day" : d}</option>
            ))}
          </select>
        </label>
      )}
      {(frequency === "monthly" || frequency === "twiceMonthly") && (
        <p className="caption">In shorter months, days that don't exist use the month's last day.</p>
      )}
      <label className="field">
        <span className="label">End date (optional)</span>
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
      </label>
      {item && startDate === item.startDate && (
        <label className="field">
          <span className="label">Next due</span>
          <input type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} />
        </label>
      )}
      <div className="field">
        <span className="label">When it's due</span>
        <Segmented
          label="When it's due"
          value={mode}
          onChange={setMode}
          options={[
            { value: "confirm", label: "Confirm first" },
            { value: "automatic", label: "Add automatically" },
          ]}
        />
        <p className="caption">
          {mode === "confirm"
            ? "Shows on Home when due so you can check the amount. Best for paychecks and variable bills."
            : "Added on its due date, including any missed while the app was closed. Best for fixed rent and subscriptions."}
        </p>
      </div>
      {item && <Switch checked={paused} onChange={setPaused} label="Paused" />}
      {item && <p className="caption">Changes apply to future occurrences. Past transactions stay as they are.</p>}
      {error && <div className="error" role="alert">{error}</div>}
      {item && (
        <button className="btn danger block section" onClick={() => setConfirmDelete(true)}>
          Delete recurring item
        </button>
      )}
      {confirmDelete && item && (
        <Confirm
          title="Delete recurring item"
          confirmLabel="Delete"
          danger
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            await deleteRecurring(item.id);
            onClose();
          }}
        >
          <p>Stop "{item.name}"? Transactions it already added stay in your history.</p>
        </Confirm>
      )}
    </Sheet>
  );
}

// Goals

export function goalProgress(goal: Goal, saved: number, period: Period, anchors: string[], asOf: string) {
  const remaining = Math.max(0, goal.targetCents - saved);
  const pct = goal.targetCents > 0 ? saved / goal.targetCents : 0;
  let perPeriod: number | null = null;
  let late = false;
  if (goal.targetDate && remaining > 0) {
    if (goal.targetDate < asOf) late = true;
    else perPeriod = Math.ceil(remaining / periodsUntil(period, goal.targetDate, anchors));
  }
  return { remaining, pct, perPeriod, late };
}

function Goals() {
  const { data, asOf, period } = useApp();
  const [open, setOpen] = useState<Goal | "new" | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const saved = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of data.goalEntries) m.set(e.goalId, (m.get(e.goalId) ?? 0) + e.amountCents);
    return m;
  }, [data.goalEntries]);
  const active = data.goals.filter((g) => !g.archivedAt);
  const archived = data.goals.filter((g) => g.archivedAt);

  const row = (g: Goal) => {
    const s = saved.get(g.id) ?? 0;
    const p = goalProgress(g, s, period, data.settings.payScheduleAnchors, asOf);
    return (
      <li key={g.id} style={{ padding: "12px 0" }}>
        <button style={{ width: "100%", textAlign: "left" }} onClick={() => setOpen(g)}>
          <div className="row-flex" style={{ marginBottom: 6 }}>
            <span className="grow" style={{ fontWeight: 500 }}>{g.name}</span>
            <span className="nowrap">
              {formatWhole(s)} <span className="muted">of {formatWhole(g.targetCents)}</span>
            </span>
          </div>
          <ProgressBar ratio={p.pct} level="ok" label={`${g.name}: ${Math.floor(p.pct * 100)}% saved`} />
          <div className="caption" style={{ marginTop: 4 }}>
            {p.remaining === 0
              ? "Goal reached"
              : `${Math.floor(p.pct * 100)}% · ${formatCents(p.remaining)} to go`}
            {p.perPeriod !== null && ` · ${formatCents(p.perPeriod)} per pay period`}
            {p.late && " · Target date passed"}
          </div>
        </button>
      </li>
    );
  };

  return (
    <>
      {active.length === 0 ? (
        <Empty title="No savings goals">
          Set a target, like an emergency fund or a trip. Add money as you save and see how much you need each pay period.
        </Empty>
      ) : (
        <ul className="list">{active.map(row)}</ul>
      )}
      <button className="btn secondary block section" onClick={() => setOpen("new")}>
        Add goal
      </button>
      {archived.length > 0 && (
        <div className="section">
          <button className="link" onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? "Hide" : "Show"} archived goals ({archived.length})
          </button>
          {showArchived && <ul className="list">{archived.map(row)}</ul>}
        </div>
      )}
      {open === "new" && <GoalForm onClose={() => setOpen(null)} />}
      {open && open !== "new" && <GoalSheet goal={data.goals.find((g) => g.id === open.id) ?? open} saved={saved.get(open.id) ?? 0} onClose={() => setOpen(null)} />}
    </>
  );
}

function GoalForm({ goal, onClose }: { goal?: Goal; onClose: () => void }) {
  const { data } = useApp();
  const [name, setName] = useState(goal?.name ?? "");
  const [target, setTarget] = useState(goal ? centsToInput(goal.targetCents) : "");
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? "");
  const [linked, setLinked] = useState(goal?.linkedAccountId ?? "");
  const cents = parseCents(target);
  const valid = name.trim() && cents !== null && cents > 0 && (!targetDate || isValidDate(targetDate));
  return (
    <Sheet
      title={goal ? "Edit goal" : "New goal"}
      onClose={onClose}
      right={
        <button
          className="link"
          style={{ fontWeight: 600 }}
          disabled={!valid}
          onClick={async () => {
            await saveGoal({ name: name.trim(), targetCents: cents!, targetDate: targetDate || undefined, linkedAccountId: linked || undefined, archivedAt: goal?.archivedAt }, goal?.id);
            onClose();
          }}
        >
          Save
        </button>
      }
    >
      <label className="field">
        <span className="label">Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Emergency fund" maxLength={40} />
      </label>
      <div className="field">
        <label className="label" htmlFor="goal-target">Target amount</label>
        <MoneyInput id="goal-target" value={target} onChange={setTarget} />
      </div>
      <label className="field">
        <span className="label">Target date (optional)</span>
        <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
      </label>
      <label className="field">
        <span className="label">Linked account (optional)</span>
        <select value={linked} onChange={(e) => setLinked(e.target.value)}>
          <option value="">None</option>
          {data.accounts.filter((a) => !a.archivedAt && a.type !== "creditCard").map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </label>
      <p className="caption">
        Goal progress is tracked separately from account balances. When you add money, you can also record a transfer into
        the linked account.
      </p>
    </Sheet>
  );
}

function GoalSheet({ goal, saved, onClose }: { goal: Goal; saved: number; onClose: () => void }) {
  const { data, asOf, period, accountById } = useApp();
  const [mode, setMode] = useState<"view" | "add" | "withdraw" | "edit">("view");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const p = goalProgress(goal, saved, period, data.settings.payScheduleAnchors, asOf);
  const entries = data.goalEntries.filter((e) => e.goalId === goal.id).sort((a, b) => b.date.localeCompare(a.date));

  if (mode === "edit") return <GoalForm goal={goal} onClose={() => setMode("view")} />;
  if (mode === "add" || mode === "withdraw") return <GoalEntrySheet goal={goal} withdraw={mode === "withdraw"} saved={saved} onClose={() => setMode("view")} />;

  return (
    <Sheet title={goal.name} onClose={onClose} left={<button className="link" onClick={onClose}>Done</button>} right={<button className="link" onClick={() => setMode("edit")}>Edit</button>}>
      <div className="big-number">{formatCents(saved)}</div>
      <div className="muted">saved of {formatCents(goal.targetCents)}</div>
      <div style={{ margin: "16px 0" }}>
        <ProgressBar ratio={p.pct} level="ok" label={`${Math.floor(p.pct * 100)}% saved`} />
      </div>
      <div className="stat-row">
        <div>
          <div className="caption">Complete</div>
          <div className="v">{Math.floor(p.pct * 100)}%</div>
        </div>
        <div>
          <div className="caption">Remaining</div>
          <div className="v">{formatCents(p.remaining)}</div>
        </div>
        {p.perPeriod !== null && (
          <div>
            <div className="caption">Per pay period</div>
            <div className="v">{formatCents(p.perPeriod)}</div>
          </div>
        )}
      </div>
      {goal.targetDate && (
        <p className="caption">
          Target date {friendlyDate(goal.targetDate, asOf)}
          {p.late && " (passed)"}
        </p>
      )}
      {goal.linkedAccountId && <p className="caption">Linked to {accountById.get(goal.linkedAccountId)?.name}</p>}
      <div className="row-flex section">
        <button className="btn primary grow" onClick={() => setMode("add")}>Add money</button>
        <button className="btn secondary grow" onClick={() => setMode("withdraw")} disabled={saved <= 0}>Withdraw</button>
      </div>
      {entries.length > 0 && (
        <div className="section">
          <h2>History</h2>
          <ul className="list">
            {entries.map((e) => (
              <li key={e.id} className="item">
                <span className="main">
                  <div>{e.amountCents >= 0 ? "Added" : "Withdrew"}</div>
                  <div className="caption">
                    {friendlyDate(e.date, asOf)}
                    {e.transactionId && " · with transfer"}
                  </div>
                </span>
                <span className={`amt ${e.amountCents >= 0 ? "income" : ""}`}>
                  {e.amountCents >= 0 ? "+" : "−"}
                  {formatCents(Math.abs(e.amountCents))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="section stack">
        <button
          className="btn secondary block"
          onClick={async () => {
            await setArchived("goals", goal.id, !goal.archivedAt);
            onClose();
          }}
        >
          {goal.archivedAt ? "Unarchive goal" : "Archive goal"}
        </button>
        <button className="btn danger block" onClick={() => setConfirmDelete(true)}>Delete goal</button>
      </div>
      {confirmDelete && (
        <Confirm
          title="Delete goal"
          confirmLabel="Delete"
          danger
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            await deleteGoal(goal.id);
            onClose();
          }}
        >
          <p>Delete "{goal.name}" and its history? Any transfers it created stay in your transactions.</p>
        </Confirm>
      )}
    </Sheet>
  );
}

function GoalEntrySheet({ goal, withdraw, saved, onClose }: { goal: Goal; withdraw: boolean; saved: number; onClose: () => void }) {
  const { data, asOf } = useApp();
  const accounts = data.accounts.filter((a) => !a.archivedAt);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(asOf);
  const [transfer, setTransfer] = useState(!!goal.linkedAccountId);
  const other = accounts.find((a) => a.id !== goal.linkedAccountId)?.id ?? "";
  const [fromId, setFromId] = useState(withdraw ? goal.linkedAccountId ?? "" : other);
  const [toId, setToId] = useState(withdraw ? other : goal.linkedAccountId ?? "");
  const cents = parseCents(amount);
  const valid =
    cents !== null &&
    cents > 0 &&
    (!withdraw || cents <= saved) &&
    isValidDate(date) &&
    (!transfer || (fromId && toId && fromId !== toId));

  return (
    <Sheet
      title={withdraw ? "Withdraw" : "Add money"}
      onClose={onClose}
      right={
        <button
          className="link"
          style={{ fontWeight: 600 }}
          disabled={!valid}
          onClick={async () => {
            await addGoalEntry(goal.id, withdraw ? -cents! : cents!, date, transfer ? { fromAccountId: fromId, toAccountId: toId, note: `${goal.name} goal` } : undefined);
            onClose();
          }}
        >
          Save
        </button>
      }
    >
      <div className="field">
        <label className="label" htmlFor="ge-amt">Amount</label>
        <MoneyInput id="ge-amt" value={amount} onChange={setAmount} />
        {withdraw && cents !== null && cents > saved && <div className="error">That's more than the {formatCents(saved)} saved.</div>}
      </div>
      <label className="field">
        <span className="label">Date</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <Switch checked={transfer} onChange={setTransfer} label="Also record a transfer" hint="Moves the money between accounts too." />
      {transfer && (
        <div style={{ marginTop: 12 }}>
          <label className="field">
            <span className="label">From</span>
            <select value={fromId} onChange={(e) => setFromId(e.target.value)}>
              <option value="">Choose…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">To</span>
            <select value={toId} onChange={(e) => setToId(e.target.value)}>
              <option value="">Choose…</option>
              {accounts.filter((a) => a.id !== fromId).map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </label>
        </div>
      )}
      {!transfer && <p className="caption">Only the goal's progress changes. Account balances stay the same.</p>}
    </Sheet>
  );
}
