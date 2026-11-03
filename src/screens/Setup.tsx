import { useState } from "react";
import { PinPad } from "../components/PinPad";
import { AccountForm, ACCOUNT_TYPES, type AccountDraft } from "../components/AccountForm";
import { RestoreButton } from "../components/RestorePicker";
import { MoneyInput } from "../components/ui";
import { createPinHash } from "../lib/pin";
import { db, newId, SCHEMA_VERSION } from "../lib/db";
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from "../lib/actions";
import { addDays, isValidDate, today } from "../lib/dates";
import { formatCents, parseCents } from "../lib/money";
import type { Category, RecurringItem } from "../lib/types";
import { nextOccurrence } from "../lib/recurring";

type Step = "welcome" | "pin" | "confirm" | "payday" | "accounts" | "categories" | "paycheck";

export function Setup({ onFinished }: { onFinished: () => void }) {
  const [step, setStep] = useState<Step>("welcome");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [pinError, setPinError] = useState("");
  const [payday, setPayday] = useState(today());
  const [accounts, setAccounts] = useState<(AccountDraft & { key: string })[]>([]);
  const [adding, setAdding] = useState(true);
  const [payAmount, setPayAmount] = useState("");
  const [payAccount, setPayAccount] = useState(0);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function finish(withPaycheck: boolean) {
    setSaving(true);
    setError("");
    try {
      const hash = await createPinHash(pin);
      const accountRows = accounts.map((a, i) => ({ ...a, id: newId(), sortOrder: i, key: undefined }));
      const categories: Category[] = [
        ...DEFAULT_EXPENSE_CATEGORIES.map((name, i) => ({ id: newId(), name, kind: "expense" as const, sortOrder: i })),
        ...DEFAULT_INCOME_CATEGORIES.map((name, i) => ({ id: newId(), name, kind: "income" as const, sortOrder: i })),
      ];
      const recurring: RecurringItem[] = [];
      const payCents = parseCents(payAmount);
      if (withPaycheck && payCents && payCents > 0) {
        const item: RecurringItem = {
          id: newId(),
          name: "Paycheck",
          type: "income",
          amountCents: payCents,
          accountId: accountRows[payAccount].id,
          categoryId: categories.find((c) => c.kind === "income" && c.name === "Paycheck")!.id,
          frequency: "biweekly",
          startDate: payday,
          nextDueDate: payday,
          mode: "confirm",
        };
        // The setup payday is in the past or today; start with the next one so it isn't double counted
        // with the opening balance.
        let next = payday;
        while (next <= today()) next = nextOccurrence(item, next);
        item.nextDueDate = next;
        recurring.push(item);
      }
      await db.transaction("rw", db.tables, async () => {
        await Promise.all(db.tables.map((t) => t.clear()));
        await db.accounts.bulkAdd(accountRows.map(({ key: _k, ...a }) => a));
        await db.categories.bulkAdd(categories);
        await db.recurring.bulkAdd(recurring);
        await db.settings.put({
          id: "settings",
          ...hash,
          payScheduleAnchors: [payday],
          appearance: "system",
          autoLockSeconds: 60,
          failedPinAttempts: 0,
          lastAccountId: accountRows[0].id,
          setupComplete: true,
          schemaVersion: SCHEMA_VERSION,
          lastChangeAt: new Date().toISOString(),
        });
      });
      onFinished();
    } catch (e) {
      setError(`Couldn't save. ${(e as Error).message}`);
      setSaving(false);
    }
  }

  if (step === "pin")
    return (
      <PinPad
        title="Create a PIN"
        subtitle="6 digits. You'll enter it each time you open the app."
        value={pin}
        onChange={setPin}
        onComplete={() => setTimeout(() => setStep("confirm"), 150)}
        cancel={{ label: "Back", onClick: () => { setPin(""); setStep("welcome"); } }}
      />
    );

  if (step === "confirm")
    return (
      <PinPad
        title="Confirm your PIN"
        value={pin2}
        error={pinError}
        onChange={(v) => {
          setPin2(v);
          if (v) setPinError("");
        }}
        onComplete={(v) => {
          if (v === pin) setStep("payday");
          else {
            setPinError("PINs didn't match. Start again.");
            setPin2("");
            setPin("");
            setTimeout(() => setStep("pin"), 900);
          }
        }}
        cancel={{ label: "Back", onClick: () => { setPin(""); setPin2(""); setStep("pin"); } }}
      />
    );

  return (
    <main className="screen no-tabs" style={{ paddingTop: "calc(var(--safe-top) + 32px)" }}>
      {step === "welcome" && (
        <>
          <img className="app-icon" src="/apple-touch-icon.png" alt="" />
          <h1 className="title">Pocket Ledger</h1>
          <p>Track what comes in and goes out, by pay period. Everything stays on this phone.</p>
          <div className="section stack">
            <button className="btn primary block" onClick={() => setStep("pin")}>
              Get started
            </button>
            <RestoreButton replacing={false} />
          </div>
          <p className="caption section">
            Data lives only on this phone. Deleting the app from your Home Screen erases it, so you'll be reminded to save
            backups to Files.
          </p>
        </>
      )}

      {step === "payday" && (
        <>
          <h1 className="title">When were you last paid?</h1>
          <p className="muted">
            Budgets and summaries follow 14-day pay periods starting on payday. Pick a recent payday.
          </p>
          <label className="field section">
            <span className="label">Recent payday</span>
            <input type="date" value={payday} max={addDays(today(), 13)} onChange={(e) => setPayday(e.target.value)} />
          </label>
          {isValidDate(payday) && (
            <p className="caption">
              The current period runs every 14 days from this date. You can change the schedule later in Settings.
            </p>
          )}
          <button className="btn primary block section" disabled={!isValidDate(payday)} onClick={() => setStep("accounts")}>
            Continue
          </button>
        </>
      )}

      {step === "accounts" && (
        <>
          <h1 className="title">Add your accounts</h1>
          <p className="muted">Add at least one. For a credit card, enter the amount you owe.</p>
          {accounts.length > 0 && (
            <ul className="list card section">
              {accounts.map((a) => (
                <li key={a.key} className="item">
                  <span className="main">
                    <div>{a.name}</div>
                    <div className="caption">{ACCOUNT_TYPES.find((t) => t.value === a.type)?.label}</div>
                  </span>
                  <span className="amt">
                    {formatCents(a.startingBalanceCents)}
                    {a.type === "creditCard" ? " owed" : ""}
                  </span>
                  <button
                    className="link danger"
                    onClick={() => setAccounts(accounts.filter((x) => x.key !== a.key))}
                    aria-label={`Remove ${a.name}`}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="section">
            {adding ? (
              <AccountForm
                key={accounts.length}
                submitLabel="Add account"
                onSubmit={(a) => {
                  setAccounts([...accounts, { ...a, key: newId() }]);
                  setAdding(false);
                }}
              />
            ) : (
              <div className="stack">
                <button className="btn secondary block" onClick={() => setAdding(true)}>
                  Add another account
                </button>
                <button className="btn primary block" onClick={() => setStep("categories")}>
                  Continue
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {step === "categories" && (
        <>
          <h1 className="title">Categories</h1>
          <p className="muted">These are ready to use. You can add, rename, reorder, or archive them later in Settings.</p>
          <h2 className="section">Spending</h2>
          <p>{DEFAULT_EXPENSE_CATEGORIES.join(", ")}</p>
          <h2 className="section">Income</h2>
          <p>{DEFAULT_INCOME_CATEGORIES.join(", ")}</p>
          <button className="btn primary block section" onClick={() => setStep("paycheck")}>
            Looks good
          </button>
        </>
      )}

      {step === "paycheck" && (
        <>
          <h1 className="title">Add your paycheck?</h1>
          <p className="muted">
            Optional. Your paycheck will appear on Home each payday so you can confirm the take-home amount. Add bills
            later in Plan › Recurring.
          </p>
          <div className="field section">
            <label className="label" htmlFor="pay-amt">Usual take-home pay</label>
            <MoneyInput id="pay-amt" value={payAmount} onChange={setPayAmount} />
          </div>
          <label className="field">
            <span className="label">Deposited to</span>
            <select value={payAccount} onChange={(e) => setPayAccount(Number(e.target.value))}>
              {accounts.map((a, i) => (
                <option key={a.key} value={i}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          {error && <div className="error" role="alert">{error}</div>}
          <div className="stack section">
            <button className="btn primary block" disabled={saving || !(parseCents(payAmount)! > 0)} onClick={() => finish(true)}>
              Add paycheck and finish
            </button>
            <button className="btn secondary block" disabled={saving} onClick={() => finish(false)}>
              Skip for now
            </button>
          </div>
        </>
      )}
    </main>
  );
}
