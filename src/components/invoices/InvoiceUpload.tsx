import { useState, useCallback } from "react"
import { Upload, FileText, Image, AlertCircle, CheckCircle2, Loader2, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { useInvoiceStore } from "@/store/invoiceStore"
import { generateId, formatCurrency, parseFrenchNumber } from "@/lib/utils"
import { API_BASE } from "@/lib/api"
import { authHeader } from "@/store/authStore"
import type { Invoice, TVALine, TVARate } from "@/types"
import { INVOICE_CATEGORIES, TVA_RATES, TVA_RATE_LABELS } from "@/types"

interface InvoiceUploadProps {
  open: boolean
  onClose: () => void
  defaultMonth?: string
}

type Step = "upload" | "review" | "success"

// ─── TVA line éditable ────────────────────────────────────────────────────────

interface TVALineInput {
  id: string
  baseHT: string
  rate: TVARate
}

function tvaFromLine(line: TVALineInput): { ht: number; tva: number; ttc: number } {
  const ht = parseFrenchNumber(line.baseHT) || 0
  const tva = Math.round(ht * (line.rate / 100) * 100) / 100
  return { ht, tva, ttc: Math.round((ht + tva) * 100) / 100 }
}

function linesToTVALines(lines: TVALineInput[]): TVALine[] {
  return lines.map((l) => {
    const { ht, tva } = tvaFromLine(l)
    return { rate: l.rate, baseHT: ht, montantTVA: tva }
  })
}

function sumLines(lines: TVALineInput[]) {
  return lines.reduce(
    (acc, l) => {
      const { ht, tva, ttc } = tvaFromLine(l)
      return { ht: acc.ht + ht, tva: acc.tva + tva, ttc: acc.ttc + ttc }
    },
    { ht: 0, tva: 0, ttc: 0 }
  )
}

// ─── Formats acceptés ─────────────────────────────────────────────────────────

const ACCEPTED_MIME = new Set([
  "application/pdf",
  "image/jpeg", "image/jpg", "image/png", "image/webp",
  "image/heic", "image/heif", "image/avif",
  "image/tiff", "image/bmp", "image/gif",
])

const ACCEPTED_EXT = new Set([
  "pdf", "jpg", "jpeg", "png", "webp",
  "heic", "heif", "avif", "tiff", "tif", "bmp", "gif",
])

function isAccepted(file: File): boolean {
  if (ACCEPTED_MIME.has(file.type)) return true
  const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
  return ACCEPTED_EXT.has(ext)
}

// ─── Confiance badge ─────────────────────────────────────────────────────────

const CONFIDENCE_BADGE = {
  high: { label: "Haute confiance", variant: "success" as const },
  medium: { label: "Confiance moyenne", variant: "warning" as const },
  low: { label: "À compléter", variant: "info" as const },
}

// ─── Composant principal ──────────────────────────────────────────────────────

export function InvoiceUpload({ open, onClose, defaultMonth }: InvoiceUploadProps) {
  const addInvoice = useInvoiceStore((s) => s.addInvoice)

  const [step, setStep] = useState<Step>("upload")
  const [isDragging, setIsDragging] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confidence, setConfidence] = useState<"high" | "medium" | "low">("low")

  const defaultDate = defaultMonth ? `${defaultMonth}-01` : undefined
  const [form, setForm] = useState<Partial<Invoice>>({ invoiceDate: defaultDate })

  // Lignes TVA éditables
  const [tvaLines, setTvaLines] = useState<TVALineInput[]>([
    { id: generateId(), baseHT: "", rate: 20 },
  ])

  const reset = () => {
    setStep("upload")
    setForm({ invoiceDate: defaultDate })
    setTvaLines([{ id: generateId(), baseHT: "", rate: 20 }])
    setError(null)
    setIsLoading(false)
    setConfidence("low")
  }

  const handleClose = () => { reset(); onClose() }

  // ── Traitement du fichier ─────────────────────────────────────────────────

  const processFile = useCallback(async (file: File) => {
    if (!isAccepted(file)) {
      setError("Format non supporté. Utilisez PDF, JPG, PNG, HEIC, AVIF, WEBP, TIFF…")
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append("file", file)
      console.log("[upload] fichier:", file.name, file.type, file.size, "→ envoi vers", `${API_BASE}/api/invoice/parse`)

      const resp = await fetch(`${API_BASE}/api/invoice/parse`, {
        method: "POST",
        headers: authHeader(),
        body: formData,
      })
      const data = await resp.json()

      if (!resp.ok || !data.ok) {
        // Format non supporté par l'IA → passe en saisie manuelle
        setError(data.error ?? "Analyse impossible. Complétez manuellement.")
        setForm({ fileName: file.name, fileType: "pdf", status: "pending", invoiceDate: defaultDate })
      } else {
        setForm({
          fileName: file.name,
          fileType: file.type === "application/pdf" ? "pdf" : "image",
          status: "pending",
          vendor: data.vendor ?? null,
          invoiceDate: data.invoiceDate ?? defaultDate ?? null,
          invoiceNumber: data.invoiceNumber ?? null,
          category: "Autre",
        })
        setConfidence(data.confidence ?? "medium")
        if (data.tvaLines?.length) {
          setTvaLines(data.tvaLines.map((l: TVALine) => ({
            id: generateId(),
            baseHT: String(l.baseHT),
            rate: l.rate,
          })))
        }
      }
    } catch (err) {
      console.error("[upload] erreur:", err)
      setError("Erreur lors de l'analyse. Complétez manuellement.")
      setForm({ fileName: file.name, fileType: "pdf", status: "pending", invoiceDate: defaultDate })
    } finally {
      setIsLoading(false)
      setStep("review")
    }
  }, [defaultDate])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }, [processFile])

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const handleManualEntry = () => {
    setForm({ fileName: "Saisie manuelle", fileType: "manual", status: "manual", invoiceDate: defaultDate })
    setTvaLines([{ id: generateId(), baseHT: "", rate: 20 }])
    setConfidence("low")
    setStep("review")
  }

  // ── Gestion des lignes TVA ────────────────────────────────────────────────

  const addTVALine = () =>
    setTvaLines((p) => [...p, { id: generateId(), baseHT: "", rate: 5.5 }])

  const removeTVALine = (id: string) =>
    setTvaLines((p) => p.length > 1 ? p.filter((l) => l.id !== id) : p)

  const updateTVALine = (id: string, key: keyof TVALineInput, value: string | TVARate) =>
    setTvaLines((p) => p.map((l) => l.id === id ? { ...l, [key]: value } : l))

  // ── Sauvegarde ────────────────────────────────────────────────────────────

  const handleSave = () => {
    const totals = sumLines(tvaLines)
    const invoice: Invoice = {
      id: generateId(),
      uploadedAt: new Date().toISOString(),
      fileName: form.fileName ?? "facture",
      fileType: form.fileType ?? "manual",
      invoiceDate: form.invoiceDate ?? null,
      invoiceNumber: form.invoiceNumber ?? null,
      vendor: form.vendor ?? null,
      totalHT: Math.round(totals.ht * 100) / 100,
      totalTVA: Math.round(totals.tva * 100) / 100,
      totalTTC: Math.round(totals.ttc * 100) / 100,
      tvaLines: linesToTVALines(tvaLines),
      status: form.status ?? "manual",
      category: form.category,
      notes: form.notes,
      rawText: form.rawText,
    }
    addInvoice(invoice)
    setForm((p) => ({ ...p, totalHT: invoice.totalHT, totalTVA: invoice.totalTVA, totalTTC: invoice.totalTTC }))
    setStep("success")
  }

  const totals = sumLines(tvaLines)
  const canSave = totals.ht > 0

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl">

        {/* ── ÉTAPE 1 : Upload ── */}
        {step === "upload" && (
          <>
            <DialogHeader>
              <DialogTitle>Importer une facture</DialogTitle>
              <DialogDescription>PDF, JPG, PNG, HEIC, AVIF et autres formats acceptés</DialogDescription>
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
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Analyse en cours par IA…</p>
                </div>
              ) : (
                <>
                  <div className="flex gap-2">
                    <FileText className="h-8 w-8 text-muted-foreground" />
                    <Image className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium">Glissez votre facture ici</p>
                    <p className="text-xs text-muted-foreground mt-1">PDF · JPG · PNG · HEIC · AVIF · WEBP · TIFF · BMP</p>
                  </div>
                  <Label htmlFor="file-input" className="cursor-pointer">
                    <div className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors">
                      <Upload className="h-4 w-4" />
                      Choisir un fichier
                    </div>
                    <Input
                      id="file-input"
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.avif,.tiff,.tif,.bmp,.gif"
                      className="sr-only"
                      onChange={handleFileInput}
                    />
                  </Label>
                </>
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />{error}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={handleManualEntry}>Saisie manuelle</Button>
            </DialogFooter>
          </>
        )}

        {/* ── ÉTAPE 2 : Vérification ── */}
        {step === "review" && (
          <>
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle>Vérifier les informations</DialogTitle>
                <Badge variant={CONFIDENCE_BADGE[confidence].variant}>
                  {CONFIDENCE_BADGE[confidence].label}
                </Badge>
              </div>
              <DialogDescription>{form.fileName} — Corrigez si nécessaire</DialogDescription>
            </DialogHeader>

            {error && (
              <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />{error}
              </div>
            )}

            <div className="grid gap-4 py-2 max-h-[60vh] overflow-y-auto pr-1">

              {/* Fournisseur + N° */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Fournisseur</Label>
                  <Input value={form.vendor ?? ""} placeholder="Nom du fournisseur"
                    onChange={(e) => setForm((p) => ({ ...p, vendor: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>N° de facture</Label>
                  <Input value={form.invoiceNumber ?? ""} placeholder="FAC-2024-001"
                    onChange={(e) => setForm((p) => ({ ...p, invoiceNumber: e.target.value }))} />
                </div>
              </div>

              {/* Date + Catégorie */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Date de facture</Label>
                  <Input type="date" value={form.invoiceDate ?? ""}
                    onChange={(e) => setForm((p) => ({ ...p, invoiceDate: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Catégorie</Label>
                  <Select value={form.category ?? "Autre"} onValueChange={(v) => setForm((p) => ({ ...p, category: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {INVOICE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* ── Lignes TVA ── */}
              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Ventilation TVA</p>
                  <Button variant="outline" size="sm" onClick={addTVALine} className="gap-1 h-7 text-xs">
                    <Plus className="h-3 w-3" /> Ajouter un taux
                  </Button>
                </div>

                <div className="space-y-2">
                  {tvaLines.map((line, i) => {
                    const { tva, ttc } = tvaFromLine(line)
                    return (
                      <div key={line.id} className="grid grid-cols-[1fr_130px_auto] items-end gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Base HT {tvaLines.length > 1 ? `(ligne ${i + 1})` : ""}</Label>
                          <Input
                            type="number" step="0.01"
                            value={line.baseHT}
                            placeholder="0.00"
                            onChange={(e) => updateTVALine(line.id, "baseHT", e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Taux TVA</Label>
                          <Select
                            value={String(line.rate)}
                            onValueChange={(v) => updateTVALine(line.id, "rate", Number(v) as TVARate)}
                          >
                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {TVA_RATES.map((r) => (
                                <SelectItem key={r} value={String(r)}>{TVA_RATE_LABELS[r]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-end gap-1 pb-0.5">
                          {parseFrenchNumber(line.baseHT) > 0 && (
                            <p className="text-xs text-muted-foreground whitespace-nowrap">
                              TVA {formatCurrency(tva)} · TTC {formatCurrency(ttc)}
                            </p>
                          )}
                          {tvaLines.length > 1 && (
                            <button onClick={() => removeTVALine(line.id)} className="ml-1 text-destructive hover:text-destructive/80">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Récap totaux */}
                {totals.ht > 0 && (
                  <div className="rounded-md bg-primary/5 p-3 text-xs space-y-1 border-t pt-3 mt-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total HT</span>
                      <span className="font-semibold">{formatCurrency(totals.ht)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total TVA</span>
                      <span className="font-medium text-amber-600">{formatCurrency(totals.tva)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-1">
                      <span className="font-semibold">Total TTC</span>
                      <span className="font-bold">{formatCurrency(totals.ttc)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <Label>Notes (optionnel)</Label>
                <Input value={form.notes ?? ""} placeholder="Remarques..."
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={reset}>Retour</Button>
              <Button onClick={handleSave} disabled={!canSave}>Enregistrer la facture</Button>
            </DialogFooter>
          </>
        )}

        {/* ── ÉTAPE 3 : Succès ── */}
        {step === "success" && (
          <>
            <DialogHeader><DialogTitle>Facture enregistrée</DialogTitle></DialogHeader>
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              </div>
              <div className="text-center">
                <p className="font-semibold">{form.vendor ?? form.fileName}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {formatCurrency(form.totalHT ?? 0)} HT · TVA {formatCurrency(form.totalTVA ?? 0)} · {formatCurrency(form.totalTTC ?? 0)} TTC
                </p>
                {tvaLines.length > 1 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {tvaLines.length} taux de TVA appliqués
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={reset}>Importer une autre</Button>
              <Button onClick={handleClose}>Fermer</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
