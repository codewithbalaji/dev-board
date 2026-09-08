import * as React from "react";

import { apiFetch } from "@/api/client";
import { type AuthUser, useAuthStore } from "@/stores/auth-store";

interface AuthResponse {
  user: AuthUser;
  token?: string;
}

export interface UseAuthResult {
  user: AuthUser | null;
  isLoading: boolean;
  error: string | null;
  retryAfter: number | null;
  login(email: string, password: string, turnstileToken: string): Promise<boolean>;
  register(name: string, email: string, password: string, turnstileToken: string): Promise<boolean>;
  logout(): void;
}

function extractErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong";
}

function extractRetryAfter(err: unknown): number | null {
  const retryAfter = (err as { retryAfter?: number } | null)?.retryAfter;
  return typeof retryAfter === "number" ? retryAfter : null;
}

export function useAuth(): UseAuthResult {
  const user = useAuthStore((s) => s.user);
  const setSession = useAuthStore((s) => s.setSession);
  const clearSession = useAuthStore((s) => s.clearSession);
  const [isLoading, setIsLoading] = React.useState(useAuthStore.getState().token !== null);
  const [error, setError] = React.useState<string | null>(null);
  const [retryAfter, setRetryAfter] = React.useState<number | null>(null);

  React.useEffect(() => {
    const storedToken = useAuthStore.getState().token;
    if (!storedToken) {
      setIsLoading(false);
      return;
    }
    apiFetch<AuthResponse>("/api/auth/me")
      .then((data) => setSession({ token: storedToken, user: data.user }))
      .catch(() => clearSession())
      .finally(() => setIsLoading(false));
    // Runs once on mount to revalidate a stored token — not on every session change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = React.useCallback(
    async (email: string, password: string, turnstileToken: string) => {
      setError(null);
      setRetryAfter(null);
      try {
        const data = await apiFetch<AuthResponse>("/api/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password, turnstileToken }),
          skipAuth: true,
        });
        setSession({ token: data.token ?? null, user: data.user });
        return true;
      } catch (err) {
        setError(extractErrorMessage(err));
        setRetryAfter(extractRetryAfter(err));
        return false;
      }
    },
    [setSession],
  );

  const register = React.useCallback(
    async (name: string, email: string, password: string, turnstileToken: string) => {
      setError(null);
      setRetryAfter(null);
      try {
        const data = await apiFetch<AuthResponse>("/api/auth/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name, email, password, turnstileToken }),
          skipAuth: true,
        });
        setSession({ token: data.token ?? null, user: data.user });
        return true;
      } catch (err) {
        setError(extractErrorMessage(err));
        setRetryAfter(extractRetryAfter(err));
        return false;
      }
    },
    [setSession],
  );

  const logout = React.useCallback(() => {
    clearSession();
  }, [clearSession]);

  return { user, isLoading, error, retryAfter, login, register, logout };
}
