import { useId, useState } from "react";
import { MoneyInput } from "./ui";
import type { Account, AccountType } from "../lib/types";
import { centsToInput, parseCents } from "../lib/money";

export const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: "checking", label: "Checking" },
  { value: "savings", label: "Savings" },
  { value: "cash", label: "Cash" },
  { value: "creditCard", label: "Credit Card" },
  { value: "other", label: "Other" },
];

export type AccountDraft = Pick<Account, "name" | "type" | "startingBalanceCents">;

export function AccountForm(props: {
  initial?: AccountDraft;
  submitLabel: string;
  onSubmit: (a: AccountDraft) => void | Promise<void>;
  balanceHint?: string;
}) {
  const id = useId();
  const [name, setName] = useState(props.initial?.name ?? "");
  const [type, setType] = useState<AccountType>(props.initial?.type ?? "checking");
  const [balance, setBalance] = useState(props.initial ? centsToInput(props.initial.startingBalanceCents) : "");
  const [error, setError] = useState("");
  const cents = balance === "" ? 0 : parseCents(balance);
  const card = type === "creditCard";

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return setError("Give the account a name.");
        if (cents === null) return setError("Enter a valid amount.");
        try {
          await props.onSubmit({ name: name.trim(), type, startingBalanceCents: cents });
        } catch (err) {
          setError((err as Error).message);
        }
      }}
    >
      <label className="field">
        <span className="label">Name</span>
        <input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Checking" maxLength={40} />
      </label>
      <label className="field">
        <span className="label">Type</span>
        <select value={type} onChange={(e) => setType(e.target.value as AccountType)}>
          {ACCOUNT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <div className="field">
        <label className="label" htmlFor={`${id}-bal`}>
          {card ? "Amount owed" : "Current balance"}
        </label>
        <MoneyInput id={`${id}-bal`} value={balance} onChange={setBalance} allowNegative />
        <div className="caption" style={{ marginTop: 6 }}>
          {props.balanceHint ??
            (card ? "What you owe on the card today." : "The balance today. Transactions you add will adjust it.")}
        </div>
      </div>
      {error && <div className="error" role="alert">{error}</div>}
      <button className="btn primary block" type="submit">
        {props.submitLabel}
      </button>
    </form>
  );
}
