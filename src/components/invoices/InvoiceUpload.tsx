import { useState, useCallback } from "react"
import { Upload, FileText, Image, AlertCircle, CheckCircle2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { parseInvoiceFile } from "@/lib/invoice-parser"
import { useInvoiceStore } from "@/store/invoiceStore"
import { generateId, formatCurrency, parseFrenchNumber } from "@/lib/utils"
import { buildSingleRateTVALines, computeFromHT } from "@/lib/tva-calculator"
import type { Invoice, TVARate } from "@/types"
import { INVOICE_CATEGORIES, TVA_RATES, TVA_RATE_LABELS } from "@/types"

interface InvoiceUploadProps {
  open: boolean
  onClose: () => void
  defaultMonth?: string
}

type Step = "upload" | "review" | "success"

const CONFIDENCE_BADGE = {
  high: { label: "Haute confiance", variant: "success" as const },
  medium: { label: "Confiance moyenne", variant: "warning" as const },
  low: { label: "À compléter", variant: "info" as const },
}

export function InvoiceUpload({ open, onClose, defaultMonth }: InvoiceUploadProps) {
  const addInvoice = useInvoiceStore((s) => s.addInvoice)

  const [step, setStep] = useState<Step>("upload")
  const [isDragging, setIsDragging] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confidence, setConfidence] = useState<"high" | "medium" | "low">("low")

  // Editable invoice fields — pré-rempli avec le mois sélectionné si fourni
  const defaultDate = defaultMonth ? `${defaultMonth}-01` : undefined
  const [form, setForm] = useState<Partial<Invoice>>({ invoiceDate: defaultDate })

  const reset = () => {
    setStep("upload")
    setForm({})
    setError(null)
    setIsLoading(false)
    setConfidence("low")
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const processFile = useCallback(async (file: File) => {
    const allowed = ["application/pdf", "image/png", "image/jpeg", "image/jpg", "image/webp"]
    if (!allowed.includes(file.type)) {
      setError("Format non supporté. Utilisez un PDF ou une image (PNG, JPG).")
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const result = await parseInvoiceFile(file)
      setForm({
        ...result.invoice,
        category: "Autre",
      })
      setConfidence(result.confidence)
      setStep("review")
    } catch (err) {
      setError("Erreur lors de l'analyse. Vérifiez le fichier ou saisissez manuellement.")
      setForm({ fileName: file.name, fileType: "pdf", status: "pending" })
      setStep("review")
    } finally {
      setIsLoading(false)
    }
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) processFile(file)
    },
    [processFile]
  )

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const handleManualEntry = () => {
    setForm({ fileName: "Saisie manuelle", fileType: "manual", status: "manual" })
    setConfidence("low")
    setStep("review")
  }

  const updateForm = (key: keyof Invoice, value: string | number | null) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value }

      // Auto-recalc TVA when HT changes
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

  const handleSave = () => {
    const invoice: Invoice = {
      id: generateId(),
      uploadedAt: new Date().toISOString(),
      fileName: form.fileName ?? "facture",
      fileType: form.fileType ?? "manual",
      invoiceDate: form.invoiceDate ?? null,
      invoiceNumber: form.invoiceNumber ?? null,
      vendor: form.vendor ?? null,
      totalHT: form.totalHT ?? 0,
      totalTVA: form.totalTVA ?? 0,
      totalTTC: form.totalTTC ?? 0,
      tvaLines: form.tvaLines ?? [],
      status: form.status ?? "manual",
      category: form.category,
      notes: form.notes,
      rawText: form.rawText,
    }
    addInvoice(invoice)
    setStep("success")
  }

  // Determine default TVA rate for display
  const guessedRate: TVARate =
    form.tvaLines?.[0]?.rate ?? (form.totalHT && form.totalTVA
      ? Math.round((form.totalTVA / form.totalHT) * 100) as TVARate
      : 20)

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl">
        {step === "upload" && (
          <>
            <DialogHeader>
              <DialogTitle>Importer une facture</DialogTitle>
              <DialogDescription>
                Déposez un PDF ou une image depuis votre Mac
              </DialogDescription>
            </DialogHeader>

            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`relative mt-2 flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-12 transition-colors ${
                isDragging ? "border-primary bg-primary/5" : "border-border bg-muted/30"
              }`}
            >
              {isLoading ? (
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
              ) : (
                <>
                  <div className="flex gap-2">
                    <FileText className="h-8 w-8 text-muted-foreground" />
                    <Image className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium">Glissez votre facture ici</p>
                    <p className="text-xs text-muted-foreground mt-1">PDF, PNG, JPG acceptés</p>
                  </div>
                  <Label htmlFor="file-input" className="cursor-pointer">
                    <div className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors">
                      <Upload className="h-4 w-4" />
                      Choisir un fichier
                    </div>
                    <Input
                      id="file-input"
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.webp"
                      className="sr-only"
                      onChange={handleFileInput}
                    />
                  </Label>
                </>
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={handleManualEntry}>
                Saisie manuelle
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "review" && (
          <>
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle>Vérifier les informations</DialogTitle>
                <Badge variant={CONFIDENCE_BADGE[confidence].variant}>
                  {CONFIDENCE_BADGE[confidence].label}
                </Badge>
              </div>
              <DialogDescription>
                {form.fileName} — Corrigez si nécessaire avant d'enregistrer
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
              {/* Fournisseur */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Fournisseur</Label>
                  <Input
                    value={form.vendor ?? ""}
                    placeholder="Nom du fournisseur"
                    onChange={(e) => updateForm("vendor", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>N° de facture</Label>
                  <Input
                    value={form.invoiceNumber ?? ""}
                    placeholder="FAC-2024-001"
                    onChange={(e) => updateForm("invoiceNumber", e.target.value)}
                  />
                </div>
              </div>

              {/* Date + Catégorie */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Date de facture</Label>
                  <Input
                    type="date"
                    value={form.invoiceDate ?? ""}
                    onChange={(e) => updateForm("invoiceDate", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Catégorie</Label>
                  <Select
                    value={form.category ?? "Autre"}
                    onValueChange={(v) => updateForm("category", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INVOICE_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Montants */}
              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <p className="text-sm font-semibold">Montants</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Total HT (€)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={form.totalHT ?? ""}
                      placeholder="0.00"
                      onChange={(e) => updateForm("totalHT", parseFrenchNumber(e.target.value))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">TVA (€)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={form.totalTVA ?? ""}
                      placeholder="0.00"
                      onChange={(e) => {
                        const tva = parseFrenchNumber(e.target.value)
                        const ht = form.totalHT ?? 0
                        setForm((p) => ({
                          ...p,
                          totalTVA: tva,
                          totalTTC: Math.round((ht + tva) * 100) / 100,
                        }))
                      }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Total TTC (€)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={form.totalTTC ?? ""}
                      placeholder="0.00"
                      onChange={(e) => updateForm("totalTTC", parseFrenchNumber(e.target.value))}
                    />
                  </div>
                </div>

                {/* TVA rate */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Taux de TVA applicable</Label>
                  <Select
                    value={String(guessedRate)}
                    onValueChange={(v) => {
                      const rate = Number(v) as TVARate
                      const ht = form.totalHT ?? 0
                      const { tva, ttc } = computeFromHT(ht, rate)
                      setForm((p) => ({
                        ...p,
                        totalTVA: tva,
                        totalTTC: ttc,
                        tvaLines: buildSingleRateTVALines(ht, tva, rate),
                      }))
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TVA_RATES.map((r) => (
                        <SelectItem key={r} value={String(r)}>
                          {TVA_RATE_LABELS[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Summary */}
                {(form.totalHT ?? 0) > 0 && (
                  <div className="rounded-md bg-primary/5 p-3 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Base HT</span>
                      <span className="font-medium">{formatCurrency(form.totalHT ?? 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">TVA ({guessedRate}%)</span>
                      <span className="font-medium text-amber-600">{formatCurrency(form.totalTVA ?? 0)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-1">
                      <span className="font-semibold">Total TTC</span>
                      <span className="font-bold">{formatCurrency(form.totalTTC ?? 0)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <Label>Notes (optionnel)</Label>
                <Input
                  value={form.notes ?? ""}
                  placeholder="Remarques..."
                  onChange={(e) => updateForm("notes", e.target.value)}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={reset}>
                Retour
              </Button>
              <Button onClick={handleSave}>
                Enregistrer la facture
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "success" && (
          <>
            <DialogHeader>
              <DialogTitle>Facture enregistrée</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              </div>
              <div className="text-center">
                <p className="font-semibold">
                  {form.vendor ?? form.fileName}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {formatCurrency(form.totalHT ?? 0)} HT ·{" "}
                  TVA {formatCurrency(form.totalTVA ?? 0)} ·{" "}
                  {formatCurrency(form.totalTTC ?? 0)} TTC
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={reset}>
                Importer une autre
              </Button>
              <Button onClick={handleClose}>Fermer</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
