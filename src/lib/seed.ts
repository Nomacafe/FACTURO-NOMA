/**
 * Initialise les stores au premier lancement si vides.
 * Importe automatiquement toutes les données du Google Sheet.
 */

import { buildSheetImportPreview, toFixedExpense, toInvoice } from "@/lib/sheet-parser"
import type { FixedExpense, Invoice, MonthlyRevenue } from "@/types"

export const SEED_DONE_KEY = "facturo-seeded-v1"

export function seedStores(
  existingFixed: { name: string }[],
  existingInvoices: { vendor: string | null; totalTTC: number; invoiceDate: string | null }[],
  existingRevenues: { month: string }[],
  addExpense: (e: FixedExpense) => void,
  addInvoice: (i: Invoice) => void,
  setMonthRevenue: (r: MonthlyRevenue) => void,
) {
  if (localStorage.getItem(SEED_DONE_KEY)) return

  const preview = buildSheetImportPreview()

  // Charges fixes
  for (const item of preview.fixedExpenses) {
    const exists = existingFixed.some(
      (e) => e.name.toLowerCase().trim() === item.name.toLowerCase().trim()
    )
    if (!exists) addExpense(toFixedExpense(item))
  }

  // Emprunts
  for (const item of preview.loans) {
    const exists = existingFixed.some(
      (e) => e.name.toLowerCase().trim() === item.name.toLowerCase().trim()
    )
    if (!exists) addExpense(toFixedExpense(item))
  }

  // Factures février
  for (const item of preview.februaryInvoices) {
    const exists = existingInvoices.some(
      (e) =>
        e.vendor?.toLowerCase() === (item.vendor ?? "").toLowerCase() &&
        Math.abs(e.totalTTC - item.totalTTC) < 0.01 &&
        e.invoiceDate?.startsWith("2026-02")
    )
    if (!exists) addInvoice(toInvoice(item))
  }

  // CA mensuel
  for (const item of preview.revenues) {
    const exists = existingRevenues.some((r) => r.month === item.month)
    if (!exists) {
      setMonthRevenue({
        month: item.month,
        cabrut: item.cabrut,
        canet: item.canet,
        tvaCollectee: item.tvaCollectee,
        tvaRate: item.tvaRate,
        notes: item.notes,
      })
    }
  }

  localStorage.setItem(SEED_DONE_KEY, "1")
}
