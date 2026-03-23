import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—"
  try {
    const date = new Date(dateStr)
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date)
  } catch {
    return dateStr
  }
}

export function generateId(): string {
  return `inv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

/** Parse a French number string like "1 234,56" or "1234.56" → number */
export function parseFrenchNumber(str: string): number {
  if (!str) return 0
  // Remove spaces (thousands separator in French)
  const cleaned = str.replace(/\s/g, "").replace(/\u00a0/g, "")
  // Replace comma decimal separator with dot
  const normalized = cleaned.replace(",", ".")
  const n = parseFloat(normalized)
  return isNaN(n) ? 0 : n
}
