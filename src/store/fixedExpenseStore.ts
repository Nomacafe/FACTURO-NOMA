import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { FixedExpense } from "@/types"

interface FixedExpenseStore {
  expenses: FixedExpense[]
  addExpense: (expense: FixedExpense) => void
  updateExpense: (id: string, updates: Partial<FixedExpense>) => void
  deleteExpense: (id: string) => void
  toggleActive: (id: string) => void
}

export const useFixedExpenseStore = create<FixedExpenseStore>()(
  persist(
    (set) => ({
      expenses: [],
      addExpense: (expense) =>
        set((s) => ({ expenses: [...s.expenses, expense] })),
      updateExpense: (id, updates) =>
        set((s) => ({
          expenses: s.expenses.map((e) => (e.id === id ? { ...e, ...updates } : e)),
        })),
      deleteExpense: (id) =>
        set((s) => ({ expenses: s.expenses.filter((e) => e.id !== id) })),
      toggleActive: (id) =>
        set((s) => ({
          expenses: s.expenses.map((e) =>
            e.id === id ? { ...e, active: !e.active } : e
          ),
        })),
    }),
    { name: "facturo-fixed-expenses" }
  )
)
