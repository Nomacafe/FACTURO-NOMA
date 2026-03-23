import { useState, useMemo } from "react"
import { Plus, Pencil, Trash2, Settings2, ArrowDownCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useEnvelopeStore, computeEnvelopeBalance, computeMonthFlow } from "@/store/envelopeStore"
import { useRevenueStore } from "@/store/revenueStore"
import { useInvoiceStore } from "@/store/invoiceStore"
import { useFixedExpenseStore } from "@/store/fixedExpenseStore"
import type { BudgetEnvelope, EnvelopeTransaction } from "@/types"
import { formatCurrency, generateId } from "@/lib/utils"
import { computeMonthPL, getCurrentYM, ymToLabel, getAllMonthsForYear } from "@/lib/pl-calculator"

const ENVELOPE_COLORS = [
  "#3b82f6","#10b981","#f59e0b","#8b5cf6","#ef4444",
  "#06b6d4","#84cc16","#f97316","#ec4899","#6b7280",
]

// ─── Sub-component: envelope card ───────────────────────────────────────────

function EnvelopeCard({
  envelope,
  balance,
  dotation,
  spending,
  onAddSpending,
  onEdit,
  onDelete,
}: {
  envelope: BudgetEnvelope
  balance: number
  dotation: number
  spending: number
  onAddSpending: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const spentPct = dotation > 0 ? Math.min((spending / dotation) * 100, 100) : 0
  const hasBalance = balance > 0

  return (
    <Card className="overflow-hidden">
      <div className="h-1 w-full" style={{ background: envelope.color }} />
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="font-semibold text-sm">{envelope.name}</p>
            <p className="text-xs text-muted-foreground">{envelope.allocationPercent}% du résultat</p>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
              <Pencil className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onDelete}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Balance accumulée */}
        <div className="rounded-lg p-3 mb-3" style={{ background: envelope.color + "15" }}>
          <p className="text-xs text-muted-foreground mb-0.5">Solde accumulé disponible</p>
          <p className="text-xl font-bold" style={{ color: hasBalance ? envelope.color : "#ef4444" }}>
            {formatCurrency(balance)}
          </p>
        </div>

        {/* Ce mois */}
        <div className="space-y-1.5 text-xs mb-3">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Dotation ce mois</span>
            <span className="font-medium">{formatCurrency(dotation)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Investi / dépensé</span>
            <span className="font-medium text-red-600">{formatCurrency(spending)}</span>
          </div>
        </div>

        {dotation > 0 && (
          <Progress value={spentPct} className="h-1.5 mb-3" />
        )}

        <Button
          size="sm"
          variant="outline"
          className="w-full gap-1.5 text-xs"
          onClick={onAddSpending}
          style={{ borderColor: envelope.color + "60", color: envelope.color }}
        >
          <ArrowDownCircle className="h-3.5 w-3.5" />
          Enregistrer une dépense / investissement
        </Button>
      </CardContent>
    </Card>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────

export function Budget() {
  const { envelopes, transactions, addEnvelope, updateEnvelope, deleteEnvelope, addTransaction, deleteTransaction } =
    useEnvelopeStore()
  const revenues = useRevenueStore((s) => s.revenues)
  const invoices = useInvoiceStore((s) => s.invoices)
  const fixedExpenses = useFixedExpenseStore((s) => s.expenses)

  const [month, setMonth] = useState(getCurrentYM())
  const [activeTab, setActiveTab] = useState("envelopes")

  // Dialogs
  const [envelopeDialog, setEnvelopeDialog] = useState<{ open: boolean; editing: BudgetEnvelope | null }>({ open: false, editing: null })
  const [spendingDialog, setSpendingDialog] = useState<{ open: boolean; envelopeId: string | null }>({ open: false, envelopeId: null })
  const [settingsDialog, setSettingsDialog] = useState(false)
  const [historyEnvId, setHistoryEnvId] = useState<string | null>(null)

  // Forms
  const [envForm, setEnvForm] = useState({ name: "", allocationPercent: 0, color: ENVELOPE_COLORS[0], description: "" })
  const [spendForm, setSpendForm] = useState({ amount: "", description: "", date: new Date().toISOString().slice(0, 10) })

  // Current month P&L
  const rev = revenues.find((r) => r.month === month)
  const pl = useMemo(() => computeMonthPL(month, invoices, fixedExpenses, rev), [month, invoices, fixedExpenses, rev])
  const resultatDisponible = pl.resultatNet

  // Total allocation %
  const totalAlloc = envelopes.reduce((s, e) => s + e.allocationPercent, 0)

  // For each envelope: compute dotation this month + cumulative balance
  const envelopeData = useMemo(() => envelopes.map((env) => {
    // Auto-dotation: we create dotation transactions when month P&L is positive
    // But we store them — check if dotation already recorded
    const dotationTx = transactions.find(
      (t) => t.envelopeId === env.id && t.month === month && t.type === "dotation"
    )
    const dotation = dotationTx?.amount ?? (resultatDisponible > 0
      ? Math.round(resultatDisponible * (env.allocationPercent / 100) * 100) / 100
      : 0)

    const { spending } = computeMonthFlow(env.id, transactions, month)
    const balance = computeEnvelopeBalance(env.id, transactions, month)

    return { envelope: env, dotation, spending, balance }
  }), [envelopes, transactions, month, resultatDisponible])

  // Unallocated result
  const allocatedAmount = resultatDisponible > 0
    ? Math.round(resultatDisponible * (Math.min(totalAlloc, 100) / 100) * 100) / 100
    : 0
  const unallocated = Math.round((resultatDisponible - allocatedAmount) * 100) / 100

  // All months for history
  const allMonths = useMemo(() => {
    const set = new Set<string>()
    const y = parseInt(month.slice(0, 4))
    getAllMonthsForYear(y).forEach((m) => set.add(m))
    transactions.forEach((t) => set.add(t.month))
    return Array.from(set).sort((a, b) => b.localeCompare(a))
  }, [transactions, month])

  const openEnvelopeDialog = (env?: BudgetEnvelope) => {
    if (env) {
      setEnvForm({ name: env.name, allocationPercent: env.allocationPercent, color: env.color, description: env.description ?? "" })
      setEnvelopeDialog({ open: true, editing: env })
    } else {
      const usedColors = envelopes.map((e) => e.color)
      const nextColor = ENVELOPE_COLORS.find((c) => !usedColors.includes(c)) ?? ENVELOPE_COLORS[0]
      setEnvForm({ name: "", allocationPercent: 0, color: nextColor, description: "" })
      setEnvelopeDialog({ open: true, editing: null })
    }
  }

  const saveEnvelope = () => {
    if (!envForm.name || envForm.allocationPercent <= 0) return
    const data = {
      name: envForm.name,
      allocationPercent: envForm.allocationPercent,
      color: envForm.color,
      description: envForm.description,
    }
    if (envelopeDialog.editing) {
      updateEnvelope(envelopeDialog.editing.id, data)
    } else {
      addEnvelope({ ...data, id: generateId(), startMonth: month })
    }
    setEnvelopeDialog({ open: false, editing: null })
  }

  const openSpendingDialog = (envelopeId: string) => {
    setSpendingDialog({ open: true, envelopeId })
    setSpendForm({ amount: "", description: "", date: `${month}-01` })
  }

  const saveSpending = () => {
    if (!spendingDialog.envelopeId || !spendForm.amount) return
    const amount = parseFloat(spendForm.amount)
    if (!amount || amount <= 0) return

    const tx: EnvelopeTransaction = {
      id: generateId(),
      envelopeId: spendingDialog.envelopeId,
      month,
      amount: -amount, // negative = spending
      type: "spending",
      description: spendForm.description || "Dépense",
      date: spendForm.date,
    }
    addTransaction(tx)

    // Also add dotation if not yet done
    const existingDotation = transactions.find(
      (t) => t.envelopeId === spendingDialog.envelopeId && t.month === month && t.type === "dotation"
    )
    if (!existingDotation && resultatDisponible > 0) {
      const env = envelopes.find((e) => e.id === spendingDialog.envelopeId)
      if (env) {
        const dotAmt = Math.round(resultatDisponible * (env.allocationPercent / 100) * 100) / 100
        if (dotAmt > 0) {
          addTransaction({
            id: generateId(),
            envelopeId: env.id,
            month,
            amount: dotAmt,
            type: "dotation",
            description: `Dotation ${ymToLabel(month)}`,
            date: `${month}-01`,
          })
        }
      }
    }

    setSpendingDialog({ open: false, envelopeId: null })
  }

  // Confirm dotation for the month (lock in the allocation)
  const confirmDotations = () => {
    envelopes.forEach((env) => {
      const exists = transactions.find(
        (t) => t.envelopeId === env.id && t.month === month && t.type === "dotation"
      )
      if (!exists && resultatDisponible > 0) {
        const amt = Math.round(resultatDisponible * (env.allocationPercent / 100) * 100) / 100
        if (amt > 0) {
          addTransaction({
            id: generateId(),
            envelopeId: env.id,
            month,
            amount: amt,
            type: "dotation",
            description: `Dotation ${ymToLabel(month)}`,
            date: `${month}-01`,
          })
        }
      }
    })
  }

  const dotationsConfirmed = envelopes.length > 0 && envelopes.every((env) =>
    transactions.some((t) => t.envelopeId === env.id && t.month === month && t.type === "dotation")
  )

  // History for an envelope
  const historyEnv = envelopes.find((e) => e.id === historyEnvId)

  const yearNum = parseInt(month.slice(0, 4))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {getAllMonthsForYear(yearNum - 1).concat(getAllMonthsForYear(yearNum)).concat(getAllMonthsForYear(yearNum + 1)).map((ym) => (
                <SelectItem key={ym} value={ym}>{ymToLabel(ym)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge variant={totalAlloc > 100 ? "destructive" : totalAlloc === 100 ? "success" : "warning"}>
            {totalAlloc}% alloué
          </Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setSettingsDialog(true)}>
            <Settings2 className="h-4 w-4" />
            Gérer les enveloppes
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="envelopes">Enveloppes</TabsTrigger>
          <TabsTrigger value="pl">P&L du mois</TabsTrigger>
          <TabsTrigger value="history">Historique</TabsTrigger>
        </TabsList>

        {/* ── ENVELOPES TAB ── */}
        <TabsContent value="envelopes" className="space-y-4 mt-4">
          {/* P&L summary strip */}
          <div className="rounded-xl border bg-white p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Résultat {ymToLabel(month)} — base de répartition
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">CA Brut</p>
                <p className="font-bold text-emerald-700">{formatCurrency(pl.cabrut)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">− Charges</p>
                <p className="font-bold text-red-600">{formatCurrency(pl.totalChargesHT)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">− IS estimé</p>
                <p className="font-bold text-amber-600">{formatCurrency(pl.isEstime)}</p>
              </div>
              <div className="sm:col-span-2 rounded-lg bg-primary/5 border border-primary/20 p-2">
                <p className="text-xs text-muted-foreground">= Résultat net disponible</p>
                <p className={`text-lg font-bold ${resultatDisponible >= 0 ? "text-primary" : "text-red-600"}`}>
                  {formatCurrency(resultatDisponible)}
                </p>
              </div>
            </div>
          </div>

          {envelopes.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed bg-white py-16 text-center">
              <p className="text-muted-foreground text-sm mb-3">
                Aucune enveloppe. Créez vos premières enveloppes pour répartir votre résultat.
              </p>
              <Button onClick={() => openEnvelopeDialog()} className="gap-2">
                <Plus className="h-4 w-4" /> Créer une enveloppe
              </Button>
            </div>
          ) : (
            <>
              {/* Allocation bar */}
              {resultatDisponible > 0 && (
                <div className="rounded-lg border bg-white p-4">
                  <div className="flex items-center justify-between mb-2 text-sm">
                    <span className="font-medium">Répartition du résultat</span>
                    <span className="text-muted-foreground text-xs">
                      {formatCurrency(allocatedAmount)} alloué · {formatCurrency(unallocated)} libre
                    </span>
                  </div>
                  <div className="flex h-6 rounded-full overflow-hidden bg-muted">
                    {envelopeData.map(({ envelope, dotation }) => {
                      const pct = resultatDisponible > 0 ? (dotation / resultatDisponible) * 100 : 0
                      return pct > 0 ? (
                        <div
                          key={envelope.id}
                          className="flex items-center justify-center text-white text-[9px] font-semibold overflow-hidden"
                          style={{ width: `${pct}%`, background: envelope.color }}
                          title={`${envelope.name}: ${formatCurrency(dotation)}`}
                        >
                          {pct > 6 ? `${envelope.allocationPercent}%` : ""}
                        </div>
                      ) : null
                    })}
                    {unallocated > 0 && (
                      <div
                        className="flex-1 bg-muted-foreground/20"
                        title={`Non alloué: ${formatCurrency(unallocated)}`}
                      />
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3 mt-2">
                    {envelopeData.map(({ envelope, dotation }) => (
                      <div key={envelope.id} className="flex items-center gap-1 text-xs">
                        <span className="h-2 w-2 rounded-full" style={{ background: envelope.color }} />
                        <span className="text-muted-foreground">{envelope.name}</span>
                        <span className="font-medium">{formatCurrency(dotation)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Confirm dotations */}
              {resultatDisponible > 0 && !dotationsConfirmed && (
                <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 p-4">
                  <div>
                    <p className="text-sm font-semibold">Valider les dotations de {ymToLabel(month)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Cela ancre les montants dans l'historique. Les soldes s'accumuleront mois après mois.
                    </p>
                  </div>
                  <Button size="sm" onClick={confirmDotations} className="gap-1.5 shrink-0">
                    Valider les dotations
                  </Button>
                </div>
              )}

              {/* Envelope cards */}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {envelopeData.map(({ envelope, balance, dotation, spending }) => (
                  <EnvelopeCard
                    key={envelope.id}
                    envelope={envelope}
                    balance={balance}
                    dotation={dotation}
                    spending={spending}
                    onAddSpending={() => openSpendingDialog(envelope.id)}
                    onEdit={() => openEnvelopeDialog(envelope)}
                    onDelete={() => deleteEnvelope(envelope.id)}
                  />
                ))}
                <button
                  onClick={() => openEnvelopeDialog()}
                  className="rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors p-8 min-h-[200px]"
                >
                  <Plus className="h-6 w-6" />
                  <span className="text-sm font-medium">Ajouter une enveloppe</span>
                </button>
              </div>
            </>
          )}
        </TabsContent>

        {/* ── P&L TAB ── */}
        <TabsContent value="pl" className="mt-4">
          <div className="rounded-xl border bg-white p-6 max-w-lg">
            <p className="text-sm font-semibold mb-4">P&L détaillé — {ymToLabel(month)}</p>
            <div className="space-y-2 text-sm">
              <PLRow label="CA Brut HT" value={pl.cabrut} green bold />
              {pl.canet !== pl.cabrut && <PLRow label="CA Net HT" value={pl.canet} green indent />}
              <Separator className="my-3" />
              <PLRow label="Charges variables (factures)" value={pl.chargesVariablesHT} red indent />
              <PLRow label="Charges fixes (mensuel)" value={pl.chargesFixesHT} red indent />
              <PLRow label="Total charges déductibles" value={pl.totalChargesHT} red bold />
              <Separator className="my-3" />
              <PLRow label="Résultat brut" value={pl.resultatBrut} green={pl.resultatBrut >= 0} red={pl.resultatBrut < 0} bold />
              <PLRow label={`IS estimé (${pl.resultatBrut > 0 ? Math.round((pl.isEstime / pl.resultatBrut) * 100) : 0}%)`} value={pl.isEstime} amber indent />
              <Separator className="my-3" />
              <PLRow label="Résultat net disponible" value={pl.resultatNet} green={pl.resultatNet >= 0} red={pl.resultatNet < 0} bold large />
              <Separator className="my-3" />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-4">TVA</p>
              <PLRow label="TVA collectée (sur CA)" value={pl.tvaCollectee} indent small />
              <PLRow label="TVA déductible (sur achats)" value={pl.tvaDeductible} indent small />
              <PLRow label="TVA nette à reverser" value={pl.tvaNette} amber={pl.tvaNette > 0} green={pl.tvaNette < 0} indent bold small />
            </div>
          </div>
        </TabsContent>

        {/* ── HISTORY TAB ── */}
        <TabsContent value="history" className="mt-4 space-y-4">
          <div className="flex items-center gap-3">
            <Select value={historyEnvId ?? "all"} onValueChange={(v) => setHistoryEnvId(v === "all" ? null : v)}>
              <SelectTrigger className="w-52">
                <SelectValue placeholder="Toutes les enveloppes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les enveloppes</SelectItem>
                {envelopes.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {historyEnv && (
              <div className="flex items-center gap-1.5 text-sm">
                <span className="h-3 w-3 rounded-full" style={{ background: historyEnv.color }} />
                <span className="font-medium">Solde actuel :</span>
                <span className="font-bold" style={{ color: historyEnv.color }}>
                  {formatCurrency(computeEnvelopeBalance(historyEnv.id, transactions, month))}
                </span>
              </div>
            )}
          </div>

          {/* History by month */}
          {historyEnvId === null ? (
            // All transactions
            <div className="rounded-lg border bg-white divide-y">
              {transactions.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Aucune transaction</p>
              ) : (
                [...transactions]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .slice(0, 50)
                  .map((tx) => {
                    const env = envelopes.find((e) => e.id === tx.envelopeId)
                    return (
                      <div key={tx.id} className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-2 w-2 rounded-full" style={{ background: env?.color ?? "#ccc" }} />
                          <div>
                            <p className="text-sm font-medium">{tx.description}</p>
                            <p className="text-xs text-muted-foreground">
                              {env?.name} · {ymToLabel(tx.month)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`text-sm font-semibold ${tx.amount > 0 ? "text-emerald-600" : "text-red-600"}`}>
                            {tx.amount > 0 ? "+" : "−"}{formatCurrency(Math.abs(tx.amount))}
                          </span>
                          <Badge variant={tx.type === "dotation" ? "info" : "secondary"} className="text-xs">
                            {tx.type === "dotation" ? "Dotation" : "Dépense"}
                          </Badge>
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                            onClick={() => deleteTransaction(tx.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    )
                  })
              )}
            </div>
          ) : (
            // Single envelope history with cumulative balance
            <div className="space-y-3">
              {allMonths.map((ym) => {
                const flow = computeMonthFlow(historyEnvId, transactions, ym)
                const cumBalance = computeEnvelopeBalance(historyEnvId, transactions, ym)
                const monthTxs = transactions.filter((t) => t.envelopeId === historyEnvId && t.month === ym)
                if (monthTxs.length === 0 && flow.dotation === 0) return null
                return (
                  <div key={ym} className="rounded-lg border bg-white overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 bg-muted/30">
                      <p className="text-sm font-semibold">{ymToLabel(ym)}</p>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-muted-foreground text-xs">
                          +{formatCurrency(flow.dotation)} / −{formatCurrency(flow.spending)}
                        </span>
                        <span className="font-bold" style={{ color: historyEnv?.color }}>
                          Solde : {formatCurrency(cumBalance)}
                        </span>
                      </div>
                    </div>
                    <div className="divide-y">
                      {monthTxs.map((tx) => (
                        <div key={tx.id} className="flex items-center justify-between px-4 py-2.5">
                          <div>
                            <p className="text-sm">{tx.description}</p>
                            <p className="text-xs text-muted-foreground">{tx.date}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-semibold ${tx.amount > 0 ? "text-emerald-600" : "text-red-600"}`}>
                              {tx.amount > 0 ? "+" : "−"}{formatCurrency(Math.abs(tx.amount))}
                            </span>
                            <Button
                              variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                              onClick={() => deleteTransaction(tx.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              }).filter(Boolean)}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── ENVELOPE SETTINGS DIALOG ── */}
      <Dialog open={settingsDialog} onOpenChange={setSettingsDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Gérer les enveloppes</DialogTitle>
            <DialogDescription>
              Total alloué : {totalAlloc}% · {totalAlloc > 100 ? "⚠️ Dépasse 100%" : `${100 - totalAlloc}% libre`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {envelopes.map((env) => (
              <div key={env.id} className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full" style={{ background: env.color }} />
                  <div>
                    <p className="text-sm font-medium">{env.name}</p>
                    <p className="text-xs text-muted-foreground">{env.allocationPercent}% du résultat</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setSettingsDialog(false); openEnvelopeDialog(env) }}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteEnvelope(env.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => { setSettingsDialog(false); openEnvelopeDialog() }} className="gap-2 w-full">
              <Plus className="h-4 w-4" /> Nouvelle enveloppe
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── ENVELOPE FORM DIALOG ── */}
      <Dialog open={envelopeDialog.open} onOpenChange={(o) => setEnvelopeDialog({ open: o, editing: null })}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{envelopeDialog.editing ? "Modifier l'enveloppe" : "Nouvelle enveloppe"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-1.5">
              <Label>Nom *</Label>
              <Input value={envForm.name} onChange={(e) => setEnvForm((p) => ({ ...p, name: e.target.value }))} placeholder="Trésorerie, Communication, R&D..." />
            </div>
            <div className="space-y-1.5">
              <Label>% du résultat net alloué *</Label>
              <p className="text-xs text-muted-foreground">
                Ex: 30 = 30% du résultat net mensuel va dans cette enveloppe
              </p>
              <div className="flex items-center gap-2">
                <Input
                  type="number" min="0" max="100" step="1"
                  value={envForm.allocationPercent || ""}
                  placeholder="0"
                  onChange={(e) => setEnvForm((p) => ({ ...p, allocationPercent: parseFloat(e.target.value) || 0 }))}
                />
                <span className="text-sm font-semibold">%</span>
              </div>
              {envForm.allocationPercent > 0 && resultatDisponible > 0 && (
                <p className="text-xs text-emerald-700 font-medium">
                  = {formatCurrency(resultatDisponible * envForm.allocationPercent / 100)} ce mois
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Couleur</Label>
              <div className="flex gap-2 flex-wrap">
                {ENVELOPE_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setEnvForm((p) => ({ ...p, color: c }))}
                    className={`h-7 w-7 rounded-full border-2 transition-transform ${envForm.color === c ? "border-foreground scale-110" : "border-transparent"}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Description (optionnel)</Label>
              <Input value={envForm.description} onChange={(e) => setEnvForm((p) => ({ ...p, description: e.target.value }))} placeholder="À quoi sert cette enveloppe ?" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEnvelopeDialog({ open: false, editing: null })}>Annuler</Button>
            <Button onClick={saveEnvelope} disabled={!envForm.name || envForm.allocationPercent <= 0}>
              {envelopeDialog.editing ? "Enregistrer" : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── SPENDING DIALOG ── */}
      <Dialog open={spendingDialog.open} onOpenChange={(o) => setSpendingDialog({ open: o, envelopeId: null })}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {envelopes.find((e) => e.id === spendingDialog.envelopeId)?.name ?? "Enveloppe"}
            </DialogTitle>
            <DialogDescription>
              Enregistrer une dépense ou un investissement
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-1.5">
              <Label>Montant (€) *</Label>
              <Input
                type="number" step="0.01" autoFocus
                value={spendForm.amount}
                placeholder="0.00"
                onChange={(e) => setSpendForm((p) => ({ ...p, amount: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description *</Label>
              <Input
                value={spendForm.description}
                placeholder="Campagne Google Ads, achat matériel..."
                onChange={(e) => setSpendForm((p) => ({ ...p, description: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input
                type="date"
                value={spendForm.date}
                onChange={(e) => setSpendForm((p) => ({ ...p, date: e.target.value }))}
              />
            </div>
            {spendingDialog.envelopeId && (
              <div className="rounded-lg bg-muted/40 p-3 text-xs">
                <p className="text-muted-foreground">Solde disponible avant cette dépense :</p>
                <p className="font-bold text-sm">
                  {formatCurrency(computeEnvelopeBalance(spendingDialog.envelopeId, transactions, month))}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSpendingDialog({ open: false, envelopeId: null })}>Annuler</Button>
            <Button onClick={saveSpending} disabled={!spendForm.amount || !spendForm.description}>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function PLRow({ label, value, green, red, amber, bold, large, indent, small }: {
  label: string; value: number;
  green?: boolean; red?: boolean; amber?: boolean;
  bold?: boolean; large?: boolean; indent?: boolean; small?: boolean
}) {
  return (
    <div className={`flex justify-between ${indent ? "pl-4" : ""}`}>
      <span className={`text-muted-foreground ${small ? "text-xs" : ""}`}>{label}</span>
      <span className={[
        green ? "text-emerald-700" : red ? "text-red-600" : amber ? "text-amber-600" : "",
        bold ? "font-semibold" : "",
        large ? "text-base font-bold" : "",
        small ? "text-xs" : "",
      ].join(" ")}>
        {formatCurrency(value)}
      </span>
    </div>
  )
}
