import { useMemo, useState } from "react";
import { useApp, type TxDraft } from "../state";
import { Icon, PickerSheet, Segmented, Sheet, Switch, type Option } from "../components/ui";
import { deleteTransaction, saveTransaction } from "../lib/actions";
import { addDays, friendlyDate, isValidDate } from "../lib/dates";
import { centsToInput, formatCents, parseCents } from "../lib/money";
import type { Account, Category, TxType } from "../lib/types";

const MAX_DIGITS = 9;

function amountDisplay(s: string): string {
  if (!s) return "$0";
  const [whole, frac] = s.split(".");
  const w = Number(whole || "0").toLocaleString("en-US");
  return `$${w}${frac !== undefined ? "." + frac : ""}`;
}

export function accountOptions(accounts: Account[], balances: Map<string, number>, fmt: (c: number) => string, exclude?: string): Option[] {
  return accounts
    .filter((a) => !a.archivedAt && a.id !== exclude)
    .map((a) => ({
      value: a.id,
      label: a.name,
      hint: a.type === "creditCard" ? `${fmt(balances.get(a.id) ?? 0)} owed` : fmt(balances.get(a.id) ?? 0),
    }));
}

export function TxSheet({ draft, onClose }: { draft: TxDraft; onClose: () => void }) {
  const { data, asOf, balances, accountById, categoryById, toast } = useApp();
  const editing = !!draft.id;
  const activeAccounts = data.accounts.filter((a) => !a.archivedAt);
  const defaultAccount =
    draft.accountId ??
    (data.settings.lastAccountId && accountById.get(data.settings.lastAccountId) && !accountById.get(data.settings.lastAccountId)!.archivedAt
      ? data.settings.lastAccountId
      : activeAccounts[0]?.id);

  const [type, setType] = useState<TxType>(draft.type ?? "expense");
  const [amount, setAmount] = useState(draft.amountCents ? centsToInput(draft.amountCents).replace(/\.00$/, "") : "");
  const [accountId, setAccountId] = useState(defaultAccount ?? "");
  const [toAccountId, setToAccountId] = useState(draft.toAccountId ?? "");
  const [categoryId, setCategoryId] = useState(draft.categoryId ?? "");
  const [date, setDate] = useState(draft.date ?? asOf);
  const [note, setNote] = useState(draft.note ?? "");
  const [isRefund, setIsRefund] = useState(!!draft.isRefund);
  const [picker, setPicker] = useState<"category" | "account" | "to" | null>(null);
  const [noteFocused, setNoteFocused] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const cents = parseCents(amount || "0") ?? 0;
  const kind = type === "income" ? "income" : "expense";
  const category = categoryById.get(categoryId);
  const categoryValid = type === "transfer" || (category && category.kind === kind);
  const valid =
    cents > 0 &&
    !!accountId &&
    isValidDate(date) &&
    categoryValid &&
    (type !== "transfer" || (!!toAccountId && toAccountId !== accountId));

  // Frequently used categories (last 90 days) first, then everything in its usual order.
  const categoryOptions = useMemo(() => {
    const since = addDays(asOf, -90);
    const counts = new Map<string, number>();
    for (const t of data.transactions) {
      if (t.categoryId && t.date >= since) counts.set(t.categoryId, (counts.get(t.categoryId) ?? 0) + 1);
    }
    const all = data.categories.filter((c) => c.kind === kind && (!c.archivedAt || c.id === categoryId));
    const frequent = [...all]
      .filter((c) => counts.has(c.id))
      .sort((a, b) => counts.get(b.id)! - counts.get(a.id)!)
      .slice(0, 5);
    const toOpt = (c: Category, group: string): Option => ({ value: c.id, label: c.name, group });
    return [...frequent.map((c) => toOpt(c, "Frequent")), ...all.map((c) => toOpt(c, frequent.length ? "All" : ""))];
  }, [data.transactions, data.categories, kind, asOf, categoryId]);

  const press = (k: string) => {
    setError("");
    if (k === "back") return setAmount(amount.slice(0, -1));
    if (k === ".") {
      if (amount.includes(".")) return;
      return setAmount((amount || "0") + ".");
    }
    const [whole, frac] = amount.split(".");
    if (frac !== undefined && frac.length >= 2) return;
    if (frac === undefined && whole.replace(/^0+/, "").length >= MAX_DIGITS) return;
    if (amount === "0") return setAmount(k);
    setAmount(amount + k);
  };

  async function save() {
    if (!valid) return;
    setSaving(true);
    try {
      await saveTransaction(
        {
          type,
          amountCents: cents,
          date,
          accountId,
          toAccountId: type === "transfer" ? toAccountId : undefined,
          categoryId: type === "transfer" ? undefined : categoryId,
          note,
          isRefund: type === "expense" ? isRefund : undefined,
          recurringItemId: draft.recurringItemId,
        },
        draft.id,
      );
      onClose();
    } catch (e) {
      setError(`Not saved. ${(e as Error).message}`);
      setSaving(false);
    }
  }

  const fmt = formatCents;
  const acc = accountById.get(accountId);
  const to = accountById.get(toAccountId);

  return (
    <Sheet
      title={editing ? "Edit" : "Add"}
      onClose={onClose}
      right={
        <button className="link" style={{ fontWeight: 600 }} disabled={!valid || saving} onClick={save}>
          Save
        </button>
      }
      flush
    >
      <div style={{ flex: 1, overflowY: "auto", padding: "12px var(--pad)" }}>
        <Segmented
          label="Transaction type"
          value={type}
          onChange={(t) => {
            setType(t);
            if (t !== "transfer" && category && category.kind !== (t === "income" ? "income" : "expense")) setCategoryId("");
          }}
          options={[
            { value: "expense", label: "Expense" },
            { value: "income", label: "Income" },
            { value: "transfer", label: "Transfer" },
          ]}
        />
        <div className={`amount-display ${type === "income" ? "income" : ""}`} aria-live="polite" aria-label={`Amount ${amountDisplay(amount)}`}>
          {type === "expense" && isRefund ? "+" : ""}
          {amountDisplay(amount)}
        </div>
        <div className="form-rows">
          {type !== "transfer" && (
            <button className="form-row" onClick={() => setPicker("category")}>
              <span>Category</span>
              <span className="value">
                {category?.name ?? <span className="accent">Choose</span>}
                <Icon name="chevron" size={16} />
              </span>
            </button>
          )}
          <button className="form-row" onClick={() => setPicker("account")}>
            <span>{type === "transfer" ? "From" : "Account"}</span>
            <span className="value">
              {acc?.name ?? <span className="accent">Choose</span>}
              <Icon name="chevron" size={16} />
            </span>
          </button>
          {type === "transfer" && (
            <button className="form-row" onClick={() => setPicker("to")}>
              <span>To</span>
              <span className="value">
                {to?.name ?? <span className="accent">Choose</span>}
                <Icon name="chevron" size={16} />
              </span>
            </button>
          )}
          <label className="form-row">
            <span>Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              aria-label={`Date, ${friendlyDate(date, asOf)}`}
            />
          </label>
          <label className="form-row">
            <span>Note</span>
            <input
              value={note}
              placeholder="Optional"
              maxLength={120}
              onFocus={() => setNoteFocused(true)}
              onBlur={() => setNoteFocused(false)}
              onChange={(e) => setNote(e.target.value)}
              enterKeyHint="done"
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
          </label>
          {type === "expense" && (
            <div className="form-row">
              <Switch
                checked={isRefund}
                onChange={setIsRefund}
                label="Refund"
                hint="Money back. Lowers spending, isn't income."
              />
            </div>
          )}
        </div>
        {date > asOf && <p className="caption">Scheduled. It won't affect balances until {friendlyDate(date, asOf)}.</p>}
        {type === "transfer" && to?.type === "creditCard" && (
          <p className="caption">A card payment. It lowers both balances and isn't counted as spending again.</p>
        )}
        {error && <div className="error" role="alert">{error}</div>}
        {editing && (
          <button
            className="btn danger block section"
            onClick={async () => {
              const undo = await deleteTransaction(draft.id!);
              onClose();
              toast("Transaction deleted", undo);
            }}
          >
            Delete transaction
          </button>
        )}
      </div>
      {!noteFocused && (
        <div className="keypad" role="group" aria-label="Amount keypad">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0"].map((k) => (
            <button key={k} onClick={() => press(k)} aria-label={k === "." ? "Decimal point" : k}>
              {k}
            </button>
          ))}
          <button onClick={() => press("back")} aria-label="Delete digit">
            <Icon name="backspace" size={26} />
          </button>
        </div>
      )}

      {picker === "category" && (
        <PickerSheet
          title="Category"
          options={categoryOptions}
          value={categoryId}
          onPick={setCategoryId}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === "account" && (
        <PickerSheet
          title={type === "transfer" ? "From account" : "Account"}
          options={accountOptions(data.accounts, balances, fmt)}
          value={accountId}
          onPick={(v) => {
            setAccountId(v);
            if (v === toAccountId) setToAccountId("");
          }}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === "to" && (
        <PickerSheet
          title="To account"
          options={accountOptions(data.accounts, balances, fmt, accountId)}
          value={toAccountId}
          onPick={setToAccountId}
          onClose={() => setPicker(null)}
        />
      )}
    </Sheet>
  );
}
