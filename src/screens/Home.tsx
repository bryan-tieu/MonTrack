import { useMemo, useState } from "react";
import { useApp } from "../state";
import { Icon, MoneyInput, ProgressBar, Sheet } from "../components/ui";
import { budgetLabel, budgetStatuses, cashSummary, inRange, isCard, totals } from "../lib/ledger";
import { daysBetween, friendlyDate, isValidDate, rangeLabel, shortDate } from "../lib/dates";
import { centsToInput, formatCents, formatWhole, parseCents } from "../lib/money";
import { resolveDue } from "../lib/actions";
import type { RecurringItem } from "../lib/types";
import { hasEnded } from "../lib/recurring";

export function needsBackupReminder(s: { lastBackupAt?: string; lastChangeAt?: string }, now = Date.now()): boolean {
  if (!s.lastChangeAt) return false;
  if (s.lastBackupAt && s.lastChangeAt <= s.lastBackupAt) return false;
  if (!s.lastBackupAt) return true;
  return now - Date.parse(s.lastBackupAt) >= 7 * 86_400_000;
}

export function Home() {
  const { data, asOf, period, balances, accountById, categoryById, openSettings, openTx, showActivity } = useApp();
  const [review, setReview] = useState<RecurringItem | null>(null);

  const accounts = data.accounts.filter((a) => !a.archivedAt);
  const { cash, owed } = cashSummary(accounts, balances);
  const periodTxns = useMemo(() => inRange(data.transactions, period, asOf), [data.transactions, period, asOf]);
  const sum = totals(periodTxns);
  const watch = budgetStatuses(data.categories, data.budgetRules, periodTxns, period.start)
    .filter((b) => b.ratio >= 0.8)
    .sort((a, b) => b.ratio - a.ratio);

  const due = data.recurring
    .filter((r) => !r.pausedAt && !hasEnded(r) && r.nextDueDate <= period.end)
    .sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate));
  const scheduled = data.transactions
    .filter((t) => t.date > asOf && t.date <= period.end)
    .sort((a, b) => a.date.localeCompare(b.date));
  const remind = needsBackupReminder(data.settings);

  return (
    <div className="screen">
      <div className="topbar">
        <h1 className="title" style={{ margin: 0, fontSize: "1.375rem" }}>Pocket Ledger</h1>
        <button className="icon-btn" onClick={openSettings} aria-label="Settings">
          <Icon name="gear" />
        </button>
      </div>

      {remind && (
        <button className="banner" style={{ width: "100%", textAlign: "left", marginTop: 8 }} onClick={openSettings}>
          <span className="grow">
            <strong>Back up your data.</strong>{" "}
            {data.settings.lastBackupAt
              ? `Last backup ${friendlyDate(data.settings.lastBackupAt.slice(0, 10), asOf)}.`
              : "You haven't saved a backup yet."}
          </span>
          <Icon name="chevron" size={16} />
        </button>
      )}

      <section style={{ marginTop: 16 }} aria-label="Balances">
        <div className="muted">Cash available</div>
        <div className="big-number">{formatCents(cash)}</div>
        {accounts.some(isCard) && (
          <div className="muted" style={{ marginTop: 4 }}>
            Owed on cards <span style={{ color: "var(--text)" }}>{formatCents(owed)}</span>
          </div>
        )}
      </section>

      <section className="section" aria-label="This pay period">
        <div className="section-head">
          <h2>{rangeLabel(period.start, period.end)}</h2>
          <span className="caption">{daysBetween(asOf, period.end) === 0 ? "Last day" : `${daysBetween(asOf, period.end)} days left`}</span>
        </div>
        <button className="stat-row" style={{ width: "100%", textAlign: "left" }} onClick={() => showActivity({ start: period.start, end: period.end })}>
          <div>
            <div className="caption">In</div>
            <div className="v income">{formatWhole(sum.income)}</div>
          </div>
          <div>
            <div className="caption">Out</div>
            <div className="v">{formatWhole(sum.spending)}</div>
          </div>
          <div>
            <div className="caption">Net</div>
            <div className="v">{(sum.net >= 0 ? "+" : "−") + formatWhole(Math.abs(sum.net))}</div>
          </div>
        </button>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Accounts</h2>
        </div>
        <ul className="list">
          {accounts.map((a) => (
            <li key={a.id}>
              <button className="item" onClick={() => showActivity({ accountId: a.id })}>
                <span className="main">{a.name}</span>
                <span className="amt">
                  {formatCents(balances.get(a.id) ?? 0)}
                  {isCard(a) && <span className="muted"> owed</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {(due.length > 0 || scheduled.length > 0) && (
        <section className="section">
          <div className="section-head">
            <h2>Due before next payday</h2>
          </div>
          <ul className="list">
            {due.map((r) => (
              <li key={r.id} className="item">
                <span className="main">
                  <div>{r.name}</div>
                  <div className={`caption ${r.nextDueDate < asOf ? "warn" : ""}`}>
                    {r.nextDueDate < asOf ? `Overdue since ${shortDate(r.nextDueDate)}` : friendlyDate(r.nextDueDate, asOf)}
                    {r.mode === "automatic" && " · Adds automatically"}
                  </div>
                </span>
                <span className={`amt ${r.type === "income" ? "income" : ""}`}>{formatCents(r.amountCents)}</span>
                {r.mode === "confirm" && r.nextDueDate <= asOf && (
                  <button className="btn secondary" style={{ minHeight: 36, padding: "0 12px" }} onClick={() => setReview(r)}>
                    Review
                  </button>
                )}
              </li>
            ))}
            {scheduled.map((t) => (
              <li key={t.id}>
                <button className="item" onClick={() => openTx(t)}>
                  <span className="main">
                    <div>{t.note || (t.categoryId ? categoryById.get(t.categoryId)?.name : "Transfer")}</div>
                    <div className="caption">
                      {friendlyDate(t.date, asOf)} · Scheduled · {accountById.get(t.accountId)?.name}
                    </div>
                  </span>
                  <span className={`amt ${t.type === "income" ? "income" : ""}`}>{formatCents(t.amountCents)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {watch.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>Budgets to watch</h2>
          </div>
          <ul className="list">
            {watch.map((b) => (
              <li key={b.category.id}>
                <button className="item" style={{ display: "block" }} onClick={() => showActivity({ start: period.start, end: period.end, categoryId: b.category.id, type: "expense" })}>
                  <div className="row-flex" style={{ marginBottom: 6 }}>
                    <span className="grow">{b.category.name}</span>
                    <span className="nowrap">
                      {formatWhole(b.spent)} <span className="muted">of {formatWhole(b.limit)}</span>
                    </span>
                  </div>
                  <ProgressBar ratio={b.ratio} level={b.level} label={`${b.category.name}: ${budgetLabel(b, formatCents)}`} />
                  <div className={`caption ${b.level === "over" ? "over" : b.level === "warn" ? "warn" : ""}`} style={{ marginTop: 4 }}>
                    {budgetLabel(b, formatCents)}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.transactions.length === 0 && (
        <div className="notice section">
          Tap <strong>+</strong> below to add your first transaction. It takes a few seconds.
        </div>
      )}

      {review && <ReviewDue item={review} onClose={() => setReview(null)} />}
    </div>
  );
}

function ReviewDue({ item, onClose }: { item: RecurringItem; onClose: () => void }) {
  const { data, accountById, categoryById, asOf } = useApp();
  const [amount, setAmount] = useState(centsToInput(item.amountCents));
  const [date, setDate] = useState(item.nextDueDate);
  const [accountId, setAccountId] = useState(item.accountId);
  const [busy, setBusy] = useState(false);
  const cents = parseCents(amount);
  const ok = cents !== null && cents > 0 && isValidDate(date);

  const detail =
    item.type === "transfer"
      ? `Transfer to ${accountById.get(item.toAccountId ?? "")?.name ?? "?"}`
      : categoryById.get(item.categoryId ?? "")?.name;

  return (
    <Sheet
      title={item.name}
      onClose={onClose}
      right={
        <button
          className="link"
          style={{ fontWeight: 600 }}
          disabled={!ok || busy}
          onClick={async () => {
            setBusy(true);
            await resolveDue(item.id, item.nextDueDate, { save: { amountCents: cents!, date, accountId } });
            onClose();
          }}
        >
          Save
        </button>
      }
    >
      <p className="muted">
        Due {friendlyDate(item.nextDueDate, asOf)} · {detail}. Adjust the amount if it's different this time.
      </p>
      <div className="field">
        <label className="label" htmlFor="due-amt">Amount</label>
        <MoneyInput id="due-amt" value={amount} onChange={setAmount} />
      </div>
      <label className="field">
        <span className="label">Date</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="field">
        <span className="label">{item.type === "transfer" ? "From account" : "Account"}</span>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {data.accounts
            .filter((a) => !a.archivedAt || a.id === accountId)
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
        </select>
      </label>
      <button
        className="btn secondary block section"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await resolveDue(item.id, item.nextDueDate, "skip");
          onClose();
        }}
      >
        Skip this one
      </button>
      <p className="caption center">Skipping moves {item.name} to its next date without adding anything.</p>
    </Sheet>
  );
}
