import { useEffect } from "react"
import { BrowserRouter, Routes, Route } from "react-router-dom"
import { Layout } from "@/components/layout/Layout"
import { Dashboard } from "@/pages/Dashboard"
import { Invoices } from "@/pages/Invoices"
import { FixedExpenses } from "@/pages/FixedExpenses"
import { Stock } from "@/pages/Stock"
import { TVAPage } from "@/pages/TVAPage"
import { Revenue } from "@/pages/Revenue"
import { Budget } from "@/pages/Budget"
import { Settings } from "@/pages/Settings"
import { Import } from "@/pages/Import"
import { Login } from "@/pages/Login"
import { ProtectedRoute } from "@/components/ProtectedRoute"
import { useFixedExpenseStore } from "@/store/fixedExpenseStore"
import { useInvoiceStore } from "@/store/invoiceStore"
import { useRevenueStore } from "@/store/revenueStore"
import { seedStores } from "@/lib/seed"
import { pullFromServer, initServerSync } from "@/lib/serverSync"

function SeedInitializer() {
  const { addExpense } = useFixedExpenseStore()
  const { addInvoice } = useInvoiceStore()
  const { setMonthRevenue } = useRevenueStore()

  useEffect(() => {
    const init = async () => {
      // 1. Charger depuis le serveur (source de vérité)
      await pullFromServer()
      // 2. Seed les données par défaut si vide (utilise l'état après pull)
      const currentExpenses = useFixedExpenseStore.getState().expenses
      const currentInvoices = useInvoiceStore.getState().invoices
      const currentRevenues = useRevenueStore.getState().revenues
      seedStores(currentExpenses, currentInvoices, currentRevenues, addExpense, addInvoice, setMonthRevenue)
      // 3. Synchroniser chaque modification vers le serveur
      initServerSync()
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <SeedInitializer />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/factures" element={<Invoices />} />
          <Route path="/charges-fixes" element={<FixedExpenses />} />
          <Route path="/stock" element={<Stock />} />
          <Route path="/tva" element={<TVAPage />} />
          <Route path="/resultat" element={<Revenue />} />
          <Route path="/budget" element={<Budget />} />
          <Route path="/parametres" element={<Settings />} />
          <Route path="/import" element={<Import />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
