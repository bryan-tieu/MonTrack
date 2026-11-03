import { useEffect, useState } from "react";
import { useApp } from "../state";
import { Confirm, Icon, Segmented, Sheet } from "../components/ui";
import { PinPad } from "../components/PinPad";
import { AccountForm, ACCOUNT_TYPES } from "../components/AccountForm";
import { RestoreButton } from "../components/RestorePicker";
import {
  accountInUse,
  addCategory,
  deleteAccount,
  moveItem,
  renameCategory,
  saveAccount,
  setArchived,
  updateSettings,
} from "../lib/actions";
import { buildBackup, backupFileName, shareFile } from "../lib/backup";
import { transactionsCsv } from "../lib/csv";
import { eraseAll } from "../lib/db";
import { createPinHash, hashPin, sameHash } from "../lib/pin";
import { addDays, friendlyDate, isValidDate, rangeLabel, today } from "../lib/dates";
import { formatCents } from "../lib/money";
import { periodFor } from "../lib/periods";
import type { Account, Appearance, CategoryKind } from "../lib/types";

type Page = "main" | "accounts" | "categories" | "schedule";

export function SettingsScreen({ onClose }: { onClose: () => void }) {
  const [page, setPage] = useState<Page>("main");
  if (page === "accounts") return <AccountsPage onBack={() => setPage("main")} />;
  if (page === "categories") return <CategoriesPage onBack={() => setPage("main")} />;
  if (page === "schedule") return <SchedulePage onBack={() => setPage("main")} />;
  return <MainSettings onClose={onClose} go={setPage} />;
}

function PageHead({ title, onBack, backLabel = "Settings" }: { title: string; onBack: () => void; backLabel?: string }) {
  return (
    <>
      <div className="topbar">
        <button className="link" onClick={onBack} style={{ marginLeft: -8 }}>
          <Icon name="back" /> {backLabel}
        </button>
      </div>
      <h1 className="title">{title}</h1>
    </>
  );
}

function NavRow({ label, value, onClick }: { label: string; value?: string; onClick: () => void }) {
  return (
    <button className="form-row" onClick={onClick}>
      <span>{label}</span>
      <span className="value">
        {value}
        <Icon name="chevron" size={16} />
      </span>
    </button>
  );
}

function MainSettings({ onClose, go }: { onClose: () => void; go: (p: Page) => void }) {
  const { data, asOf, toast } = useApp();
  const s = data.settings;
  const [busy, setBusy] = useState(false);
  const [changePin, setChangePin] = useState(false);
  const [erase, setErase] = useState(false);
  const [storage, setStorage] = useState<{ persisted: boolean | null; usage?: number; quota?: number }>({ persisted: null });

  useEffect(() => {
    (async () => {
      const persisted = (await navigator.storage?.persisted?.()) ?? null;
      const est = await navigator.storage?.estimate?.();
      setStorage({ persisted, usage: est?.usage, quota: est?.quota });
    })().catch(() => {});
  }, []);

  async function exportBackup() {
    setBusy(true);
    try {
      const backup = await buildBackup(__APP_VERSION__);
      const result = await shareFile(backupFileName(), "application/json", JSON.stringify(backup, null, 1));
      if (result !== "cancelled") {
        await updateSettings({ lastBackupAt: backup.exportedAt });
        toast("Backup created");
      }
    } catch (e) {
      toast(`Backup failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function exportCsv() {
    try {
      const csv = transactionsCsv(data.transactions, data.accounts, data.categories, asOf);
      await shareFile(`pocket-ledger-transactions-${today()}.csv`, "text/csv", csv);
    } catch (e) {
      toast(`Export failed: ${(e as Error).message}`);
    }
  }

  const mb = (n?: number) => (n === undefined ? "?" : n < 1e6 ? `${Math.max(1, Math.round(n / 1e3))} KB` : `${(n / 1e6).toFixed(1)} MB`);
  const activeAccounts = data.accounts.filter((a) => !a.archivedAt).length;
  const anchors = s.payScheduleAnchors;
  const current = periodFor(asOf, anchors);

  return (
    <div className="screen no-tabs">
      <div className="topbar">
        <span />
        <button className="link" style={{ fontWeight: 600 }} onClick={onClose}>
          Done
        </button>
      </div>
      <h1 className="title">Settings</h1>

      <div className="form-rows">
        <NavRow label="Accounts" value={String(activeAccounts)} onClick={() => go("accounts")} />
        <NavRow label="Categories" onClick={() => go("categories")} />
        <NavRow label="Pay schedule" value={rangeLabel(current.start, current.end)} onClick={() => go("schedule")} />
      </div>

      <h2 className="section" style={{ marginBottom: 8 }}>Security</h2>
      <div className="form-rows">
        <NavRow label="Change PIN" onClick={() => setChangePin(true)} />
        <label className="form-row">
          <span>Auto-lock</span>
          <select value={s.autoLockSeconds} onChange={(e) => updateSettings({ autoLockSeconds: Number(e.target.value) })}>
            <option value={0}>Immediately</option>
            <option value={60}>After 1 minute</option>
            <option value={300}>After 5 minutes</option>
            <option value={900}>After 15 minutes</option>
          </select>
        </label>
      </div>
      <p className="caption">
        The PIN keeps out someone who picks up your unlocked phone. It doesn't encrypt the data; your iPhone passcode is
        the main protection.
      </p>

      <h2 className="section" style={{ marginBottom: 8 }}>Backup</h2>
      <div className="card padded stack">
        <div className="row-flex">
          <span className="grow">Last backup</span>
          <span className="muted">{s.lastBackupAt ? friendlyDate(s.lastBackupAt.slice(0, 10), asOf) : "Never"}</span>
        </div>
        <button className="btn primary block" disabled={busy} onClick={exportBackup}>
          <Icon name="share" size={18} /> Export backup
        </button>
        <RestoreButton replacing />
        <button className="btn secondary block" onClick={exportCsv} disabled={data.transactions.length === 0}>
          Export transactions (CSV)
        </button>
      </div>
      <p className="caption">
        Your data exists only on this phone. Save backups to Files or iCloud Drive. Backup files are{" "}
        <strong>not encrypted</strong>: anyone who can open one can read your financial history. A backup is the only
        way to move to a new phone.
      </p>

      <h2 className="section" style={{ marginBottom: 8 }}>Appearance</h2>
      <Segmented<Appearance>
        label="Appearance"
        value={s.appearance}
        onChange={(v) => updateSettings({ appearance: v })}
        options={[
          { value: "system", label: "System" },
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
        ]}
      />

      <h2 className="section" style={{ marginBottom: 8 }}>Storage</h2>
      <div className="form-rows">
        <div className="form-row">
          <span>Persistent storage</span>
          <span className="value">{storage.persisted === null ? "Unknown" : storage.persisted ? "Granted" : "Not granted"}</span>
        </div>
        <div className="form-row">
          <span>Used</span>
          <span className="value">{mb(storage.usage)}</span>
        </div>
        <div className="form-row">
          <span>Version</span>
          <span className="value">{__APP_VERSION__}</span>
        </div>
      </div>
      <p className="caption">
        Removing the Home Screen icon or clearing website data in iPhone Settings erases everything. Persistent storage
        lowers the chance iOS clears data, but isn't a guarantee.
      </p>

      <button className="btn danger block section" onClick={() => setErase(true)}>
        Erase all data
      </button>

      {changePin && <ChangePin onClose={() => setChangePin(false)} />}
      {erase && <EraseAll onClose={() => setErase(false)} />}
    </div>
  );
}

async function pinMatches(pin: string, s: { pinSalt: string; pinIterations: number; pinHash: string }) {
  return sameHash(await hashPin(pin, s.pinSalt, s.pinIterations), s.pinHash);
}

function ChangePin({ onClose }: { onClose: () => void }) {
  const { data, toast } = useApp();
  const [stage, setStage] = useState<"current" | "new" | "confirm">("current");
  const [value, setValue] = useState("");
  const [newPin, setNewPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const titles = { current: "Enter current PIN", new: "Enter new PIN", confirm: "Confirm new PIN" };
  return (
    <PinPad
      title={titles[stage]}
      value={value}
      error={error}
      disabled={busy}
      onChange={(v) => {
        setValue(v);
        if (v) setError("");
      }}
      cancel={{ label: "Cancel", onClick: onClose }}
      onComplete={async (pin) => {
        setBusy(true);
        try {
          if (stage === "current") {
            if (await pinMatches(pin, data.settings)) setStage("new");
            else setError("Wrong PIN.");
          } else if (stage === "new") {
            setNewPin(pin);
            setStage("confirm");
          } else if (pin === newPin) {
            await updateSettings(await createPinHash(pin));
            toast("PIN changed");
            onClose();
          } else {
            setError("PINs didn't match. Enter the new PIN again.");
            setStage("new");
          }
        } finally {
          setValue("");
          setBusy(false);
        }
      }}
    />
  );
}

function EraseAll({ onClose }: { onClose: () => void }) {
  const { data } = useApp();
  const [stage, setStage] = useState<"pin" | "confirm">("pin");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [typed, setTyped] = useState("");

  if (stage === "pin")
    return (
      <PinPad
        title="Enter PIN to erase"
        value={pin}
        error={error}
        onChange={(v) => {
          setPin(v);
          if (v) setError("");
        }}
        cancel={{ label: "Cancel", onClick: onClose }}
        onComplete={async (p) => {
          if (await pinMatches(p, data.settings)) setStage("confirm");
          else setError("Wrong PIN.");
          setPin("");
        }}
      />
    );

  return (
    <Confirm title="Erase all data" confirmLabel="Erase everything" danger disabled={typed !== "ERASE"} onClose={onClose} onConfirm={eraseAll}>
      <p>
        This permanently deletes every account, transaction, budget, recurring item, and goal on this phone. It can't be
        undone.
      </p>
      <p>Export a backup first if you might want this data again.</p>
      <label className="field">
        <span className="label">Type ERASE to confirm</span>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="characters" autoComplete="off" />
      </label>
    </Confirm>
  );
}

// Accounts

function AccountsPage({ onBack }: { onBack: () => void }) {
  const { data, balances } = useApp();
  const [editing, setEditing] = useState<Account | "new" | null>(null);
  const active = data.accounts.filter((a) => !a.archivedAt);
  const archived = data.accounts.filter((a) => a.archivedAt);
  const ids = active.map((a) => a.id);

  return (
    <div className="screen no-tabs">
      <PageHead title="Accounts" onBack={onBack} />
      <ul className="list">
        {active.map((a, i) => (
          <li key={a.id} className="item">
            <button className="main" style={{ textAlign: "left", minHeight: 44 }} onClick={() => setEditing(a)}>
              <div>{a.name}</div>
              <div className="caption">
                {ACCOUNT_TYPES.find((t) => t.value === a.type)?.label} · {formatCents(balances.get(a.id) ?? 0)}
                {a.type === "creditCard" ? " owed" : ""}
              </div>
            </button>
            <button className="icon-btn" disabled={i === 0} onClick={() => moveItem("accounts", ids, a.id, -1)} aria-label={`Move ${a.name} up`}>
              <Icon name="up" size={18} />
            </button>
            <button className="icon-btn" disabled={i === ids.length - 1} onClick={() => moveItem("accounts", ids, a.id, 1)} aria-label={`Move ${a.name} down`}>
              <Icon name="down" size={18} />
            </button>
          </li>
        ))}
      </ul>
      <button className="btn secondary block section" onClick={() => setEditing("new")}>
        Add account
      </button>
      {archived.length > 0 && (
        <div className="section">
          <h2>Archived</h2>
          <ul className="list">
            {archived.map((a) => (
              <li key={a.id}>
                <button className="item" onClick={() => setEditing(a)}>
                  <span className="main muted">{a.name}</span>
                  <span className="caption">{formatCents(balances.get(a.id) ?? 0)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {editing && <AccountSheet account={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function AccountSheet({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const [inUse, setInUse] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (account) accountInUse(account.id).then(setInUse);
  }, [account]);

  return (
    <Sheet title={account ? "Edit account" : "New account"} onClose={onClose}>
      <AccountForm
        initial={account ?? undefined}
        submitLabel="Save"
        balanceHint={account ? "The balance before any transactions in the app. Changing it shifts the current balance by the same amount." : undefined}
        onSubmit={async (a) => {
          await saveAccount({ ...a, archivedAt: account?.archivedAt }, account?.id);
          onClose();
        }}
      />
      {account && (
        <div className="section stack">
          <button
            className="btn secondary block"
            onClick={async () => {
              await setArchived("accounts", account.id, !account.archivedAt);
              onClose();
            }}
          >
            {account.archivedAt ? "Unarchive" : "Archive"}
          </button>
          {inUse === false && (
            <button
              className="btn danger block"
              onClick={async () => {
                try {
                  await deleteAccount(account.id);
                  onClose();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Delete account
            </button>
          )}
          {inUse && <p className="caption">This account has transactions, so it can be archived but not deleted. Its history stays intact.</p>}
          {error && <div className="error">{error}</div>}
        </div>
      )}
    </Sheet>
  );
}

// Categories

function CategoriesPage({ onBack }: { onBack: () => void }) {
  const { data } = useApp();
  const [kind, setKind] = useState<CategoryKind>("expense");
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const all = data.categories.filter((c) => c.kind === kind);
  const active = all.filter((c) => !c.archivedAt);
  const archived = all.filter((c) => c.archivedAt);
  const ids = active.map((c) => c.id);

  return (
    <div className="screen no-tabs">
      <PageHead title="Categories" onBack={onBack} />
      <Segmented
        label="Category type"
        value={kind}
        onChange={setKind}
        options={[
          { value: "expense", label: "Spending" },
          { value: "income", label: "Income" },
        ]}
      />
      <ul className="list" style={{ marginTop: 12 }}>
        {active.map((c, i) => (
          <li key={c.id} className="item">
            <button className="main" style={{ textAlign: "left", minHeight: 44 }} onClick={() => setRenaming({ id: c.id, name: c.name })}>
              {c.name}
            </button>
            <button className="icon-btn" disabled={i === 0} onClick={() => moveItem("categories", ids, c.id, -1)} aria-label={`Move ${c.name} up`}>
              <Icon name="up" size={18} />
            </button>
            <button className="icon-btn" disabled={i === ids.length - 1} onClick={() => moveItem("categories", ids, c.id, 1)} aria-label={`Move ${c.name} down`}>
              <Icon name="down" size={18} />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="row-flex section"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!newName.trim()) return;
          await addCategory(newName, kind);
          setNewName("");
        }}
      >
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New category" aria-label="New category name" maxLength={30} />
        <button className="btn primary" type="submit" disabled={!newName.trim()}>
          Add
        </button>
      </form>
      {archived.length > 0 && (
        <div className="section">
          <h2>Archived</h2>
          <p className="caption">Archived categories stay on old transactions but can't be picked for new ones.</p>
          <ul className="list">
            {archived.map((c) => (
              <li key={c.id} className="item">
                <span className="main muted">{c.name}</span>
                <button className="link" onClick={() => setArchived("categories", c.id, false)}>
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {renaming && (
        <Sheet
          title="Edit category"
          onClose={() => setRenaming(null)}
          right={
            <button
              className="link"
              style={{ fontWeight: 600 }}
              disabled={!renaming.name.trim()}
              onClick={async () => {
                await renameCategory(renaming.id, renaming.name);
                setRenaming(null);
              }}
            >
              Save
            </button>
          }
        >
          <label className="field">
            <span className="label">Name</span>
            <input value={renaming.name} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} maxLength={30} />
          </label>
          <button
            className="btn secondary block section"
            onClick={async () => {
              await setArchived("categories", renaming.id, true);
              setRenaming(null);
            }}
          >
            Archive category
          </button>
        </Sheet>
      )}
    </div>
  );
}

// Pay schedule

function SchedulePage({ onBack }: { onBack: () => void }) {
  const { data, asOf } = useApp();
  const anchors = data.settings.payScheduleAnchors;
  const latest = [...anchors].sort().at(-1)!;
  const [date, setDate] = useState("");
  const [confirm, setConfirm] = useState(false);
  const current = periodFor(asOf, anchors);
  const valid = isValidDate(date) && date > latest;

  return (
    <div className="screen no-tabs">
      <PageHead title="Pay schedule" onBack={onBack} />
      <p>
        Pay periods are 14 days, starting on payday. The current period is <strong>{rangeLabel(current.start, current.end)}</strong>.
      </p>
      <h2 className="section">Schedule history</h2>
      <ul className="list">
        {[...anchors].sort().reverse().map((a, i) => (
          <li key={a} className="item">
            <span className="main">Every 14 days from {friendlyDate(a, asOf)}</span>
            {i === 0 && <span className="tag accent">Current</span>}
          </li>
        ))}
      </ul>
      <h2 className="section">Pay schedule changed?</h2>
      <p className="muted">
        Enter the first payday on the new schedule. It applies from that date onward; earlier periods and their budgets
        stay as they were.
      </p>
      <label className="field">
        <span className="label">New schedule's first payday</span>
        <input type="date" value={date} min={latest} onChange={(e) => setDate(e.target.value)} />
      </label>
      {date && !valid && <div className="error">Pick a date after {friendlyDate(latest, asOf)}.</div>}
      <button className="btn primary block" disabled={!valid} onClick={() => setConfirm(true)}>
        Change schedule
      </button>
      {confirm && (
        <Confirm
          title="Change pay schedule"
          confirmLabel="Change schedule"
          onClose={() => setConfirm(false)}
          onConfirm={async () => {
            await updateSettings({ payScheduleAnchors: [...anchors, date].sort() });
            setConfirm(false);
            setDate("");
          }}
        >
          <p>
            New pay periods start every 14 days from {friendlyDate(date, asOf)}. The period before it ends{" "}
            {friendlyDate(addDays(date, -1), asOf)}.
          </p>
        </Confirm>
      )}
    </div>
  );
}
