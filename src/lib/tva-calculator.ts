import type { Invoice, TVALine, TVARate, DashboardStats } from "@/types"

/**
 * Given HT + TVA rate, computes TVA amount and TTC
 */
export function computeFromHT(htAmount: number, rate: TVARate) {
  const tva = Math.round(htAmount * (rate / 100) * 100) / 100
  const ttc = Math.round((htAmount + tva) * 100) / 100
  return { ht: htAmount, tva, ttc }
}

/**
 * Given TTC + TVA rate, computes HT and TVA amount
 */
export function computeFromTTC(ttcAmount: number, rate: TVARate) {
  const ht = Math.round((ttcAmount / (1 + rate / 100)) * 100) / 100
  const tva = Math.round((ttcAmount - ht) * 100) / 100
  return { ht, tva, ttc: ttcAmount }
}

/**
 * Aggregates all invoices into dashboard stats
 */
export function computeDashboardStats(invoices: Invoice[]): DashboardStats {
  const tvaByRate: Record<string, { baseHT: number; montantTVA: number }> = {}
  const vendorMap: Record<string, number> = {}
  const categoryMap: Record<string, number> = {}
  const monthMap: Record<string, { ht: number; tva: number }> = {}

  let totalHT = 0
  let totalTVA = 0
  let totalTTC = 0

  for (const inv of invoices) {
    totalHT += inv.totalHT
    totalTVA += inv.totalTVA
    totalTTC += inv.totalTTC

    // TVA by rate
    for (const line of inv.tvaLines) {
      const key = String(line.rate)
      if (!tvaByRate[key]) tvaByRate[key] = { baseHT: 0, montantTVA: 0 }
      tvaByRate[key].baseHT += line.baseHT
      tvaByRate[key].montantTVA += line.montantTVA
    }

    // Vendor totals
    if (inv.vendor) {
      vendorMap[inv.vendor] = (vendorMap[inv.vendor] ?? 0) + inv.totalHT
    }

    // Category totals
    const cat = inv.category ?? "Autre"
    categoryMap[cat] = (categoryMap[cat] ?? 0) + inv.totalHT

    // Monthly
    const dateKey = inv.invoiceDate
      ? inv.invoiceDate.slice(0, 7) // "YYYY-MM"
      : inv.uploadedAt.slice(0, 7)
    if (!monthMap[dateKey]) monthMap[dateKey] = { ht: 0, tva: 0 }
    monthMap[dateKey].ht += inv.totalHT
    monthMap[dateKey].tva += inv.totalTVA
  }

  const monthlyExpenses = Object.entries(monthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([month, v]) => ({
      month: new Intl.DateTimeFormat("fr-FR", { month: "short", year: "2-digit" }).format(
        new Date(month + "-01")
      ),
      ht: Math.round(v.ht * 100) / 100,
      tva: Math.round(v.tva * 100) / 100,
    }))

  const topVendors = Object.entries(vendorMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, total]) => ({ name, total: Math.round(total * 100) / 100 }))

  const byCategory = Object.entries(categoryMap)
    .sort(([, a], [, b]) => b - a)
    .map(([category, ht]) => ({ category, ht: Math.round(ht * 100) / 100 }))

  return {
    totalHT: Math.round(totalHT * 100) / 100,
    totalTVA: Math.round(totalTVA * 100) / 100,
    totalTTC: Math.round(totalTTC * 100) / 100,
    invoiceCount: invoices.length,
    averageHT: invoices.length > 0 ? Math.round((totalHT / invoices.length) * 100) / 100 : 0,
    tvaByRate,
    monthlyExpenses,
    topVendors,
    byCategory,
  }
}

/**
 * Build TVA lines from a single rate (when invoice has only one TVA rate)
 */
export function buildSingleRateTVALines(ht: number, tva: number, rate: TVARate): TVALine[] {
  if (ht === 0 && tva === 0) return []
  return [{ rate, baseHT: ht, montantTVA: tva }]
}
