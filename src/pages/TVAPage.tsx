import { useMemo } from "react"
import { AlertTriangle, CheckCircle2, Info } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { useInvoiceStore } from "@/store/invoiceStore"
import { computeDashboardStats } from "@/lib/tva-calculator"
import { formatCurrency } from "@/lib/utils"
import { TVA_RATE_LABELS } from "@/types"

const REGIME_THRESHOLDS = {
  micro: 36_800,
  reel_simplifie: 254_000,
  reel_normal: Infinity,
}

function getRegime(totalHT: number) {
  if (totalHT <= REGIME_THRESHOLDS.micro) return "franchise_base"
  if (totalHT <= REGIME_THRESHOLDS.reel_simplifie) return "reel_simplifie"
  return "reel_normal"
}

const REGIME_LABELS = {
  franchise_base: "Franchise en base",
  reel_simplifie: "Réel simplifié",
  reel_normal: "Réel normal",
}

const REGIME_DESC = {
  franchise_base: "Votre CA est sous le seuil de franchise. Vous n'êtes pas redevable de la TVA.",
  reel_simplifie: "Déclaration annuelle avec 2 acomptes provisionnels (juillet et décembre).",
  reel_normal: "Déclaration mensuelle ou trimestrielle obligatoire.",
}

export function TVAPage() {
  const invoices = useInvoiceStore((s) => s.invoices)
  const stats = useMemo(() => computeDashboardStats(invoices), [invoices])

  const regime = getRegime(stats.totalHT)
  const pendingCount = invoices.filter((i) => i.status === "pending").length

  // Group by quarter
  const byQuarter: Record<string, { ht: number; tva: number; count: number }> = {}
  for (const inv of invoices) {
    const date = inv.invoiceDate ?? inv.uploadedAt
    const d = new Date(date)
    const q = `T${Math.ceil((d.getMonth() + 1) / 3)} ${d.getFullYear()}`
    if (!byQuarter[q]) byQuarter[q] = { ht: 0, tva: 0, count: 0 }
    byQuarter[q].ht += inv.totalHT
    byQuarter[q].tva += inv.totalTVA
    byQuarter[q].count += 1
  }
  const quarters = Object.entries(byQuarter).sort(([a], [b]) => a.localeCompare(b))

  const currentYear = new Date().getFullYear()
  const currentYearInvoices = invoices.filter((i) => {
    const date = i.invoiceDate ?? i.uploadedAt
    return date.startsWith(String(currentYear))
  })
  const currentYearHT = currentYearInvoices.reduce((s, i) => s + i.totalHT, 0)
  const progressToNextThreshold =
    regime === "franchise_base"
      ? (currentYearHT / REGIME_THRESHOLDS.micro) * 100
      : regime === "reel_simplifie"
      ? (currentYearHT / REGIME_THRESHOLDS.reel_simplifie) * 100
      : 100

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Récapitulatif de votre TVA déductible et à reverser à la DGFiP
      </p>

      {/* Regime */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Régime fiscal estimé</CardTitle>
            <Badge
              variant={
                regime === "franchise_base"
                  ? "success"
                  : regime === "reel_simplifie"
                  ? "warning"
                  : "destructive"
              }
            >
              {REGIME_LABELS[regime]}
            </Badge>
          </div>
          <CardDescription>{REGIME_DESC[regime]}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                CA HT {currentYear} : {formatCurrency(currentYearHT)}
              </span>
              <span className="text-muted-foreground">
                Seuil :{" "}
                {regime === "franchise_base"
                  ? formatCurrency(REGIME_THRESHOLDS.micro)
                  : regime === "reel_simplifie"
                  ? formatCurrency(REGIME_THRESHOLDS.reel_simplifie)
                  : "Illimité"}
              </span>
            </div>
            <Progress value={Math.min(progressToNextThreshold, 100)} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* Warnings */}
      {pendingCount > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">
              {pendingCount} facture{pendingCount > 1 ? "s" : ""} à compléter
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Des montants sont manquants. Le calcul TVA peut être incomplet.
            </p>
          </div>
        </div>
      )}

      {invoices.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12">
            <Info className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">Importez des factures pour voir votre récap TVA</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* TVA by rate */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">TVA par taux</CardTitle>
              <CardDescription>Ventilation des montants selon le taux applicable</CardDescription>
            </CardHeader>
            <CardContent>
              {Object.keys(stats.tvaByRate).length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Aucune TVA calculée</p>
              ) : (
                <div className="space-y-4">
                  {Object.entries(stats.tvaByRate).map(([rate, values]) => (
                    <div key={rate}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">
                          {TVA_RATE_LABELS[Number(rate) as keyof typeof TVA_RATE_LABELS] ?? `TVA ${rate}%`}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-4 rounded-lg bg-muted/40 p-3 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Base HT</p>
                          <p className="font-semibold">{formatCurrency(values.baseHT)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">TVA ({rate}%)</p>
                          <p className="font-semibold text-amber-600">{formatCurrency(values.montantTVA)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">TTC</p>
                          <p className="font-semibold">
                            {formatCurrency(values.baseHT + values.montantTVA)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}

                  <Separator />

                  {/* Grand total */}
                  <div className="grid grid-cols-3 gap-4 rounded-lg bg-primary/5 border border-primary/20 p-4 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground font-medium">TOTAL HT</p>
                      <p className="text-lg font-bold">{formatCurrency(stats.totalHT)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-amber-700">TVA À REVERSER</p>
                      <p className="text-lg font-bold text-amber-600">{formatCurrency(stats.totalTVA)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground font-medium">TOTAL TTC</p>
                      <p className="text-lg font-bold">{formatCurrency(stats.totalTTC)}</p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* By quarter */}
          {quarters.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">TVA par trimestre</CardTitle>
                <CardDescription>Aide à la déclaration périodique</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {quarters.map(([quarter, data]) => (
                    <div key={quarter} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
                          <span className="text-xs font-bold text-primary">{quarter.slice(0, 2)}</span>
                        </div>
                        <div>
                          <p className="font-medium">{quarter}</p>
                          <p className="text-xs text-muted-foreground">{data.count} facture{data.count > 1 ? "s" : ""}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6 text-right">
                        <div>
                          <p className="text-xs text-muted-foreground">HT</p>
                          <p className="font-semibold">{formatCurrency(data.ht)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-amber-600">TVA</p>
                          <p className="font-semibold text-amber-600">{formatCurrency(data.tva)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Info */}
          <div className="flex items-start gap-3 rounded-lg border bg-blue-50 border-blue-200 p-4">
            <CheckCircle2 className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-semibold mb-1">Rappel légal</p>
              <p className="text-xs leading-relaxed">
                La TVA collectée sur vos achats est déductible de la TVA que vous facturez à vos clients.
                Le montant affiché ici correspond à la TVA sur vos <strong>dépenses</strong> (TVA déductible).
                Déclarez-la via votre espace professionnel sur <strong>impots.gouv.fr</strong>.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
