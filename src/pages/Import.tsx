import { useState, useMemo } from "react"
import { CheckCircle2, AlertTriangle, ChevronDown, ChevronRight, Import as ImportIcon, Info, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  buildSheetImportPreview,
  isFixedExpenseDuplicate,
  isInvoiceDuplicate,
  isRevenueDuplicate,
  toFixedExpense,
  toInvoice,
  type ImportedFixedExpense,
  type ImportedInvoice,
  type ImportedRevenue,
} from "@/lib/sheet-parser"
import { useFixedExpenseStore } from "@/store/fixedExpenseStore"
import { useInvoiceStore } from "@/store/invoiceStore"
import { useRevenueStore } from "@/store/revenueStore"
import { formatCurrency } from "@/lib/utils"

type ImportStatus = "idle" | "preview" | "done"

interface RowState {
  selected: boolean
  duplicate: boolean
}

export function Import() {
  const { expenses: existingFixed, addExpense } = useFixedExpenseStore()
  const { invoices: existingInvoices, addInvoice } = useInvoiceStore()
  const { revenues: existingRevenues, setMonthRevenue } = useRevenueStore()

  const [status, setStatus] = useState<ImportStatus>("idle")
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    revenues: true,
    fixed: true,
    loans: true,
    february: true,
  })
  const [importResult, setImportResult] = useState({ fixed: 0, loans: 0, invoices: 0, revenues: 0, skipped: 0 })

  // Build preview
  const preview = useMemo(() => buildSheetImportPreview(), [])

  // Detect duplicates
  const fixedRows: (ImportedFixedExpense & { rowState: RowState })[] = useMemo(
    () =>
      preview.fixedExpenses.map((item) => ({
        ...item,
        rowState: {
          duplicate: isFixedExpenseDuplicate(item.name, existingFixed),
          selected: !isFixedExpenseDuplicate(item.name, existingFixed),
        },
      })),
    [preview.fixedExpenses, existingFixed]
  )

  const loanRows: (ImportedFixedExpense & { rowState: RowState })[] = useMemo(
    () =>
      preview.loans.map((item) => ({
        ...item,
        rowState: {
          duplicate: isFixedExpenseDuplicate(item.name, existingFixed),
          selected: !isFixedExpenseDuplicate(item.name, existingFixed),
        },
      })),
    [preview.loans, existingFixed]
  )

  const invoiceRows: (ImportedInvoice & { rowState: RowState })[] = useMemo(
    () =>
      preview.februaryInvoices.map((item) => ({
        ...item,
        rowState: {
          duplicate: isInvoiceDuplicate(item.vendor ?? "", item.totalTTC, "2026-02", existingInvoices),
          selected: !isInvoiceDuplicate(item.vendor ?? "", item.totalTTC, "2026-02", existingInvoices),
        },
      })),
    [preview.februaryInvoices, existingInvoices]
  )

  const revenueRows: (ImportedRevenue & { rowState: RowState })[] = useMemo(
    () =>
      preview.revenues.map((item) => ({
        ...item,
        rowState: {
          duplicate: isRevenueDuplicate(item.month, existingRevenues),
          selected: !isRevenueDuplicate(item.month, existingRevenues),
        },
      })),
    [preview.revenues, existingRevenues]
  )

  const [fixedSelected, setFixedSelected] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(fixedRows.map((r, i) => [i, r.rowState.selected]))
  )
  const [loanSelected, setLoanSelected] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(loanRows.map((r, i) => [i, r.rowState.selected]))
  )
  const [invoiceSelected, setInvoiceSelected] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(invoiceRows.map((r, i) => [i, r.rowState.selected]))
  )
  const [revenueSelected, setRevenueSelected] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(revenueRows.map((r, i) => [i, r.rowState.selected]))
  )

  const totalSelected =
    Object.values(fixedSelected).filter(Boolean).length +
    Object.values(loanSelected).filter(Boolean).length +
    Object.values(invoiceSelected).filter(Boolean).length +
    Object.values(revenueSelected).filter(Boolean).length

  const totalDuplicates =
    fixedRows.filter((r) => r.rowState.duplicate).length +
    loanRows.filter((r) => r.rowState.duplicate).length +
    invoiceRows.filter((r) => r.rowState.duplicate).length +
    revenueRows.filter((r) => r.rowState.duplicate).length

  const handleImport = () => {
    let fixed = 0, loans = 0, invoices = 0, revenues = 0, skipped = 0

    revenueRows.forEach((item, i) => {
      if (revenueSelected[i]) {
        setMonthRevenue({
          month: item.month,
          cabrut: item.cabrut,
          canet: item.canet,
          tvaCollectee: item.tvaCollectee,
          tvaRate: item.tvaRate,
          notes: item.notes,
        })
        revenues++
      } else {
        skipped++
      }
    })

    fixedRows.forEach((item, i) => {
      if (fixedSelected[i]) {
        addExpense(toFixedExpense(item))
        fixed++
      } else {
        skipped++
      }
    })

    loanRows.forEach((item, i) => {
      if (loanSelected[i]) {
        addExpense(toFixedExpense(item))
        loans++
      } else {
        skipped++
      }
    })

    invoiceRows.forEach((item, i) => {
      if (invoiceSelected[i]) {
        addInvoice(toInvoice(item))
        invoices++
      } else {
        skipped++
      }
    })

    setImportResult({ fixed, loans, invoices, revenues, skipped })
    setStatus("done")
  }

  const toggle = (section: string) =>
    setExpanded((p) => ({ ...p, [section]: !p[section] }))

  // ── DONE STATE ──
  if (status === "done") {
    return (
      <div className="max-w-lg mx-auto py-12">
        <div className="rounded-2xl border bg-white p-8 text-center space-y-4">
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
          </div>
          <h2 className="text-xl font-bold">Import terminé</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-2xl font-bold text-teal-700">{importResult.revenues}</p>
              <p className="text-muted-foreground text-xs">Mois de CA</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-2xl font-bold text-emerald-700">{importResult.fixed}</p>
              <p className="text-muted-foreground text-xs">Charges fixes</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-2xl font-bold text-blue-700">{importResult.loans}</p>
              <p className="text-muted-foreground text-xs">Emprunts</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-2xl font-bold text-purple-700">{importResult.invoices}</p>
              <p className="text-muted-foreground text-xs">Dépenses fév.</p>
            </div>
          </div>
          {importResult.skipped > 0 && (
            <p className="text-xs text-muted-foreground">
              {importResult.skipped} ligne{importResult.skipped > 1 ? "s" : ""} ignorée{importResult.skipped > 1 ? "s" : ""} (doublons ou désélectionnées)
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            Toutes les données sont maintenant visibles dans les sections correspondantes.
          </p>
          <Button onClick={() => setStatus("idle")} variant="outline" className="w-full">
            Retour
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
        <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800">
          <p className="font-semibold mb-1">Import depuis votre Google Sheet</p>
          <p className="text-xs leading-relaxed">
            Les données ont été analysées et les montants <strong>TTC convertis en HT</strong> avec les taux de TVA français applicables.
            Les doublons sont détectés automatiquement. Décochez les lignes que vous ne souhaitez pas importer.
          </p>
        </div>
      </div>

      {totalDuplicates > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800">
            <strong>{totalDuplicates}</strong> doublon{totalDuplicates > 1 ? "s" : ""} détecté{totalDuplicates > 1 ? "s" : ""} — déjà présent{totalDuplicates > 1 ? "s" : ""} dans l'application, non sélectionné{totalDuplicates > 1 ? "s" : ""} par défaut.
          </p>
        </div>
      )}

      {/* ── SECTION 0: CA mensuel ── */}
      <Section
        title="CA mensuel — Ventes Square"
        subtitle={`6 mois · ${formatCurrency(preview.revenues.reduce((s, r) => s + r.cabrut, 0))} TTC encaissé`}
        badge="CA"
        badgeColor="bg-teal-100 text-teal-700"
        expanded={expanded.revenues}
        onToggle={() => toggle("revenues")}
      >
        <div>
          <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] items-center gap-x-4 px-5 py-2 bg-muted/30 text-xs font-medium text-muted-foreground">
            <span className="w-5" />
            <span>Mois</span>
            <span className="text-right w-24">TTC encaissé</span>
            <span className="text-right w-24">CA net HT</span>
            <span className="text-right w-20">TVA coll.</span>
            <span className="w-20" />
          </div>
          {revenueRows.map((row, i) => (
            <label
              key={i}
              className={`grid grid-cols-[auto_1fr_auto_auto_auto_auto] items-center gap-x-4 px-5 py-3 cursor-pointer border-b last:border-b-0 hover:bg-muted/20 transition-colors ${!revenueSelected[i] ? "opacity-50" : ""}`}
            >
              <input
                type="checkbox"
                checked={revenueSelected[i] ?? false}
                onChange={() => setRevenueSelected((p) => ({ ...p, [i]: !p[i] }))}
                className="h-4 w-4 rounded accent-primary"
              />
              <div className="min-w-0">
                <p className="text-sm font-medium">{row.label}</p>
                <p className="text-xs text-muted-foreground">{row.notes} · {row.transactions} transactions · {formatCurrency(row.ticketMoyen)} / ticket</p>
              </div>
              <div className="text-right w-24">
                <p className="text-xs text-muted-foreground">{formatCurrency(row.cabrut)}</p>
              </div>
              <div className="text-right w-24">
                <p className="text-sm font-semibold">{formatCurrency(row.canet ?? 0)}</p>
              </div>
              <div className="text-right w-20">
                <p className="text-xs font-medium text-amber-600">{formatCurrency(row.tvaCollectee)}</p>
              </div>
              <div className="w-20 text-right">
                {row.rowState.duplicate && (
                  <Badge variant="warning" className="text-xs">Doublon</Badge>
                )}
              </div>
            </label>
          ))}
          <div className="px-5 py-3 bg-muted/20 text-xs font-semibold text-muted-foreground flex gap-4">
            <span className="flex items-center gap-1.5">
              <TrendingUp className="h-3 w-3" />
              CA net sélectionné : {formatCurrency(revenueRows.filter((_, i) => revenueSelected[i]).reduce((s, r) => s + (r.canet ?? 0), 0))}
            </span>
            <span>TVA collectée : {formatCurrency(revenueRows.filter((_, i) => revenueSelected[i]).reduce((s, r) => s + r.tvaCollectee, 0))}</span>
          </div>
        </div>
      </Section>

      {/* ── SECTION 1: Charges fixes ── */}
      <Section
        title="Charges fixes mensuelles"
        subtitle={`${preview.fixedExpenses.length} postes · ${formatCurrency(preview.fixedExpenses.reduce((s, e) => s + e.amountTTC, 0))} TTC/mois`}
        badge="Charges fixes"
        badgeColor="bg-purple-100 text-purple-700"
        expanded={expanded.fixed}
        onToggle={() => toggle("fixed")}
      >
        <ImportTable
          rows={fixedRows.map((r, i) => ({
            label: r.name,
            ttc: r.amountTTC,
            ht: r.amountHT,
            tva: r.tvaRate,
            detail: r.notes ?? r.category,
            duplicate: r.rowState.duplicate,
            selected: fixedSelected[i] ?? false,
            onToggle: () => setFixedSelected((p) => ({ ...p, [i]: !p[i] })),
          }))}
          footer={`Total HT/mois : ${formatCurrency(fixedRows.filter((_, i) => fixedSelected[i]).reduce((s, r) => s + r.amountHT, 0))}`}
        />
      </Section>

      {/* ── SECTION 2: Emprunts ── */}
      <Section
        title="Remboursements d'emprunts"
        subtitle={`4 emprunts · ${formatCurrency(preview.loans.reduce((s, e) => s + e.amountTTC, 0))}/mois à terme`}
        badge="Banque"
        badgeColor="bg-red-100 text-red-700"
        expanded={expanded.loans}
        onToggle={() => toggle("loans")}
      >
        <ImportTable
          rows={loanRows.map((r, i) => ({
            label: r.name,
            ttc: r.amountTTC,
            ht: r.amountHT,
            tva: r.tvaRate,
            detail: `Début : ${r.startDate}`,
            duplicate: r.rowState.duplicate,
            selected: loanSelected[i] ?? false,
            onToggle: () => setLoanSelected((p) => ({ ...p, [i]: !p[i] })),
          }))}
          footer={`Total/mois : ${formatCurrency(loanRows.filter((_, i) => loanSelected[i]).reduce((s, r) => s + r.amountHT, 0))}`}
        />
      </Section>

      {/* ── SECTION 3: Dépenses février ── */}
      <Section
        title="Dépenses variables — Février 2026"
        subtitle={`${preview.februaryInvoices.length} achats · ${formatCurrency(preview.februaryInvoices.reduce((s, e) => s + e.totalTTC, 0))} TTC total`}
        badge="Factures"
        badgeColor="bg-blue-100 text-blue-700"
        expanded={expanded.february}
        onToggle={() => toggle("february")}
      >
        <ImportTable
          rows={invoiceRows.map((r, i) => ({
            label: r.label,
            ttc: r.totalTTC,
            ht: r.totalHT,
            tva: r.tvaLines[0]?.rate ?? 0,
            detail: `${r.vendor} · ${r.category}`,
            duplicate: r.rowState.duplicate,
            selected: invoiceSelected[i] ?? false,
            onToggle: () => setInvoiceSelected((p) => ({ ...p, [i]: !p[i] })),
          }))}
          footer={`Total HT : ${formatCurrency(invoiceRows.filter((_, i) => invoiceSelected[i]).reduce((s, r) => s + r.totalHT, 0))} · TVA : ${formatCurrency(invoiceRows.filter((_, i) => invoiceSelected[i]).reduce((s, r) => s + r.totalTVA, 0))}`}
        />
      </Section>

      {/* Summary + Import button */}
      <div className="sticky bottom-4 rounded-xl border-2 border-primary/30 bg-white/95 backdrop-blur p-4 shadow-lg">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="text-sm">
            <span className="font-semibold text-primary">{totalSelected}</span>
            <span className="text-muted-foreground"> ligne{totalSelected > 1 ? "s" : ""} sélectionnée{totalSelected > 1 ? "s" : ""} à importer</span>
            {totalDuplicates > 0 && (
              <span className="ml-2 text-amber-600 text-xs">
                · {totalDuplicates} doublon{totalDuplicates > 1 ? "s" : ""} ignoré{totalDuplicates > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <Button
            onClick={handleImport}
            disabled={totalSelected === 0}
            className="gap-2"
            size="lg"
          >
            <ImportIcon className="h-4 w-4" />
            Importer {totalSelected} entrée{totalSelected > 1 ? "s" : ""}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Section component ─────────────────────────────────────────────────────────

function Section({
  title, subtitle, badge, badgeColor, expanded, onToggle, children,
}: {
  title: string
  subtitle: string
  badge: string
  badgeColor: string
  expanded: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border bg-white overflow-hidden">
      <button
        className="flex items-center justify-between w-full px-5 py-4 hover:bg-muted/20 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3 text-left">
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeColor}`}>
            {badge}
          </span>
          <div>
            <p className="font-semibold text-sm">{title}</p>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>
      {expanded && <div className="border-t">{children}</div>}
    </div>
  )
}

// ─── Table component ──────────────────────────────────────────────────────────

interface TableRow {
  label: string
  ttc: number
  ht: number
  tva: number
  detail: string
  duplicate: boolean
  selected: boolean
  onToggle: () => void
}

function ImportTable({ rows, footer }: { rows: TableRow[]; footer: string }) {
  return (
    <div>
      {/* Header */}
      <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] items-center gap-x-4 px-5 py-2 bg-muted/30 text-xs font-medium text-muted-foreground">
        <span className="w-5" />
        <span>Poste</span>
        <span className="text-right w-20">TTC</span>
        <span className="text-right w-20">HT</span>
        <span className="text-right w-12">TVA</span>
        <span className="w-20" />
      </div>

      {/* Rows */}
      {rows.map((row, i) => (
        <label
          key={i}
          className={`grid grid-cols-[auto_1fr_auto_auto_auto_auto] items-center gap-x-4 px-5 py-3 cursor-pointer border-b last:border-b-0 hover:bg-muted/20 transition-colors ${!row.selected ? "opacity-50" : ""}`}
        >
          <input
            type="checkbox"
            checked={row.selected}
            onChange={row.onToggle}
            className="h-4 w-4 rounded accent-primary"
          />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{row.label}</p>
            <p className="text-xs text-muted-foreground truncate">{row.detail}</p>
          </div>
          <div className="text-right w-20">
            <p className="text-xs text-muted-foreground">{formatCurrency(row.ttc)}</p>
          </div>
          <div className="text-right w-20">
            <p className="text-sm font-semibold">{formatCurrency(row.ht)}</p>
          </div>
          <div className="text-right w-12">
            <p className="text-xs font-medium text-amber-600">{row.tva}%</p>
          </div>
          <div className="w-20 text-right">
            {row.duplicate && (
              <Badge variant="warning" className="text-xs">Doublon</Badge>
            )}
          </div>
        </label>
      ))}

      {/* Footer */}
      <div className="px-5 py-3 bg-muted/20 text-xs font-semibold text-muted-foreground">
        {footer}
      </div>
    </div>
  )
}
