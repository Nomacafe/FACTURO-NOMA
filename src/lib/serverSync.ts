import { useInvoiceStore } from "@/store/invoiceStore"
import { useFixedExpenseStore } from "@/store/fixedExpenseStore"
import { useRevenueStore } from "@/store/revenueStore"
import { API_BASE } from "@/lib/api"
import { authHeader } from "@/store/authStore"

let saveTimer: ReturnType<typeof setTimeout> | null = null

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(pushToServer, 1500)
}

export async function pushToServer() {
  try {
    await fetch(`${API_BASE}/api/store`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({
        invoices: useInvoiceStore.getState().invoices,
        expenses: useFixedExpenseStore.getState().expenses,
        revenues: useRevenueStore.getState().revenues,
      }),
    })
  } catch {
    // Serveur indisponible — les données restent dans localStorage
  }
}

export async function pullFromServer(): Promise<{ synced: boolean; hasServerData: boolean }> {
  try {
    const resp = await fetch(`${API_BASE}/api/store`, { headers: authHeader() })
    if (!resp.ok) return { synced: false, hasServerData: false }
    const data = await resp.json()
    const hasServerData = Array.isArray(data.invoices) || Array.isArray(data.expenses) || Array.isArray(data.revenues)
    // On écrase uniquement si le serveur a des données
    if (Array.isArray(data.invoices)) useInvoiceStore.setState({ invoices: data.invoices })
    if (Array.isArray(data.expenses)) useFixedExpenseStore.setState({ expenses: data.expenses })
    if (Array.isArray(data.revenues)) useRevenueStore.setState({ revenues: data.revenues })
    return { synced: true, hasServerData }
  } catch {
    return { synced: false, hasServerData: false }
  }
}

export function initServerSync() {
  useInvoiceStore.subscribe(scheduleSave)
  useFixedExpenseStore.subscribe(scheduleSave)
  useRevenueStore.subscribe(scheduleSave)
}
