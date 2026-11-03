export function isStandalone(): boolean {
  return (
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches
  );
}

/** Shown in Safari: data entered in a browser tab would live in separate storage from the app. */
export function Install() {
  const isIPhone = /iPhone|iPod/.test(navigator.userAgent);
  return (
    <main className="install">
      <img className="app-icon" src="/apple-touch-icon.png" alt="" />
      <h1 className="title">Install Pocket Ledger</h1>
      <p>
        Pocket Ledger runs as a Home Screen app. Your financial data stays on this phone and is never sent anywhere.
      </p>
      {isIPhone ? (
        <ol>
          <li>
            Tap <strong>Share</strong> in Safari's toolbar.
          </li>
          <li>
            Scroll down and tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.
          </li>
          <li>Open Pocket Ledger from its new Home Screen icon.</li>
        </ol>
      ) : (
        <p>Open this page in Safari on your iPhone, then add it to your Home Screen.</p>
      )}
      <div className="notice">
        Don't enter anything here in Safari. The browser and the Home Screen app keep separate data, and Safari may clear
        site data after seven days without a visit.
      </div>
    </main>
  );
}
