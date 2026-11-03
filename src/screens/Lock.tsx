import { useEffect, useState } from "react";
import { PinPad } from "../components/PinPad";
import { Confirm } from "../components/ui";
import { hashPin, lockoutMs, sameHash } from "../lib/pin";
import { updateSettings } from "../lib/actions";
import { eraseAll } from "../lib/db";
import type { Settings } from "../lib/types";

export function Lock({ settings, onUnlock }: { settings: Settings; onUnlock: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [forgot, setForgot] = useState(false);
  const [typed, setTyped] = useState("");

  const lockedUntil = settings.pinLockedUntil ?? 0;
  const waiting = lockedUntil > now;
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [waiting]);

  async function check(entered: string) {
    setChecking(true);
    try {
      const hash = await hashPin(entered, settings.pinSalt, settings.pinIterations);
      if (sameHash(hash, settings.pinHash)) {
        await updateSettings({ failedPinAttempts: 0, pinLockedUntil: undefined });
        onUnlock();
        return;
      }
      const failed = settings.failedPinAttempts + 1;
      const wait = lockoutMs(failed);
      await updateSettings({ failedPinAttempts: failed, pinLockedUntil: wait ? Date.now() + wait : undefined });
      setNow(Date.now());
      setError(wait ? "Too many attempts." : `Wrong PIN. ${5 - failed} ${5 - failed === 1 ? "try" : "tries"} left before a delay.`);
    } finally {
      setPin("");
      setChecking(false);
    }
  }

  const secs = Math.ceil((lockedUntil - now) / 1000);

  return (
    <>
      <PinPad
        title="Enter PIN"
        subtitle="Pocket Ledger is locked"
        value={pin}
        onChange={(v) => {
          setPin(v);
          if (v) setError("");
        }}
        onComplete={check}
        disabled={checking || waiting}
        error={waiting ? `Try again in ${secs >= 60 ? `${Math.ceil(secs / 60)} min` : `${secs} s`}.` : error}
        footer={
          <button className="link" onClick={() => setForgot(true)}>
            Forgot PIN?
          </button>
        }
      />
      {forgot && (
        <Confirm
          title="Forgot PIN"
          confirmLabel="Erase all data"
          danger
          disabled={typed !== "ERASE"}
          onClose={() => {
            setForgot(false);
            setTyped("");
          }}
          onConfirm={async () => {
            await eraseAll();
          }}
        >
          <p>There's no way to recover a PIN. Your data never leaves this phone, so nothing can reset it.</p>
          <p>
            <strong>The only option is to erase everything</strong> and start over. You can restore a backup file
            afterward, and it will use the PIN that was set when the backup was made.
          </p>
          <label className="field">
            <span className="label">Type ERASE to confirm</span>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="characters" autoComplete="off" />
          </label>
        </Confirm>
      )}
    </>
  );
}
