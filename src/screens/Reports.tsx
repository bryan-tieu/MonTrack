import { useMemo, useState } from "react";
import { useApp } from "../state";
import { Empty, Icon, ProgressBar, Segmented } from "../components/ui";
import { PeriodStepper } from "./Plan";
import { budgetLabel, budgetStatuses, inRange, spendingByCategory, totals } from "../lib/ledger";
import { monthFor, nextPeriod, periodsEndingWith, previousPeriod, shiftMonth, type Period } from "../lib/periods";
import { monthLabel, rangeLabel, shortDate } from "../lib/dates";
import { formatCents, formatWhole } from "../lib/money";

type Mode = "period" | "month";

export function Reports() {
  const { data, asOf, period: currentPeriod, categoryById, showActivity } = useApp();
  const anchors = data.settings.payScheduleAnchors;
  const [mode, setMode] = useState<Mode>("period");
  const [range, setRange] = useState<Period>(currentPeriod);

  const step = (r: Period, dir: -1 | 1): Period =>
    mode === "month" ? shiftMonth(r, dir) : dir < 0 ? previousPeriod(r, anchors) : nextPeriod(r, anchors);

  const txns = useMemo(() => inRange(data.transactions, range, asOf), [data.transactions, range, asOf]);
  const prevRange = step(range, -1);
  const prevTxns = useMemo(() => inRange(data.transactions, prevRange, asOf), [data.transactions, prevRange.start, prevRange.end, asOf]); // eslint-disable-line react-hooks/exhaustive-deps
  const sum = totals(txns);

  const byCat = [...spendingByCategory(txns)]
    .filter(([, v]) => v !== 0)
    .sort((a, b) => b[1] - a[1]);
  const prevByCat = spendingByCategory(prevTxns);
  const maxCat = Math.max(1, ...byCat.map(([, v]) => v));

  const history = useMemo(() => {
    const ranges: Period[] = mode === "month" ? [range] : periodsEndingWith(range, 6, anchors);
    if (mode === "month") while (ranges.length < 6) ranges.unshift(shiftMonth(ranges[0], -1));
    return ranges.map((r) => ({ range: r, ...totals(inRange(data.transactions, r, asOf)) }));
  }, [mode, range, anchors, data.transactions, asOf]);

  const budgets = mode === "period" ? budgetStatuses(data.categories, data.budgetRules, txns, range.start) : [];
  const unit = mode === "month" ? "month" : "pay period";
  const hasAny = data.transactions.length > 0;

  return (
    <div className="screen">
      <h1 className="title" style={{ marginTop: 8 }}>Reports</h1>
      <Segmented
        label="Report by"
        value={mode}
        onChange={(m) => {
          setMode(m);
          setRange(m === "month" ? monthFor(asOf) : currentPeriod);
        }}
        options={[
          { value: "period", label: "Pay periods" },
          { value: "month", label: "Months" },
        ]}
      />
      <div style={{ marginTop: 12 }}>
        {mode === "period" ? (
          <PeriodStepper period={range} isCurrent={range.start === currentPeriod.start} onChange={(d) => setRange(step(range, d))} />
        ) : (
          <div className="row-flex" style={{ justifyContent: "space-between" }}>
            <button className="icon-btn" onClick={() => setRange(step(range, -1))} aria-label="Previous month">
              <Icon name="left" />
            </button>
            <div style={{ fontWeight: 600 }}>{monthLabel(range.start)}</div>
            <button className="icon-btn" onClick={() => setRange(step(range, 1))} aria-label="Next month">
              <Icon name="right" />
            </button>
          </div>
        )}
      </div>

      {!hasAny ? (
        <Empty title="Reports appear here">
          After you add transactions, you'll see income and spending for each pay period, spending by category, and how
          you're doing against your budgets.
        </Empty>
      ) : (
        <>
          <button className="stat-row section" style={{ marginTop: 20, width: "100%", textAlign: "left" }} onClick={() => showActivity({ start: range.start, end: range.end })}>
            <div>
              <div className="caption">Income</div>
              <div className="v income">{formatCents(sum.income)}</div>
            </div>
            <div>
              <div className="caption">Spending</div>
              <div className="v">{formatCents(sum.spending)}</div>
            </div>
            <div>
              <div className="caption">Net</div>
              <div className="v">{(sum.net < 0 ? "−" : "+") + formatCents(Math.abs(sum.net))}</div>
            </div>
          </button>
          {mode === "month" && (
            <p className="caption">
              Months can include three paydays, which makes some months' income look high. Budgets follow pay periods.
            </p>
          )}

          <section className="section">
            <h2>Spending by category</h2>
            {byCat.length === 0 ? (
              <p className="muted">No spending this {unit}.</p>
            ) : (
              <ul className="list" style={{ marginTop: 8 }}>
                {byCat.map(([id, v]) => (
                  <li key={id} style={{ borderBottom: 0 }}>
                    <button
                      className="hbar-row"
                      onClick={() => showActivity({ start: range.start, end: range.end, categoryId: id, type: "expense" })}
                      aria-label={`${categoryById.get(id)?.name}: ${formatCents(v)}. Show transactions.`}
                    >
                      <span>{categoryById.get(id)?.name ?? "Uncategorized"}</span>
                      <span className="nowrap">{formatCents(v)}</span>
                      <span className="track" aria-hidden="true">
                        <span style={{ width: `${Math.max(0, (v / maxCat) * 100)}%` }} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="section">
            <h2>Income vs spending</h2>
            <p className="caption" style={{ margin: "2px 0 8px" }}>Last six {mode === "month" ? "months" : "pay periods"}. Tap a column for its transactions.</p>
            <IncomeSpendChart
              rows={history}
              label={(r) => (mode === "month" ? monthLabel(r.start).slice(0, 3) : shortDate(r.start))}
              longLabel={(r) => (mode === "month" ? monthLabel(r.start) : rangeLabel(r.start, r.end))}
              onPick={(r) => showActivity({ start: r.start, end: r.end })}
              selected={range.start}
            />
          </section>

          {mode === "period" && (
            <section className="section">
              <h2>Budget vs actual</h2>
              {budgets.length === 0 ? (
                <p className="muted">No budgets for this pay period. Set them in Plan › Budgets.</p>
              ) : (
                <ul className="list" style={{ marginTop: 8 }}>
                  {budgets.map((b) => (
                    <li key={b.category.id} style={{ padding: "10px 0" }}>
                      <div className="row-flex" style={{ marginBottom: 6 }}>
                        <span className="grow">{b.category.name}</span>
                        <span className="nowrap">
                          {formatWhole(b.spent)} <span className="muted">of {formatWhole(b.limit)}</span>
                        </span>
                      </div>
                      <ProgressBar ratio={b.ratio} level={b.level} label={`${b.category.name}: ${budgetLabel(b, formatCents)}`} />
                      <div className={`caption ${b.level === "over" ? "over" : b.level === "warn" ? "warn" : ""}`} style={{ marginTop: 4 }}>
                        {budgetLabel(b, formatCents)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <section className="section">
            <h2>Top categories vs previous {unit}</h2>
            {byCat.length === 0 ? (
              <p className="muted">Nothing to compare yet.</p>
            ) : (
              <ul className="list" style={{ marginTop: 8 }}>
                {byCat.slice(0, 5).map(([id, v]) => {
                  const prev = prevByCat.get(id) ?? 0;
                  const diff = v - prev;
                  return (
                    <li key={id}>
                      <button className="item" onClick={() => showActivity({ start: range.start, end: range.end, categoryId: id, type: "expense" })}>
                        <span className="main">
                          <div>{categoryById.get(id)?.name}</div>
                          <div className="caption">
                            {prev === 0
                              ? `Nothing last ${unit}`
                              : diff === 0
                                ? `Same as last ${unit}`
                                : `${diff > 0 ? "Up" : "Down"} ${formatCents(Math.abs(diff))} from ${formatCents(prev)}`}
                          </div>
                        </span>
                        <span className="amt">{formatCents(v)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <p className="caption section">Transfers, including credit card payments, aren't counted as income or spending.</p>
        </>
      )}
    </div>
  );
}

type Row = { range: Period; income: number; spending: number };

/** Paired columns per period; one y-axis starting at zero, values labeled under the chart via the table. */
function IncomeSpendChart(props: {
  rows: Row[];
  label: (r: Period) => string;
  longLabel: (r: Period) => string;
  onPick: (r: Period) => void;
  selected: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const W = 340;
  const H = 170;
  const top = 18;
  const bottom = 22;
  const plotH = H - top - bottom;
  const max = Math.max(1, ...props.rows.flatMap((r) => [r.income, r.spending]));
  const slot = W / props.rows.length;
  const barW = Math.min(16, (slot - 14) / 2);
  const y = (v: number) => top + plotH - (Math.max(0, v) / max) * plotH;
  const shown = active ?? props.rows.findIndex((r) => r.range.start === props.selected);
  const sel = props.rows[shown];

  // Bars with 4px rounded tops anchored square to the baseline.
  const bar = (x: number, v: number, fill: string) => {
    const h = Math.max(0, top + plotH - y(v));
    if (h === 0) return null;
    const r = Math.min(4, h, barW / 2);
    const yt = top + plotH - h;
    return (
      <path
        d={`M${x},${top + plotH} V${yt + r} Q${x},${yt} ${x + r},${yt} H${x + barW - r} Q${x + barW},${yt} ${x + barW},${yt + r} V${top + plotH} Z`}
        fill={fill}
      />
    );
  };

  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Income and spending by period. Details in the table below." style={{ display: "block", overflow: "visible" }}>
        <line x1={0} x2={W} y1={top + plotH} y2={top + plotH} stroke="var(--divider)" />
        <text x={0} y={10}>{formatWhole(max)}</text>
        <line x1={0} x2={W} y1={top} y2={top} stroke="var(--divider)" strokeDasharray="2 4" />
        {props.rows.map((r, i) => {
          const cx = slot * i + slot / 2;
          return (
            <g
              key={r.range.start}
              onClick={() => props.onPick(r.range)}
              onPointerEnter={() => setActive(i)}
              onPointerLeave={() => setActive(null)}
              style={{ cursor: "pointer" }}
            >
              <rect x={slot * i} y={0} width={slot} height={H} fill="transparent" />
              {i === shown && <rect x={slot * i + 2} y={top - 4} width={slot - 4} height={plotH + 4} rx={6} fill="var(--surface)" />}
              {bar(cx - barW - 1, r.income, "var(--chart-income)")}
              {bar(cx + 1, r.spending, "var(--accent)")}
              <text x={cx} y={H - 6} textAnchor="middle" style={i === shown ? { fill: "var(--text)", fontWeight: 600 } : undefined}>
                {props.label(r.range)}
              </text>
              <title>{`${props.longLabel(r.range)}: income ${formatCents(r.income)}, spending ${formatCents(r.spending)}`}</title>
            </g>
          );
        })}
      </svg>
      <figcaption className="legend">
        <span><i style={{ background: "var(--chart-income)" }} />Income</span>
        <span><i style={{ background: "var(--accent)" }} />Spending</span>
      </figcaption>
      {sel && (
        <div className="caption" style={{ color: "var(--text)", marginTop: 4 }} aria-live="polite">
          {props.longLabel(sel.range)}: {formatWhole(sel.income)} in · {formatWhole(sel.spending)} out
        </div>
      )}
      <details style={{ marginTop: 8 }}>
        <summary className="caption" style={{ minHeight: 32, cursor: "pointer" }}>Show as table</summary>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem", marginTop: 4 }}>
          <thead>
            <tr className="muted">
              <th style={{ textAlign: "left", fontWeight: 500 }}>Period</th>
              <th className="right" style={{ fontWeight: 500 }}>In</th>
              <th className="right" style={{ fontWeight: 500 }}>Out</th>
              <th className="right" style={{ fontWeight: 500 }}>Net</th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((r) => (
              <tr key={r.range.start} style={{ borderTop: "1px solid var(--divider)" }}>
                <td style={{ padding: "6px 0" }}>{props.longLabel(r.range)}</td>
                <td className="right">{formatWhole(r.income)}</td>
                <td className="right">{formatWhole(r.spending)}</td>
                <td className="right">{(r.income - r.spending < 0 ? "−" : "+") + formatWhole(Math.abs(r.income - r.spending))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
