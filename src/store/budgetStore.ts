import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { BudgetEntry } from "@/types"

interface BudgetStore {
  entries: BudgetEntry[]
  setBudget: (entry: BudgetEntry) => void
  deleteBudget: (id: string) => void
}

export const useBudgetStore = create<BudgetStore>()(
  persist(
    (set) => ({
      entries: [],
      setBudget: (entry) =>
        set((s) => {
          const exists = s.entries.find(
            (e) => e.month === entry.month && e.category === entry.category
          )
          if (exists) {
            return {
              entries: s.entries.map((e) =>
                e.month === entry.month && e.category === entry.category ? entry : e
              ),
            }
          }
          return { entries: [...s.entries, entry] }
        }),
      deleteBudget: (id) =>
        set((s) => ({ entries: s.entries.filter((e) => e.id !== id) })),
    }),
    { name: "facturo-budgets" }
  )
)
