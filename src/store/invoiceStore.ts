import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { Invoice } from "@/types"

interface InvoiceStore {
  invoices: Invoice[]
  addInvoice: (invoice: Invoice) => void
  updateInvoice: (id: string, updates: Partial<Invoice>) => void
  deleteInvoice: (id: string) => void
  clearAll: () => void
}

export const useInvoiceStore = create<InvoiceStore>()(
  persist(
    (set) => ({
      invoices: [],

      addInvoice: (invoice) =>
        set((state) => ({
          invoices: [invoice, ...state.invoices],
        })),

      updateInvoice: (id, updates) =>
        set((state) => ({
          invoices: state.invoices.map((inv) =>
            inv.id === id ? { ...inv, ...updates } : inv
          ),
        })),

      deleteInvoice: (id) =>
        set((state) => ({
          invoices: state.invoices.filter((inv) => inv.id !== id),
        })),

      clearAll: () => set({ invoices: [] }),
    }),
    {
      name: "facturo-invoices",
    }
  )
)
