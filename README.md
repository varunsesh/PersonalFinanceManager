# FinChat — Local Budget Copilot

A chat-first, local-first app for budgeting and financial planning. You type or say what you spent, earned, saved or own, and Google Gemini turns it into transactions, budget changes, after-tax projections and a live portfolio. The data lives on your device in IndexedDB; a dashboard and manual entry are there when you want them.

Built with React, Vite, Tailwind CSS and zustand, and packaged as an Android app with Capacitor.

## Features

**Chat**
- **This month at a glance:** a card above the chat shows how much is left to spend, a safe amount per day, spending pace against the month, goal progress and open suggestions.
- **Log in plain language:** "Spent 480 on coffee and 1200 on an uber", "I save 1.5 lakh a year towards PPF". Habits and yearly amounts become one transaction for the current month.
- **Correct mistakes:** "the coffee was 450", "delete the swiggy order from September". The assistant finds the transaction and edits or removes it.
- **Undo:** every reply that changes data has an Undo button that reverses exactly what that reply did.
- **Ask about any period:** "dining last month", "expenses month by month since September". Answers are computed on the device from your full history.
- **Cards and warnings:** replies can include a summary, plan-vs-actual or category card, and the app warns when a category or the Needs/Wants bucket crosses 80% or 100% of its limit.
- **Voice input:** tap the mic and speak (English, India). The message sends when you stop talking.
- **Plan changes on request:** "set dining limit to 8000", "change the split to 50/25/25". Partial splits are rebalanced to 100%.

**Planning**
- **After-tax projections:** "2L in an FD at 7.25% for 3 years", "15k SIP in Parag Parikh for 10 years", "$5,000 in VOO for 8 years", "10k/month in NPS till 60". Cards show the tax breakdown, post-tax return, value in today's money, a range at ±2%, and sliders for return and years.
- **Loans and EMIs:** "EMI on a 50L home loan at 8.5% for 20 years", "how much can I borrow with a 40k EMI?", "how long to repay 8L at 15k a month?". Give any three of amount, rate, tenure and EMI and the fourth is worked out, with total interest, a principal/interest bar, a year-by-year table and sliders.
- **Required investment:** "how much monthly to have ₹50L in today's money in 12 years?"
- **Investments you own:** mutual funds (Indian and international), US stocks/ETFs, FDs, PPF, NPS and Indian stocks/IPOs, added and updated by chat. Values update from live prices; "what's my net worth?" shows allocation, gains and tax if sold today.
- **Goals:** "₹20L for a car in 3 years", an emergency fund sized from your spending, targets in today's money. Fund them with linked investments (whole or a share), savings tagged to the goal and money held elsewhere; see progress, the after-tax monthly amount needed, your actual pace and whether you're on track.
- **Suggestions you decide on:** splitting this month's savings across goals, setting up an emergency fund, what to do with a maturing FD, booking Indian equity gains tax-free within the ₹1.25L yearly allowance, and goals due soon that are mostly in equity. Each has Accept / Adjust / Dismiss (or Ask FinChat); nothing changes until you accept, and accepted suggestions can be undone.
- **Memory:** the assistant remembers lasting facts you mention (age, employer NPS, preferences, plans) across conversations. Review, add or delete them in Settings. ID and account numbers are never stored.
- **Settings:** tax slab (new regime), inflation, rupee depreciation, NPS annuity rate, default expected returns and remembered facts.

**Plan (secondary)**
- **This month:** KPIs with change vs last month, 50/30/20 plan vs. actual, spending by category, category limits with month-on-month change, and the transaction list.
- **Goals:** every goal with progress ring, status and monthly need vs. pace.
- **Investments:** net worth, allocation, each holding with value and gain, tax if sold today, and a price refresh.
- Searchable transaction list (all months) and editable category limits.
- Manual entry and reset to sample data.

**Backups**
- One file with everything (transactions, plan, investments, goals, remembered facts, chat, settings; never API keys), saved through Android's share sheet to Drive, Files or email. Restore shows what the file contains and replaces data only after you confirm.

## How the assistant works

Each message runs a [Gemini function-calling](https://ai.google.dev/gemini-api/docs/function-calling) loop (`gemini-2.5-flash`, up to 6 rounds):

| Tool | Kind | What it does |
| --- | --- | --- |
| `get_spending_summary` | query | Totals for a date range, filtered and grouped by category, bucket, month or type |
| `find_transactions` | query | Search by text, date, category, type or amount (returns ids) |
| `get_budget_status` | query | A month's plan, bucket targets and category limits vs. actuals |
| `log_transactions` | action | Add new transactions |
| `edit_transactions` | action | Correct transactions by id |
| `delete_transactions` | action | Remove transactions by id |
| `update_plan` | action | Change the income target, split or category limits |
| `calculate_returns` | query | After-tax projection for FD/RD, PPF, NPS, Indian equity, international funds, US stocks or debt funds (USD amounts converted) |
| `required_investment` | query | Lumpsum/monthly/yearly amount needed to reach an after-tax target |
| `calculate_loan` | query | EMI calculator: from any three of loan amount, rate, tenure and EMI, computes the fourth, plus total interest and a yearly breakdown |
| `search_mutual_funds` | query | Find Indian mutual fund scheme codes (mfapi.in) |
| `search_us_stocks` | query | Find US tickers (Finnhub) |
| `get_portfolio` | query | Holdings with live values, allocation, gains and tax if sold today |
| `add_holding` | action | Record an investment; units can be derived from a lumpsum's NAV on its date |
| `update_holding` | action | Change units, cost, value or FD details |
| `remove_holding` | action | Remove a holding |
| `create_goal` / `update_goal` / `delete_goal` | action | Manage goals (emergency funds size themselves) |
| `link_holding_to_goal` | action | Earmark a holding, or a share of it, for a goal |
| `get_goals` | query | Progress, monthly need, pace and status for every goal |
| `get_suggestions` | query | The app's current suggestions (the user accepts them in a card) |
| `remember` / `update_memory` / `forget` | action | Keep lasting facts about the user across conversations |
| `show_card` | action | Attach a summary, buckets, categories, portfolio, goals or suggestions card to the reply |

Query tools run locally, and only their results are sent back to Gemini. Action tools are validated (amounts, types, categories, dates, ids) and reported back to the model, so its reply only describes changes that were accepted. The app then applies them in one step and records them for Undo.

**What Gemini sees:** this month's budget status, your 10 most recent transactions, the names of your holdings and goals, the facts it remembers about you, the last 10 chat messages, and the results of any tools it calls. It never receives the full ledger. Calculations are always done by the app, never by the model.

## Tax and prices

**Tax rules** (FY 2026-27, new regime) live in `src/lib/finance/taxRules.js`, so they can be updated when budgets change:

| Investment | Tax |
| --- | --- |
| Indian equity funds, stocks, IPOs | Short-term (≤12 months) 20%; long-term 12.5% above ₹1.25L a year |
| International funds (Indian fund houses), US stocks/ETFs | Short-term (≤24 months) at your slab; long-term 12.5%, no exemption |
| FD/RD, debt funds | Your slab |
| PPF | Tax-free |
| NPS | 60% lump sum tax-free; annuity income at your slab |

All amounts add 4% cess; surcharge is not modelled. SIPs are taxed per instalment, so recent instalments count as short-term. Projections are estimates, and market returns are assumptions.

**Price sources:**

| Data | Source | Key |
| --- | --- | --- |
| Indian mutual fund NAVs (incl. international funds from Indian fund houses) | [mfapi.in](https://www.mfapi.in) | None |
| US stocks and ETFs | [Finnhub](https://finnhub.io) (free tier, personal use) | Enter in Settings |
| USD→INR | [Frankfurter](https://frankfurter.dev) | None |
| PPF, NPS, Indian stocks | Entered manually | — |

On Android, price requests go through Capacitor's native HTTP client, because mfapi.in's NAV endpoints don't allow browser cross-origin requests. Prices refresh when older than 6 hours.

## Getting started

Requires Node.js 18+ and a [Gemini API key](https://aistudio.google.com/apikey).

```bash
npm install
npm run dev
```

Then tap **API Key** in the app and paste your key (or pick a `.env`/`.txt` file containing it). The key is stored in the device's localStorage and sent only to the Gemini API. For US stock prices, add a free [Finnhub key](https://finnhub.io) under the gear icon (Settings).

Keys are never compiled into the build: the app doesn't read them from `.env`, so `dist/` and the APK are safe to share.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server (voice input is Android-only) |
| `npm run build` | Build the web app into `dist/` |
| `npm run android:sync` | Build and sync web assets and plugins into the Android project |
| `npm run android:apk` | Build, sync and assemble a debug APK |

## Android

Requires the Android SDK and a JDK (Android Studio provides both).

```bash
npm run android:apk
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

`-r` keeps the app's existing data. To open the project in Android Studio, run `npm run android:sync` and then `npx cap open android`.

- App ID: `com.personal.finchat` (see `capacitor.config.json`)
- Voice input uses [`@capacitor-community/speech-recognition`](https://github.com/capacitor-community/speech-recognition) and asks for microphone permission on first use.
- Backups use `@capacitor/filesystem` and `@capacitor/share`.
- **Icons and splash screens** come from the SVG sources in `assets/source/` (a chat bubble with rising bars). After editing them, render the PNGs into `assets/` and run `npx capacitor-assets generate --android`.

## Project structure

```
src/
  App.jsx               # Shell: header, Chat/Dashboard switch, modals
  pages/
    Chat.jsx            # Chat feed, quick prompts and input
    Dashboard.jsx       # Monthly KPIs, charts, ledger and category limits
  components/           # UI pieces composed by the two pages (ThisMonthCard, ChatCard,
                        #   ReturnsCard, SuggestionCard, GoalsSection, PortfolioSection, ...)
  assets/logo.svg       # App logo used in the header and loading screen
  hooks/
    useVoiceInput.js    # Speech recognition with auto-send on end of speech
  store/
    dbStore.js          # Budget data (transactions, plan, currency, holdings) + API key
    chatStore.js        # Messages, sendMessage, undoMessage, acceptSuggestion
    useSuggestions.js   # Current suggestions, recomputed as data changes
    idbStorage.js       # IndexedDB adapter for zustand persist (localStorage fallback)
    settingsStore.js    # Tax slab, assumptions, default returns, Finnhub key
    useHydration.js     # Waits for stored data to load before rendering
  lib/
    gemini.js           # System prompt, chat history and the function-calling loop
    tools.js            # Tool declarations and their local implementations
    assistantActions.js # Applies tool actions, undo, budget alerts and card data
    validation.js       # Checks transactions and plan updates proposed by the model
    portfolio.js        # Holdings: creation, valuation, price refresh, exit-tax estimate
    goals.js            # Goal balance, target, monthly need, pace and status
    suggestions.js      # Suggestion rules and how an accepted one changes data
    memory.js           # Validation for remembered facts
    backup.js           # Backup file export, validation and restore
    finance/
      calculators.js    # After-tax projections and required-contribution solver
      loans.js          # EMI / loan amount / tenure / rate solver and amortisation
      taxRules.js       # Tax rates and instrument definitions
    prices/             # mfapi.in, Finnhub, Frankfurter clients and a native-aware HTTP helper
    budget.js           # Monthly metrics and money formatting
    constants.js        # Categories, defaults, sample data, local dates
assets/                 # Logo, icon and splash sources (SVG) and rendered PNGs
android/                # Capacitor Android project
```

State lives in [zustand](https://github.com/pmndrs/zustand) stores persisted to IndexedDB. The chat writes into the same store the dashboard reads, so both always show the same data.
