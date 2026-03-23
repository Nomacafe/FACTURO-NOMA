import { useState } from "react"
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Euro } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { useFixedExpenseStore } from "@/store/fixedExpenseStore"
import type { FixedExpense, FixedExpenseFrequency, TVARate } from "@/types"
import {
  FIXED_EXPENSE_CATEGORIES,
  TVA_RATES,
  TVA_RATE_LABELS,
  monthlyAmount,
} from "@/types"
import { formatCurrency, generateId } from "@/lib/utils"

const FREQ_LABELS: Record<FixedExpenseFrequency, string> = {
  monthly: "Mensuel",
  quarterly: "Trimestriel",
  annual: "Annuel",
}

const EMPTY_FORM: Omit<FixedExpense, "id"> = {
  name: "",
  category: "Autre",
  amountHT: 0,
  tvaRate: 20,
  frequency: "monthly",
  startDate: new Date().toISOString().slice(0, 10),
  active: true,
  notes: "",
}

export function FixedExpenses() {
  const { expenses, addExpense, updateExpense, deleteExpense, toggleActive } =
    useFixedExpenseStore()

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<FixedExpense | null>(null)
  const [form, setForm] = useState<Omit<FixedExpense, "id">>(EMPTY_FORM)

  const openNew = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setOpen(true)
  }

  const openEdit = (expense: FixedExpense) => {
    setEditing(expense)
    setForm({ ...expense })
    setOpen(true)
  }

  const handleSave = () => {
    if (!form.name || form.amountHT <= 0) return
    if (editing) {
      updateExpense(editing.id, form)
    } else {
      addExpense({ ...form, id: generateId() })
    }
    setOpen(false)
  }

  const set = (k: keyof typeof EMPTY_FORM, v: unknown) =>
    setForm((p) => ({ ...p, [k]: v }))

  const activeExpenses = expenses.filter((e) => e.active)
  const totalMonthlyHT = activeExpenses.reduce((s, e) => s + monthlyAmount(e), 0)
  const totalMonthlyTVA = activeExpenses.reduce(
    (s, e) => s + monthlyAmount(e) * (e.tvaRate / 100),
    0
  )
  const totalAnnualHT = totalMonthlyHT * 12

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {expenses.length} charge{expenses.length > 1 ? "s" : ""} enregistrée{expenses.length > 1 ? "s" : ""}
        </p>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" /> Ajouter une charge
        </Button>
      </div>

      {/* Summary strip */}
      {expenses.length > 0 && (
        <div className="grid grid-cols-3 gap-4 rounded-xl border bg-white p-4">
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-0.5">Charges fixes / mois</p>
            <p className="text-xl font-bold">{formatCurrency(totalMonthlyHT)}</p>
            <p className="text-xs text-muted-foreground">HT</p>
          </div>
          <div className="text-center border-x">
            <p className="text-xs text-muted-foreground mb-0.5">TVA déductible / mois</p>
            <p className="text-xl font-bold text-amber-600">{formatCurrency(totalMonthlyTVA)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-0.5">Total annuel estimé</p>
            <p className="text-xl font-bold">{formatCurrency(totalAnnualHT)}</p>
            <p className="text-xs text-muted-foreground">HT</p>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Charge</TableHead>
              <TableHead>Catégorie</TableHead>
              <TableHead>Fréquence</TableHead>
              <TableHead className="text-right">Montant HT</TableHead>
              <TableHead className="text-right">TVA</TableHead>
              <TableHead className="text-right">/ mois HT</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {expenses.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                  Aucune charge fixe. Ajoutez votre loyer, abonnements, banque...
                </TableCell>
              </TableRow>
            ) : (
              expenses.map((expense) => {
                const monthly = monthlyAmount(expense)
                return (
                  <TableRow key={expense.id} className={!expense.active ? "opacity-50" : ""}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{expense.name}</p>
                        {expense.notes && (
                          <p className="text-xs text-muted-foreground">{expense.notes}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{expense.category}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {FREQ_LABELS[expense.frequency]}
                    </TableCell>
                    <TableCell className="text-right font-medium text-sm">
                      {formatCurrency(expense.amountHT)}
                    </TableCell>
                    <TableCell className="text-right text-sm text-amber-600">
                      {expense.tvaRate}%
                    </TableCell>
                    <TableCell className="text-right font-semibold text-sm">
                      {formatCurrency(monthly)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={expense.active ? "success" : "secondary"}>
                        {expense.active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => toggleActive(expense.id)}
                          title={expense.active ? "Désactiver" : "Activer"}
                        >
                          {expense.active ? (
                            <ToggleRight className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEdit(expense)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => deleteExpense(expense.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
          {expenses.length > 0 && (
            <tfoot>
              <TableRow className="bg-muted/50 font-semibold">
                <TableCell colSpan={5}>
                  Total mensuel (charges actives)
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(totalMonthlyHT)}
                </TableCell>
                <TableCell colSpan={2} />
              </TableRow>
            </tfoot>
          )}
        </Table>
      </div>

      {/* Form Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Modifier la charge" : "Nouvelle charge fixe"}
            </DialogTitle>
            <DialogDescription>
              Loyer, abonnements, banque, salaires...
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="space-y-1.5">
              <Label>Nom de la charge *</Label>
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Loyer bureau, Abonnement Slack..."
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Catégorie</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => set("category", v)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FIXED_EXPENSE_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Fréquence</Label>
                <Select
                  value={form.frequency}
                  onValueChange={(v) => set("frequency", v as FixedExpenseFrequency)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Mensuel</SelectItem>
                    <SelectItem value="quarterly">Trimestriel</SelectItem>
                    <SelectItem value="annual">Annuel</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Montant HT (€) *</Label>
                <div className="relative">
                  <Euro className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="number"
                    step="0.01"
                    className="pl-9"
                    value={form.amountHT || ""}
                    placeholder="0.00"
                    onChange={(e) => set("amountHT", parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Taux TVA</Label>
                <Select
                  value={String(form.tvaRate)}
                  onValueChange={(v) => set("tvaRate", Number(v) as TVARate)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TVA_RATES.map((r) => (
                      <SelectItem key={r} value={String(r)}>{TVA_RATE_LABELS[r]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Date de début</Label>
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => set("startDate", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Date de fin (optionnel)</Label>
                <Input
                  type="date"
                  value={form.endDate ?? ""}
                  onChange={(e) => set("endDate", e.target.value || undefined)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Notes (optionnel)</Label>
              <Input
                value={form.notes ?? ""}
                placeholder="Remarques..."
                onChange={(e) => set("notes", e.target.value)}
              />
            </div>

            {form.amountHT > 0 && (
              <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Montant HT</span>
                  <span className="font-medium">{formatCurrency(form.amountHT)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    TVA ({form.tvaRate}%)
                  </span>
                  <span className="font-medium text-amber-600">
                    {formatCurrency(form.amountHT * (form.tvaRate / 100))}
                  </span>
                </div>
                <div className="flex justify-between font-semibold border-t pt-1">
                  <span>Équivalent mensuel HT</span>
                  <span>{formatCurrency(monthlyAmount({ ...form, id: "" }))}</span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={!form.name || form.amountHT <= 0}>
              {editing ? "Enregistrer" : "Ajouter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
