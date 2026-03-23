import { useState, useMemo } from "react"
import { Pencil, Trash2, ChevronDown, ChevronRight, Info, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { useRevenueStore } from "@/store/revenueStore"
import { useInvoiceStore } from "@/store/invoiceStore"
import { useFixedExpenseStore } from "@/store/fixedExpenseStore"
import { authHeader } from "@/store/authStore"
import { API_BASE } from "@/lib/api"
import type { TVARate } from "@/types"
import { TVA_RATES, TVA_RATE_LABELS, computeIS } from "@/types"
import { formatCurrency } from "@/lib/utils"
import { computeMonthPL, getAllMonthsForYear, ymToLabel } from "@/lib/pl-calculator"

const MONTHS_SHORT = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Août","Sep","Oct","Nov","Déc"]

function currentYear() { return new Date().getFullYear() }

export function Revenue() {
  const { revenues, setMonthRevenue, deleteMonthRevenue } = useRevenueStore()
  const invoices = useInvoiceStore((s) => s.invoices)
  const fixedExpenses = useFixedExpenseStore((s) => s.expenses)

  const [year, setYear] = useState(String(currentYear()))
  const [open, setOpen] = useState(false)
  const [editingMonth, setEditingMonth] = useState<string | null>(null)
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // Mois verrouillés = déjà synchronisés et terminés (passés)
  const LOCK_KEY = "facturo-square-locked-months"
  function getLockedMonths(): string[] {
    try { return JSON.parse(localStorage.getItem(LOCK_KEY) ?? "[]") } catch { return [] }
  }
  function lockMonth(ym: string) {
    const locked = getLockedMonths()
    if (!locked.includes(ym)) localStorage.setItem(LOCK_KEY, JSON.stringify([...locked, ym]))
  }
  function isMonthOver(ym: string): boolean {
    const now = new Date()
    const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
    return ym < currentYM
  }

  const handleSquareSync = async () => {
    setSyncing(true)
    setSyncMsg(null)
    try {
      // Sync uniquement le mois en cours — les mois passés sont figés
      const now = new Date()
      const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01T00:00:00Z`

      const res = await fetch(`${API_BASE}/api/square/sync?from=${from}`, { headers: authHeader() })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? "Erreur inconnue")

      let updated = 0
      for (const m of data.months) {
        setMonthRevenue({
          month: m.month,
          cabrut: m.totalTTC,
          canet: m.caNet,
          tvaCollectee: m.tvaCollectee,
          tvaRate: 10,
          notes: `Sync Square · ${m.transactions} transactions`,
        })
        // Verrouiller automatiquement les mois terminés après leur première sync
        if (isMonthOver(m.month)) lockMonth(m.month)
        updated++
      }
      setSyncMsg({ ok: true, text: `Mois en cours mis à jour · ${data.total} transactions` })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erreur de connexion au serveur local (port 3001)"
      setSyncMsg({ ok: false, text: msg })
    } finally {
      setSyncing(false)
    }
  }
  const [form, setForm] = useState({
    cabrut: "",
    canet: "",
    tvaRate: 20 as TVARate,
    notes: "",
  })

  const years = useMemo(() => {
    const set = new Set<string>()
    set.add(String(currentYear()))
    revenues.forEach((r) => set.add(r.month.slice(0, 4)))
    return Array.from(set).sort((a, b) => b.localeCompare(a))
  }, [revenues])

  const openForm = (month: string) => {
    setEditingMonth(month)
    const existing = revenues.find((r) => r.month === month)
    setForm({
      cabrut: existing ? String(existing.cabrut) : "",
      canet: existing?.canet ? String(existing.canet) : "",
      tvaRate: existing?.tvaRate ?? 20,
      notes: existing?.notes ?? "",
    })
    setOpen(true)
  }

  const handleSave = () => {
    if (!editingMonth) return
    const cabrut = parseFloat(form.cabrut) || 0
    const canet = form.canet ? parseFloat(form.canet) : undefined
    const tvaCollectee = Math.round(cabrut * (form.tvaRate / 100) * 100) / 100
    setMonthRevenue({ month: editingMonth, cabrut, canet, tvaCollectee, tvaRate: form.tvaRate, notes: form.notes })
    setOpen(false)
  }

  // Build monthly P&L rows
  const rows = useMemo(() =>
    getAllMonthsForYear(parseInt(year)).map((ym) => {
      const rev = revenues.find((r) => r.month === ym)
      const pl = computeMonthPL(ym, invoices, fixedExpenses, rev)
      return pl
    }),
    [year, revenues, invoices, fixedExpenses]
  )

  const totals = rows.reduce(
    (acc, r) => ({
      cabrut: acc.cabrut + r.cabrut,
      totalChargesHT: acc.totalChargesHT + r.totalChargesHT,
      tvaNette: acc.tvaNette + r.tvaNette,
      resultatBrut: acc.resultatBrut + r.resultatBrut,
      resultatNet: acc.resultatNet + r.resultatNet,
    }),
    { cabrut: 0, totalChargesHT: 0, tvaNette: 0, resultatBrut: 0, resultatNet: 0 }
  )
  const annualIS = totals.resultatBrut > 0 ? computeIS(totals.resultatBrut) : 0

  return (
    <div className="space-y-6">
      {/* Year selector + Square sync */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSquareSync}
            disabled={syncing}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Synchronisation…" : "Sync Square"}
          </Button>
          {syncMsg && (
            <p className={`text-xs ${syncMsg.ok ? "text-emerald-600" : "text-red-500"}`}>
              {syncMsg.ok ? "✓ " : "✗ "}{syncMsg.text}
            </p>
          )}
        </div>
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Annual KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { label: "CA Brut", value: totals.cabrut, color: "text-emerald-700" },
          { label: "Charges totales", value: totals.totalChargesHT, color: "text-red-600" },
          { label: "Résultat brut", value: totals.resultatBrut, color: totals.resultatBrut >= 0 ? "text-emerald-700" : "text-red-600" },
          { label: "IS estimé (annuel)", value: annualIS, color: "text-amber-600" },
          { label: "Résultat net", value: totals.resultatNet - annualIS + rows.reduce((s, r) => s + r.isEstime, 0) - annualIS, color: totals.resultatBrut - annualIS >= 0 ? "text-emerald-700" : "text-red-600" },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
              <p className={`text-lg font-bold mt-1 ${kpi.color}`}>
                {formatCurrency(kpi.value)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Monthly rows */}
      <div className="space-y-2">
        {rows.map((row, i) => {
          const isExpanded = expandedMonth === row.month
          const hasData = row.cabrut > 0
          const isFuture = row.month > `${currentYear()}-${String(new Date().getMonth() + 1).padStart(2,"0")}`

          return (
            <div
              key={row.month}
              className={`rounded-xl border bg-white overflow-hidden transition-all ${isFuture && !hasData ? "opacity-60" : ""}`}
            >
              {/* Row header */}
              <div
                className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors select-none"
                onClick={() => setExpandedMonth(isExpanded ? null : row.month)}
              >
                <div className="flex items-center gap-2 w-32 shrink-0">
                  <span className="text-xs font-semibold text-muted-foreground w-6">{MONTHS_SHORT[i]}</span>
                  {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                </div>

                {/* CA */}
                <div className="flex-1">
                  {hasData ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-emerald-700">{formatCurrency(row.cabrut)}</span>
                      {row.canet !== row.cabrut && (
                        <span className="text-xs text-muted-foreground">net: {formatCurrency(row.canet)}</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">— Cliquer pour saisir le CA</span>
                  )}
                </div>

                {/* Quick P&L */}
                <div className="hidden sm:flex items-center gap-6 text-sm shrink-0">
                  <div className="text-right w-24">
                    <p className="text-xs text-muted-foreground">Charges</p>
                    <p className="font-medium text-red-600">
                      {row.totalChargesHT > 0 ? formatCurrency(row.totalChargesHT) : "—"}
                    </p>
                  </div>
                  <div className="text-right w-24">
                    <p className="text-xs text-muted-foreground">TVA nette</p>
                    <p className={`font-medium ${row.tvaNette > 0 ? "text-amber-600" : row.tvaNette < 0 ? "text-emerald-600" : "text-muted-foreground"}`}>
                      {row.cabrut > 0 || row.tvaDeductible > 0 ? formatCurrency(row.tvaNette) : "—"}
                    </p>
                  </div>
                  <div className="text-right w-28">
                    <p className="text-xs text-muted-foreground">Résultat net</p>
                    <p className={`font-bold ${row.resultatNet > 0 ? "text-emerald-700" : row.resultatNet < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                      {hasData || row.totalChargesHT > 0 ? formatCurrency(row.resultatNet) : "—"}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="sm" className="h-8 text-xs gap-1 px-2" onClick={() => openForm(row.month)}>
                    <Pencil className="h-3 w-3" />
                    {hasData ? "Modifier" : "Saisir"}
                  </Button>
                  {hasData && (
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                      onClick={() => deleteMonthRevenue(row.month)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Expanded waterfall */}
              {isExpanded && (
                <div className="border-t bg-muted/20 px-6 py-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    P&L détaillé — {ymToLabel(row.month)}
                  </p>
                  <div className="space-y-1.5 text-sm max-w-md">
                    <WFRow label="CA Brut" value={row.cabrut} color="text-emerald-700" bold />
                    {row.canet !== row.cabrut && (
                      <WFRow label="CA Net (après remises)" value={row.canet} color="text-emerald-600" indent />
                    )}
                    <Separator className="my-2" />
                    <WFRow label="Charges variables (factures)" value={-row.chargesVariablesHT} color="text-red-600" indent />
                    <WFRow label="Charges fixes (mensuel)" value={-row.chargesFixesHT} color="text-red-600" indent />
                    <WFRow label="Total charges HT" value={-row.totalChargesHT} color="text-red-700" bold />
                    <Separator className="my-2" />
                    <WFRow label="Résultat brut" value={row.resultatBrut} color={row.resultatBrut >= 0 ? "text-emerald-700" : "text-red-600"} bold />
                    <WFRow label={`IS estimé (15%/25%)`} value={-row.isEstime} color="text-amber-600" indent />
                    <Separator className="my-2" />
                    <WFRow label="Résultat net disponible" value={row.resultatNet} color={row.resultatNet >= 0 ? "text-emerald-700" : "text-red-600"} bold large />
                    <Separator className="my-2" />
                    <WFRow label="TVA collectée" value={row.tvaCollectee} color="text-muted-foreground" indent small />
                    <WFRow label="TVA déductible" value={-row.tvaDeductible} color="text-muted-foreground" indent small />
                    <WFRow label="TVA nette à reverser" value={row.tvaNette} color={row.tvaNette > 0 ? "text-amber-600" : "text-emerald-600"} indent small />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Annual summary row */}
      <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <p className="text-sm font-semibold">Bilan annuel {year}</p>
          <div className="flex gap-6 text-sm flex-wrap">
            <span>CA : <strong className="text-emerald-700">{formatCurrency(totals.cabrut)}</strong></span>
            <span>Charges : <strong className="text-red-600">{formatCurrency(totals.totalChargesHT)}</strong></span>
            <span>IS : <strong className="text-amber-600">{formatCurrency(annualIS)}</strong></span>
            <span>Résultat net : <strong className={totals.resultatBrut - annualIS >= 0 ? "text-emerald-700" : "text-red-600"}>{formatCurrency(totals.resultatBrut - annualIS)}</strong></span>
          </div>
        </div>
      </div>

      {/* Info SAS */}
      <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
        <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-800 leading-relaxed">
          <strong>IS SAS :</strong> 15% sur les 42 500 premiers € de bénéfice · 25% au-delà.
          L'IS mensuel affiché est une estimation (bénéfice mensuel × 12 / IS annuel / 12).
          Les acomptes réels sont dus en mars, juin, sept. et déc.
        </p>
      </div>

      {/* Form Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {editingMonth ? ymToLabel(editingMonth) : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">CA Brut HT (€) *</Label>
              <p className="text-xs text-muted-foreground">Votre chiffre d'affaires total avant toute déduction</p>
              <Input
                type="number"
                step="0.01"
                autoFocus
                value={form.cabrut}
                placeholder="0.00"
                onChange={(e) => setForm((p) => ({ ...p, cabrut: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">CA Net HT (€) <span className="text-muted-foreground font-normal">(optionnel)</span></Label>
              <p className="text-xs text-muted-foreground">Après remises, retours, avoirs. Laissez vide si = CA Brut.</p>
              <Input
                type="number"
                step="0.01"
                value={form.canet}
                placeholder="= CA Brut si vide"
                onChange={(e) => setForm((p) => ({ ...p, canet: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Taux TVA appliqué à votre CA</Label>
              <Select
                value={String(form.tvaRate)}
                onValueChange={(v) => setForm((p) => ({ ...p, tvaRate: Number(v) as TVARate }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TVA_RATES.map((r) => (
                    <SelectItem key={r} value={String(r)}>{TVA_RATE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Notes</Label>
              <Input
                value={form.notes}
                placeholder="Ex: mois exceptionnel, retard paiement..."
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              />
            </div>
            {form.cabrut && parseFloat(form.cabrut) > 0 && (
              <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">CA Brut HT</span>
                  <span className="font-semibold text-emerald-700">{formatCurrency(parseFloat(form.cabrut))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">TVA collectée ({form.tvaRate}%)</span>
                  <span className="font-medium text-amber-600">
                    {formatCurrency(parseFloat(form.cabrut) * (form.tvaRate / 100))}
                  </span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={!form.cabrut || parseFloat(form.cabrut) <= 0}>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function WFRow({
  label, value, color, bold, large, indent, small,
}: {
  label: string
  value: number
  color: string
  bold?: boolean
  large?: boolean
  indent?: boolean
  small?: boolean
}) {
  return (
    <div className={`flex justify-between ${indent ? "pl-4" : ""}`}>
      <span className={`text-muted-foreground ${small ? "text-xs" : ""}`}>{label}</span>
      <span className={`${color} ${bold ? "font-semibold" : ""} ${large ? "text-base font-bold" : ""} ${small ? "text-xs" : ""}`}>
        {value >= 0 ? "" : "−"}{formatCurrency(Math.abs(value))}
      </span>
    </div>
  )
}
