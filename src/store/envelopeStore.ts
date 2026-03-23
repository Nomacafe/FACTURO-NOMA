import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { BudgetEnvelope, EnvelopeTransaction } from "@/types"

interface EnvelopeStore {
  envelopes: BudgetEnvelope[]
  transactions: EnvelopeTransaction[]

  addEnvelope: (envelope: BudgetEnvelope) => void
  updateEnvelope: (id: string, updates: Partial<BudgetEnvelope>) => void
  deleteEnvelope: (id: string) => void

  addTransaction: (tx: EnvelopeTransaction) => void
  updateTransaction: (id: string, updates: Partial<EnvelopeTransaction>) => void
  deleteTransaction: (id: string) => void
}

export const useEnvelopeStore = create<EnvelopeStore>()(
  persist(
    (set) => ({
      envelopes: [],
      transactions: [],

      addEnvelope: (envelope) =>
        set((s) => ({ envelopes: [...s.envelopes, envelope] })),
      updateEnvelope: (id, updates) =>
        set((s) => ({
          envelopes: s.envelopes.map((e) => (e.id === id ? { ...e, ...updates } : e)),
        })),
      deleteEnvelope: (id) =>
        set((s) => ({
          envelopes: s.envelopes.filter((e) => e.id !== id),
          transactions: s.transactions.filter((t) => t.envelopeId !== id),
        })),

      addTransaction: (tx) =>
        set((s) => ({ transactions: [...s.transactions, tx] })),
      updateTransaction: (id, updates) =>
        set((s) => ({
          transactions: s.transactions.map((t) => (t.id === id ? { ...t, ...updates } : t)),
        })),
      deleteTransaction: (id) =>
        set((s) => ({ transactions: s.transactions.filter((t) => t.id !== id) })),
    }),
    { name: "facturo-envelopes" }
  )
)

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** All months from startMonth up to currentMonth (inclusive), sorted */
export function monthRange(start: string, end: string): string[] {
  const months: string[] = []
  let [y, m] = start.split("-").map(Number)
  const [ey, em] = end.split("-").map(Number)
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return months
}

/**
 * Compute cumulative balance for an envelope up to (and including) `upToMonth`.
 * dotationByMonth: a function that returns the auto-dotation for a given month.
 * We add dotation + manual transactions.
 */
export function computeEnvelopeBalance(
  envelopeId: string,
  transactions: EnvelopeTransaction[],
  upToMonth: string
): number {
  const relevant = transactions.filter(
    (t) => t.envelopeId === envelopeId && t.month <= upToMonth
  )
  return Math.round(relevant.reduce((s, t) => s + t.amount, 0) * 100) / 100
}

/** Balance for a specific month only (not cumulative) */
export function computeMonthFlow(
  envelopeId: string,
  transactions: EnvelopeTransaction[],
  month: string
): { dotation: number; spending: number; net: number } {
  const txs = transactions.filter((t) => t.envelopeId === envelopeId && t.month === month)
  const dotation = txs.filter((t) => t.type === "dotation").reduce((s, t) => s + t.amount, 0)
  const spending = txs.filter((t) => t.type === "spending").reduce((s, t) => s + Math.abs(t.amount), 0)
  return {
    dotation: Math.round(dotation * 100) / 100,
    spending: Math.round(spending * 100) / 100,
    net: Math.round((dotation - spending) * 100) / 100,
  }
}
