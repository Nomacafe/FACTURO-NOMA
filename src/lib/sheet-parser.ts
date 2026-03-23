/**
 * Parser dédié pour le Google Sheet de l'entreprise.
 * Convertit les montants TTC → HT selon les taux TVA français applicables.
 * Structure détectée :
 *   - Section 1 : Charges fixes mensuelles
 *   - Section 2 : Emprunts (avec dates de début)
 *   - Section 3 : Charges variables / matières (dépenses réelles du mois)
 */

import type { FixedExpense, Invoice, MonthlyRevenue, TVALine, TVARate } from "@/types"
import { generateId } from "@/lib/utils"

// ─── TVA helpers ─────────────────────────────────────────────────────────────

function ttcToHT(ttc: number, rate: TVARate): number {
  if (rate === 0) return ttc
  return Math.round((ttc / (1 + rate / 100)) * 100) / 100
}

function tvaAmount(ttc: number, rate: TVARate): number {
  return Math.round((ttc - ttcToHT(ttc, rate)) * 100) / 100
}

function makeTVALine(ht: number, rate: TVARate): TVALine {
  return { rate, baseHT: ht, montantTVA: tvaAmount(ht * (1 + rate / 100), rate) }
}

// ─── Fixed expenses from the sheet ───────────────────────────────────────────

export interface ImportedFixedExpense extends Omit<FixedExpense, "id"> {
  amountTTC: number
  label: string
}

export interface ImportedInvoice extends Omit<Invoice, "id" | "uploadedAt"> {
  amountTTC: number
  label: string
}

export interface ImportedRevenue extends MonthlyRevenue {
  label: string
  transactions: number
  joursOuverts: number
  caJour: number
  ticketMoyen: number
}

export interface SheetImportPreview {
  fixedExpenses: ImportedFixedExpense[]
  loans: ImportedFixedExpense[]
  februaryInvoices: ImportedInvoice[]
  revenues: ImportedRevenue[]
}

// ─── Parsed data from the Google Sheet ───────────────────────────────────────
// These are the fixed charges parsed from the sheet.

const FIXED_CHARGES_RAW: {
  name: string
  ttc: number
  category: FixedExpense["category"]
  tvaRate: TVARate
  notes?: string
}[] = [
  // Loyer : souvent exonéré TVA pour les baux commerciaux simples
  { name: "Loyer + charges", ttc: 1600, category: "Loyer & Immobilier", tvaRate: 0, notes: "Bail commercial" },
  // Énergie : 5.5% (usage domestique/professionnel)
  { name: "Électricité", ttc: 32, category: "Loyer & Immobilier", tvaRate: 5.5 },
  // Assurance : exonérée de TVA
  { name: "Assurance", ttc: 70, category: "Banque & Assurances", tvaRate: 0 },
  // Comptable : 20%
  { name: "Comptable", ttc: 220, category: "Comptabilité & Juridique", tvaRate: 20 },
  // Wix (SaaS) : 20%
  { name: "Wix", ttc: 16.20, category: "Logiciels & SaaS", tvaRate: 20 },
  // Spotify : 20%
  { name: "Spotify (Noma + perso)", ttc: 10.12, category: "Logiciels & SaaS", tvaRate: 20 },
  // Orange : 20%
  { name: "Orange (Fibre + Perso)", ttc: 63.80, category: "Télécom & Internet", tvaRate: 20 },
  // Verisure : 20%
  { name: "Verisure abonnement", ttc: 60, category: "Banque & Assurances", tvaRate: 20 },
  // BPCE intérêts : exonérés
  { name: "BPCE Vie (Intérêts emprunts)", ttc: 18, category: "Banque & Assurances", tvaRate: 0 },
  // Salaire : pas de TVA
  { name: "Salaire", ttc: 522, category: "RH & Salaires", tvaRate: 0, notes: "À adapter si alternance" },
  // ChatGPT : 20%
  { name: "ChatGPT", ttc: 19, category: "Logiciels & SaaS", tvaRate: 20 },
]

const LOANS_RAW: {
  name: string
  ttc: number
  startDate: string
}[] = [
  { name: "Emprunt Banque (25k)", ttc: 369.04, startDate: "2026-04-01" },
  { name: "Emprunt Banque (10k)", ttc: 186.97, startDate: "2026-04-01" },
  { name: "Emprunt BPI (6k)", ttc: 111.00, startDate: "2026-08-01" },
  { name: "Emprunt IHG (4k)", ttc: 93.00, startDate: "2026-05-01" },
]

// Dépenses variables réelles de Février 2026
// Les matières alimentaires sont à 5.5% (matières premières)
// Les autres services à taux variable
const FEBRUARY_EXPENSES_RAW: {
  name: string
  ttc: number
  category: string
  tvaRate: TVARate
  vendor: string
}[] = [
  // Matières premières alimentaires : 5.5%
  { name: "Pâtisserie", ttc: 175.99, category: "Fournitures", tvaRate: 5.5, vendor: "Coup de Pates" },
  { name: "Lait (Avoine & Vache)", ttc: 207.22, category: "Fournitures", tvaRate: 5.5, vendor: "Fournisseur lait" },
  { name: "Matcha & Thé", ttc: 80, category: "Fournitures", tvaRate: 5.5, vendor: "Fournisseur X5" },
  { name: "Café", ttc: 124, category: "Fournitures", tvaRate: 5.5, vendor: "Torréfacteur" },
  // Transport : 10%
  { name: "Métro (courses)", ttc: 235, category: "Transport", tvaRate: 10, vendor: "Métro/RATP" },
  // Pharmacie : 10% (médicaments non remb.) ou 2.1% — on met 0 (exonéré souvent)
  { name: "Pharmacie", ttc: 25, category: "Fournitures", tvaRate: 0, vendor: "Pharmacie" },
  // Action (petits achats) : 20%
  { name: "Action (achat)", ttc: 12.14, category: "Fournitures", tvaRate: 20, vendor: "Action" },
  { name: "Action (achat)", ttc: 16, category: "Fournitures", tvaRate: 20, vendor: "Action" },
  // Ezvilife : 20%
  { name: "Ezvilife", ttc: 10.56, category: "Logiciels & SaaS", tvaRate: 20, vendor: "Ezvilife" },
  // Vista Print : 20%
  { name: "Vista Print (impression)", ttc: 53.38, category: "Marketing & Communication", tvaRate: 20, vendor: "Vistaprint" },
  // Métro grossiste : 10% (distribution alimentaire)
  { name: "Metro (grossiste)", ttc: 105.58, category: "Fournitures", tvaRate: 10, vendor: "Metro Cash & Carry" },
  { name: "Metro (grossiste)", ttc: 47.17, category: "Fournitures", tvaRate: 10, vendor: "Metro Cash & Carry" },
  // Square (paiement) : 20%
  { name: "Square (frais)", ttc: 25, category: "Banque & Assurances", tvaRate: 20, vendor: "Square" },
]

// ─── Ventes mensuelles (depuis Square — onglet VENTES) ───────────────────────
// Source : gid=5104575
const VENTES_RAW: {
  month: string
  label: string
  periode: string
  jours: number
  transactions: number
  ttcEncaisse: number
  ventesNettes: number
  tvaCollectee: number
  caJour: number
  ticketMoyen: number
  partiel?: boolean
}[] = [
  { month: "2025-10", label: "Octobre 2025", periode: "25/10–31/10/2025", jours: 6, transactions: 137, ttcEncaisse: 1100.71, ventesNettes: 984.90, tvaCollectee: 115.81, caJour: 164.15, ticketMoyen: 7.19 },
  { month: "2025-11", label: "Novembre 2025", periode: "01/11–30/11/2025", jours: 25, transactions: 817, ttcEncaisse: 9373.72, ventesNettes: 8188.70, tvaCollectee: 1185.02, caJour: 327.55, ticketMoyen: 10.02 },
  { month: "2025-12", label: "Décembre 2025", periode: "01/12–31/12/2025", jours: 18, transactions: 502, ttcEncaisse: 5569.40, ventesNettes: 5091.28, tvaCollectee: 478.12, caJour: 282.85, ticketMoyen: 10.14 },
  { month: "2026-01", label: "Janvier 2026", periode: "02/01–31/01/2026", jours: 26, transactions: 526, ttcEncaisse: 6419.84, ventesNettes: 5882.90, tvaCollectee: 536.94, caJour: 226.27, ticketMoyen: 11.18 },
  { month: "2026-02", label: "Février 2026", periode: "02/02–21/02/2026", jours: 24, transactions: 456, ttcEncaisse: 4971.81, ventesNettes: 4606.07, tvaCollectee: 365.74, caJour: 191.92, ticketMoyen: 10.10 },
  { month: "2026-03", label: "Mars 2026 (partiel)", periode: "02/03–14/03/2026", jours: 14, transactions: 315, ttcEncaisse: 3651.60, ventesNettes: 3381.01, tvaCollectee: 270.59, caJour: 241.50, ticketMoyen: 10.73, partiel: true },
]

// ─── Build import preview ─────────────────────────────────────────────────────

export function buildSheetImportPreview(): SheetImportPreview {
  const today = new Date().toISOString().slice(0, 10)

  // Fixed expenses
  const fixedExpenses: ImportedFixedExpense[] = FIXED_CHARGES_RAW.map((item) => {
    const amountHT = ttcToHT(item.ttc, item.tvaRate)
    return {
      label: item.name,
      amountTTC: item.ttc,
      name: item.name,
      category: item.category,
      amountHT,
      tvaRate: item.tvaRate,
      frequency: "monthly",
      startDate: today,
      active: true,
      notes: item.notes,
    }
  })

  // Loans
  const loans: ImportedFixedExpense[] = LOANS_RAW.map((item) => ({
    label: item.name,
    amountTTC: item.ttc,
    name: item.name,
    category: "Banque & Assurances" as FixedExpense["category"],
    amountHT: item.ttc, // remboursement emprunt = pas de TVA
    tvaRate: 0 as TVARate,
    frequency: "monthly",
    startDate: item.startDate,
    active: true,
    notes: "Remboursement emprunt",
  }))

  // February invoices
  const februaryInvoices: ImportedInvoice[] = FEBRUARY_EXPENSES_RAW.map((item) => {
    const ht = ttcToHT(item.ttc, item.tvaRate)
    const tva = tvaAmount(item.ttc, item.tvaRate)
    return {
      label: item.name,
      amountTTC: item.ttc,
      fileName: `Import Sheet — ${item.name}`,
      fileType: "manual" as Invoice["fileType"],
      invoiceDate: "2026-02-01",
      invoiceNumber: null,
      vendor: item.vendor,
      totalHT: ht,
      totalTVA: tva,
      totalTTC: item.ttc,
      tvaLines: [makeTVALine(ht, item.tvaRate)],
      status: "manual" as Invoice["status"],
      category: item.category,
      notes: "Importé depuis Google Sheets",
    }
  })

  // Revenues from Square
  const revenues: ImportedRevenue[] = VENTES_RAW.map((item) => ({
    label: item.label,
    month: item.month,
    cabrut: item.ttcEncaisse,
    canet: item.ventesNettes,
    tvaCollectee: item.tvaCollectee,
    tvaRate: 10 as TVARate,
    notes: item.partiel ? `Mois partiel (${item.jours}j ouv.) · ${item.periode}` : `${item.jours}j ouv. · ${item.periode}`,
    transactions: item.transactions,
    joursOuverts: item.jours,
    caJour: item.caJour,
    ticketMoyen: item.ticketMoyen,
  }))

  return { fixedExpenses, loans, februaryInvoices, revenues }
}

// ─── Deduplication helpers ────────────────────────────────────────────────────

export function isFixedExpenseDuplicate(
  name: string,
  existing: { name: string }[]
): boolean {
  return existing.some(
    (e) => e.name.toLowerCase().trim() === name.toLowerCase().trim()
  )
}

export function isRevenueDuplicate(
  month: string,
  existing: { month: string }[]
): boolean {
  return existing.some((r) => r.month === month)
}

export function isInvoiceDuplicate(
  vendor: string,
  ttc: number,
  month: string,
  existing: { vendor: string | null; totalTTC: number; invoiceDate: string | null }[]
): boolean {
  return existing.some(
    (e) =>
      e.vendor?.toLowerCase() === vendor.toLowerCase() &&
      Math.abs(e.totalTTC - ttc) < 0.01 &&
      e.invoiceDate?.startsWith(month)
  )
}

// ─── Finalize to storable records ────────────────────────────────────────────

export function toFixedExpense(item: ImportedFixedExpense): FixedExpense {
  return {
    id: generateId(),
    name: item.name,
    category: item.category,
    amountHT: item.amountHT,
    tvaRate: item.tvaRate,
    frequency: item.frequency,
    startDate: item.startDate,
    active: item.active,
    notes: item.notes,
    endDate: item.endDate,
  }
}

export function toInvoice(item: ImportedInvoice): Invoice {
  return {
    id: generateId(),
    uploadedAt: new Date().toISOString(),
    fileName: item.fileName,
    fileType: item.fileType,
    invoiceDate: item.invoiceDate,
    invoiceNumber: item.invoiceNumber,
    vendor: item.vendor,
    totalHT: item.totalHT,
    totalTVA: item.totalTVA,
    totalTTC: item.totalTTC,
    tvaLines: item.tvaLines,
    status: item.status,
    category: item.category,
    notes: item.notes,
  }
}
