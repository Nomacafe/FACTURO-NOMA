import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { MonthlyRevenue } from "@/types"

interface RevenueStore {
  revenues: MonthlyRevenue[]
  setMonthRevenue: (revenue: MonthlyRevenue) => void
  deleteMonthRevenue: (month: string) => void
}

export const useRevenueStore = create<RevenueStore>()(
  persist(
    (set) => ({
      revenues: [],
      setMonthRevenue: (revenue) =>
        set((s) => {
          const exists = s.revenues.find((r) => r.month === revenue.month)
          if (exists) {
            return {
              revenues: s.revenues.map((r) =>
                r.month === revenue.month ? revenue : r
              ),
            }
          }
          return { revenues: [...s.revenues, revenue] }
        }),
      deleteMonthRevenue: (month) =>
        set((s) => ({ revenues: s.revenues.filter((r) => r.month !== month) })),
    }),
    { name: "facturo-revenues" }
  )
)
