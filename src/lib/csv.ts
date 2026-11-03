import type { Account, Category, Transaction } from "./types";
import { centsToInput } from "./money";

// Text that a spreadsheet would run as a formula gets a leading apostrophe.
const esc = (v: string) => {
  if (/^[=+@\t\r]/.test(v)) v = `'${v}`;
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

export function transactionsCsv(txns: Transaction[], accounts: Account[], categories: Category[], asOf: string): string {
  const acc = new Map(accounts.map((a) => [a.id, a.name]));
  const cat = new Map(categories.map((c) => [c.id, c.name]));
  const rows = [["Date", "Type", "Amount", "Account", "To account", "Category", "Note", "Refund", "Scheduled"]];
  for (const t of [...txns].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))) {
    const signed = t.type === "income" || (t.type === "expense" && t.isRefund) ? t.amountCents : t.type === "expense" ? -t.amountCents : t.amountCents;
    rows.push([
      t.date,
      t.type,
      centsToInput(signed),
      acc.get(t.accountId) ?? "",
      t.toAccountId ? acc.get(t.toAccountId) ?? "" : "",
      t.categoryId ? cat.get(t.categoryId) ?? "" : "",
      t.note ?? "",
      t.isRefund ? "yes" : "",
      t.date > asOf ? "yes" : "",
    ]);
  }
  return rows.map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n";
}
