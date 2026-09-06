import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  setSession: (session: { token: string | null; user: AuthUser | null }) => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setSession: ({ token, user }) => set({ token, user }),
      clearSession: () => set({ token: null, user: null }),
    }),
    { name: "devboard.session" },
  ),
);

// For non-component call sites (api/client.ts isn't a hook) — zustand stores
// support reading outside React via getState().
export function getToken(): string | null {
  return useAuthStore.getState().token;
}
