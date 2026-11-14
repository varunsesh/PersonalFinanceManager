import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Send, Wallet, TrendingUp, TrendingDown, PiggyBank, Plus, Trash2,
  Download, Upload, RotateCcw, Sparkles, PieChart as PieChartIcon,
  BarChart3, ListFilter, Search, CheckCircle2, AlertCircle, Sliders,
  Bot, User, Edit3, Check, X, Database, KeyRound, FileText
} from 'lucide-react';

// ============================================================================
// 1. LOCAL-FIRST STORAGE LAYER (IndexedDB + localStorage fallback)
// ============================================================================
const DB_NAME = 'FinChatLocalBudgetDB';
const DB_VERSION = 1;
const STORE_NAME = 'app_state';
const API_KEY_STORAGE = 'finchat_gemini_api_key';

const BudgetStorage = {
  openDB() {
    return new Promise((resolve, reject) => {
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
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
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
        const req = store.put(value, key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {
      // Fallback handled below
    }
    try {
      localStorage.setItem(`${DB_NAME}_${key}`, JSON.stringify(value));
    } catch {
      // Ignore quota errors
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
  needs: { label: 'Needs (50%)', color: '#4f46e5', bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
  wants: { label: 'Wants (30%)', color: '#f59e0b', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  savings: { label: 'Savings (20%)', color: '#10b981', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  income: { label: 'Income', color: '#059669', bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200' }
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
async function callGeminiBudgetParser({ userMessage, currentPlan, recentTransactions, currency, apiKey }) {
  if (!apiKey) {
    throw new Error('NO_API_KEY');
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;

  const systemInstruction = `You are FinChat, an intelligent personal finance and budgeting assistant embedded inside a local-first React budget tracker.
Today's date is ${TODAY}. Active currency symbol is "${currency}".

Current Budget Plan:
${JSON.stringify(currentPlan)}

Recent Transactions (last 8):
${JSON.stringify(recentTransactions.slice(0, 8))}

Your job:
1. Parse the user's message to extract ANY new financial transactions (expenses, income, or savings transfers) AND/OR updates to their budget plan (monthlyIncomeTarget, 50/30/20 ratios, or specific categoryLimits).
2. Classify each transaction accurately:
   - type: "expense" | "income" | "savings"
   - bucket: "needs" | "wants" | "savings" | "income"
   - category: MUST be one of: ${CATEGORIES.join(', ')}
   - date: YYYY-MM-DD (default to "${TODAY}" unless user specifies otherwise)
3. If the user asks a question about their spending, budget health, or wants advice, analyze their Current Budget Plan and Recent Transactions and answer concisely in "reply".
4. Always provide a warm, concise, helpful confirmation in "reply" summarizing what was logged or updated.`;

  const responseSchema = {
    type: 'OBJECT',
    properties: {
      reply: {
        type: 'STRING',
        description: 'Conversational response confirming logged items, plan updates, or answering financial questions.'
      },
      transactions: {
        type: 'ARRAY',
        description: 'Zero or more transactions extracted from the message.',
        items: {
          type: 'OBJECT',
          properties: {
            description: { type: 'STRING' },
            amount: { type: 'NUMBER' },
            type: { type: 'STRING', enum: ['expense', 'income', 'savings'] },
            bucket: { type: 'STRING', enum: ['needs', 'wants', 'savings', 'income'] },
            category: { type: 'STRING', enum: CATEGORIES },
            date: { type: 'STRING' }
          },
          required: ['description', 'amount', 'type', 'bucket', 'category', 'date']
        }
      },
      planUpdate: {
        type: 'OBJECT',
        nullable: true,
        description: 'Optional updates to the user budget plan if requested.',
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
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
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
// 5. MAIN APPLICATION
// ============================================================================
export default function App() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [currency, setCurrency] = useState('₹');
  const [transactions, setTransactions] = useState(SAMPLE_TRANSACTIONS);
  const [plan, setPlan] = useState(DEFAULT_PLAN);
  const [messages, setMessages] = useState(INITIAL_MESSAGES);

  // API Key state (reads localStorage first, falls back to compile-time .env)
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

  // Table & Filter state
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
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

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
      // Matches VITE_GEMINI_API_KEY=..., GEMINI_API_KEY=..., or a standalone AIza... token
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
        currentPlan: plan,
        recentTransactions: transactions,
        currency,
        apiKey
      });

      const loggedBadges = [];

      if (Array.isArray(result.transactions) && result.transactions.length > 0) {
        const newTxs = result.transactions.map((t, idx) => {
          loggedBadges.push(
            `${t.type === 'income' ? '+' : '-'}${formatMoney(t.amount)} (${t.category})`
          );
          return {
            id: `tx-${Date.now()}-${idx}`,
            date: t.date || TODAY,
            description: t.description,
            amount: Number(t.amount) || 0,
            type: t.type,
            bucket: t.bucket,
            category: t.category
          };
        });
        setTransactions((prev) => [...newTxs, ...prev]);
      }

      if (result.planUpdate) {
        const pu = result.planUpdate;
        setPlan((prev) => {
          const next = {
            ...prev,
            ratios: { ...prev.ratios },
            categoryLimits: { ...prev.categoryLimits }
          };
          if (typeof pu.monthlyIncomeTarget === 'number' && pu.monthlyIncomeTarget > 0) {
            next.monthlyIncomeTarget = pu.monthlyIncomeTarget;
            loggedBadges.push(`Income Target: ${formatMoney(pu.monthlyIncomeTarget)}`);
          }
          if (
            typeof pu.needsRatio === 'number' &&
            typeof pu.wantsRatio === 'number' &&
            typeof pu.savingsRatio === 'number'
          ) {
            next.ratios = {
              needs: pu.needsRatio,
              wants: pu.wantsRatio,
              savings: pu.savingsRatio
            };
            loggedBadges.push(`Split: ${pu.needsRatio}/${pu.wantsRatio}/${pu.savingsRatio}`);
          }
          if (Array.isArray(pu.categoryLimitUpdates)) {
            pu.categoryLimitUpdates.forEach((item) => {
              next.categoryLimits[item.category] = item.limit;
              loggedBadges.push(`${item.category} limit: ${formatMoney(item.limit)}`);
            });
          }
          return next;
        });
      }

      const aiMsg = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text: result.reply,
        badges: loggedBadges
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      const errorMsg = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text: `Could not reach Gemini (${err.message}). Check your API key in Settings or use the "+ Add Entry" button to log offline.`
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
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-20">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-base tracking-tight text-slate-900">FinChat</h1>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <Database className="w-3 h-3" /> IndexedDB
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">Conversational local-first budget &amp; cashflow planner</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => {
                setKeyInput(apiKey);
                setShowKeyModal(true);
              }}
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${
                apiKey
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                  : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
              }`}
              title="Configure Gemini API Key or load .env file"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>{apiKey ? 'API Key Set' : 'Set API Key'}</span>
            </button>

            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              aria-label="Currency"
              className="text-xs font-semibold bg-slate-100 border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="₹">₹ INR</option>
              <option value="$">$ USD</option>
              <option value="€">€ EUR</option>
              <option value="£">£ GBP</option>
            </select>

            <button
              onClick={() => setShowManualModal(true)}
              className="inline-flex items-center gap-1 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1.5 rounded-lg shadow-sm transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Add Entry</span>
            </button>

            <button
              onClick={exportJSON}
              className="inline-flex items-center gap-1 text-xs font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-2.5 py-1.5 rounded-lg transition-colors"
              title="Export JSON Backup"
            >
              <Download className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={startFreshBlank}
              className="hidden md:inline-flex items-center gap-1 text-xs font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-2.5 py-1.5 rounded-lg transition-colors"
              title="Clear sample transactions"
            >
              Wipe
            </button>

            <button
              onClick={resetDemoData}
              className="inline-flex items-center gap-1 text-xs font-medium bg-white hover:bg-slate-50 text-slate-500 border border-slate-200 px-2 py-1.5 rounded-lg transition-colors"
              title="Reset sample data"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Split Workspace */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto p-3 sm:p-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* LEFT COLUMN: Conversational Copilot */}
        <section className="lg:col-span-5 xl:col-span-4 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[540px] lg:h-[calc(100vh-5.5rem)] lg:sticky lg:top-20 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <h2 className="text-sm font-bold text-slate-800">Budget Chat Copilot</h2>
            </div>
            <span className="text-[11px] text-slate-400">Natural Language Parser</span>
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
                <div className={`max-w-[82%] space-y-1.5 ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
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
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          {b}
                        </span>
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
                <div className="bg-slate-100 text-slate-500 rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-xs">
                  Updating your ledger &amp; charts...
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Quick Prompt Chips */}
          <div className="px-3 py-2 border-t border-slate-100 bg-slate-50/60 flex gap-1.5 overflow-x-auto">
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
                className="shrink-0 text-[11px] font-medium px-2.5 py-1 rounded-full bg-white hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 border border-slate-200 transition-colors"
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Input Box */}
          <form onSubmit={handleSendChat} className="p-3 border-t border-slate-200 bg-white flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="e.g., Paid 1850 for groceries..."
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
        </section>

        {/* RIGHT COLUMN: Analytics & Tables */}
        <section className="lg:col-span-7 xl:col-span-8 space-y-4">
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
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-sm font-bold text-slate-800">
                    {plan.ratios.needs}/{plan.ratios.wants}/{plan.ratios.savings} Plan vs. Actual
                  </h3>
                </div>
              </div>
              <AllocationBarChart buckets={metrics.bucketList} currency={currency} formatMoney={formatMoney} />
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <PieChartIcon className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-sm font-bold text-slate-800">Outflows by Category</h3>
                </div>
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
        </section>
      </main>

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