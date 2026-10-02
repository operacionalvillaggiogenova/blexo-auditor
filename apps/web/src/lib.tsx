import type { AuthUser } from "@blexo/contracts";
import { createContext, useCallback, useContext, useEffect, useState, type FormEvent, type ReactNode } from "react";

export class ApiError extends Error {
  constructor(message: string, public code = "REQUEST_FAILED", public status = 0) { super(message); }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData)) headers.set("content-type", "application/json");
  const response = await fetch(`/api${path}`, { ...init, headers, credentials: "same-origin" });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
    throw new ApiError(payload?.error?.message ?? "Não foi possível concluir a solicitação.", payload?.error?.code, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api<{ user: AuthUser }>("/auth/me").then((data) => setUser(data.user)).catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);
  const login = useCallback(async (email: string, password: string) => {
    const data = await api<{ user: AuthUser }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    setUser(data.user);
  }, []);
  const logout = useCallback(async () => {
    await api("/auth/logout", { method: "POST" });
    setUser(null);
  }, []);
  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("AuthProvider ausente");
  return context;
}

export function useApiData<T>(path: string | null, initial: T) {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    if (!path) { setLoading(false); return; }
    setLoading(true); setError("");
    try { setData(await api<T>(path)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Erro inesperado"); }
    finally { setLoading(false); }
  }, [path]);
  useEffect(() => { void reload(); }, [reload]);
  return { data, loading, error, reload, setData };
}

export function useFormAction(onSuccess?: () => void | Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setMessage("");
    try { await action(); setMessage("Salvo com sucesso."); await onSuccess?.(); return true; }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Erro inesperado"); return false; }
    finally { setBusy(false); }
  };
  return { busy, message, run, setMessage };
}

export function field(form: HTMLFormElement, name: string) {
  return String(new FormData(form).get(name) ?? "").trim();
}

export function cents(value: string): number {
  const normalized = value.replace(/\./g, "").replace(",", ".");
  return Math.round(Number(normalized || 0) * 100);
}

export function money(value: unknown): string {
  const number = Number(value ?? 0) / 100;
  return number.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function dateBr(value: unknown): string {
  if (!value) return "—";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  return day && month && year ? `${day}/${month}/${year}` : String(value);
}

export function submit(handler: (form: HTMLFormElement) => void | Promise<void>) {
  return (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void handler(event.currentTarget); };
}

export type Row = Record<string, unknown>;
