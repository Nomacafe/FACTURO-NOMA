import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { useInvoiceStore } from "@/store/invoiceStore"
import type { Invoice, TVARate } from "@/types"
import { INVOICE_CATEGORIES, TVA_RATES, TVA_RATE_LABELS } from "@/types"
import { formatCurrency, formatDate, parseFrenchNumber } from "@/lib/utils"
import { buildSingleRateTVALines, computeFromHT } from "@/lib/tva-calculator"

interface InvoiceDetailModalProps {
  invoice: Invoice
  onClose: () => void
}

export function InvoiceDetailModal({ invoice, onClose }: InvoiceDetailModalProps) {
  const updateInvoice = useInvoiceStore((s) => s.updateInvoice)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Invoice>({ ...invoice })

  const update = (key: keyof Invoice, value: string | number | null) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value }
      if (key === "totalHT") {
        const ht = value as number
        const rate = prev.tvaLines?.[0]?.rate ?? 20 as TVARate
        const { tva, ttc } = computeFromHT(ht, rate)
        next.totalTVA = tva
        next.totalTTC = ttc
        next.tvaLines = buildSingleRateTVALines(ht, tva, rate)
      }
      return next
    })
  }

  const changeRate = (rateStr: string) => {
    const rate = Number(rateStr) as TVARate
    const ht = form.totalHT
    const { tva, ttc } = computeFromHT(ht, rate)
    setForm((p) => ({
      ...p,
      totalTVA: tva,
      totalTTC: ttc,
      tvaLines: buildSingleRateTVALines(ht, tva, rate),
    }))
  }

  const handleSave = () => {
    updateInvoice(invoice.id, { ...form, status: "manual" })
    setEditing(false)
    onClose()
  }

  const currentRate = form.tvaLines?.[0]?.rate ?? 20 as TVARate

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center justify-between pr-6">
            <DialogTitle className="truncate max-w-xs">
              {invoice.vendor ?? invoice.fileName}
            </DialogTitle>
            <Badge variant={invoice.status === "analysed" ? "success" : invoice.status === "pending" ? "warning" : "info"}>
              {invoice.status === "analysed" ? "Analysée" : invoice.status === "pending" ? "À compléter" : "Manuelle"}
            </Badge>
          </div>
        </DialogHeader>

        {!editing ? (
          <div className="space-y-4">
            {/* Info */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Fournisseur</p>
                <p className="font-medium">{invoice.vendor ?? "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">N° de facture</p>
                <p className="font-medium">{invoice.invoiceNumber ?? "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Date</p>
                <p className="font-medium">{formatDate(invoice.invoiceDate)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Catégorie</p>
                <p className="font-medium">{invoice.category ?? "Autre"}</p>
              </div>
            </div>

            <Separator />

            {/* Amounts */}
            <div className="rounded-lg bg-muted/30 p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total HT</span>
                <span className="font-semibold">{formatCurrency(invoice.totalHT)}</span>
              </div>
              {invoice.tvaLines.map((line, i) => (
                <div key={i} className="flex justify-between">
                  <span className="text-muted-foreground">TVA {line.rate}%</span>
                  <span className="font-medium text-amber-600">{formatCurrency(line.montantTVA)}</span>
                </div>
              ))}
              {invoice.tvaLines.length === 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">TVA</span>
                  <span className="font-medium text-amber-600">{formatCurrency(invoice.totalTVA)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between">
                <span className="font-semibold">Total TTC</span>
                <span className="font-bold text-base">{formatCurrency(invoice.totalTTC)}</span>
              </div>
            </div>

            {invoice.notes && (
              <p className="text-xs text-muted-foreground border rounded p-2">{invoice.notes}</p>
            )}
          </div>
        ) : (
          <div className="grid gap-3 max-h-[60vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Fournisseur</Label>
                <Input value={form.vendor ?? ""} onChange={(e) => update("vendor", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">N° facture</Label>
                <Input value={form.invoiceNumber ?? ""} onChange={(e) => update("invoiceNumber", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Date</Label>
                <Input type="date" value={form.invoiceDate ?? ""} onChange={(e) => update("invoiceDate", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Catégorie</Label>
                <Select value={form.category ?? "Autre"} onValueChange={(v) => update("category", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INVOICE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">HT (€)</Label>
                <Input type="number" step="0.01" value={form.totalHT} onChange={(e) => update("totalHT", parseFrenchNumber(e.target.value))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">TVA (€)</Label>
                <Input type="number" step="0.01" value={form.totalTVA} readOnly className="bg-muted/50" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">TTC (€)</Label>
                <Input type="number" step="0.01" value={form.totalTTC} readOnly className="bg-muted/50" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Taux TVA</Label>
              <Select value={String(currentRate)} onValueChange={changeRate}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TVA_RATES.map((r) => <SelectItem key={r} value={String(r)}>{TVA_RATE_LABELS[r]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Input value={form.notes ?? ""} onChange={(e) => update("notes", e.target.value)} />
            </div>
          </div>
        )}

        <DialogFooter>
          {!editing ? (
            <>
              <Button variant="outline" onClick={onClose}>Fermer</Button>
              <Button onClick={() => setEditing(true)}>Modifier</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setEditing(false)}>Annuler</Button>
              <Button onClick={handleSave}>Enregistrer</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
