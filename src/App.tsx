import { useCallback, useEffect, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { AppProvider, useAllData, useApp, type TxDraft } from "./state";
import { Icon } from "./components/ui";
import { processRecurring } from "./lib/actions";
import { today } from "./lib/dates";
import { isStandalone, Install } from "./screens/Install";
import { Lock } from "./screens/Lock";
import { Setup } from "./screens/Setup";
import { Home } from "./screens/Home";
import { Activity } from "./screens/Activity";
import { TxSheet } from "./screens/TxSheet";
import { Plan } from "./screens/Plan";
import { Reports } from "./screens/Reports";
import { SettingsScreen } from "./screens/Settings";
import type { Appearance } from "./lib/types";

const DEV_BYPASS = import.meta.env.DEV && new URLSearchParams(location.search).has("dev");

type Update = { available: boolean; apply: () => void };

export default function App() {
  const [standalone] = useState(() => isStandalone() || DEV_BYPASS);
  // Register the service worker on first load so the app works offline even before setup.
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  const update: Update = { available: needRefresh, apply: () => updateServiceWorker(true) };
  if (!standalone) return <Install />;
  return <InstalledApp update={update} />;
}

function applyAppearance(a: Appearance | undefined) {
  const root = document.documentElement;
  if (!a || a === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", a);
}

function InstalledApp({ update }: { update: Update }) {
  const [dbError, setDbError] = useState<string | null>(null);
  const data = useAllData(!dbError);
  const [locked, setLocked] = useState(true);
  const [hidden, setHidden] = useState(document.visibilityState === "hidden");
  const [day, setDay] = useState(today());
  const hiddenAt = useRef<number | null>(null);
  const autoLock = data?.settings.autoLockSeconds ?? 60;
  const setupDone = !!data?.settings.setupComplete;

  useEffect(() => applyAppearance(data?.settings.appearance), [data?.settings.appearance]);

  useEffect(() => {
    navigator.storage?.persist?.().catch(() => {});
  }, []);

  // Hide everything the moment the app leaves the screen, and lock after the auto-lock delay.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
        setHidden(true);
      } else {
        if (hiddenAt.current !== null && Date.now() - hiddenAt.current >= autoLock * 1000) setLocked(true);
        hiddenAt.current = null;
        setHidden(false);
        setDay(today());
      }
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onVis);
    };
  }, [autoLock]);

  // Process due recurring items on open and whenever the app comes back.
  useEffect(() => {
    if (!setupDone || hidden) return;
    processRecurring(day).catch((e) => setDbError(String(e?.message ?? e)));
  }, [setupDone, hidden, day]);

  // Catch midnight while the app stays open.
  useEffect(() => {
    const t = setInterval(() => setDay(today()), 60_000);
    return () => clearInterval(t);
  }, []);

  if (dbError) {
    return (
      <div className="install">
        <h1 className="title">Storage problem</h1>
        <p>The app couldn't read or write its data on this phone.</p>
        <p className="caption">{dbError}</p>
        <p>If the phone is low on storage, free up some space, then reopen the app.</p>
      </div>
    );
  }

  if (data === undefined) return <div className="privacy-cover" />;
  if (data === null || !data.settings.setupComplete) return <Setup onFinished={() => setLocked(false)} />;
  if (locked) return hidden ? <div className="privacy-cover" /> : <Lock settings={data.settings} onUnlock={() => setLocked(false)} />;

  // The cover sits on top rather than replacing the app, so a quick app switch keeps open sheets.
  return (
    <>
      <Unlocked data={data} day={day} update={update} />
      {hidden && <div className="privacy-cover" aria-hidden="true" />}
    </>
  );
}

function Unlocked({ data, day, update }: { data: NonNullable<ReturnType<typeof useAllData>>; day: string; update: Update }) {
  const [txDraft, setTxDraft] = useState<TxDraft | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<{ id: number; message: string; undo?: () => void } | null>(null);

  const openTx = useCallback((d?: TxDraft) => setTxDraft(d ?? {}), []);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const showToast = useCallback((message: string, undo?: () => void) => {
    setToast({ id: Date.now(), message, undo });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <AppProvider data={data} day={day} openTx={openTx} openSettings={openSettings} toast={showToast}>
      {settingsOpen ? <SettingsScreen onClose={() => setSettingsOpen(false)} /> : <Tabs update={update} />}
      {txDraft && <TxSheet draft={txDraft} onClose={() => setTxDraft(null)} />}
      {toast && (
        <div className="toast" role="status" aria-live="polite" key={toast.id}>
          <span className="grow">{toast.message}</span>
          {toast.undo && (
            <button
              onClick={() => {
                toast.undo!();
                setToast(null);
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </AppProvider>
  );
}

function UpdateBanner({ update }: { update: Update }) {
  if (!update.available) return null;
  return (
    <div className="banner floating" role="status">
      <span className="grow">Update available</span>
      <button className="btn primary" onClick={update.apply}>
        Reload
      </button>
    </div>
  );
}

function Tabs({ update }: { update: Update }) {
  const { tab, setTab, openTx } = useApp();
  return (
    <>
      <UpdateBanner update={update} />
      <main>
        {tab === "home" && <Home />}
        {tab === "activity" && <Activity />}
        {tab === "plan" && <Plan />}
        {tab === "reports" && <Reports />}
      </main>
      <nav className="tabbar" aria-label="Main">
        <button aria-current={tab === "home" ? "page" : undefined} onClick={() => setTab("home")}>
          <Icon name="home" />
          Home
        </button>
        <button aria-current={tab === "activity" ? "page" : undefined} onClick={() => setTab("activity")}>
          <Icon name="list" />
          Activity
        </button>
        <button className="add-tab" onClick={() => openTx()} aria-label="Add transaction">
          <span className="plus">
            <Icon name="plus" />
          </span>
        </button>
        <button aria-current={tab === "plan" ? "page" : undefined} onClick={() => setTab("plan")}>
          <Icon name="plan" />
          Plan
        </button>
        <button aria-current={tab === "reports" ? "page" : undefined} onClick={() => setTab("reports")}>
          <Icon name="chart" />
          Reports
        </button>
      </nav>
    </>
  );
}
