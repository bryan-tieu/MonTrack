# Pocket Ledger: Design and Functionality Spec

*Working name. Version 1 draft, updated November 3, 2026.*

## 1. Product summary

Pocket Ledger is a private, iPhone-only money tracker for one person. It records everything coming in and going out, shows the balance of each account, and helps with budgets, recurring bills and paychecks, reports, and savings goals.

It is a Progressive Web App (PWA) hosted on Cloudflare and installed to the iPhone Home Screen. Cloudflare only serves the app's code. All financial data stays on the phone.

### Goals

- Log a typical transaction in under 10 seconds.
- Answer three questions at a glance: How much do I have? What came in and went out this pay period? How much budget is left?
- Work fully offline after the first load.
- Keep financial data off every server.

### Not in version 1

- Bank connections or statement imports
- Receipt scanning
- Sync between devices, user accounts, or sharing
- Push notifications
- Currencies other than US dollars
- Android or desktop layouts

## 2. Confirmed decisions

| Topic | Decision |
|---|---|
| Device | iPhone only |
| App type | PWA installed to the Home Screen |
| Hosting | Cloudflare, static files only |
| Data storage | On the phone only |
| Transaction entry | Manual only |
| Money tracking | Separate accounts, including credit cards |
| Currency | US dollars only |
| Budget period | Biweekly, following paychecks |
| Income amount | Take-home pay only |
| Features | Budgets by category, recurring items, charts and reports, savings goals |
| Security | PIN lock |
| Visual style | Clean and minimal |

## 3. Pay periods

The app's budgets and default views run on 14-day pay periods.

- During setup, the user enters a recent payday. This sets the schedule.
- A period starts on payday and ends the day before the next payday. For example, a period starting Friday, October 30 ends Thursday, November 12.
- A transaction belongs to the period containing its date.
- Period dates stay on the 14-day schedule, even if one paycheck lands a day or two early or late.
- If the pay schedule changes, the new schedule applies from the new payday onward. Earlier periods stay unchanged.
- The period dates, not the calendar month, control budgets. Some calendar months contain three paydays, which can make monthly income look unusually high in Reports.

## 4. How the app works

### Install and setup

1. Open the app's URL in Safari.
2. Tap **Share**, then **Add to Home Screen**.
3. Open the app from its Home Screen icon. Safari and the installed app should be treated as separate, so no data should be entered in Safari first. If Safari is detected, show install instructions rather than the app.
4. Create a 6-digit PIN.
5. Enter a recent payday to set the 14-day pay schedule.
6. Add at least one account and its current balance. For a credit card, enter the amount owed.
7. Review the default categories.
8. Optionally add a paycheck and regular bills.

### Main navigation

The bottom tab bar has five items:

| Tab | Purpose |
|---|---|
| **Home** | Balances, this pay period's summary, budget alerts, and items due before the next payday |
| **Activity** | Searchable transaction history |
| **+** | Add a transaction |
| **Plan** | Budgets, recurring items, and savings goals |
| **Reports** | Charts and pay period summaries |

A gear icon on Home opens Settings.

## 5. Functionality

### 5.1 Accounts

- Create, edit, and archive accounts.
- Account types: Checking, Savings, Cash, Credit Card, Other.
- Each account has a name and starting balance.
- Current balance is calculated from the starting balance and transactions.
- A credit card's balance is the amount owed. Card balances are never added to cash available.
- Home shows cash available across non-card accounts, total owed on cards, and each account's balance.
- Accounts with transactions can be archived but not deleted. History stays intact.

### 5.2 Transactions

There are three transaction types:

| Type | Effect | Required fields |
|---|---|---|
| **Expense** | Reduces an account, or adds to the amount owed on a card | Amount, date, account, category |
| **Income** | Increases an account | Amount, date, account, category |
| **Transfer** | Moves money between accounts | Amount, date, from account, to account |

All types can include an optional note.

Rules:

- Date defaults to today and account defaults to the last one used.
- Show recent or most-used categories first.
- Transfers do not count as income or spending.
- A card purchase counts as spending on its purchase date.
- A credit card payment is a transfer from a bank account to the card. It lowers both balances and does not count as spending again.
- Card interest and fees are logged as expenses on the card.
- Transactions can be edited or deleted.
- After a delete, show an **Undo** option for 5 seconds.
- An expense can be marked **Refund**. A refund adds money to the account or lowers the amount owed on a card, and it lowers spending in that category. It does not count as income.
- Future-dated transactions are allowed. They are marked **Scheduled** and excluded from current balances until their date arrives.

### 5.3 Categories

Default expense categories: Housing, Utilities, Groceries, Dining, Transport, Health, Insurance, Subscriptions, Shopping, Entertainment, Personal, Travel, Gifts, Fees, Other.

Default income categories: Paycheck, Side Income, Interest, Gift, Other.

Users can add, rename, reorder, and archive categories. Archived categories remain on old transactions.

### 5.4 Activity

- Transactions are grouped by date, newest first.
- Each row shows the category, note, account, and amount.
- Search by note, category, account, or amount.
- Filter by date range, type, account, and category.
- Show income, expense, and net totals for the filtered results.

### 5.5 Budgets

- Set a pay-period limit for any expense category.
- A budget continues each pay period until changed. A change applies from the selected period onward and does not rewrite past periods.
- A limit can be overridden for one period. This handles a monthly bill, such as rent, that falls in only some pay periods.
- Each budget shows spent, limit, remaining, and a progress bar.
- Show the bar in the accent color below 80%, amber from 80% to 99%, and red at 100% or more.
- Home lists budgets at 80% or above.
- Unused money does not roll over to the next pay period in version 1.

### 5.6 Recurring items

- Supports income, expenses, and transfers.
- Frequencies: weekly, every 2 weeks, twice a month, monthly, yearly.
- Each item has a name, amount, account, category, start date, and optional end date.
- Each item uses one of two modes:
  - **Confirm first:** The item appears on Home as due, and its amount can be edited before saving. This is the default and suits paychecks and variable bills.
  - **Add automatically:** The transaction is added on its due date. This suits fixed rent and subscriptions.
- A PWA cannot be relied on to run in the background, so the app processes due items each time it opens, including any missed while it was closed.
- A monthly item set for a day that doesn't exist in a shorter month uses that month's last day.
- Editing a recurring item affects future occurrences only.

### 5.7 Reports

- Pay period picker with income, expenses, and net. A toggle switches to calendar months.
- Spending by category, shown as a sorted bar chart.
- Income versus expense chart for the last six pay periods.
- Budget versus actual for the selected pay period.
- Top spending categories compared with the previous pay period.
- Credit card payments are excluded from spending totals.
- Tapping a chart item opens the matching transactions in Activity.
- Empty states explain what will appear after the first transactions are added.

### 5.8 Savings goals

- Each goal has a name, target amount, optional target date, and optional linked account.
- Show amount saved, percent complete, amount remaining, and the amount needed each pay period if there is a target date.
- **Add money** records a goal contribution and can also create a transfer between accounts.
- **Withdraw** reduces goal progress.
- Goal progress does not change an account balance unless a transfer is created.
- Finished goals can be archived.

### 5.9 PIN lock

- The app requires a PIN on open and after 1 minute in the background.
- The PIN is 6 digits and is never stored in plain text. Store only a salted hash from a slow key-derivation function, such as PBKDF2 through the Web Crypto API.
- After 5 wrong attempts, wait 30 seconds, then increase the delay with further failures.
- Hide balances behind a blank screen when the app is locked.
- The PIN can be changed in Settings after entering the current one.
- **Forgot PIN:** There is no server recovery. The only option is to erase app data and restore a backup, with a clear warning before erasing.
- **Limitation:** This PIN keeps out someone casually picking up the unlocked phone. It is not full database encryption. The iPhone passcode remains the main device protection.

### 5.10 Backup and export

Because data is stored only on the phone, backup is a required part of version 1.

- **Export backup:** Create a complete JSON file and open the iPhone share sheet so it can be saved to Files.
- **Restore backup:** Validate the file, show a summary, require confirmation, then replace all current data.
- **Export CSV:** Export transactions for use in a spreadsheet.
- **Reminder:** If there are unsaved changes and the last backup is at least 7 days old, show a reminder on Home.
- Show the last backup date in Settings.
- Warn that backup files are not encrypted and that anyone who can open one can read its contents.

### 5.11 Settings

- Accounts and categories
- Pay schedule
- Change PIN and auto-lock time
- Backup, restore, and CSV export
- Appearance: System, Light, Dark
- Storage status
- App version
- Erase all data, with PIN entry and a typed confirmation

## 6. Design

### Principles

- Numbers first, with little decoration.
- One main action per screen.
- Use whitespace and type size for hierarchy instead of heavy boxes.
- Use color only when it adds meaning.
- Keep common actions within thumb reach.

### Visual system

| Element | Light | Dark |
|---|---|---|
| Background | `#FFFFFF` | `#000000` |
| Surface | `#F5F5F7` | `#1C1C1E` |
| Primary text | `#1D1D1F` | `#F5F5F7` |
| Secondary text | `#6E6E73` | `#A1A1A6` |
| Divider | `#E5E5EA` | `#2C2C2E` |
| Accent | `#007AFF` | `#0A84FF` |
| Income | `#1E8E5A` | `#30D158` |
| Warning | `#B25E00` | `#FF9F0A` |
| Over budget | `#D70015` | `#FF453A` |

Expenses use the primary text color. Red is reserved for problems such as going over budget, so normal spending does not look like an error.

**Type:** Use the iPhone system font with tabular numbers.

| Style | Size and weight |
|---|---|
| Cash available | 40 pt, semibold |
| Screen title | 28 pt, bold |
| Section heading | 17 pt, semibold |
| Body | 16 pt, regular |
| Caption | 13 pt, regular |

**Layout:**

- 16 pt side margins and an 8 pt spacing scale
- 12 pt corner radius on cards
- Minimum 44 by 44 pt touch targets
- Respect the iPhone's top and bottom safe areas
- Use icons sparingly and in one line style
- Keep motion subtle and honor the iPhone's Reduce Motion setting

**Accessibility:**

- Support larger text without clipped amounts.
- Keep text at WCAG AA contrast or better.
- Never use color alone. Include labels such as "Over by $24."
- Add screen reader labels to icons and chart summaries.

### Key screens

#### Home

```text
Pocket Ledger                  [gear]

Cash available
$8,420.16
Owed on cards  $642.10

Oct 30 - Nov 12
In $2,100          Out $846   Net +$1,254

Accounts
Checking                     $2,120.16
Savings                      $6,000.00
Cash                           $300.00
Credit Card               $642.10 owed

Due before next payday
Card payment - Nov 10    $300  [Review]

Budgets to watch
Dining           $92 of $100   ███████░

[Home] [Activity] [ + ] [Plan] [Reports]
```

#### Add transaction

This opens as a full-height sheet.

```text
Cancel                          Save

[Expense] [Income] [Transfer]

              $24.50

Category           Groceries     >
Account            Checking      >
Date               Today         >
Note               Optional

  1      2      3
  4      5      6
  7      8      9
  .      0      ⌫
```

The custom keypad appears immediately, and the amount updates as each digit is entered. Save stays disabled until all required fields are complete.

#### Activity

Search sits at the top with filters below it. Results are grouped by day, and swiping left on a row reveals Delete.

#### Plan

A segmented control switches between Budgets, Recurring, and Goals. Each section has an **Add** button and a helpful empty state.

#### Reports

The pay period picker sits at the top, followed by the summary and charts. Charts have labeled values and avoid decorative effects.

## 7. Technical design

### Recommended stack

| Layer | Choice | Reason |
|---|---|---|
| App | React, TypeScript, and Vite | Common, type-safe, and fast to build |
| Local database | IndexedDB through Dexie | Structured local storage that works offline |
| Offline and install | `vite-plugin-pwa` and a web manifest | Handles caching and Home Screen setup |
| Charts | Lightweight SVG charts | Keeps the app small and easy to style |
| Hosting | Cloudflare Workers Static Assets | Cloudflare's recommended path for new projects |

### Architecture

```text
iPhone
├── Home Screen app (HTML, CSS, JavaScript)
├── Service worker for offline use
└── IndexedDB for all financial data

Cloudflare
└── Static app files only
```

There is no backend, login, database, API, analytics, or third-party tracking. The app should not send financial data over the network.

### Data model

All money is stored as integer cents to avoid rounding errors. Dates are stored as local `YYYY-MM-DD` values.

```ts
type Account = {
  id: string;
  name: string;
  type: "checking" | "savings" | "cash" | "creditCard" | "other";
  startingBalanceCents: number; // For cards, the amount owed
  archivedAt?: string;
  sortOrder: number;
};

type Category = {
  id: string;
  name: string;
  kind: "income" | "expense";
  icon?: string;
  archivedAt?: string;
  sortOrder: number;
};

type Transaction = {
  id: string;
  type: "expense" | "income" | "transfer";
  amountCents: number; // Always positive
  date: string;
  accountId: string;
  toAccountId?: string; // Transfers only
  categoryId?: string; // Not used for transfers
  note?: string;
  isRefund?: boolean;
  recurringItemId?: string;
  createdAt: string;
  updatedAt: string;
};

type BudgetRule = {
  id: string;
  categoryId: string;
  limitCents: number; // Per pay period
  periodStart: string; // First pay period this applies to
  onlyThisPeriod?: boolean; // One-period override
};

type RecurringItem = {
  id: string;
  name: string;
  type: "expense" | "income" | "transfer";
  amountCents: number;
  accountId: string;
  toAccountId?: string;
  categoryId?: string;
  frequency: "weekly" | "biweekly" | "twiceMonthly" | "monthly" | "yearly";
  startDate: string;
  endDate?: string;
  nextDueDate: string;
  mode: "confirm" | "automatic";
  pausedAt?: string;
};

type Goal = {
  id: string;
  name: string;
  targetCents: number;
  targetDate?: string;
  linkedAccountId?: string;
  archivedAt?: string;
};

type GoalEntry = {
  id: string;
  goalId: string;
  amountCents: number; // Negative for a withdrawal
  date: string;
  transactionId?: string;
};

type Settings = {
  pinHash: string;
  pinSalt: string;
  payScheduleAnchors: string[]; // One payday per schedule, oldest first
  appearance: "system" | "light" | "dark";
  autoLockSeconds: number;
  lastBackupAt?: string;
  schemaVersion: number;
};
```

### iPhone storage rules

- Launch the app in `standalone` display mode so it runs as a Home Screen app.
- Do not rely on the app while it is an ordinary Safari tab, because Safari can clear site storage after seven days of use without visiting the site.
- Call `navigator.storage.persist()` when available and show the result in Settings. Do not treat it as a guarantee.
- Deleting the app's Home Screen icon or clearing website data can erase its records.
- A backup file is the only supported way to move data to a new phone.
- Show clear errors for storage-full or database failures. Never report a transaction as saved until the write completes.

### Hosting and updates

- Deploy as an assets-only project on Cloudflare Workers Static Assets, with single-page app routing enabled.
- Use a stable URL. Changing the domain would create a separate app with separate storage.
- Show **Update available** instead of swapping the app while it is open.
- Use versioned, non-destructive Dexie migrations.
- Prompt for a backup before any database migration with structural changes.
- Set a strict Content Security Policy that blocks third-party scripts and unexpected network connections.

## 8. Build plan

| Phase | Scope |
|---|---|
| **1. Foundation** | PWA setup, Cloudflare deployment, Dexie schema, pay period logic, navigation, PIN, install screen |
| **2. Core tracking** | Accounts including credit cards, categories, add/edit/delete transactions, Home, Activity |
| **3. Safety** | Backup, restore, CSV export, storage status, reminders |
| **4. Planning** | Budgets, recurring items, goals |
| **5. Reports and polish** | Charts, dark mode, accessibility, performance |

Backup comes before planning features so real data is protected early.

## 9. Acceptance criteria

- The app installs from Safari and opens without browser controls.
- After one successful load, it opens and saves transactions in Airplane Mode.
- Expenses, income, transfers, and refunds produce the correct balances and reports.
- Transfers never count as income or spending.
- A card purchase counts as spending once, and its later payment does not count again.
- Each date falls in exactly one pay period, including the first and last days of a period.
- A due recurring item appears once, even if the app is opened repeatedly.
- Budget totals stay correct when transactions are edited, deleted, or moved to another pay period.
- Exporting, erasing, and restoring returns all data accurately.
- Network inspection shows no financial data leaving the phone.
- All main screens work at the smallest supported iPhone width and with larger text enabled.
- The PIN screen hides financial information when the app opens or returns from the background.

## 10. Later ideas

- Password-protected backup files
- Face ID unlock
- Split transactions
- CSV import
- Rollover budgets
- Tags
- Pay period review screen

## 11. Technical references

- [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- [Cloudflare guidance on new projects](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/#use-workers-static-assets-for-new-projects)
- [WebKit storage policy announcement](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)
- [MDN storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
