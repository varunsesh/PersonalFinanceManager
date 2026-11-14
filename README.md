# FinChat — Local Budget Copilot

A chat-first, local-first budgeting app. You type or say what you spent, earned or saved, and Google Gemini turns it into transactions, budget changes and answers. The data lives on your device in IndexedDB; a dashboard and manual entry are there when you want them.

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

**Dashboard (secondary)**
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
| `show_card` | action | Attach a summary, buckets or categories card to the reply |

Query tools run locally, and only their results are sent back to Gemini. Action tools are validated (amounts, types, categories, dates, ids) and reported back to the model, so its reply only describes changes that were accepted. The app then applies them in one step and records them for Undo.

**What Gemini sees:** this month's budget status, your 10 most recent transactions, the last 10 chat messages, and the results of any tools it calls. It never receives the full ledger.

## Getting started

Requires Node.js 18+ and a [Gemini API key](https://aistudio.google.com/apikey).

```bash
npm install
npm run dev
```

Then tap **API Key** in the app and paste your key (or pick a `.env`/`.txt` file containing it). The key is stored in the device's localStorage and sent only to the Gemini API.

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
  components/           # UI pieces composed by the two pages (ChatCard, ChatMessage, ...)
  hooks/
    useVoiceInput.js    # Speech recognition with auto-send on end of speech
  store/
    dbStore.js          # Budget data (transactions, plan, currency) + API key
    chatStore.js        # Messages, sendMessage and undoMessage
    idbStorage.js       # IndexedDB adapter for zustand persist (localStorage fallback)
    useHydration.js     # Waits for stored data to load before rendering
  lib/
    gemini.js           # System prompt, chat history and the function-calling loop
    tools.js            # Tool declarations and their local implementations
    assistantActions.js # Applies tool actions, undo, budget alerts and card data
    validation.js       # Checks transactions and plan updates proposed by the model
    budget.js           # Monthly metrics and money formatting
    constants.js        # Categories, defaults, sample data, local dates
android/                # Capacitor Android project
```

State lives in [zustand](https://github.com/pmndrs/zustand) stores persisted to IndexedDB. The chat writes into the same store the dashboard reads, so both always show the same data.
