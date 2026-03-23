import type { Invoice, MonthlyRevenue, FixedExpense } from "@/types"
import { monthlyAmount, computeIS } from "@/types"

export interface MonthPL {
  month: string
  label: string

  // Revenue
  cabrut: number
  canet: number // = canet si saisi, sinon = cabrut

  // Charges
  chargesVariablesHT: number
  chargesFixesHT: number
  chargesVariablesTVA: number
  chargesFixesTVA: number
  totalChargesHT: number

  // Taxes
  tvaCollectee: number
  tvaDeductible: number
  tvaNette: number
  isEstime: number

  // Result
  resultatBrut: number   // canet - totalChargesHT
  resultatNet: number    // resultatBrut - isEstime
  resultatDisponible: number // = resultatNet (what's left for envelopes)
}

const MONTH_NAMES = [
  "Jan","Fév","Mar","Avr","Mai","Jun",
  "Jul","Août","Sep","Oct","Nov","Déc",
]

export function computeMonthPL(
  month: string,
  invoices: Invoice[],
  fixedExpenses: FixedExpense[],
  revenue: MonthlyRevenue | undefined
): MonthPL {
  const [, m] = month.split("-")
  const label = `${MONTH_NAMES[parseInt(m, 10) - 1]}`

  // Revenue
  const cabrut = revenue?.cabrut ?? 0
  const canet = revenue?.canet ?? cabrut
  const tvaCollectee = revenue?.tvaCollectee ?? 0

  // Variable charges (invoices this month)
  const monthInvoices = invoices.filter(
    (i) => (i.invoiceDate ?? i.uploadedAt).startsWith(month)
  )
  const chargesVariablesHT = monthInvoices.reduce((s, i) => s + i.totalHT, 0)
  const chargesVariablesTVA = monthInvoices.reduce((s, i) => s + i.totalTVA, 0)

  // Fixed charges (active, normalised to monthly)
  const activeFixed = fixedExpenses.filter((e) => {
    if (!e.active) return false
    if (e.endDate && e.endDate < `${month}-01`) return false
    if (e.startDate > `${month}-31`) return false
    return true
  })
  const chargesFixesHT = activeFixed.reduce((s, e) => s + monthlyAmount(e), 0)
  const chargesFixesTVA = activeFixed.reduce(
    (s, e) => s + monthlyAmount(e) * (e.tvaRate / 100),
    0
  )

  const totalChargesHT = chargesVariablesHT + chargesFixesHT
  const tvaDeductible = chargesVariablesTVA + chargesFixesTVA
  const tvaNette = tvaCollectee - tvaDeductible

  const resultatBrut = canet - totalChargesHT
  // IS: monthly estimate (annualise × 1 month)
  const annualisedResult = resultatBrut * 12
  const annualisedIS = annualisedResult > 0 ? computeIS(annualisedResult) : 0
  const isEstime = Math.round((annualisedIS / 12) * 100) / 100

  const resultatNet = Math.round((resultatBrut - isEstime) * 100) / 100
  const resultatDisponible = resultatNet

  return {
    month,
    label,
    cabrut: round2(cabrut),
    canet: round2(canet),
    chargesVariablesHT: round2(chargesVariablesHT),
    chargesFixesHT: round2(chargesFixesHT),
    chargesVariablesTVA: round2(chargesVariablesTVA),
    chargesFixesTVA: round2(chargesFixesTVA),
    totalChargesHT: round2(totalChargesHT),
    tvaCollectee: round2(tvaCollectee),
    tvaDeductible: round2(tvaDeductible),
    tvaNette: round2(tvaNette),
    isEstime,
    resultatBrut: round2(resultatBrut),
    resultatNet,
    resultatDisponible,
  }
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

/** Last 12 months starting from today */
export function getLast12Months(): string[] {
  const months: string[] = []
  const now = new Date()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`)
  }
  return months
}

export function getCurrentYM(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

export function getAllMonthsForYear(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) =>
    `${year}-${String(i + 1).padStart(2, "0")}`
  )
}

export function ymToLabel(ym: string): string {
  const [y, m] = ym.split("-")
  const FULL = [
    "Janvier","Février","Mars","Avril","Mai","Juin",
    "Juillet","Août","Septembre","Octobre","Novembre","Décembre",
  ]
  return `${FULL[parseInt(m, 10) - 1]} ${y}`
}
