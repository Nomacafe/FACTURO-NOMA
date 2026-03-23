import { useState, useMemo } from "react"
import { Plus, Download, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { InvoiceList } from "@/components/invoices/InvoiceList"
import { InvoiceUpload } from "@/components/invoices/InvoiceUpload"
import { useInvoiceStore } from "@/store/invoiceStore"
import { formatCurrency } from "@/lib/utils"

const MONTH_NAMES = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"]

function currentYM() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

function ymLabel(ym: string) {
  const [y, m] = ym.split("-")
  return `${MONTH_NAMES[parseInt(m) - 1]} ${y}`
}

function prevYM(ym: string) {
  const [y, m] = ym.split("-").map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

function nextYM(ym: string) {
  const [y, m] = ym.split("-").map(Number)
  const d = new Date(y, m, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

export function Invoices() {
  const [uploadOpen, setUploadOpen] = useState(false)
  const [selectedYM, setSelectedYM] = useState(currentYM())
  const invoices = useInvoiceStore((s) => s.invoices)
  const isCurrentMonth = selectedYM === currentYM()

  // Filtre par mois sélectionné
  const monthInvoices = useMemo(
    () => invoices.filter((inv) => (inv.invoiceDate ?? inv.uploadedAt ?? "").startsWith(selectedYM)),
    [invoices, selectedYM]
  )

  const totalHT = monthInvoices.reduce((s, i) => s + i.totalHT, 0)
  const totalTVA = monthInvoices.reduce((s, i) => s + i.totalTVA, 0)
  const totalTTC = monthInvoices.reduce((s, i) => s + i.totalTTC, 0)

  const exportCSV = () => {
    const header = ["Date","Fournisseur","N° Facture","Catégorie","HT (€)","TVA (€)","TTC (€)","Taux TVA","Statut"]
    const rows = monthInvoices.map((inv) => [
      inv.invoiceDate ?? "",
      inv.vendor ?? "",
      inv.invoiceNumber ?? "",
      inv.category ?? "",
      inv.totalHT.toFixed(2),
      inv.totalTVA.toFixed(2),
      inv.totalTTC.toFixed(2),
      inv.tvaLines[0]?.rate ?? "",
      inv.status,
    ])
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n")
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `factures-${selectedYM}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {/* Sélecteur de mois */}
        <div className="flex items-center gap-2 rounded-lg border bg-white px-3 py-1.5 shadow-sm">
          <button
            onClick={() => setSelectedYM(prevYM(selectedYM))}
            className="rounded p-1 hover:bg-muted transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold w-36 text-center">{ymLabel(selectedYM)}</span>
          <button
            onClick={() => setSelectedYM(nextYM(selectedYM))}
            disabled={isCurrentMonth}
            className="rounded p-1 hover:bg-muted transition-colors disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-2">
          {monthInvoices.length > 0 && (
            <Button variant="outline" onClick={exportCSV} className="gap-2">
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          )}
          <Button onClick={() => setUploadOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Ajouter une charge
          </Button>
        </div>
      </div>

      {/* Summary strip */}
      {monthInvoices.length > 0 ? (
        <div className="grid grid-cols-3 gap-4 rounded-xl border bg-white p-4">
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-0.5">Total HT</p>
            <p className="text-xl font-bold">{formatCurrency(totalHT)}</p>
          </div>
          <div className="text-center border-x">
            <p className="text-xs text-muted-foreground mb-0.5">TVA déductible</p>
            <p className="text-xl font-bold text-amber-600">{formatCurrency(totalTVA)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-0.5">Total TTC</p>
            <p className="text-xl font-bold">{formatCurrency(totalTTC)}</p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed bg-muted/20 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Aucune charge variable pour <strong>{ymLabel(selectedYM)}</strong>
          </p>
          <Button variant="outline" size="sm" className="mt-3 gap-2" onClick={() => setUploadOpen(true)}>
            <Plus className="h-4 w-4" />
            Ajouter une charge pour ce mois
          </Button>
        </div>
      )}

      {/* Invoice list — filtré par mois */}
      <InvoiceList filterMonth={selectedYM} />

      {/* Upload modal — pré-rempli avec le mois sélectionné */}
      <InvoiceUpload open={uploadOpen} onClose={() => setUploadOpen(false)} defaultMonth={selectedYM} />
    </div>
  )
}
