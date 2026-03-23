import { create } from "zustand"
import { persist } from "zustand/middleware"

interface AuthStore {
  token: string | null
  username: string | null
  login: (token: string, username: string) => void
  logout: () => void
  isAuthenticated: () => boolean
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      token: null,
      username: null,
      login: (token, username) => set({ token, username }),
      logout: () => set({ token: null, username: null }),
      isAuthenticated: () => !!get().token,
    }),
    { name: "facturo-auth" }
  )
)

export function authHeader(): Record<string, string> {
  const token = useAuthStore.getState().token
  return token ? { Authorization: `Bearer ${token}` } : {}
}
