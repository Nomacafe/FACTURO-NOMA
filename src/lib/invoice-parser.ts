import type { Invoice, TVALine, TVARate } from "@/types"
import { parseFrenchNumber } from "@/lib/utils"
import { buildSingleRateTVALines } from "@/lib/tva-calculator"

// ─── PDF text extraction via pdfjs-dist ─────────────────────────────────────

async function extractTextFromPDF(file: File): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist")
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url
  ).toString()

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const texts: string[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
    texts.push(pageText)
  }

  return texts.join("\n")
}

// ─── Regex patterns for French invoices ──────────────────────────────────────

const AMOUNT_RE = /[\d\s]+(?:[,\.]\d{1,2})?/

function buildAmountPattern(label: string): RegExp {
  return new RegExp(
    `${label}[\\s:]*([\\d\\s]+(?:[,\\.]\\d{1,2})?)\\s*(?:€|EUR)?`,
    "i"
  )
}

const PATTERNS = {
  // Total HT
  totalHT: [
    buildAmountPattern("total\\s+h\\.?t\\.?"),
    buildAmountPattern("montant\\s+h\\.?t\\.?"),
    buildAmountPattern("sous[\\s-]total\\s+h\\.?t\\.?"),
    buildAmountPattern("base\\s+h\\.?t\\.?"),
    buildAmountPattern("net\\s+commercial"),
    buildAmountPattern("total\\s+hors\\s+taxes"),
  ],
  // Total TTC
  totalTTC: [
    buildAmountPattern("total\\s+t\\.?t\\.?c\\.?"),
    buildAmountPattern("montant\\s+t\\.?t\\.?c\\.?"),
    buildAmountPattern("total\\s+toutes\\s+taxes"),
    buildAmountPattern("net\\s+à\\s+payer"),
    buildAmountPattern("montant\\s+net"),
    buildAmountPattern("total\\s+à\\s+payer"),
  ],
  // TVA amounts
  tva20: [
    buildAmountPattern("t\\.?v\\.?a\\.?\\s+(?:à\\s+|au\\s+taux\\s+de\\s+)?20\\s*%"),
    buildAmountPattern("tva\\s+20"),
  ],
  tva10: [
    buildAmountPattern("t\\.?v\\.?a\\.?\\s+(?:à\\s+|au\\s+taux\\s+de\\s+)?10\\s*%"),
    buildAmountPattern("tva\\s+10"),
  ],
  tva5: [
    buildAmountPattern("t\\.?v\\.?a\\.?\\s+(?:à\\s+|au\\s+taux\\s+de\\s+)?5[,\\.]5\\s*%"),
    buildAmountPattern("tva\\s+5"),
  ],
  tva2: [
    buildAmountPattern("t\\.?v\\.?a\\.?\\s+(?:à\\s+|au\\s+taux\\s+de\\s+)?2[,\\.]1\\s*%"),
  ],
  // Vendor / fournisseur
  vendor: [
    /(?:société|entreprise|raison sociale|fournisseur|émetteur)\s*[:\-]?\s*([^\n\r,]{3,50})/i,
    /(?:de\s+la\s+société|de\s+l'entreprise)\s+([^\n\r,]{3,50})/i,
  ],
  // Date
  date: [
    /(?:date\s+de\s+(?:la\s+)?facture|date\s+d['']émission|date)\s*[:\-]?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
    /(?:le\s+|date\s*:\s*)(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
    /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/,
  ],
  // Invoice number
  invoiceNumber: [
    /(?:facture\s+n[°o]?|n[°o]?\s+de\s+facture|invoice\s+n[°o]?|réf\.?\s+facture|référence\s+facture)\s*[:\-]?\s*([A-Z0-9\-\/]{3,20})/i,
    /(?:n[°o]?\s*facture|facture)\s*[:\-]?\s*([A-Z0-9\-\/]{3,20})/i,
  ],
}

function matchFirst(patterns: RegExp[], text: string): string | null {
  for (const re of patterns) {
    const m = re.exec(text)
    if (m?.[1]) return m[1].trim()
  }
  return null
}

function extractAmount(patterns: RegExp[], text: string): number {
  const raw = matchFirst(patterns, text)
  if (!raw) return 0
  return parseFrenchNumber(raw)
}

function parseDate(raw: string | null): string | null {
  if (!raw) return null
  const parts = raw.split(/[\/\-\.]/)
  if (parts.length !== 3) return null
  const [d, m, y] = parts
  const year = y.length === 2 ? `20${y}` : y
  try {
    const date = new Date(`${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`)
    if (isNaN(date.getTime())) return null
    return date.toISOString().split("T")[0]
  } catch {
    return null
  }
}

// ─── Build TVA lines from extracted amounts ───────────────────────────────────

function buildTVALines(
  ht: number,
  ttc: number,
  tva20: number,
  tva10: number,
  tva5: number,
  tva2: number
): TVALine[] {
  const lines: TVALine[] = []

  if (tva20 > 0) {
    lines.push({ rate: 20, baseHT: Math.round((tva20 / 0.2) * 100) / 100, montantTVA: tva20 })
  }
  if (tva10 > 0) {
    lines.push({ rate: 10, baseHT: Math.round((tva10 / 0.1) * 100) / 100, montantTVA: tva10 })
  }
  if (tva5 > 0) {
    lines.push({ rate: 5.5, baseHT: Math.round((tva5 / 0.055) * 100) / 100, montantTVA: tva5 })
  }
  if (tva2 > 0) {
    lines.push({ rate: 2.1, baseHT: Math.round((tva2 / 0.021) * 100) / 100, montantTVA: tva2 })
  }

  // If no explicit TVA lines but we have HT and TTC, infer from the difference
  if (lines.length === 0 && ht > 0 && ttc > 0) {
    const inferredTVA = Math.round((ttc - ht) * 100) / 100
    if (inferredTVA > 0) {
      const inferredRate = inferTVARate(inferredTVA, ht)
      return buildSingleRateTVALines(ht, inferredTVA, inferredRate)
    }
  }

  return lines
}

function inferTVARate(tva: number, ht: number): TVARate {
  if (ht === 0) return 20
  const rate = Math.round((tva / ht) * 100 * 10) / 10
  if (rate >= 18 && rate <= 22) return 20
  if (rate >= 9 && rate <= 11) return 10
  if (rate >= 5 && rate <= 6) return 5.5
  if (rate >= 1.5 && rate <= 2.5) return 2.1
  return 20
}

// ─── Main parse function ──────────────────────────────────────────────────────

export interface ParseResult {
  invoice: Omit<Invoice, "id" | "uploadedAt">
  confidence: "high" | "medium" | "low"
}

export async function parseInvoiceFile(file: File): Promise<ParseResult> {
  const isPDF = file.type === "application/pdf"
  const isImage = file.type.startsWith("image/")

  let rawText = ""

  if (isPDF) {
    rawText = await extractTextFromPDF(file)
  } else if (isImage) {
    // Images: we return a partial result and let the user fill in manually
    return {
      invoice: {
        fileName: file.name,
        fileType: "image",
        invoiceDate: null,
        invoiceNumber: null,
        vendor: null,
        totalHT: 0,
        totalTVA: 0,
        totalTTC: 0,
        tvaLines: [],
        status: "pending",
        rawText: "",
      },
      confidence: "low",
    }
  }

  return parseInvoiceText(rawText, file.name, isPDF ? "pdf" : "manual")
}

export function parseInvoiceText(
  rawText: string,
  fileName: string,
  fileType: Invoice["fileType"]
): ParseResult {
  const text = rawText

  const totalHT = extractAmount(PATTERNS.totalHT, text)
  const totalTTC = extractAmount(PATTERNS.totalTTC, text)
  const tva20 = extractAmount(PATTERNS.tva20, text)
  const tva10 = extractAmount(PATTERNS.tva10, text)
  const tva5 = extractAmount(PATTERNS.tva5, text)
  const tva2 = extractAmount(PATTERNS.tva2, text)

  const tvaLines = buildTVALines(totalHT, totalTTC, tva20, tva10, tva5, tva2)
  const totalTVA = Math.round(tvaLines.reduce((s, l) => s + l.montantTVA, 0) * 100) / 100

  const finalHT = totalHT > 0 ? totalHT : Math.round((totalTTC - totalTVA) * 100) / 100
  const finalTTC =
    totalTTC > 0 ? totalTTC : Math.round((finalHT + totalTVA) * 100) / 100

  const rawVendor = matchFirst(PATTERNS.vendor, text)
  const rawDate = matchFirst(PATTERNS.date, text)
  const rawNumber = matchFirst(PATTERNS.invoiceNumber, text)

  const hasEnoughData = finalHT > 0 || totalTVA > 0 || finalTTC > 0
  const confidence: ParseResult["confidence"] = hasEnoughData
    ? rawVendor && rawDate
      ? "high"
      : "medium"
    : "low"

  return {
    invoice: {
      fileName,
      fileType,
      invoiceDate: parseDate(rawDate),
      invoiceNumber: rawNumber,
      vendor: rawVendor,
      totalHT: finalHT,
      totalTVA,
      totalTTC: finalTTC,
      tvaLines,
      status: hasEnoughData ? "analysed" : "pending",
      rawText,
    },
    confidence,
  }
}

// ─── TVA rate detection from known patterns ───────────────────────────────────

/** Detect TVA rates mentioned anywhere in the text */
export function detectTVARates(text: string): TVARate[] {
  const rates: TVARate[] = []
  if (/20\s*%/.test(text)) rates.push(20)
  if (/10\s*%/.test(text)) rates.push(10)
  if (/5[,.]5\s*%/.test(text)) rates.push(5.5)
  if (/2[,.]1\s*%/.test(text)) rates.push(2.1)
  return rates
}

// Silence unused import warning
void (AMOUNT_RE)
