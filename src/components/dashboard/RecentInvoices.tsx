import { useNavigate } from "react-router-dom"
import { ArrowRight } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { Invoice } from "@/types"
import { formatCurrency, formatDate } from "@/lib/utils"

interface RecentInvoicesProps {
  invoices: Invoice[]
}

const STATUS_BADGE: Record<
  Invoice["status"],
  { label: string; variant: "success" | "warning" | "info" }
> = {
  analysed: { label: "Analysée", variant: "success" },
  manual: { label: "Manuelle", variant: "info" },
  pending: { label: "À compléter", variant: "warning" },
}

export function RecentInvoices({ invoices }: RecentInvoicesProps) {
  const navigate = useNavigate()
  const recent = invoices.slice(0, 5)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div>
          <CardTitle>Dernières factures</CardTitle>
          <CardDescription>Les 5 factures les plus récentes</CardDescription>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 text-xs"
          onClick={() => navigate("/factures")}
        >
          Voir tout <ArrowRight className="h-3 w-3" />
        </Button>
      </CardHeader>
      <CardContent>
        {recent.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Aucune facture importée
          </p>
        ) : (
          <div className="space-y-3">
            {recent.map((inv) => {
              const status = STATUS_BADGE[inv.status]
              return (
                <div
                  key={inv.id}
                  className="flex items-center justify-between gap-4 rounded-lg border p-3 transition-colors hover:bg-accent/50 cursor-pointer"
                  onClick={() => navigate("/factures")}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {inv.vendor ?? inv.fileName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(inv.invoiceDate)} ·{" "}
                      {inv.invoiceNumber ? `N° ${inv.invoiceNumber}` : inv.category ?? "Sans catégorie"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Badge variant={status.variant}>{status.label}</Badge>
                    <div className="text-right">
                      <p className="text-sm font-semibold">{formatCurrency(inv.totalHT)}</p>
                      <p className="text-xs text-muted-foreground">HT</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
