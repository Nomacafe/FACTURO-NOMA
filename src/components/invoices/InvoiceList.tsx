import { useState } from "react"
import { Search, Trash2, Edit2, ChevronUp, ChevronDown } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { useInvoiceStore } from "@/store/invoiceStore"
import { INVOICE_CATEGORIES } from "@/types"
import { formatCurrency, formatDate } from "@/lib/utils"
import type { Invoice } from "@/types"
import { InvoiceDetailModal } from "./InvoiceDetailModal"

const STATUS_BADGE: Record<
  Invoice["status"],
  { label: string; variant: "success" | "warning" | "info" }
> = {
  analysed: { label: "Analysée", variant: "success" },
  manual: { label: "Manuelle", variant: "info" },
  pending: { label: "À compléter", variant: "warning" },
}

type SortKey = "invoiceDate" | "vendor" | "totalHT" | "totalTVA"
type SortDir = "asc" | "desc"

export function InvoiceList({ filterMonth }: { filterMonth?: string }) {
  const { invoices: allInvoices, deleteInvoice } = useInvoiceStore()
  const invoices = filterMonth
    ? allInvoices.filter((inv) => (inv.invoiceDate ?? inv.uploadedAt ?? "").startsWith(filterMonth))
    : allInvoices

  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const [sortKey, setSortKey] = useState<SortKey>("invoiceDate")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [selected, setSelected] = useState<Invoice | null>(null)

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else { setSortKey(key); setSortDir("asc") }
  }

  const filtered = invoices
    .filter((inv) => {
      const q = search.toLowerCase()
      const matchSearch =
        !q ||
        inv.vendor?.toLowerCase().includes(q) ||
        inv.fileName.toLowerCase().includes(q) ||
        inv.invoiceNumber?.toLowerCase().includes(q)
      const matchCat = categoryFilter === "all" || inv.category === categoryFilter
      return matchSearch && matchCat
    })
    .sort((a, b) => {
      let av: string | number = ""
      let bv: string | number = ""
      if (sortKey === "invoiceDate") {
        av = a.invoiceDate ?? a.uploadedAt
        bv = b.invoiceDate ?? b.uploadedAt
      } else if (sortKey === "vendor") {
        av = a.vendor ?? a.fileName
        bv = b.vendor ?? b.fileName
      } else if (sortKey === "totalHT") {
        av = a.totalHT; bv = b.totalHT
      } else if (sortKey === "totalTVA") {
        av = a.totalTVA; bv = b.totalTVA
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1
      if (av > bv) return sortDir === "asc" ? 1 : -1
      return 0
    })

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronUp className="h-3 w-3 opacity-30 ml-1" />
    return sortDir === "asc"
      ? <ChevronUp className="h-3 w-3 ml-1" />
      : <ChevronDown className="h-3 w-3 ml-1" />
  }

  const totals = filtered.reduce(
    (acc, inv) => ({
      ht: acc.ht + inv.totalHT,
      tva: acc.tva + inv.totalTVA,
      ttc: acc.ttc + inv.totalTTC,
    }),
    { ht: 0, tva: 0, ttc: 0 }
  )

  return (
    <>
      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Rechercher par fournisseur, n° de facture..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue placeholder="Toutes catégories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes catégories</SelectItem>
            {INVOICE_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => handleSort("vendor")}
              >
                <span className="inline-flex items-center">
                  Fournisseur <SortIcon col="vendor" />
                </span>
              </TableHead>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => handleSort("invoiceDate")}
              >
                <span className="inline-flex items-center">
                  Date <SortIcon col="invoiceDate" />
                </span>
              </TableHead>
              <TableHead>Catégorie</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead
                className="text-right cursor-pointer select-none"
                onClick={() => handleSort("totalHT")}
              >
                <span className="inline-flex items-center justify-end w-full">
                  HT <SortIcon col="totalHT" />
                </span>
              </TableHead>
              <TableHead
                className="text-right cursor-pointer select-none"
                onClick={() => handleSort("totalTVA")}
              >
                <span className="inline-flex items-center justify-end w-full">
                  TVA <SortIcon col="totalTVA" />
                </span>
              </TableHead>
              <TableHead className="text-right">TTC</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                  {invoices.length === 0
                    ? "Aucune facture. Importez votre première facture."
                    : "Aucun résultat pour cette recherche."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((inv) => {
                const status = STATUS_BADGE[inv.status]
                return (
                  <TableRow key={inv.id} className="cursor-pointer" onClick={() => setSelected(inv)}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{inv.vendor ?? inv.fileName}</p>
                        {inv.invoiceNumber && (
                          <p className="text-xs text-muted-foreground">N° {inv.invoiceNumber}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(inv.invoiceDate)}
                    </TableCell>
                    <TableCell>
                      {inv.category && (
                        <Badge variant="outline" className="text-xs">
                          {inv.category}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium text-sm">
                      {formatCurrency(inv.totalHT)}
                    </TableCell>
                    <TableCell className="text-right text-sm text-amber-600 font-medium">
                      {formatCurrency(inv.totalTVA)}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-sm">
                      {formatCurrency(inv.totalTTC)}
                    </TableCell>
                    <TableCell>
                      <div
                        className="flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setSelected(inv)}
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => deleteInvoice(inv.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
          {filtered.length > 0 && (
            <tfoot>
              <TableRow className="bg-muted/50 font-semibold">
                <TableCell colSpan={4}>
                  Total ({filtered.length} facture{filtered.length > 1 ? "s" : ""})
                </TableCell>
                <TableCell className="text-right">{formatCurrency(totals.ht)}</TableCell>
                <TableCell className="text-right text-amber-600">{formatCurrency(totals.tva)}</TableCell>
                <TableCell className="text-right">{formatCurrency(totals.ttc)}</TableCell>
                <TableCell />
              </TableRow>
            </tfoot>
          )}
        </Table>
      </div>

      {selected && (
        <InvoiceDetailModal
          invoice={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  )
}
