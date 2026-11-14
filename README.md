# FinChat — Local Budget Copilot

A local-first budgeting app where you log expenses, income and savings by chatting in plain language. Messages are parsed by Google Gemini into structured transactions and budget-plan updates; all data stays on your device in IndexedDB (with a localStorage fallback).

Built with React, Vite and Tailwind CSS, and packaged as an Android app with Capacitor.

## Features

- **Conversational logging** — "Spent 450 on coffee and 2,000 on groceries yesterday" becomes categorized transactions.
- **Budget plan updates by chat** — change your monthly income target, 50/30/20 ratios, or per-category limits.
- **Ask questions** — get answers about spending and budget health based on your plan and recent transactions.
- **50/30/20 tracking** — transactions are bucketed into Needs, Wants, Savings and Income.
- **Charts** — category donut chart and bucket allocation bar chart.
- **Transactions & plan tables** — search, filter and delete transactions; edit category limits.
- **Local-first storage** — IndexedDB, plus JSON export for backups and a reset to sample data.

## Getting started

Requires Node.js 18+ and a [Gemini API key](https://aistudio.google.com/apikey).

```bash
npm install
cp .env.example .env   # then set VITE_GEMINI_API_KEY
npm run dev
```

You can also leave `.env` empty and paste your key (or upload a `.env` file) in the app's settings; it is then stored in localStorage on the device.

> **Note:** `VITE_` variables are embedded into the built JavaScript bundle. Don't ship a build with your key baked in to anyone else — prefer entering the key in the app instead.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Build the web app into `dist/` |
| `npm run android:sync` | Build and sync web assets into the Android project |
| `npm run android:apk` | Build, sync and assemble a debug APK |

## Android

Requires Android Studio / the Android SDK and a JDK.

```bash
npm run android:apk
```

The debug APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`. To open the project in Android Studio instead, run `npm run android:sync` followed by `npx cap open android`.

App ID: `com.personal.finchat` (see `capacitor.config.json`).

## Project structure

```
src/
  App.jsx          # Shell: header, Chat/Dashboard switch, modals
  pages/
    Chat.jsx       # Chat feed, quick prompts and input
    Dashboard.jsx  # KPIs, charts, transactions and category limits
  components/      # UI pieces composed by the two pages
  store/
    dbStore.js     # Budget data (transactions, plan, currency) + API key
    chatStore.js   # Messages and sendMessage, which writes parsed results into dbStore
    idbStorage.js  # IndexedDB adapter for zustand persist (localStorage fallback)
    useHydration.js
  lib/
    constants.js   # Categories, defaults, sample data
    budget.js      # Metrics and money formatting
    gemini.js      # Gemini request, response validation and plan-update merging
android/           # Capacitor-generated Android project
```

State lives in [zustand](https://github.com/pmndrs/zustand) stores persisted to IndexedDB, so the chat and dashboard always read the same data.
