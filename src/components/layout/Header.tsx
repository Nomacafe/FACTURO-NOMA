import { useLocation, useNavigate } from "react-router-dom"
import { Bell, HelpCircle, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuthStore } from "@/store/authStore"

const PAGE_TITLES: Record<string, { title: string; subtitle: string }> = {
  "/": { title: "Tableau de bord", subtitle: "Vue d'ensemble de votre activité" },
  "/factures": { title: "Factures variables", subtitle: "Vos dépenses facturées" },
  "/charges-fixes": { title: "Charges fixes", subtitle: "Loyer, banque, abonnements..." },
  "/stock": { title: "Gestion du stock", subtitle: "Inventaire et valorisation" },
  "/tva": { title: "Déclaration TVA", subtitle: "TVA collectée vs déductible" },
  "/resultat": { title: "CA & Résultat", subtitle: "Chiffre d'affaires et calcul IS" },
  "/budget": { title: "Budget mensuel", subtitle: "Suivi des enveloppes budgétaires" },
  "/parametres": { title: "Paramètres", subtitle: "Configuration de votre espace" },
  "/import": { title: "Import Google Sheets", subtitle: "Prévisualisation et import de vos données existantes" },
}

export function Header() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { username, logout } = useAuthStore()
  const page = PAGE_TITLES[pathname] ?? { title: "Facturo", subtitle: "" }

  const handleLogout = () => {
    logout()
    navigate("/login")
  }

  return (
    <header className="fixed left-64 right-0 top-0 z-10 flex h-16 items-center justify-between border-b bg-white px-6">
      <div>
        <h1 className="text-base font-semibold leading-none text-foreground">{page.title}</h1>
        {page.subtitle && (
          <p className="text-xs text-muted-foreground mt-0.5">{page.subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" aria-label="Aide">
          <HelpCircle className="h-5 w-5 text-muted-foreground" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Notifications">
          <Bell className="h-5 w-5 text-muted-foreground" />
        </Button>
        <div className="h-4 w-px bg-border" />
        <span className="text-xs text-muted-foreground font-medium">{username}</span>
        <Button variant="ghost" size="icon" aria-label="Déconnexion" onClick={handleLogout}>
          <LogOut className="h-4 w-4 text-muted-foreground" />
        </Button>
      </div>
    </header>
  )
}
