import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  Receipt, TrendingUp, Euro, FileText,
  ArrowRight, PackageSearch, RepeatIcon, ChevronLeft, ChevronRight,
} from "lucide-react"
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { StatsCard } from "@/components/dashboard/StatsCard"
import { RecentInvoices } from "@/components/dashboard/RecentInvoices"
import { useInvoiceStore } from "@/store/invoiceStore"
import { useFixedExpenseStore } from "@/store/fixedExpenseStore"
import { useRevenueStore } from "@/store/revenueStore"
import { useStockStore } from "@/store/stockStore"
import { formatCurrency } from "@/lib/utils"
import { monthlyAmount, computeIS } from "@/types"

const MONTH_NAMES = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"]
const MONTH_SHORT = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Août","Sep","Oct","Nov","Déc"]

function currentYM() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-white p-3 shadow-lg text-xs space-y-1">
      <p className="font-semibold text-sm mb-1">{label}</p>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {payload.map((entry: any) => (
        <div key={entry.name} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: entry.color }} />
          <span className="text-muted-foreground">{entry.name} :</span>
          <span className="font-medium">{formatCurrency(entry.value)}</span>
        </div>
      ))}
    </div>
  )
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

export function Dashboard() {
  const invoices = useInvoiceStore((s) => s.invoices)
  const fixedExpenses = useFixedExpenseStore((s) => s.expenses)
  const revenues = useRevenueStore((s) => s.revenues)
  const stockItems = useStockStore((s) => s.items)
  const navigate = useNavigate()

  const [selectedYM, setSelectedYM] = useState(currentYM())
  const isCurrentMonth = selectedYM === currentYM()

  // ── Données du mois sélectionné ──────────────────────────────────────────
  const monthRevenue = revenues.find((r) => r.month === selectedYM)
  const monthCA = monthRevenue?.cabrut ?? 0
  const monthCANet = monthRevenue?.canet ?? monthCA

  const monthVarCharges = useMemo(
    () =>
      invoices
        .filter((inv) => (inv.invoiceDate ?? inv.uploadedAt ?? "").startsWith(selectedYM))
        .reduce((s, inv) => s + inv.totalHT, 0),
    [invoices, selectedYM]
  )

  const monthVarTVA = useMemo(
    () =>
      invoices
        .filter((inv) => (inv.invoiceDate ?? inv.uploadedAt ?? "").startsWith(selectedYM))
        .reduce((s, inv) => s + inv.totalTVA, 0),
    [invoices, selectedYM]
  )

  const fixedMonthlyHT = fixedExpenses
    .filter((e) => e.active)
    .reduce((s, e) => s + monthlyAmount(e), 0)

  const monthTotalCharges = monthVarCharges + fixedMonthlyHT
  const monthResult = monthCANet - monthTotalCharges
  const monthIS = monthResult > 0 ? computeIS(monthResult) : 0
  const monthTVANette = (monthRevenue?.tvaCollectee ?? 0) - monthVarTVA

  // ── Graphique 12 mois ────────────────────────────────────────────────────
  const plMonthly = useMemo(() => {
    const now = new Date()
    const months = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      const label = MONTH_SHORT[d.getMonth()]
      const ca = revenues.find((r) => r.month === ym)?.cabrut ?? 0
      const varC = invoices
        .filter((inv) => (inv.invoiceDate ?? inv.uploadedAt ?? "").startsWith(ym))
        .reduce((s, inv) => s + inv.totalHT, 0)
      months.push({
        label,
        ca,
        charges: Math.round((varC + fixedMonthlyHT) * 100) / 100,
        resultat: Math.round((ca - varC - fixedMonthlyHT) * 100) / 100,
      })
    }
    return months
  }, [revenues, invoices, fixedMonthlyHT])

  const stockValue = stockItems.reduce((s, i) => s + i.quantity * i.unitCostHT, 0)
  const lowStock = stockItems.filter((i) => i.reorderPoint !== undefined && i.quantity <= i.reorderPoint)

  const monthInvoiceCount = invoices.filter(
    (inv) => (inv.invoiceDate ?? inv.uploadedAt ?? "").startsWith(selectedYM)
  ).length

  return (
    <div className="space-y-6">

      {/* ── Sélecteur de mois ── */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">SAS · Résultats mensuels</p>
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
      </div>

      {/* ── KPIs mensuels ── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatsCard
          title="CA Brut du mois"
          value={formatCurrency(monthCA)}
          description={monthRevenue ? `CA net : ${formatCurrency(monthCANet)}` : "Non saisi — sync Square ou saisie manuelle"}
          icon={<TrendingUp className="h-5 w-5" />}
          variant={monthCA > 0 ? "primary" : "default"}
        />
        <StatsCard
          title="Charges variables"
          value={formatCurrency(monthVarCharges)}
          description={`${monthInvoiceCount} facture${monthInvoiceCount > 1 ? "s" : ""} ce mois`}
          icon={<Receipt className="h-5 w-5" />}
          variant="danger"
        />
        <StatsCard
          title="Charges fixes"
          value={formatCurrency(fixedMonthlyHT)}
          description={`${fixedExpenses.filter((e) => e.active).length} postes actifs`}
          icon={<RepeatIcon className="h-5 w-5" />}
          variant="warning"
        />
        <StatsCard
          title="IS estimé du mois"
          value={formatCurrency(monthIS)}
          description={`Résultat brut : ${formatCurrency(monthResult)}`}
          icon={<Euro className="h-5 w-5" />}
          variant="default"
        />
      </div>

      {/* ── Résultat net + TVA nette ── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatsCard
          title="TVA nette du mois"
          value={formatCurrency(Math.max(0, monthTVANette))}
          description={monthTVANette >= 0 ? "À reverser à l'État" : `Crédit TVA : ${formatCurrency(Math.abs(monthTVANette))}`}
          icon={<FileText className="h-5 w-5" />}
          variant="default"
        />
        <StatsCard
          title="Valeur du stock"
          value={formatCurrency(stockValue)}
          description={`${stockItems.length} référence${stockItems.length > 1 ? "s" : ""}`}
          icon={<PackageSearch className="h-5 w-5" />}
          variant="default"
        />
        <div className="sm:col-span-2 rounded-lg border bg-white p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Résultat net — {ymLabel(selectedYM)}</p>
            <p className={`text-2xl font-bold mt-1 ${monthResult - monthIS >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {formatCurrency(monthResult - monthIS)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              CA {formatCurrency(monthCA)} − Charges {formatCurrency(monthTotalCharges)} − IS {formatCurrency(monthIS)}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate("/resultat")} className="gap-1">
            Détails <ArrowRight className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* ── Alertes stock ── */}
      {lowStock.length > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-800">
            <strong>{lowStock.length} produit{lowStock.length > 1 ? "s" : ""}</strong> sous le seuil de réappro
          </p>
          <Button variant="outline" size="sm" onClick={() => navigate("/stock")}>
            Voir le stock
          </Button>
        </div>
      )}

      {/* ── Graphique 12 mois ── */}
      <Card>
        <CardHeader>
          <CardTitle>P&L sur 12 mois</CardTitle>
          <CardDescription>CA brut vs charges totales</CardDescription>
        </CardHeader>
        <CardContent>
          {plMonthly.some((m) => m.ca > 0 || m.charges > 0) ? (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={plMonthly} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="caGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="chargesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k€`} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="ca" name="CA Brut" stroke="#10b981" strokeWidth={2} fill="url(#caGrad)" dot={false} activeDot={{ r: 4 }} />
                <Area type="monotone" dataKey="charges" name="Charges" stroke="#ef4444" strokeWidth={2} fill="url(#chargesGrad)" dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[240px] items-center justify-center flex-col gap-3">
              <p className="text-sm text-muted-foreground">Synchronisez Square ou saisissez votre CA pour voir le P&L</p>
              <Button variant="outline" size="sm" onClick={() => navigate("/resultat")}>Saisir le CA</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Raccourcis ── */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Factures variables", desc: `${monthInvoiceCount} ce mois · ${formatCurrency(monthVarCharges)} HT`, to: "/factures", color: "text-blue-600 bg-blue-50 border-blue-200" },
          { label: "Charges fixes", desc: `${formatCurrency(fixedMonthlyHT)}/mois · ${formatCurrency(fixedMonthlyHT * 12)}/an`, to: "/charges-fixes", color: "text-purple-600 bg-purple-50 border-purple-200" },
          { label: "Déclaration TVA", desc: `${formatCurrency(Math.max(0, monthTVANette))} à reverser`, to: "/tva", color: "text-amber-600 bg-amber-50 border-amber-200" },
          { label: "Stock", desc: `${stockItems.length} réf · ${formatCurrency(stockValue)}`, to: "/stock", color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
        ].map((item) => (
          <button
            key={item.to}
            onClick={() => navigate(item.to)}
            className={`flex items-start justify-between rounded-lg border p-4 text-left transition-all hover:shadow-sm ${item.color}`}
          >
            <div>
              <p className="text-sm font-semibold">{item.label}</p>
              <p className="text-xs mt-0.5 opacity-75">{item.desc}</p>
            </div>
            <ArrowRight className="h-4 w-4 mt-0.5 shrink-0" />
          </button>
        ))}
      </div>

      {/* ── Dernières factures ── */}
      <RecentInvoices invoices={invoices.filter((inv) => (inv.invoiceDate ?? inv.uploadedAt ?? "").startsWith(selectedYM))} />
    </div>
  )
}
