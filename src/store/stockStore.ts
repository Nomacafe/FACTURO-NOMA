import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { StockItem } from "@/types"

interface StockStore {
  items: StockItem[]
  addItem: (item: StockItem) => void
  updateItem: (id: string, updates: Partial<StockItem>) => void
  deleteItem: (id: string) => void
  importItems: (items: StockItem[]) => void
}

export const useStockStore = create<StockStore>()(
  persist(
    (set) => ({
      items: [],
      addItem: (item) => set((s) => ({ items: [...s.items, item] })),
      updateItem: (id, updates) =>
        set((s) => ({
          items: s.items.map((i) =>
            i.id === id ? { ...i, ...updates, updatedAt: new Date().toISOString() } : i
          ),
        })),
      deleteItem: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
      importItems: (items) => set({ items }),
    }),
    { name: "facturo-stock" }
  )
)
