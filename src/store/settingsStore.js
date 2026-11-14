import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createIdbStorage } from './idbStorage';

// Planning assumptions and price-data keys, persisted on the device.
export const DEFAULT_SETTINGS = {
  taxRegime: 'new',
  slabPct: 30,
  inflationPct: 6,
  inrDepreciationPct: 3,
  npsAnnuityPct: 6,
  // Default expected annual returns (%) when the user doesn't give one.
  // US stocks are in USD; rupee depreciation is added on top.
  defaultReturns: {
    fd: 7,
    ppf: 7.1,
    nps: 10,
    equity_in: 12,
    intl_fund: 11,
    us_stock: 10,
    debt_mf: 7
  },
  finnhubKey: ''
};

export const useSettingsStore = create(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      updateSettings: (patch) => set(patch),
      setDefaultReturn: (instrument, pct) =>
        set((s) => ({ defaultReturns: { ...s.defaultReturns, [instrument]: pct } })),
      resetAssumptions: () => {
        const { finnhubKey, ...assumptions } = DEFAULT_SETTINGS;
        set(assumptions);
      }
    }),
    {
      name: 'finchat-settings',
      storage: createIdbStorage(),
      partialize: ({ updateSettings, setDefaultReturn, resetAssumptions, ...data }) => data,
      // Keep new default-return keys when older saved settings are loaded
      merge: (saved, current) => ({
        ...current,
        ...saved,
        defaultReturns: { ...current.defaultReturns, ...(saved?.defaultReturns ?? {}) }
      })
    }
  )
);

// The subset the calculators need.
export const calcSettings = (s) => ({
  slabPct: s.slabPct,
  inflationPct: s.inflationPct,
  inrDepreciationPct: s.inrDepreciationPct,
  npsAnnuityPct: s.npsAnnuityPct
});
