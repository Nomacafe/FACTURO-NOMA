import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { Virement } from "@/types"

interface VirementStore {
  virements: Virement[]
  addVirement: (v: Virement) => void
  updateVirement: (v: Virement) => void
  deleteVirement: (id: string) => void
}

export const useVirementStore = create<VirementStore>()(
  persist(
    (set) => ({
      virements: [],
      addVirement: (v) => set((s) => ({ virements: [...s.virements, v] })),
      updateVirement: (v) => set((s) => ({ virements: s.virements.map((x) => x.id === v.id ? v : x) })),
      deleteVirement: (id) => set((s) => ({ virements: s.virements.filter((v) => v.id !== id) })),
    }),
    { name: "facturo-virements" }
  )
)
