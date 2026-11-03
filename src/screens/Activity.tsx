import { useMemo, useRef, useState } from "react";
import { useApp, type ActivityFilter } from "../state";
import { Icon, PickerSheet, Sheet } from "../components/ui";
import { deleteTransaction } from "../lib/actions";
import { dayHeading, rangeLabel, shortDate, monthStart, monthEnd } from "../lib/dates";
import { centsToInput, formatCents } from "../lib/money";
import { incomeOf, isScheduled, spendingOf } from "../lib/ledger";
import { previousPeriod } from "../lib/periods";
import type { Transaction } from "../lib/types";

const PAGE = 150;

export function Activity() {
  const { data, asOf, period, accountById, categoryById, activityFilter: f, setActivityFilter, openTx, toast } = useApp();
  const [picker, setPicker] = useState<"date" | "type" | "account" | "category" | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const set = (patch: Partial<ActivityFilter>) => {
    setActivityFilter({ ...f, ...patch });
    setLimit(PAGE);
  };

  const results = useMemo(() => {
    const q = (f.query ?? "").trim().toLowerCase();
    return data.transactions
      .filter((t) => {
        if (f.start && t.date < f.start) return false;
        if (f.end && t.date > f.end) return false;
        if (f.type && t.type !== f.type) return false;
        if (f.accountId && t.accountId !== f.accountId && t.toAccountId !== f.accountId) return false;
        if (f.categoryId && t.categoryId !== f.categoryId) return false;
        if (!q) return true;
        const hay = [
          t.note,
          t.categoryId && categoryById.get(t.categoryId)?.name,
          accountById.get(t.accountId)?.name,
          t.toAccountId && accountById.get(t.toAccountId)?.name,
          centsToInput(t.amountCents),
          formatCents(t.amountCents),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q.replace(/^\$/, ""));
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }, [data.transactions, f, accountById, categoryById]);

  const sums = useMemo(() => {
    let income = 0;
    let spending = 0;
    for (const t of results) {
      if (isScheduled(t, asOf)) continue;
      income += incomeOf(t);
      spending += spendingOf(t);
    }
    return { income, spending, net: income - spending };
  }, [results, asOf]);

  const groups = useMemo(() => {
    const out: { date: string; items: Transaction[] }[] = [];
    for (const t of results.slice(0, limit)) {
      const last = out[out.length - 1];
      if (last && last.date === t.date) last.items.push(t);
      else out.push({ date: t.date, items: [t] });
    }
    return out;
  }, [results, limit]);

  const filtered = !!(f.start || f.end || f.type || f.accountId || f.categoryId || f.query);
  const dateLabel = f.start && f.end ? rangeLabel(f.start, f.end) : f.start ? `From ${shortDate(f.start)}` : f.end ? `Until ${shortDate(f.end)}` : "Dates";
  const typeLabel = f.type ? { expense: "Expenses", income: "Income", transfer: "Transfers" }[f.type] : "Type";

  async function remove(t: Transaction) {
    const undo = await deleteTransaction(t.id);
    toast("Transaction deleted", undo);
  }

  return (
    <div className="screen">
      <div className="search">
        <h1 className="title" style={{ marginBottom: 8 }}>Activity</h1>
        <div style={{ position: "relative" }}>
          <span className="muted" style={{ position: "absolute", left: 12, top: 11 }}>
            <Icon name="search" size={20} />
          </span>
          <input
            type="search"
            placeholder="Search note, category, account, amount"
            aria-label="Search transactions"
            value={f.query ?? ""}
            onChange={(e) => set({ query: e.target.value })}
            style={{ paddingLeft: 40 }}
            enterKeyHint="search"
          />
        </div>
        <div className="chips" role="group" aria-label="Filters">
          <Chip on={!!(f.start || f.end)} label={dateLabel} onClick={() => setPicker("date")} onClear={() => set({ start: undefined, end: undefined })} />
          <Chip on={!!f.type} label={typeLabel} onClick={() => setPicker("type")} onClear={() => set({ type: undefined })} />
          <Chip
            on={!!f.accountId}
            label={f.accountId ? accountById.get(f.accountId)?.name ?? "Account" : "Account"}
            onClick={() => setPicker("account")}
            onClear={() => set({ accountId: undefined })}
          />
          <Chip
            on={!!f.categoryId}
            label={f.categoryId ? categoryById.get(f.categoryId)?.name ?? "Category" : "Category"}
            onClick={() => setPicker("category")}
            onClear={() => set({ categoryId: undefined })}
          />
          {filtered && (
            <button className="chip" onClick={() => { setActivityFilter({}); setLimit(PAGE); }}>
              Clear all
            </button>
          )}
        </div>
        <div className="stat-row caption" style={{ padding: "4px 0 8px", borderBottom: "1px solid var(--divider)" }} aria-live="polite">
          <span>
            In <span className="income">{formatCents(sums.income)}</span>
          </span>
          <span>
            Out <span style={{ color: "var(--text)" }}>{formatCents(sums.spending)}</span>
          </span>
          <span>
            Net <span style={{ color: "var(--text)" }}>{(sums.net < 0 ? "−" : "+") + formatCents(Math.abs(sums.net))}</span>
          </span>
        </div>
      </div>

      {results.length === 0 &&
        (data.transactions.length === 0 ? (
          <div className="empty">
            <h3>No transactions yet</h3>
            <div>Everything you add with + shows up here, newest first.</div>
          </div>
        ) : (
          <div className="empty">
            <h3>No matches</h3>
            <div>Try a different search or clear the filters.</div>
          </div>
        ))}

      {groups.map((g) => (
        <section key={g.date} aria-label={dayHeading(g.date, asOf)}>
          <div className="day-head">{dayHeading(g.date, asOf)}</div>
          <ul className="list">
            {g.items.map((t) => (
              <li key={t.id}>
                <SwipeRow onDelete={() => remove(t)} onOpen={() => openTx(t)}>
                  <TxRow t={t} />
                </SwipeRow>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {results.length > limit && (
        <button className="btn secondary block section" onClick={() => setLimit(limit + PAGE)}>
          Show more
        </button>
      )}

      {picker === "date" && (
        <DateRangeSheet
          value={f}
          presets={[
            { label: "This pay period", start: period.start, end: period.end },
            (() => {
              const p = previousPeriod(period, data.settings.payScheduleAnchors);
              return { label: "Last pay period", start: p.start, end: p.end };
            })(),
            { label: "This month", start: monthStart(asOf), end: monthEnd(asOf) },
          ]}
          onApply={(start, end) => set({ start, end })}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === "type" && (
        <PickerSheet
          title="Type"
          value={f.type ?? ""}
          options={[
            { value: "", label: "All types" },
            { value: "expense", label: "Expenses" },
            { value: "income", label: "Income" },
            { value: "transfer", label: "Transfers" },
          ]}
          onPick={(v) => set({ type: (v || undefined) as ActivityFilter["type"] })}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === "account" && (
        <PickerSheet
          title="Account"
          value={f.accountId ?? ""}
          options={[{ value: "", label: "All accounts" }, ...data.accounts.map((a) => ({ value: a.id, label: a.name, hint: a.archivedAt ? "Archived" : undefined }))]}
          onPick={(v) => set({ accountId: v || undefined })}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === "category" && (
        <PickerSheet
          title="Category"
          value={f.categoryId ?? ""}
          options={[
            { value: "", label: "All categories" },
            ...data.categories
              .filter((c) => c.kind === "expense")
              .map((c) => ({ value: c.id, label: c.name, group: "Spending", hint: c.archivedAt ? "Archived" : undefined })),
            ...data.categories
              .filter((c) => c.kind === "income")
              .map((c) => ({ value: c.id, label: c.name, group: "Income", hint: c.archivedAt ? "Archived" : undefined })),
          ]}
          onPick={(v) => set({ categoryId: v || undefined })}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}

function Chip(props: { on: boolean; label: string; onClick: () => void; onClear: () => void }) {
  return (
    <span className={`chip ${props.on ? "on" : ""}`} style={{ padding: 0 }}>
      <button onClick={props.onClick} style={{ padding: "0 4px 0 12px", minHeight: 32 }}>
        {props.label}
      </button>
      {props.on ? (
        <button onClick={props.onClear} aria-label={`Clear ${props.label} filter`} style={{ padding: "0 10px 0 4px", minHeight: 32, display: "flex" }}>
          <Icon name="close" size={14} />
        </button>
      ) : (
        <span style={{ paddingRight: 10, display: "flex" }} aria-hidden="true">
          <Icon name="down" size={14} />
        </span>
      )}
    </span>
  );
}

export function TxRow({ t }: { t: Transaction }) {
  const { accountById, categoryById, asOf } = useApp();
  const scheduled = isScheduled(t, asOf);
  const account = accountById.get(t.accountId)?.name ?? "Unknown account";
  const title = t.type === "transfer" ? "Transfer" : categoryById.get(t.categoryId ?? "")?.name ?? "Uncategorized";
  const where = t.type === "transfer" ? `${account} → ${accountById.get(t.toAccountId ?? "")?.name ?? "?"}` : account;
  const positive = t.type === "income" || (t.type === "expense" && t.isRefund);
  return (
    <div className="item">
      <span className="main">
        <div>
          {title}
          {t.isRefund && <span className="tag" style={{ marginLeft: 6 }}>Refund</span>}
          {scheduled && <span className="tag accent" style={{ marginLeft: 6 }}>Scheduled</span>}
        </div>
        <div className="caption">{[t.note, where].filter(Boolean).join(" · ")}</div>
      </span>
      <span className={`amt ${positive ? "income" : t.type === "transfer" ? "muted" : ""}`}>
        {positive ? "+" : ""}
        {formatCents(t.amountCents)}
      </span>
    </div>
  );
}

/** Swipe left to reveal Delete; tap to open. */
function SwipeRow(props: { children: React.ReactNode; onDelete: () => void; onOpen: () => void }) {
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; base: number; locked?: "h" | "v" } | null>(null);
  const moved = useRef(false);
  const open = x <= -88;

  return (
    <div className="swipe">
      <button className="del" onClick={props.onDelete} tabIndex={open ? 0 : -1} aria-hidden={!open}>
        Delete
      </button>
      <div
        className={`front ${dragging ? "dragging" : ""}`}
        style={{ transform: `translateX(${x}px)` }}
        onTouchStart={(e) => {
          start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, base: x };
          moved.current = false;
        }}
        onTouchMove={(e) => {
          const s = start.current;
          if (!s) return;
          const dx = e.touches[0].clientX - s.x;
          const dy = e.touches[0].clientY - s.y;
          if (!s.locked && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) s.locked = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
          if (s.locked !== "h") return;
          moved.current = true;
          setDragging(true);
          setX(Math.max(-120, Math.min(0, s.base + dx)));
        }}
        onTouchEnd={() => {
          setDragging(false);
          if (start.current?.locked === "h") setX(x < -44 ? -88 : 0);
          start.current = null;
        }}
      >
        <button
          style={{ width: "100%", textAlign: "left", display: "block" }}
          onClick={() => {
            if (moved.current) return;
            if (x !== 0) return setX(0);
            props.onOpen();
          }}
        >
          {props.children}
        </button>
      </div>
    </div>
  );
}

function DateRangeSheet(props: {
  value: ActivityFilter;
  presets: { label: string; start: string; end: string }[];
  onApply: (start?: string, end?: string) => void;
  onClose: () => void;
}) {
  const [start, setStart] = useState(props.value.start ?? "");
  const [end, setEnd] = useState(props.value.end ?? "");
  return (
    <Sheet
      title="Dates"
      onClose={props.onClose}
      right={
        <button
          className="link"
          style={{ fontWeight: 600 }}
          disabled={!!start && !!end && start > end}
          onClick={() => {
            props.onApply(start || undefined, end || undefined);
            props.onClose();
          }}
        >
          Apply
        </button>
      }
    >
      <ul className="list">
        {props.presets.map((p) => (
          <li key={p.label}>
            <button
              className="item"
              onClick={() => {
                props.onApply(p.start, p.end);
                props.onClose();
              }}
            >
              <span className="main">{p.label}</span>
              <span className="muted">{rangeLabel(p.start, p.end)}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="section">
        <label className="field">
          <span className="label">From</span>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="field">
          <span className="label">To</span>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
    </Sheet>
  );
}
