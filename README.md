# FinChat — Local Budget Copilot

A chat-first, local-first app for budgeting and financial planning. You type or say what you spent, earned, saved or own, and Google Gemini turns it into transactions, budget changes, after-tax projections and a live portfolio. The data lives on your device in IndexedDB; a dashboard and manual entry are there when you want them.

Built with React, Vite, Tailwind CSS and zustand, and packaged as an Android app with Capacitor.

## Features

**Chat**
- **Log in plain language:** "Spent 480 on coffee and 1200 on an uber", "I save 1.5 lakh a year towards PPF". Habits and yearly amounts become one transaction for the current month.
- **Correct mistakes:** "the coffee was 450", "delete the swiggy order from September". The assistant finds the transaction and edits or removes it.
- **Undo:** every reply that changes data has an Undo button that reverses exactly what that reply did.
- **Ask about any period:** "dining last month", "expenses month by month since September". Answers are computed on the device from your full history.
- **Cards and warnings:** replies can include a summary, plan-vs-actual or category card, and the app warns when a category or the Needs/Wants bucket crosses 80% or 100% of its limit.
- **Voice input:** tap the mic and speak (English, India). The message sends when you stop talking.
- **Plan changes on request:** "set dining limit to 8000", "change the split to 50/25/25". Partial splits are rebalanced to 100%.

**Planning**
- **After-tax projections:** "2L in an FD at 7.25% for 3 years", "15k SIP in Parag Parikh for 10 years", "$5,000 in VOO for 8 years", "10k/month in NPS till 60". Cards show the tax breakdown, post-tax return, value in today's money, a range at ±2%, and sliders for return and years.
- **Required investment:** "how much monthly to have ₹50L in today's money in 12 years?"
- **Investments you own:** mutual funds (Indian and international), US stocks/ETFs, FDs, PPF, NPS and Indian stocks/IPOs, added and updated by chat. Values update from live prices; "what's my net worth?" shows allocation, gains and tax if sold today.
- **Settings:** tax slab (new regime), inflation, rupee depreciation, NPS annuity rate and default expected returns.

**Dashboard (secondary)**
- Investments: net worth, allocation, each holding with value and gain, tax if sold today, and a price refresh.
- Current-month KPIs, 50/30/20 plan vs. actual, and spending by category.
- Searchable transaction list (all months) and editable category limits.
- Manual entry, JSON export, and reset to sample data.

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
| `search_mutual_funds` | query | Find Indian mutual fund scheme codes (mfapi.in) |
| `search_us_stocks` | query | Find US tickers (Finnhub) |
| `get_portfolio` | query | Holdings with live values, allocation, gains and tax if sold today |
| `add_holding` | action | Record an investment; units can be derived from a lumpsum's NAV on its date |
| `update_holding` | action | Change units, cost, value or FD details |
| `remove_holding` | action | Remove a holding |
| `show_card` | action | Attach a summary, buckets, categories or portfolio card to the reply |

Query tools run locally, and only their results are sent back to Gemini. Action tools are validated (amounts, types, categories, dates, ids) and reported back to the model, so its reply only describes changes that were accepted. The app then applies them in one step and records them for Undo.

**What Gemini sees:** this month's budget status, your 10 most recent transactions, the names of your holdings, the last 10 chat messages, and the results of any tools it calls. It never receives the full ledger. Calculations are always done by the app, never by the model.

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

Alternatively, `cp .env.example .env` and set `VITE_GEMINI_API_KEY`.

> **Warning:** `VITE_` variables are embedded in the built JavaScript, so a key in `.env` ends up inside `dist/` and the APK. Don't share a build made with a key in `.env`.

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

## Project structure

```
src/
  App.jsx               # Shell: header, Chat/Dashboard switch, modals
  pages/
    Chat.jsx            # Chat feed, quick prompts and input
    Dashboard.jsx       # Monthly KPIs, charts, ledger and category limits
  components/           # UI pieces composed by the two pages (ChatCard, ReturnsCard,
                        #   PortfolioSection, SettingsModal, ...)
  hooks/
    useVoiceInput.js    # Speech recognition with auto-send on end of speech
  store/
    dbStore.js          # Budget data (transactions, plan, currency, holdings) + API key
    chatStore.js        # Messages, sendMessage and undoMessage
    idbStorage.js       # IndexedDB adapter for zustand persist (localStorage fallback)
    settingsStore.js    # Tax slab, assumptions, default returns, Finnhub key
    useHydration.js     # Waits for stored data to load before rendering
  lib/
    gemini.js           # System prompt, chat history and the function-calling loop
    tools.js            # Tool declarations and their local implementations
    assistantActions.js # Applies tool actions, undo, budget alerts and card data
    validation.js       # Checks transactions and plan updates proposed by the model
    portfolio.js        # Holdings: creation, valuation, price refresh, exit-tax estimate
    finance/
      calculators.js    # After-tax projections and required-contribution solver
      taxRules.js       # Tax rates and instrument definitions
    prices/             # mfapi.in, Finnhub, Frankfurter clients and a native-aware HTTP helper
    budget.js           # Monthly metrics and money formatting
    constants.js        # Categories, defaults, sample data, local dates
android/                # Capacitor Android project
```

State lives in [zustand](https://github.com/pmndrs/zustand) stores persisted to IndexedDB. The chat writes into the same store the dashboard reads, so both always show the same data.
