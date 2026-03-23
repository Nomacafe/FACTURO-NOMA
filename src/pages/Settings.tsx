import { useState } from "react"
import { Trash2, AlertTriangle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { useInvoiceStore } from "@/store/invoiceStore"

export function Settings() {
  const { invoices, clearAll } = useInvoiceStore()
  const [companyName, setCompanyName] = useState(
    () => localStorage.getItem("facturo_company") ?? ""
  )
  const [siret, setSiret] = useState(
    () => localStorage.getItem("facturo_siret") ?? ""
  )
  const [confirmClear, setConfirmClear] = useState(false)

  const saveCompany = () => {
    localStorage.setItem("facturo_company", companyName)
    localStorage.setItem("facturo_siret", siret)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Company info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Informations société</CardTitle>
          <CardDescription>Utilisées pour les exports et rapports</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Raison sociale</Label>
            <Input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Ma Société SAS"
            />
          </div>
          <div className="space-y-1.5">
            <Label>SIRET</Label>
            <Input
              value={siret}
              onChange={(e) => setSiret(e.target.value)}
              placeholder="123 456 789 00012"
              maxLength={14}
            />
          </div>
          <Button onClick={saveCompany}>Enregistrer</Button>
        </CardContent>
      </Card>

      {/* Données */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gestion des données</CardTitle>
          <CardDescription>
            {invoices.length} facture{invoices.length > 1 ? "s" : ""} stockée{invoices.length > 1 ? "s" : ""} localement dans votre navigateur
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Separator className="mb-4" />
          <div className="flex items-start gap-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-destructive">Supprimer toutes les données</p>
              <p className="text-xs text-muted-foreground mt-1 mb-3">
                Cette action est irréversible. Exportez vos données en CSV avant de procéder.
              </p>
              {!confirmClear ? (
                <Button variant="destructive" size="sm" onClick={() => setConfirmClear(true)} className="gap-2">
                  <Trash2 className="h-3.5 w-3.5" />
                  Supprimer tout
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="text-xs font-medium text-destructive">Confirmer la suppression ?</p>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      clearAll()
                      setConfirmClear(false)
                    }}
                  >
                    Oui, supprimer
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setConfirmClear(false)}>
                    Annuler
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">À propos</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p><strong>Facturo</strong> — Gestion des dépenses et TVA</p>
          <p>Taux TVA français : 20% · 10% · 5,5% · 2,1%</p>
          <p>Données stockées localement dans votre navigateur (localStorage).</p>
          <p>Aucune donnée envoyée sur un serveur.</p>
        </CardContent>
      </Card>
    </div>
  )
}
