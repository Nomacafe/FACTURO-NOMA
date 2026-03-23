import { NavLink } from "react-router-dom"
import {
  LayoutDashboard,
  Receipt,
  Calculator,
  Settings,
  Building2,
  PackageSearch,
  RepeatIcon,
  TrendingUp,
  PieChart,
  FileSpreadsheet,
} from "lucide-react"
import { cn } from "@/lib/utils"

const NAV_GROUPS = [
  {
    label: "Vue globale",
    items: [
      { to: "/", icon: LayoutDashboard, label: "Tableau de bord", end: true },
      { to: "/resultat", icon: TrendingUp, label: "CA & Résultat" },
      { to: "/budget", icon: PieChart, label: "Budget" },
    ],
  },
  {
    label: "Dépenses",
    items: [
      { to: "/factures", icon: Receipt, label: "Factures variables" },
      { to: "/charges-fixes", icon: RepeatIcon, label: "Charges fixes" },
    ],
  },
  {
    label: "Opérations",
    items: [
      { to: "/stock", icon: PackageSearch, label: "Stock" },
      { to: "/tva", icon: Calculator, label: "Déclaration TVA" },
    ],
  },
  {
    label: "Données",
    items: [
      { to: "/import", icon: FileSpreadsheet, label: "Import Google Sheets" },
      { to: "/parametres", icon: Settings, label: "Paramètres" },
    ],
  },
]

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-20 flex w-64 flex-col border-r bg-white">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2.5 border-b px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
          <Building2 className="h-4 w-4 text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold leading-none text-foreground">Facturo</p>
          <p className="text-xs text-muted-foreground">Pilotage SAS</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map(({ to, icon: Icon, label, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t px-4 py-3">
        <p className="text-xs text-muted-foreground">SAS France · IS 15%/25% · TVA</p>
      </div>
    </aside>
  )
}
