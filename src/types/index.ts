// ─── TVA ─────────────────────────────────────────────────────────────────────

export type TVARate = 20 | 10 | 5.5 | 2.1 | 0

export interface TVALine {
  rate: TVARate
  baseHT: number
  montantTVA: number
}

export const TVA_RATES: TVARate[] = [20, 10, 5.5, 2.1, 0]

export const TVA_RATE_LABELS: Record<TVARate, string> = {
  20: "Taux normal (20%)",
  10: "Taux intermédiaire (10%)",
  5.5: "Taux réduit (5,5%)",
  2.1: "Taux super réduit (2,1%)",
  0: "Exonéré (0%)",
}

// ─── Factures ────────────────────────────────────────────────────────────────

export type InvoiceStatus = "analysed" | "manual" | "pending"

export interface Invoice {
  id: string
  fileName: string
  fileType: "pdf" | "image" | "manual"
  uploadedAt: string
  invoiceDate: string | null
  invoiceNumber: string | null
  vendor: string | null
  totalHT: number
  totalTVA: number
  totalTTC: number
  tvaLines: TVALine[]
  status: InvoiceStatus
  rawText?: string
  notes?: string
  category?: string
}

export type InvoiceCategory =
  | "Fournitures"
  | "Services"
  | "Logiciels & SaaS"
  | "Marketing"
  | "Transport"
  | "Immobilier"
  | "RH & Formation"
  | "Matériel informatique"
  | "Autre"

export const INVOICE_CATEGORIES: InvoiceCategory[] = [
  "Fournitures",
  "Services",
  "Logiciels & SaaS",
  "Marketing",
  "Transport",
  "Immobilier",
  "RH & Formation",
  "Matériel informatique",
  "Autre",
]

// ─── Charges fixes ───────────────────────────────────────────────────────────

export type FixedExpenseFrequency = "monthly" | "quarterly" | "annual"

export type FixedExpenseCategory =
  | "Loyer & Immobilier"
  | "Banque & Assurances"
  | "Logiciels & SaaS"
  | "RH & Salaires"
  | "Transport & Véhicules"
  | "Télécom & Internet"
  | "Marketing & Communication"
  | "Comptabilité & Juridique"
  | "Autre"

export const FIXED_EXPENSE_CATEGORIES: FixedExpenseCategory[] = [
  "Loyer & Immobilier",
  "Banque & Assurances",
  "Logiciels & SaaS",
  "RH & Salaires",
  "Transport & Véhicules",
  "Télécom & Internet",
  "Marketing & Communication",
  "Comptabilité & Juridique",
  "Autre",
]

export interface FixedExpense {
  id: string
  name: string
  category: FixedExpenseCategory
  amountHT: number
  tvaRate: TVARate
  frequency: FixedExpenseFrequency
  /** ISO date string — date de début */
  startDate: string
  /** ISO date string — date de fin (optionnel) */
  endDate?: string
  active: boolean
  notes?: string
}

/** Montant mensuel normalisé */
export function monthlyAmount(expense: FixedExpense): number {
  if (expense.frequency === "monthly") return expense.amountHT
  if (expense.frequency === "quarterly") return expense.amountHT / 3
  return expense.amountHT / 12
}

// ─── Stock ───────────────────────────────────────────────────────────────────

export interface StockItem {
  id: string
  reference: string
  name: string
  category: string
  quantity: number
  unitCostHT: number
  unitPriceTTC?: number
  reorderPoint?: number
  supplier?: string
  notes?: string
  updatedAt: string
}

// ─── Revenus (CA mensuel) ─────────────────────────────────────────────────────

export interface MonthlyRevenue {
  /** Format "YYYY-MM" */
  month: string
  cabrut: number
  /** CA Net = CA Brut - remises/retours (optionnel, utilisé si saisi) */
  canet?: number
  /** TVA collectée sur le CA (si assujetti) */
  tvaCollectee: number
  tvaRate: TVARate
  notes?: string
}

// ─── Enveloppes budgétaires ───────────────────────────────────────────────────

export interface BudgetEnvelope {
  id: string
  name: string
  /** % du résultat net mensuel alloué à cette enveloppe */
  allocationPercent: number
  color: string
  description?: string
  /** YYYY-MM — mois de création de l'enveloppe */
  startMonth: string
}

export type EnvelopeTransactionType = "dotation" | "spending" | "adjustment"

export interface EnvelopeTransaction {
  id: string
  envelopeId: string
  /** Format "YYYY-MM" */
  month: string
  /** Positif = entrée (dotation/ajout), négatif = dépense */
  amount: number
  type: EnvelopeTransactionType
  description: string
  date: string
}

// ─── BudgetEntry (legacy — kept for store compat) ────────────────────────────
export interface BudgetEntry {
  id: string
  month: string
  category: string
  budgetedHT: number
  notes?: string
}

// ─── Dashboard stats ─────────────────────────────────────────────────────────

export interface DashboardStats {
  totalHT: number
  totalTVA: number
  totalTTC: number
  invoiceCount: number
  averageHT: number
  tvaByRate: Record<string, { baseHT: number; montantTVA: number }>
  monthlyExpenses: { month: string; ht: number; tva: number }[]
  topVendors: { name: string; total: number }[]
  byCategory: { category: string; ht: number }[]
}

// ─── SAS Tax calculation ──────────────────────────────────────────────────────

export interface SASFiscalResult {
  cabrut: number
  chargesVariablesHT: number
  chargesFixesHT: number
  chargesStockHT: number
  totalChargesHT: number
  resultatBrut: number
  /** IS estimé : 15% jusqu'à 42 500 € puis 25% */
  isEstime: number
  /** TVA nette = TVA collectée - TVA déductible */
  tvaNette: number
  resultatNet: number
}

export const IS_SEUIL_TAUX_REDUIT = 42_500
export const IS_TAUX_REDUIT = 0.15
export const IS_TAUX_NORMAL = 0.25

export function computeIS(benefice: number): number {
  if (benefice <= 0) return 0
  const reduit = Math.min(benefice, IS_SEUIL_TAUX_REDUIT) * IS_TAUX_REDUIT
  const normal = Math.max(0, benefice - IS_SEUIL_TAUX_REDUIT) * IS_TAUX_NORMAL
  return Math.round((reduit + normal) * 100) / 100
}
