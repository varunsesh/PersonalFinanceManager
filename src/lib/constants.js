export const API_KEY_STORAGE = 'finchat_gemini_api_key';

export const CATEGORIES = [
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

export const CATEGORY_COLORS = {
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

export const BUCKET_META = {
  needs: { label: 'Needs (50%)', color: '#4f46e5', bg: 'bg-indigo-50', text: 'text-indigo-700' },
  wants: { label: 'Wants (30%)', color: '#f59e0b', bg: 'bg-amber-50', text: 'text-amber-700' },
  savings: { label: 'Savings (20%)', color: '#10b981', bg: 'bg-emerald-50', text: 'text-emerald-700' },
  income: { label: 'Income', color: '#059669', bg: 'bg-teal-50', text: 'text-teal-700' }
};

export const DEFAULT_PLAN = {
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

export const TODAY = new Date().toISOString().slice(0, 10);

export const SAMPLE_TRANSACTIONS = [
  { id: 'tx-1', date: TODAY, description: 'Monthly Salary Credit', amount: 120000, type: 'income', bucket: 'income', category: 'Salary & Income' },
  { id: 'tx-2', date: TODAY, description: 'Apartment Rent', amount: 30000, type: 'expense', bucket: 'needs', category: 'Housing & Rent' },
  { id: 'tx-3', date: TODAY, description: 'Index Fund SIP Auto-Debit', amount: 20000, type: 'savings', bucket: 'savings', category: 'Savings & Investments' },
  { id: 'tx-4', date: TODAY, description: 'Weekly Organic Groceries', amount: 4200, type: 'expense', bucket: 'needs', category: 'Groceries' },
  { id: 'tx-5', date: TODAY, description: 'Specialty Coffee & Dinner Out', amount: 2450, type: 'expense', bucket: 'wants', category: 'Dining & Coffee' },
  { id: 'tx-6', date: TODAY, description: 'Electricity & Fiber Internet', amount: 3100, type: 'expense', bucket: 'needs', category: 'Utilities & Bills' }
];

export const nowTime = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export const INITIAL_MESSAGES = [
  {
    id: 'msg-welcome',
    role: 'assistant',
    timestamp: nowTime(),
    text: "I'm your local-first budget copilot. Everything is saved privately on your device.\n\nTell me about an expense, income, or budget goal in plain English—for example:\n• \"Spent 650 on coffee and lunch today\"\n• \"My monthly income is 1,50,000 and I want 50/25/25 split\"\n• \"Moved 15000 into emergency fund savings\""
  }
];
