import { useRef, useState } from "react";
import { Confirm } from "./ui";
import { parseBackup, restoreBackup, type Backup, type BackupSummary } from "../lib/backup";
import { friendlyDate } from "../lib/dates";

/** "Restore backup" button: pick a file, validate it, show a summary, confirm, replace everything. */
export function RestoreButton({ className, replacing }: { className?: string; replacing: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<{ backup: Backup; summary: BackupSummary } | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <>
      <button className={className ?? "btn secondary block"} onClick={() => input.current?.click()}>
        Restore from backup
      </button>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setError("");
          try {
            setPending(parseBackup(await file.text()));
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      />
      {error && <div className="error" role="alert">{error}</div>}
      {pending && (
        <Confirm
          title="Restore backup"
          confirmLabel={busy ? "Restoring…" : "Replace all data"}
          danger={replacing}
          disabled={busy}
          onClose={() => setPending(null)}
          onConfirm={async () => {
            setBusy(true);
            try {
              await restoreBackup(pending.backup);
              setPending(null);
            } catch (err) {
              setError(`Restore failed. Nothing was changed. ${(err as Error).message}`);
              setPending(null);
            } finally {
              setBusy(false);
            }
          }}
        >
          <p>
            Backup from <strong>{new Date(pending.summary.exportedAt).toLocaleString()}</strong>
          </p>
          <ul className="list card">
            <li className="item"><span className="main">Accounts</span>{pending.summary.accounts}</li>
            <li className="item"><span className="main">Transactions</span>{pending.summary.transactions}</li>
            {pending.summary.firstDate && (
              <li className="item">
                <span className="main">Dates</span>
                {friendlyDate(pending.summary.firstDate)} – {friendlyDate(pending.summary.lastDate!)}
              </li>
            )}
            <li className="item"><span className="main">Categories</span>{pending.summary.categories}</li>
            <li className="item"><span className="main">Budget rules</span>{pending.summary.budgets}</li>
            <li className="item"><span className="main">Recurring items</span>{pending.summary.recurring}</li>
            <li className="item"><span className="main">Goals</span>{pending.summary.goals}</li>
          </ul>
          {replacing && (
            <p className="over">
              This replaces <strong>all</strong> data currently in the app. It can't be undone.
            </p>
          )}
          <p className="muted">After restoring, unlock with the PIN that was set when this backup was made.</p>
        </Confirm>
      )}
    </>
  );
}
