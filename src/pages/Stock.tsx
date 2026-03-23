import { useState, useRef } from "react"
import { Plus, Upload, Pencil, Trash2, AlertTriangle, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { useStockStore } from "@/store/stockStore"
import type { StockItem } from "@/types"
import { formatCurrency, generateId } from "@/lib/utils"

const EMPTY_FORM: Omit<StockItem, "id" | "updatedAt"> = {
  reference: "",
  name: "",
  category: "",
  quantity: 0,
  unitCostHT: 0,
  unitPriceTTC: undefined,
  reorderPoint: undefined,
  supplier: "",
  notes: "",
}

function parseCSV(text: string): Omit<StockItem, "id" | "updatedAt">[] {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []

  // Detect separator (comma or semicolon — Google Sheets exports both)
  const sep = lines[0].includes(";") ? ";" : ","

  const header = lines[0].split(sep).map((h) => h.trim().toLowerCase().replace(/"/g, ""))
  const rows: Omit<StockItem, "id" | "updatedAt">[] = []

  const col = (row: string[], keys: string[]) => {
    for (const k of keys) {
      const i = header.indexOf(k)
      if (i !== -1) return row[i]?.replace(/"/g, "").trim() ?? ""
    }
    return ""
  }

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(sep)
    if (cells.every((c) => !c.trim())) continue
    const numVal = (s: string) => parseFloat(s.replace(",", ".")) || 0
    rows.push({
      reference: col(cells, ["reference", "ref", "sku", "code"]),
      name: col(cells, ["name", "nom", "produit", "article", "designation", "désignation"]),
      category: col(cells, ["category", "categorie", "catégorie", "type"]),
      quantity: numVal(col(cells, ["quantity", "quantite", "quantité", "qte", "qty", "stock"])),
      unitCostHT: numVal(col(cells, ["unit_cost", "cout_unitaire", "coût unitaire", "prix ht", "prix_ht", "cost"])),
      unitPriceTTC: numVal(col(cells, ["unit_price", "prix_ttc", "prix ttc", "price"])) || undefined,
      reorderPoint: numVal(col(cells, ["reorder", "seuil", "minimum"])) || undefined,
      supplier: col(cells, ["supplier", "fournisseur"]),
      notes: col(cells, ["notes", "remarques", "note"]),
    })
  }
  return rows.filter((r) => r.name)
}

export function Stock() {
  const { items, addItem, updateItem, deleteItem, importItems } = useStockStore()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<StockItem | null>(null)
  const [form, setForm] = useState<Omit<StockItem, "id" | "updatedAt">>(EMPTY_FORM)
  const [search, setSearch] = useState("")
  const [importError, setImportError] = useState<string | null>(null)

  const openNew = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setOpen(true)
  }

  const openEdit = (item: StockItem) => {
    setEditing(item)
    setForm({ ...item })
    setOpen(true)
  }

  const handleSave = () => {
    if (!form.name) return
    const now = new Date().toISOString()
    if (editing) {
      updateItem(editing.id, { ...form, updatedAt: now })
    } else {
      addItem({ ...form, id: generateId(), updatedAt: now })
    }
    setOpen(false)
  }

  const set = (k: keyof typeof EMPTY_FORM, v: unknown) =>
    setForm((p) => ({ ...p, [k]: v }))

  const handleCSVImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportError(null)
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string
        const parsed = parseCSV(text)
        if (parsed.length === 0) {
          setImportError("Aucun produit trouvé. Vérifiez les colonnes de votre fichier.")
          return
        }
        const now = new Date().toISOString()
        importItems(parsed.map((p) => ({ ...p, id: generateId(), updatedAt: now })))
      } catch {
        setImportError("Erreur lors de la lecture du fichier CSV.")
      }
    }
    reader.readAsText(file, "UTF-8")
    e.target.value = ""
  }

  const exportCSV = () => {
    const header = [
      "Reference", "Nom", "Categorie", "Quantite", "Cout HT", "Prix TTC",
      "Seuil reappro", "Fournisseur", "Notes",
    ]
    const rows = items.map((i) => [
      i.reference, i.name, i.category, i.quantity, i.unitCostHT,
      i.unitPriceTTC ?? "", i.reorderPoint ?? "", i.supplier ?? "", i.notes ?? "",
    ])
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\n")
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `stock-export-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  const filtered = items.filter((i) => {
    const q = search.toLowerCase()
    return (
      !q ||
      i.name.toLowerCase().includes(q) ||
      i.reference.toLowerCase().includes(q) ||
      i.category.toLowerCase().includes(q) ||
      (i.supplier ?? "").toLowerCase().includes(q)
    )
  })

  const totalStockValue = items.reduce((s, i) => s + i.quantity * i.unitCostHT, 0)
  const lowStock = items.filter(
    (i) => i.reorderPoint !== undefined && i.quantity <= i.reorderPoint
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {items.length} référence{items.length > 1 ? "s" : ""} · Valeur totale :{" "}
          <strong>{formatCurrency(totalStockValue)}</strong> HT
        </p>
        <div className="flex gap-2 flex-wrap">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="sr-only"
            onChange={handleCSVImport}
          />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-2">
            <Upload className="h-4 w-4" /> Import CSV
          </Button>
          {items.length > 0 && (
            <Button variant="outline" onClick={exportCSV} className="gap-2">
              <Download className="h-4 w-4" /> Export CSV
            </Button>
          )}
          <Button onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" /> Ajouter un produit
          </Button>
        </div>
      </div>

      {/* Import hint */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
        <strong>Import Google Sheets :</strong> Fichier → Télécharger → Format CSV (.csv).
        Colonnes reconnues : reference, nom, categorie, quantite, cout_ht, prix_ttc, seuil, fournisseur.
      </div>

      {importError && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {importError}
        </div>
      )}

      {/* Low stock warning */}
      {lowStock.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            <strong>{lowStock.length} produit{lowStock.length > 1 ? "s" : ""}</strong> sous le seuil de réapprovisionnement :{" "}
            {lowStock.map((i) => i.name).join(", ")}
          </p>
        </div>
      )}

      {/* Search */}
      <Input
        placeholder="Rechercher par nom, référence, fournisseur..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {/* Table */}
      <div className="rounded-lg border bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Référence</TableHead>
              <TableHead>Produit</TableHead>
              <TableHead>Catégorie</TableHead>
              <TableHead className="text-right">Qté</TableHead>
              <TableHead className="text-right">Coût HT/u</TableHead>
              <TableHead className="text-right">Valeur stock</TableHead>
              <TableHead>Fournisseur</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                  {items.length === 0
                    ? "Aucun produit. Importez un CSV ou ajoutez manuellement."
                    : "Aucun résultat."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((item) => {
                const stockValue = item.quantity * item.unitCostHT
                const isLow =
                  item.reorderPoint !== undefined && item.quantity <= item.reorderPoint
                return (
                  <TableRow key={item.id}>
                    <TableCell className="text-xs text-muted-foreground font-mono">
                      {item.reference || "—"}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{item.name}</p>
                        {item.notes && (
                          <p className="text-xs text-muted-foreground">{item.notes}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {item.category && (
                        <Badge variant="outline" className="text-xs">{item.category}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={isLow ? "text-amber-600 font-semibold" : "font-medium"}>
                        {item.quantity}
                      </span>
                      {isLow && (
                        <AlertTriangle className="inline-block ml-1 h-3.5 w-3.5 text-amber-500" />
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {formatCurrency(item.unitCostHT)}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-sm">
                      {formatCurrency(stockValue)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {item.supplier || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost" size="icon" className="h-8 w-8"
                          onClick={() => openEdit(item)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => deleteItem(item.id)}
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
          {items.length > 0 && (
            <tfoot>
              <TableRow className="bg-muted/50 font-semibold">
                <TableCell colSpan={5}>Valeur totale du stock</TableCell>
                <TableCell className="text-right">{formatCurrency(totalStockValue)}</TableCell>
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
            <DialogTitle>{editing ? "Modifier le produit" : "Nouveau produit"}</DialogTitle>
            <DialogDescription>Informations de stock</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Référence / SKU</Label>
                <Input value={form.reference} onChange={(e) => set("reference", e.target.value)} placeholder="REF-001" />
              </div>
              <div className="space-y-1.5">
                <Label>Catégorie</Label>
                <Input value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="Électronique..." />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Nom du produit *</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Nom du produit" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Quantité en stock</Label>
                <Input type="number" value={form.quantity} onChange={(e) => set("quantity", Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label>Seuil réappro</Label>
                <Input type="number" value={form.reorderPoint ?? ""} onChange={(e) => set("reorderPoint", Number(e.target.value) || undefined)} placeholder="Optionnel" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Coût unitaire HT (€)</Label>
                <Input type="number" step="0.01" value={form.unitCostHT} onChange={(e) => set("unitCostHT", parseFloat(e.target.value) || 0)} />
              </div>
              <div className="space-y-1.5">
                <Label>Prix vente TTC (€)</Label>
                <Input type="number" step="0.01" value={form.unitPriceTTC ?? ""} onChange={(e) => set("unitPriceTTC", parseFloat(e.target.value) || undefined)} placeholder="Optionnel" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Fournisseur</Label>
              <Input value={form.supplier ?? ""} onChange={(e) => set("supplier", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
            </div>
            {form.unitCostHT > 0 && form.quantity > 0 && (
              <div className="rounded-lg bg-muted/40 p-3 text-xs">
                Valeur stock : <strong>{formatCurrency(form.quantity * form.unitCostHT)}</strong> HT
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={!form.name}>
              {editing ? "Enregistrer" : "Ajouter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
