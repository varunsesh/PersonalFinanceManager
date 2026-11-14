import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Send, Wallet, TrendingUp, TrendingDown, PiggyBank, Plus, Trash2,
  Download, RotateCcw, Sparkles, PieChart as PieChartIcon,
  BarChart3, Search, CheckCircle2, MessageSquare, LayoutDashboard,
  Bot, User, Edit3, Check, X, Database, KeyRound, FileText
} from 'lucide-react';

// ============================================================================
// 1. LOCAL-FIRST STORAGE LAYER (IndexedDB + localStorage fallback)
// ============================================================================
const DB_NAME = 'FinChatLocalBudgetDB';
const DB_VERSION = 1;
const STORE_NAME = 'app_state';
const API_KEY_STORAGE = 'finchat_gemini_api_key';

// A single shared connection: every write awaits the same promise, so readwrite
// transactions are created (and therefore committed) in the order they were
// requested. Opening a new connection per call let a stale write land last.
let dbPromise = null;

const BudgetStorage = {
  openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB unavailable'));
        return;
      }
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onclose = () => {
          dbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => reject(req.error);
    });
    dbPromise.catch(() => {
      dbPromise = null;
    });
    return dbPromise;
  },

  async get(key) {
    try {
      const db = await this.openDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error);
      });
    } catch {
      try {
        const raw = localStorage.getItem(`${DB_NAME}_${key}`);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    }
  },

  async set(key, value) {
    try {
      const db = await this.openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
        store.put(value, key);
      });
    } catch {
      // IndexedDB unavailable or failed: fall back to localStorage, which get() also reads
      try {
        localStorage.setItem(`${DB_NAME}_${key}`, JSON.stringify(value));
      } catch {
        // Ignore quota errors
      }
    }
  },

  async clearAll() {
    try {
      const db = await this.openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const req = tx.objectStore(STORE_NAME).clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {
      // Ignore
    }
    Object.keys(localStorage)
      .filter((k) => k.startsWith(DB_NAME))
      .forEach((k) => localStorage.removeItem(k));
  }
};

// ============================================================================
// 2. DEFAULTS & CONSTANTS
// ============================================================================
const CATEGORIES = [
  'Housing & Rent',
  'Groceries',
  'Utilities & Bills',
  'Transport',
  'Dining & Coffee',
  'Shopping & Lifestyle',
  'Health & Fitness',
  'Savings & Investments',
  'Salary & Income',
  'Other'
];

const CATEGORY_COLORS = {
  'Housing & Rent': '#4f46e5',
  'Groceries': '#0ea5e9',
  'Utilities & Bills': '#6366f1',
  'Transport': '#14b8a6',
  'Dining & Coffee': '#f59e0b',
  'Shopping & Lifestyle': '#ec4899',
  'Health & Fitness': '#8b5cf6',
  'Savings & Investments': '#10b981',
  'Salary & Income': '#059669',
  'Other': '#64748b'
};

const BUCKET_META = {
  needs: { label: 'Needs (50%)', color: '#4f46e5', bg: 'bg-indigo-50', text: 'text-indigo-700' },
  wants: { label: 'Wants (30%)', color: '#f59e0b', bg: 'bg-amber-50', text: 'text-amber-700' },
  savings: { label: 'Savings (20%)', color: '#10b981', bg: 'bg-emerald-50', text: 'text-emerald-700' },
  income: { label: 'Income', color: '#059669', bg: 'bg-teal-50', text: 'text-teal-700' }
};

const DEFAULT_PLAN = {
  monthlyIncomeTarget: 120000,
  ratios: { needs: 50, wants: 30, savings: 20 },
  categoryLimits: {
    'Housing & Rent': 32000,
    'Groceries': 12000,
    'Utilities & Bills': 6000,
    'Transport': 6000,
    'Dining & Coffee': 10000,
    'Shopping & Lifestyle': 14000,
    'Health & Fitness': 5000,
    'Savings & Investments': 24000,
    'Other': 5000
  }
};

const TODAY = new Date().toISOString().slice(0, 10);

const SAMPLE_TRANSACTIONS = [
  { id: 'tx-1', date: TODAY, description: 'Monthly Salary Credit', amount: 120000, type: 'income', bucket: 'income', category: 'Salary & Income' },
  { id: 'tx-2', date: TODAY, description: 'Apartment Rent', amount: 30000, type: 'expense', bucket: 'needs', category: 'Housing & Rent' },
  { id: 'tx-3', date: TODAY, description: 'Index Fund SIP Auto-Debit', amount: 20000, type: 'savings', bucket: 'savings', category: 'Savings & Investments' },
  { id: 'tx-4', date: TODAY, description: 'Weekly Organic Groceries', amount: 4200, type: 'expense', bucket: 'needs', category: 'Groceries' },
  { id: 'tx-5', date: TODAY, description: 'Specialty Coffee & Dinner Out', amount: 2450, type: 'expense', bucket: 'wants', category: 'Dining & Coffee' },
  { id: 'tx-6', date: TODAY, description: 'Electricity & Fiber Internet', amount: 3100, type: 'expense', bucket: 'needs', category: 'Utilities & Bills' }
];

const INITIAL_MESSAGES = [
  {
    id: 'msg-welcome',
    role: 'assistant',
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    text: "I'm your local-first budget copilot. Everything is saved privately on your device.\n\nTell me about an expense, income, or budget goal in plain English—for example:\n• \"Spent 650 on coffee and lunch today\"\n• \"My monthly income is 1,50,000 and I want 50/25/25 split\"\n• \"Moved 15000 into emergency fund savings\""
  }
];

// ============================================================================
// 3. GEMINI CONVERSATIONAL BUDGET PARSER
// ============================================================================
const HISTORY_TURNS = 10;
const RATIO_KEYS = ['needs', 'wants', 'savings'];
const TX_TYPES = ['expense', 'income', 'savings'];

const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);

function isValidDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}

// Coerce one model-produced transaction into a consistent shape. `type` is the
// source of truth: income/savings always map to their own bucket, and expenses
// can only be needs or wants. Returns null if the entry is unusable.
function normalizeTransaction(t) {
  const amount = Math.abs(Number(t?.amount));
  if (!Number.isFinite(amount) || amount === 0) return null;
  if (!TX_TYPES.includes(t.type)) return null;
  const bucket = t.type === 'expense' ? (t.bucket === 'wants' ? 'wants' : 'needs') : t.type;
  const category = CATEGORIES.includes(t.category) ? t.category : 'Other';
  return {
    description: String(t.description || '').trim() || category,
    amount,
    type: t.type,
    bucket,
    category,
    date: isValidDate(t.date) ? t.date : TODAY
  };
}

// Apply a model-produced plan update to `prev` without mutating it. Partial
// ratio changes keep the given values and rebalance the rest proportionally so
// the split always totals 100. Returns what was applied and what was rejected.
function applyPlanUpdate(prev, pu, fmt) {
  const next = { ...prev, ratios: { ...prev.ratios }, categoryLimits: { ...prev.categoryLimits } };
  const applied = [];
  const skipped = [];

  if (pu.monthlyIncomeTarget != null) {
    if (isFiniteNumber(pu.monthlyIncomeTarget) && pu.monthlyIncomeTarget > 0) {
      next.monthlyIncomeTarget = pu.monthlyIncomeTarget;
      applied.push(`Income Target: ${fmt(pu.monthlyIncomeTarget)}`);
    } else {
      skipped.push(`income target of ${pu.monthlyIncomeTarget} is invalid`);
    }
  }

  const given = {};
  RATIO_KEYS.forEach((key) => {
    const v = pu[`${key}Ratio`];
    if (v == null) return;
    if (isFiniteNumber(v) && v >= 0 && v <= 100) given[key] = v;
    else skipped.push(`${key} ratio of ${v}% is invalid`);
  });
  const givenKeys = Object.keys(given);
  if (givenKeys.length > 0) {
    const givenSum = givenKeys.reduce((s, k) => s + given[k], 0);
    const rest = RATIO_KEYS.filter((k) => !(k in given));
    const fits = rest.length === 0 ? Math.abs(givenSum - 100) < 0.01 : givenSum <= 100;
    if (!fits) {
      skipped.push(
        `split (${givenKeys.map((k) => `${k} ${given[k]}%`).join(', ')}) doesn't add up to 100%`
      );
    } else {
      const ratios = { ...given };
      const remaining = 100 - givenSum;
      const prevRestSum = rest.reduce((s, k) => s + prev.ratios[k], 0);
      let assigned = 0;
      rest.forEach((k, i) => {
        if (i === rest.length - 1) {
          ratios[k] = remaining - assigned;
        } else {
          ratios[k] = Math.round(
            prevRestSum > 0 ? (remaining * prev.ratios[k]) / prevRestSum : remaining / rest.length
          );
          assigned += ratios[k];
        }
      });
      next.ratios = ratios;
      applied.push(`Split: ${ratios.needs}/${ratios.wants}/${ratios.savings}`);
    }
  }

  (pu.categoryLimitUpdates || []).forEach((item) => {
    if (!CATEGORIES.includes(item?.category) || item.category === 'Salary & Income') {
      skipped.push(`limit for unknown category "${item?.category}"`);
    } else if (!isFiniteNumber(item.limit) || item.limit < 0) {
      skipped.push(`${item.category} limit of ${item.limit} is invalid`);
    } else {
      next.categoryLimits[item.category] = item.limit;
      applied.push(`${item.category} limit: ${fmt(item.limit)}`);
    }
  });

  return { plan: applied.length > 0 ? next : prev, applied, skipped };
}

// Numbers the model needs to answer budget questions accurately.
function buildBudgetSnapshot(plan, metrics, transactions) {
  return {
    plan,
    totals: {
      income: metrics.totalIncome,
      expenses: metrics.totalExpenses,
      savings: metrics.totalSavings,
      unallocated: metrics.netCashflow
    },
    buckets: metrics.bucketList.map((b) => ({
      bucket: b.key,
      targetPercent: b.ratio,
      target: b.target,
      actual: b.actual
    })),
    categories: CATEGORIES.filter((c) => c !== 'Salary & Income').map((c) => ({
      category: c,
      spent: metrics.byCategory[c] || 0,
      limit: plan.categoryLimits[c] ?? null
    })),
    recentTransactions: transactions.slice(0, 15).map(({ id, ...rest }) => rest)
  };
}

// Convert prior chat messages to Gemini turns. Badges are appended so the model
// knows what the app actually saved, not just what it said it would save.
function toGeminiHistory(messages) {
  const turns = [];
  messages
    .filter((m) => !m.isError)
    .slice(-HISTORY_TURNS)
    .forEach((m) => {
      const role = m.role === 'user' ? 'user' : 'model';
      const text = m.badges?.length ? `${m.text}\n[Applied: ${m.badges.join('; ')}]` : m.text;
      const last = turns[turns.length - 1];
      if (last?.role === role) last.parts[0].text += `\n\n${text}`;
      else turns.push({ role, parts: [{ text }] });
    });
  while (turns.length > 0 && turns[0].role !== 'user') turns.shift();
  return turns;
}

async function callGeminiBudgetParser({ userMessage, history, snapshot, currency, apiKey }) {
  if (!apiKey) {
    throw new Error('NO_API_KEY');
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;

  const systemInstruction = `You are FinChat, an intelligent personal finance and budgeting assistant embedded inside a local-first mobile budget tracker.
Today's date is ${TODAY}. Active currency symbol is "${currency}".

Current budget snapshot (computed by the app across all logged transactions):
${JSON.stringify(snapshot)}

Your job:
1. Parse the user's LATEST message to extract any NEW financial transactions (expenses, income, or savings transfers) AND/OR updates to their budget plan. Never re-log transactions from earlier turns.
2. Classify each transaction:
   - type: "expense" | "income" | "savings" (money moved into savings or investments is "savings", not "expense")
   - bucket: "needs" or "wants" for expenses; "income" for income; "savings" for savings
   - category: MUST be one of: ${CATEGORIES.join(', ')}
   - amount: a positive number in currency units, without symbols
   - date: YYYY-MM-DD (default to "${TODAY}" unless the user specifies otherwise)
3. For plan updates, include ONLY the fields the user asked to change. For the needs/wants/savings split, return only the ratios the user mentioned; the app rebalances the others to total 100.
4. If the user asks about their spending or budget health, answer using the numbers in the snapshot. Do not invent figures.
5. Always give a warm, concise confirmation in "reply" summarizing what you logged or updated.
Lines starting with "[Applied: ...]" in earlier turns are added by the app to record what was actually saved. Never write them yourself.`;

  const responseSchema = {
    type: 'OBJECT',
    properties: {
      reply: {
        type: 'STRING',
        description: 'Conversational response confirming logged items, plan updates, or answering financial questions.'
      },
      transactions: {
        type: 'ARRAY',
        description: 'Zero or more new transactions extracted from the latest message.',
        items: {
          type: 'OBJECT',
          properties: {
            description: { type: 'STRING' },
            amount: { type: 'NUMBER' },
            type: { type: 'STRING', enum: TX_TYPES },
            bucket: { type: 'STRING', enum: ['needs', 'wants', 'savings', 'income'] },
            category: { type: 'STRING', enum: CATEGORIES },
            date: { type: 'STRING', description: 'YYYY-MM-DD' }
          },
          required: ['description', 'amount', 'type', 'bucket', 'category', 'date']
        }
      },
      planUpdate: {
        type: 'OBJECT',
        nullable: true,
        description: 'Only the plan fields the user asked to change; omit everything else.',
        properties: {
          monthlyIncomeTarget: { type: 'NUMBER', nullable: true },
          needsRatio: { type: 'NUMBER', nullable: true },
          wantsRatio: { type: 'NUMBER', nullable: true },
          savingsRatio: { type: 'NUMBER', nullable: true },
          categoryLimitUpdates: {
            type: 'ARRAY',
            nullable: true,
            items: {
              type: 'OBJECT',
              properties: {
                category: { type: 'STRING', enum: CATEGORIES },
                limit: { type: 'NUMBER' }
              },
              required: ['category', 'limit']
            }
          }
        }
      }
    },
    required: ['reply', 'transactions']
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [...history, { role: 'user', parts: [{ text: userMessage }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema
      }
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error('Empty response from Gemini');
  return JSON.parse(rawText);
}

// ============================================================================
// 4. SVG DATA VISUALIZATION COMPONENTS
// ============================================================================
function DonutChart({ items, currency, formatMoney }) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const size = 180;
  const strokeWidth = 26;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  if (total <= 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-slate-400 text-sm">
        <PieChartIcon className="w-8 h-8 mb-2 opacity-40" />
        No outflows logged yet
      </div>
    );
  }

  let cumulativePercent = 0;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          {items.map((item) => {
            const percent = item.value / total;
            const strokeDasharray = `${percent * circumference} ${circumference}`;
            const strokeDashoffset = -cumulativePercent * circumference;
            cumulativePercent += percent;
            return (
              <circle
                key={item.label}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="transparent"
                stroke={item.color}
                strokeWidth={strokeWidth}
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
                className="transition-all duration-500"
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">Outflows</span>
          <span className="text-base font-bold text-slate-800">{formatMoney(total, currency)}</span>
        </div>
      </div>

      <div className="flex-1 w-full space-y-2 max-h-48 overflow-y-auto pr-1">
        {items.map((item) => {
          const pct = Math.round((item.value / total) * 100);
          return (
            <div key={item.label} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                <span className="text-slate-700 font-medium truncate">{item.label}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                <span className="text-slate-400">{pct}%</span>
                <span className="font-semibold text-slate-800">{formatMoney(item.value, currency)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AllocationBarChart({ buckets, currency, formatMoney }) {
  return (
    <div className="space-y-4">
      {buckets.map((b) => {
        const pctOfTarget = b.target > 0 ? Math.min(100, Math.round((b.actual / b.target) * 100)) : 0;
        const isOver = b.key !== 'savings' && b.actual > b.target && b.target > 0;
        return (
          <div key={b.key} className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-800">{b.label}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${b.bg} ${b.text}`}>
                  Target {b.ratio}%
                </span>
              </div>
              <div className="text-right">
                <span className={`font-bold ${isOver ? 'text-rose-600' : 'text-slate-800'}`}>
                  {formatMoney(b.actual, currency)}
                </span>
                <span className="text-slate-400"> / {formatMoney(b.target, currency)}</span>
              </div>
            </div>
            <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${pctOfTarget}%`,
                  backgroundColor: isOver ? '#e11d48' : b.color
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// 5. MAIN APPLICATION (CHAT-FIRST WITH TOP VIEW SWITCHER)
// ============================================================================
export default function App() {
  // Primary top-level view: 'chat' (default) | 'dashboard'
  const [activeView, setActiveView] = useState('chat');
  const [hasNewUpdates, setHasNewUpdates] = useState(false);

  const [isLoaded, setIsLoaded] = useState(false);
  const [currency, setCurrency] = useState('₹');
  const [transactions, setTransactions] = useState(SAMPLE_TRANSACTIONS);
  const [plan, setPlan] = useState(DEFAULT_PLAN);
  const [messages, setMessages] = useState(INITIAL_MESSAGES);

  // API Key state
  const [apiKey, setApiKey] = useState(() => {
    try {
      return localStorage.getItem(API_KEY_STORAGE) || import.meta.env.VITE_GEMINI_API_KEY || '';
    } catch {
      return import.meta.env.VITE_GEMINI_API_KEY || '';
    }
  });
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [keyInput, setKeyInput] = useState('');

  // Chat state
  const [chatInput, setChatInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const chatEndRef = useRef(null);

  // Dashboard Table & Filter state
  const [activeTab, setActiveTab] = useState('transactions');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [showManualModal, setShowManualModal] = useState(false);
  const [editingLimitCat, setEditingLimitCat] = useState(null);
  const [editingLimitVal, setEditingLimitVal] = useState('');

  // Manual entry form
  const [manualForm, setManualForm] = useState({
    description: '',
    amount: '',
    type: 'expense',
    bucket: 'needs',
    category: 'Groceries',
    date: TODAY
  });

  // Load initial state from IndexedDB
  useEffect(() => {
    (async () => {
      const savedTx = await BudgetStorage.get('transactions');
      const savedPlan = await BudgetStorage.get('plan');
      const savedMsgs = await BudgetStorage.get('messages');
      const savedCurrency = await BudgetStorage.get('currency');

      if (savedTx) setTransactions(savedTx);
      if (savedPlan) setPlan(savedPlan);
      if (savedMsgs) setMessages(savedMsgs);
      if (savedCurrency) setCurrency(savedCurrency);
      setIsLoaded(true);
    })();
  }, []);

  // Persist changes to IndexedDB
  useEffect(() => {
    if (!isLoaded) return;
    BudgetStorage.set('transactions', transactions);
  }, [transactions, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    BudgetStorage.set('plan', plan);
  }, [plan, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    BudgetStorage.set('messages', messages);
  }, [messages, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    BudgetStorage.set('currency', currency);
  }, [currency, isLoaded]);

  useEffect(() => {
    if (activeView === 'chat') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else {
      setHasNewUpdates(false);
    }
  }, [messages, isSending, activeView]);

  const formatMoney = (val, curr = currency) => {
    const num = Number(val) || 0;
    return `${curr}${num.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  };

  // Save API Key to device storage
  const saveApiKey = (rawVal) => {
    const cleaned = rawVal.trim();
    setApiKey(cleaned);
    try {
      if (cleaned) {
        localStorage.setItem(API_KEY_STORAGE, cleaned);
      } else {
        localStorage.removeItem(API_KEY_STORAGE);
      }
    } catch {
      // Ignore storage errors
    }
    setShowKeyModal(false);
  };

  // Read .env or .txt file picked from phone storage
  const handleEnvFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = String(evt.target?.result || '');
      const envMatch = text.match(/(?:VITE_)?GEMINI_API_KEY\s*=\s*["']?([^\s"']+)["']?/i);
      const rawKeyMatch = text.match(/(AIza[0-9A-Za-z_-]{20,})/);
      const extracted = envMatch?.[1] || rawKeyMatch?.[1] || text.trim();
      setKeyInput(extracted);
    };
    reader.readAsText(file);
  };

  // Derived metrics
  const metrics = useMemo(() => {
    let totalIncome = 0;
    let totalExpenses = 0;
    let totalSavings = 0;
    const byBucket = { needs: 0, wants: 0, savings: 0 };
    const byCategory = {};

    transactions.forEach((tx) => {
      const amt = Number(tx.amount) || 0;
      if (tx.type === 'income' || tx.bucket === 'income') {
        totalIncome += amt;
      } else if (tx.type === 'savings' || tx.bucket === 'savings') {
        totalSavings += amt;
        byBucket.savings += amt;
        byCategory[tx.category] = (byCategory[tx.category] || 0) + amt;
      } else {
        totalExpenses += amt;
        const b = tx.bucket === 'wants' ? 'wants' : 'needs';
        byBucket[b] += amt;
        byCategory[tx.category] = (byCategory[tx.category] || 0) + amt;
      }
    });

    const netCashflow = totalIncome - totalExpenses - totalSavings;
    const baseIncome = totalIncome > 0 ? totalIncome : plan.monthlyIncomeTarget;

    const bucketList = ['needs', 'wants', 'savings'].map((key) => ({
      key,
      ...BUCKET_META[key],
      ratio: plan.ratios[key],
      target: Math.round((baseIncome * plan.ratios[key]) / 100),
      actual: byBucket[key]
    }));

    const categoryBreakdown = Object.entries(byCategory)
      .map(([label, value]) => ({
        label,
        value,
        color: CATEGORY_COLORS[label] || '#64748b'
      }))
      .sort((a, b) => b.value - a.value);

    return {
      totalIncome,
      totalExpenses,
      totalSavings,
      netCashflow,
      byCategory,
      bucketList,
      categoryBreakdown
    };
  }, [transactions, plan]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      const matchesCat = categoryFilter === 'ALL' || tx.category === categoryFilter;
      const matchesSearch =
        !searchQuery.trim() ||
        tx.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tx.category.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCat && matchesSearch;
    });
  }, [transactions, categoryFilter, searchQuery]);

  // Send message to Gemini Copilot
  const handleSendChat = async (e, presetPrompt = null) => {
    if (e) e.preventDefault();
    const text = (presetPrompt ?? chatInput).trim();
    if (!text || isSending) return;

    if (!apiKey) {
      setKeyInput('');
      setShowKeyModal(true);
      return;
    }

    const userMsg = {
      id: `msg-${Date.now()}`,
      role: 'user',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      text
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!presetPrompt) setChatInput('');
    setIsSending(true);

    try {
      const result = await callGeminiBudgetParser({
        userMessage: text,
        history: toGeminiHistory(messages),
        snapshot: buildBudgetSnapshot(plan, metrics, transactions),
        currency,
        apiKey
      });

      const loggedBadges = [];
      const skipped = [];

      if (Array.isArray(result.transactions) && result.transactions.length > 0) {
        const newTxs = [];
        result.transactions.forEach((raw, idx) => {
          const t = normalizeTransaction(raw);
          if (!t) {
            skipped.push(`transaction "${raw?.description ?? 'unknown'}" had an invalid amount or type`);
            return;
          }
          newTxs.push({ id: `tx-${Date.now()}-${idx}`, ...t });
          loggedBadges.push(`${t.type === 'income' ? '+' : '-'}${formatMoney(t.amount)} (${t.category})`);
        });
        if (newTxs.length > 0) {
          setTransactions((prev) => [...newTxs, ...prev]);
          setHasNewUpdates(true);
        }
      }

      if (result.planUpdate) {
        const update = applyPlanUpdate(plan, result.planUpdate, (v) => formatMoney(v));
        loggedBadges.push(...update.applied);
        skipped.push(...update.skipped);
        if (update.applied.length > 0) {
          setPlan(update.plan);
          setHasNewUpdates(true);
        }
      }

      const reply = typeof result.reply === 'string' && result.reply.trim() ? result.reply : 'Done.';
      const aiMsg = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text: skipped.length > 0 ? `${reply}\n\n⚠️ Not applied: ${skipped.join('; ')}.` : reply,
        badges: loggedBadges
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      const errorMsg = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text: `Could not reach Gemini (${err.message}). Check your API key in Settings or switch to Dashboard to log offline.`,
        isError: true
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsSending(false);
    }
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    const amt = parseFloat(manualForm.amount);
    if (!manualForm.description.trim() || isNaN(amt) || amt <= 0) return;

    const bucket =
      manualForm.type === 'income'
        ? 'income'
        : manualForm.type === 'savings'
        ? 'savings'
        : manualForm.bucket;

    const newTx = {
      id: `tx-${Date.now()}`,
      date: manualForm.date || TODAY,
      description: manualForm.description.trim(),
      amount: amt,
      type: manualForm.type,
      bucket,
      category: manualForm.category
    };

    setTransactions((prev) => [newTx, ...prev]);
    setManualForm({
      description: '',
      amount: '',
      type: 'expense',
      bucket: 'needs',
      category: 'Groceries',
      date: TODAY
    });
    setShowManualModal(false);
  };

  const deleteTransaction = (id) => {
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  };

  const saveCategoryLimit = (cat) => {
    const val = parseFloat(editingLimitVal);
    if (!isNaN(val) && val >= 0) {
      setPlan((prev) => ({
        ...prev,
        categoryLimits: { ...prev.categoryLimits, [cat]: val }
      }));
    }
    setEditingLimitCat(null);
  };

  const exportJSON = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      currency,
      plan,
      transactions
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finchat-budget-${TODAY}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const startFreshBlank = async () => {
    setTransactions([]);
    setMessages([
      {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text: 'Cleared sample data! Tell me your monthly income, savings goal, or log your first expense.'
      }
    ]);
  };

  const resetDemoData = async () => {
    await BudgetStorage.clearAll();
    setTransactions(SAMPLE_TRANSACTIONS);
    setPlan(DEFAULT_PLAN);
    setMessages(INITIAL_MESSAGES);
    setCurrency('₹');
  };

  return (
    <div className="h-[100dvh] bg-slate-50 text-slate-900 flex flex-col font-sans overflow-hidden">
      {/* Top Header with Primary Chat / Dashboard Switcher */}
      <header className="bg-white border-b border-slate-200 px-3 sm:px-4 py-2.5 shrink-0 z-20">
        <div className="max-w-5xl mx-auto flex flex-col gap-2.5">
          {/* Row 1: Brand + Controls */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
                <Wallet className="w-4 h-4" />
              </div>
              <div className="flex items-center gap-1.5">
                <h1 className="font-bold text-base tracking-tight text-slate-900">FinChat</h1>
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <Database className="w-2.5 h-2.5" /> Local
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  setKeyInput(apiKey);
                  setShowKeyModal(true);
                }}
                className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${
                  apiKey
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                    : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                }`}
                title="Configure Gemini API Key"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>{apiKey ? 'Key Set' : 'API Key'}</span>
              </button>

              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                aria-label="Currency"
                className="text-xs font-semibold bg-slate-100 border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700 focus:outline-none"
              >
                <option value="₹">₹</option>
                <option value="$">$</option>
                <option value="€">€</option>
                <option value="£">£</option>
              </select>

              <button
                onClick={() => setShowManualModal(true)}
                className="inline-flex items-center gap-1 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1.5 rounded-lg shadow-sm transition-colors"
                title="Manual Entry"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Add</span>
              </button>

              <button
                onClick={exportJSON}
                className="inline-flex items-center text-xs font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 p-1.5 rounded-lg transition-colors"
                title="Export JSON Backup"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Row 2: Full-Width Top Tab Switcher (Chat Default vs Dashboard) */}
          <div className="grid grid-cols-2 bg-slate-100 p-1 rounded-xl border border-slate-200/80">
            <button
              type="button"
              onClick={() => setActiveView('chat')}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                activeView === 'chat'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              <span>Chat</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveView('dashboard');
                setHasNewUpdates(false);
              }}
              className={`relative flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                activeView === 'dashboard'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Dashboard</span>
              {hasNewUpdates && activeView !== 'dashboard' && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* ==================================================================== */}
      {/* VIEW 1: CHAT VIEW (DEFAULT)                                          */}
      {/* ==================================================================== */}
      {activeView === 'chat' && (
        <main className="flex-1 max-w-3xl w-full mx-auto flex flex-col overflow-hidden bg-white sm:my-3 sm:rounded-2xl sm:border sm:border-slate-200 sm:shadow-sm">
          {/* Compact Balance Strip */}
          <div className="px-4 py-2 bg-slate-50/90 border-b border-slate-100 flex items-center justify-between text-xs shrink-0">
            <div className="flex items-center gap-3">
              <span className="text-slate-500">
                Spent: <strong className="text-slate-800">{formatMoney(metrics.totalExpenses)}</strong>
              </span>
              <span className="text-slate-300">|</span>
              <span className="text-slate-500">
                Saved: <strong className="text-emerald-600">{formatMoney(metrics.totalSavings)}</strong>
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setActiveView('dashboard');
                setHasNewUpdates(false);
              }}
              className="text-indigo-600 font-semibold hover:underline"
            >
              View Charts →
            </button>
          </div>

          {/* Messages Feed */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex gap-2.5 ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                    m.role === 'user' ? 'bg-slate-800 text-white' : 'bg-indigo-100 text-indigo-700'
                  }`}
                >
                  {m.role === 'user' ? <User className="w-3.5 h-3.5" /> : <Bot className="w-4 h-4" />}
                </div>
                <div className={`max-w-[84%] space-y-1.5 ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-line ${
                      m.role === 'user'
                        ? 'bg-indigo-600 text-white rounded-tr-sm'
                        : 'bg-slate-100 text-slate-800 rounded-tl-sm'
                    }`}
                  >
                    {m.text}
                  </div>
                  {m.badges && m.badges.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {m.badges.map((b, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            setActiveView('dashboard');
                            setHasNewUpdates(false);
                          }}
                          className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-colors"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          {b}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className={`text-[10px] text-slate-400 ${m.role === 'user' ? 'text-right' : 'text-left'}`}>
                    {m.timestamp}
                  </div>
                </div>
              </div>
            ))}

            {isSending && (
              <div className="flex gap-2.5">
                <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 animate-pulse" />
                </div>
                <div className="bg-slate-100 text-slate-500 rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-xs flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-500 animate-spin" />
                  <span>Logging to IndexedDB...</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Quick Prompt Chips */}
          <div className="px-3 py-2 border-t border-slate-100 bg-slate-50/70 flex gap-1.5 overflow-x-auto shrink-0">
            {[
              'Spent 480 on coffee & snacks',
              'Invested 10000 in index fund',
              'Set dining limit to 8000',
              'How is my budget looking?'
            ].map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => handleSendChat(null, chip)}
                disabled={isSending}
                className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-full bg-white hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 border border-slate-200 transition-colors"
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Sticky Bottom Chat Input */}
          <form onSubmit={handleSendChat} className="p-3 border-t border-slate-200 bg-white flex gap-2 shrink-0">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Tell me an expense or budget goal..."
              className="flex-1 text-sm bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
            />
            <button
              type="submit"
              disabled={!chatInput.trim() || isSending}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white px-4 py-2.5 rounded-xl flex items-center justify-center transition-colors shadow-sm"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </main>
      )}

      {/* ==================================================================== */}
      {/* VIEW 2: DASHBOARD VIEW (CHARTS, KPIS & LEDGER)                       */}
      {/* ==================================================================== */}
      {activeView === 'dashboard' && (
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-5xl w-full mx-auto p-3 sm:p-4 space-y-4 pb-10">
            {/* Dashboard Utility Strip */}
            <div className="flex items-center justify-between bg-white px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs">
              <span className="text-slate-500 font-medium">Local Database Controls</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={startFreshBlank}
                  className="font-medium px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                >
                  Wipe Sample Data
                </button>
                <button
                  onClick={resetDemoData}
                  className="inline-flex items-center gap-1 font-medium px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" /> Reset Demo
                </button>
              </div>
            </div>

            {/* KPI Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1">
                  <span>Income</span>
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="text-lg font-bold text-slate-900">{formatMoney(metrics.totalIncome)}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">Target: {formatMoney(plan.monthlyIncomeTarget)}</div>
              </div>

              <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1">
                  <span>Expenses</span>
                  <TrendingDown className="w-4 h-4 text-rose-600" />
                </div>
                <div className="text-lg font-bold text-slate-900">{formatMoney(metrics.totalExpenses)}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">Needs + Wants</div>
              </div>

              <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1">
                  <span>Saved</span>
                  <PiggyBank className="w-4 h-4 text-indigo-600" />
                </div>
                <div className="text-lg font-bold text-emerald-600">{formatMoney(metrics.totalSavings)}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {metrics.totalIncome > 0
                    ? `${Math.round((metrics.totalSavings / metrics.totalIncome) * 100)}% savings rate`
                    : `Goal: ${plan.ratios.savings}%`}
                </div>
              </div>

              <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1">
                  <span>Unallocated</span>
                  <Wallet className="w-4 h-4 text-amber-500" />
                </div>
                <div className={`text-lg font-bold ${metrics.netCashflow >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>
                  {formatMoney(metrics.netCashflow)}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">Remaining buffer</div>
              </div>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart3 className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-sm font-bold text-slate-800">
                    {plan.ratios.needs}/{plan.ratios.wants}/{plan.ratios.savings} Plan vs. Actual
                  </h3>
                </div>
                <AllocationBarChart buckets={metrics.bucketList} currency={currency} formatMoney={formatMoney} />
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <PieChartIcon className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-sm font-bold text-slate-800">Outflows by Category</h3>
                </div>
                <DonutChart items={metrics.categoryBreakdown} currency={currency} formatMoney={formatMoney} />
              </div>
            </div>

            {/* Ledger & Category Limits Card */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
                <div className="flex items-center gap-1 bg-slate-200/70 p-1 rounded-xl">
                  <button
                    onClick={() => setActiveTab('transactions')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      activeTab === 'transactions' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                    }`}
                  >
                    Transactions ({transactions.length})
                  </button>
                  <button
                    onClick={() => setActiveTab('plan')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      activeTab === 'plan' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                    }`}
                  >
                    Category Limits
                  </button>
                </div>

                {activeTab === 'transactions' && (
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <div className="relative flex-1 sm:w-44">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search..."
                        className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      className="text-xs bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700"
                    >
                      <option value="ALL">All Categories</option>
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {activeTab === 'transactions' ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-400 bg-slate-50/40">
                        <th className="py-2.5 px-3 font-semibold">Date</th>
                        <th className="py-2.5 px-3 font-semibold">Description</th>
                        <th className="py-2.5 px-3 font-semibold">Category</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Amount</th>
                        <th className="py-2.5 px-2 w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {filteredTransactions.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-10 text-center text-slate-400">
                            No matching transactions found.
                          </td>
                        </tr>
                      ) : (
                        filteredTransactions.map((tx) => {
                          const isIncome = tx.type === 'income' || tx.bucket === 'income';
                          const isSavings = tx.type === 'savings' || tx.bucket === 'savings';
                          return (
                            <tr key={tx.id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">{tx.date}</td>
                              <td className="py-2.5 px-3 font-medium text-slate-800">{tx.description}</td>
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <span className="inline-flex items-center gap-1.5 text-slate-600">
                                  <span
                                    className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: CATEGORY_COLORS[tx.category] || '#64748b' }}
                                  />
                                  {tx.category}
                                </span>
                              </td>
                              <td
                                className={`py-2.5 px-3 text-right font-bold whitespace-nowrap ${
                                  isIncome ? 'text-emerald-600' : isSavings ? 'text-indigo-600' : 'text-slate-800'
                                }`}
                              >
                                {isIncome ? '+' : '-'}
                                {formatMoney(tx.amount)}
                              </td>
                              <td className="py-2.5 px-2 text-right">
                                <button
                                  onClick={() => deleteTransaction(tx.id)}
                                  className="text-slate-400 hover:text-rose-600 p-1 rounded"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-400 bg-slate-50/40">
                        <th className="py-2.5 px-4 font-semibold">Category</th>
                        <th className="py-2.5 px-4 font-semibold text-right">Actual</th>
                        <th className="py-2.5 px-4 font-semibold text-right">Limit</th>
                        <th className="py-2.5 px-4 font-semibold">Progress</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {CATEGORIES.filter((c) => c !== 'Salary & Income').map((cat) => {
                        const spent = metrics.byCategory[cat] || 0;
                        const limit = plan.categoryLimits[cat] || 0;
                        const pct = limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0;
                        const isOver = limit > 0 && spent > limit && cat !== 'Savings & Investments';

                        return (
                          <tr key={cat} className="hover:bg-slate-50/80">
                            <td className="py-2.5 px-4 font-medium text-slate-800">{cat}</td>
                            <td className="py-2.5 px-4 text-right font-semibold text-slate-800">
                              {formatMoney(spent)}
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              {editingLimitCat === cat ? (
                                <div className="inline-flex items-center justify-end gap-1">
                                  <input
                                    type="number"
                                    value={editingLimitVal}
                                    onChange={(e) => setEditingLimitVal(e.target.value)}
                                    className="w-20 text-right border border-indigo-300 rounded px-1.5 py-0.5 text-xs"
                                    autoFocus
                                  />
                                  <button onClick={() => saveCategoryLimit(cat)} className="text-emerald-600 p-0.5">
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  <button onClick={() => setEditingLimitCat(null)} className="text-slate-400 p-0.5">
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => {
                                    setEditingLimitCat(cat);
                                    setEditingLimitVal(String(limit));
                                  }}
                                  className="inline-flex items-center gap-1 text-slate-600 hover:text-indigo-600 font-medium"
                                >
                                  {formatMoney(limit)}
                                  <Edit3 className="w-3 h-3 opacity-60" />
                                </button>
                              )}
                            </td>
                            <td className="py-2.5 px-4 w-36">
                              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${isOver ? 'bg-rose-500' : 'bg-indigo-600'}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </main>
      )}

      {/* API Key & .env File Loader Modal */}
      {showKeyModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-sm">Gemini API Key Configuration</h3>
              </div>
              <button onClick={() => setShowKeyModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Your key is stored locally inside the app&apos;s private device storage and sent only to Google&apos;s Gemini API.
            </p>

            {/* Load from phone file (.env or .txt) */}
            <div className="p-3 rounded-xl bg-slate-50 border border-dashed border-slate-300 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>Load from a <code className="font-mono">.env</code> or <code className="font-mono">.txt</code> file on your phone</span>
              </div>
              <label className="shrink-0 cursor-pointer text-xs font-semibold bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-1.5 rounded-lg">
                Pick File
                <input
                  type="file"
                  accept=".env,.txt,text/plain,*/*"
                  onChange={handleEnvFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Gemini API Key</label>
              <input
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full text-sm font-mono border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex justify-between items-center pt-2">
              {apiKey ? (
                <button
                  type="button"
                  onClick={() => saveApiKey('')}
                  className="text-xs font-medium text-rose-600 hover:underline"
                >
                  Remove Saved Key
                </button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowKeyModal(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => saveApiKey(keyInput)}
                  className="px-4 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm"
                >
                  Save Key Locally
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual Entry Modal */}
      {showManualModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm">Log Manual Transaction</h3>
              <button onClick={() => setShowManualModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleManualSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
                <input
                  type="text"
                  required
                  value={manualForm.description}
                  onChange={(e) => setManualForm({ ...manualForm, description: e.target.value })}
                  placeholder="e.g., Supermarket Groceries"
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Amount ({currency})</label>
                  <input
                    type="number"
                    required
                    min="1"
                    step="any"
                    value={manualForm.amount}
                    onChange={(e) => setManualForm({ ...manualForm, amount: e.target.value })}
                    className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={manualForm.date}
                    onChange={(e) => setManualForm({ ...manualForm, date: e.target.value })}
                    className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Type</label>
                  <select
                    value={manualForm.type}
                    onChange={(e) => setManualForm({ ...manualForm, type: e.target.value })}
                    className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white"
                  >
                    <option value="expense">Expense</option>
                    <option value="income">Income</option>
                    <option value="savings">Savings</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
                  <select
                    value={manualForm.category}
                    onChange={(e) => setManualForm({ ...manualForm, category: e.target.value })}
                    className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm"
                >
                  Save Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}