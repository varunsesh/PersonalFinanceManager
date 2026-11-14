import { useState } from 'react';
import { Settings, X } from 'lucide-react';
import { INSTRUMENTS, TAX_RULES } from '../lib/finance/taxRules';
import { useSettingsStore } from '../store/settingsStore';
import MemoryList from './MemoryList';

const SLABS = [0, 5, 10, 15, 20, 25, 30];

function NumberField({ label, value, onChange, suffix = '%' }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1.5 text-xs">
      <span className="text-slate-600">{label}</span>
      <span className="flex items-center gap-1">
        <input
          type="number"
          step="0.1"
          value={value}
          onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
          className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-right text-xs tabular-nums"
        />
        <span className="w-3 text-slate-400">{suffix}</span>
      </span>
    </label>
  );
}

function Section({ title, children, hint }) {
  return (
    <section className="space-y-1">
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{title}</h4>
      {hint && <p className="text-[11px] leading-snug text-slate-500">{hint}</p>}
      <div className="divide-y divide-slate-100">{children}</div>
    </section>
  );
}

export default function SettingsModal({ onClose }) {
  const s = useSettingsStore();
  const [finnhubKey, setFinnhubKey] = useState(s.finnhubKey);

  const close = () => {
    if (finnhubKey.trim() !== s.finnhubKey) s.updateSettings({ finnhubKey: finnhubKey.trim() });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs">
      <div className="flex max-h-full w-full max-w-md flex-col rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">Planning settings</h3>
          </div>
          <button onClick={close} className="text-slate-400 hover:text-slate-600" aria-label="Close settings">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto px-5 py-4">
          <Section title="What FinChat remembers" hint="Facts the assistant keeps across conversations. It adds them when you mention them in chat; you can also add or delete them here.">
            <MemoryList />
          </Section>

          <Section title="Tax" hint={`New regime · ${TAX_RULES.label} rules. Your slab is used for FD interest, debt funds and short-term gains on US/international investments.`}>
            <label className="flex items-center justify-between py-1.5 text-xs">
              <span className="text-slate-600">Income-tax slab</span>
              <select
                value={s.slabPct}
                onChange={(e) => s.updateSettings({ slabPct: Number(e.target.value) })}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
              >
                {SLABS.map((v) => (
                  <option key={v} value={v}>
                    {v}%
                  </option>
                ))}
              </select>
            </label>
          </Section>

          <Section title="Assumptions">
            <NumberField label="Inflation" value={s.inflationPct} onChange={(v) => s.updateSettings({ inflationPct: v })} />
            <NumberField label="Rupee depreciation vs USD" value={s.inrDepreciationPct} onChange={(v) => s.updateSettings({ inrDepreciationPct: v })} />
            <NumberField label="NPS annuity rate" value={s.npsAnnuityPct} onChange={(v) => s.updateSettings({ npsAnnuityPct: v })} />
          </Section>

          <Section title="Default expected returns" hint="Used when you don't say a rate in chat. US stocks are in USD.">
            {Object.entries(INSTRUMENTS).map(([key, { label }]) => (
              <NumberField key={key} label={label} value={s.defaultReturns[key]} onChange={(v) => s.setDefaultReturn(key, v)} />
            ))}
          </Section>

          <Section title="Live prices" hint="Finnhub key for US stock and ETF prices. Stored only on this device.">
            <input
              type="password"
              value={finnhubKey}
              onChange={(e) => setFinnhubKey(e.target.value)}
              placeholder="Finnhub API key"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </Section>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
          <button type="button" onClick={s.resetAssumptions} className="text-xs font-medium text-slate-500 hover:text-rose-600">
            Reset assumptions
          </button>
          <button
            type="button"
            onClick={close}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
