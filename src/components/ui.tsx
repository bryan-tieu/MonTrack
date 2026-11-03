import { useEffect, useId, useRef, type ReactNode } from "react";
import { formatCents } from "../lib/money";

export function Icon({ name, size = 22, label }: { name: IconName; size?: number; label?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {ICONS[name]}
    </svg>
  );
}

type IconName = keyof typeof ICONS;

const ICONS = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  list: (
    <>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  plan: (
    <>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18M8 2v4M16 2v4" />
    </>
  ),
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>
  ),
  chevron: <path d="m9 18 6-6-6-6" />,
  back: <path d="m15 18-6-6 6-6" />,
  left: <path d="m15 18-6-6 6-6" />,
  right: <path d="m9 18 6-6-6-6" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  up: <path d="m18 15-6-6-6 6" />,
  down: <path d="m6 9 6 6 6-6" />,
  close: <path d="M18 6 6 18M6 6l12 12" />,
  backspace: (
    <>
      <path d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z" />
      <path d="m17 9-6 6M11 9l6 6" />
    </>
  ),
  share: (
    <>
      <path d="M12 3v12M8 7l4-4 4 4" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </>
  ),
  check: <path d="M20 6 9 17l-5-5" />,
  filter: <path d="M3 5h18M6 12h12M10 19h4" />,
};

let openSheets = 0;

export function Sheet(props: {
  title: string;
  onClose: () => void;
  left?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  flush?: boolean;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      // Only the topmost sheet closes on Escape.
      if (e.key === "Escape" && ref.current?.contains(document.activeElement)) props.onClose();
    };
    window.addEventListener("keydown", onKey);
    openSheets++;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      if (--openSheets === 0) document.body.style.overflow = "";
      prev?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      <div className="sheet-scrim" onClick={props.onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref} tabIndex={-1}>
        <div className="sheet-head">
          <div>{props.left ?? <button className="link" onClick={props.onClose}>Cancel</button>}</div>
          <h2 id={titleId}>{props.title}</h2>
          <div>{props.right}</div>
        </div>
        <div className={props.flush ? "sheet-body flush" : "sheet-body"}>{props.children}</div>
      </div>
    </>
  );
}

export function Segmented<T extends string>(props: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={props.label}>
      {props.options.map((o) => (
        <button key={o.value} type="button" aria-pressed={props.value === o.value} onClick={() => props.onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ProgressBar({ ratio, level, label }: { ratio: number; level: "ok" | "warn" | "over"; label: string }) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 1)) * 100;
  return (
    <div
      className={`bar ${level === "ok" ? "" : level}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label={label}
    >
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Money({ cents, className, signed }: { cents: number; className?: string; signed?: boolean }) {
  const text = signed && cents > 0 ? `+${formatCents(cents)}` : signed && cents < 0 ? `−${formatCents(-cents)}` : formatCents(cents);
  return <span className={className}>{text}</span>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <div>{children}</div>}
    </div>
  );
}

export function Switch(props: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: ReactNode }) {
  const id = useId();
  return (
    <div className="toggle">
      <label htmlFor={id} className="grow">
        {props.label}
        {props.hint && <div className="caption">{props.hint}</div>}
      </label>
      <span className="switch">
        <input id={id} type="checkbox" role="switch" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
        <span />
      </span>
    </div>
  );
}

export type Option = { value: string; label: string; hint?: string; group?: string };

/** A full-height list for choosing one option, used for categories and accounts. */
export function PickerSheet(props: {
  title: string;
  options: Option[];
  value?: string;
  onPick: (v: string) => void;
  onClose: () => void;
  footer?: ReactNode;
}) {
  const groups: { name?: string; items: Option[] }[] = [];
  for (const o of props.options) {
    const last = groups[groups.length - 1];
    if (last && last.name === o.group) last.items.push(o);
    else groups.push({ name: o.group, items: [o] });
  }
  return (
    <Sheet title={props.title} onClose={props.onClose}>
      {groups.map((g, i) => (
        <div key={i} className={i ? "section" : ""}>
          {g.name && <div className="caption" style={{ marginBottom: 4 }}>{g.name}</div>}
          <ul className="list">
            {g.items.map((o) => (
              <li key={(g.name ?? "") + o.value}>
                <button
                  className="item"
                  aria-pressed={o.value === props.value}
                  onClick={() => {
                    props.onPick(o.value);
                    props.onClose();
                  }}
                >
                  <span className="main">
                    <div>{o.label}</div>
                    {o.hint && <div className="caption">{o.hint}</div>}
                  </span>
                  {o.value === props.value && (
                    <span className="accent">
                      <Icon name="check" label="Selected" />
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {props.footer}
    </Sheet>
  );
}

export function Confirm(props: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
  disabled?: boolean;
}) {
  return (
    <Sheet title={props.title} onClose={props.onClose}>
      <div className="stack">{props.children}</div>
      <div className="section stack">
        <button
          className={`btn block ${props.danger ? "danger" : "primary"}`}
          disabled={props.disabled}
          onClick={async () => {
            await props.onConfirm();
          }}
        >
          {props.confirmLabel}
        </button>
        <button className="btn block secondary" onClick={props.onClose}>
          Cancel
        </button>
      </div>
    </Sheet>
  );
}

/** Money text field that accepts "12.34" and keeps a decimal keyboard. */
export function MoneyInput(props: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  placeholder?: string;
  allowNegative?: boolean;
  "aria-label"?: string;
}) {
  return (
    <input
      id={props.id}
      inputMode="decimal"
      autoComplete="off"
      placeholder={props.placeholder ?? "0.00"}
      aria-label={props["aria-label"]}
      value={props.value}
      onChange={(e) => {
        const v = e.target.value.replace(/[^\d.\-]/g, "");
        const re = props.allowNegative ? /^-?\d*(\.\d{0,2})?$/ : /^\d*(\.\d{0,2})?$/;
        if (re.test(v)) props.onChange(v);
      }}
    />
  );
}
