import { useEffect, type ReactNode } from "react";
import { Icon } from "./ui";
import { PIN_LENGTH } from "../lib/pin";

/** Full-screen 6-digit PIN entry. Calls onComplete once all digits are in. */
export function PinPad(props: {
  title: string;
  subtitle?: ReactNode;
  value: string;
  onChange: (v: string) => void;
  onComplete: (pin: string) => void;
  disabled?: boolean;
  error?: ReactNode;
  footer?: ReactNode;
  cancel?: { label: string; onClick: () => void };
}) {
  const { value, onChange, onComplete, disabled } = props;
  const press = (d: string) => {
    if (disabled || value.length >= PIN_LENGTH) return;
    const next = value + d;
    onChange(next);
    if (next.length === PIN_LENGTH) onComplete(next);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") onChange(value.slice(0, -1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="pin-screen">
      <div className="center" style={{ maxWidth: 320 }}>
        <h1 className="title" style={{ fontSize: "1.375rem", marginBottom: 4 }}>{props.title}</h1>
        {props.subtitle && <div className="muted">{props.subtitle}</div>}
        <div className="pin-dots" role="img" aria-label={`${value.length} of ${PIN_LENGTH} digits entered`}>
          {Array.from({ length: PIN_LENGTH }, (_, i) => (
            <span key={i} className={i < value.length ? "filled" : ""} />
          ))}
        </div>
        <div className="error" role="alert" style={{ minHeight: "1.4em" }}>
          {props.error}
        </div>
      </div>
      <div>
        <div className="pin-pad">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button key={d} onClick={() => press(d)} disabled={disabled}>
              {d}
            </button>
          ))}
          {props.cancel ? (
            <button className="plain" onClick={props.cancel.onClick}>
              {props.cancel.label}
            </button>
          ) : (
            <span />
          )}
          <button onClick={() => press("0")} disabled={disabled}>
            0
          </button>
          <button className="plain" onClick={() => onChange(value.slice(0, -1))} aria-label="Delete digit" disabled={disabled}>
            <Icon name="backspace" size={26} />
          </button>
        </div>
        <div className="center" style={{ marginTop: 16, minHeight: 44 }}>
          {props.footer}
        </div>
      </div>
    </div>
  );
}
