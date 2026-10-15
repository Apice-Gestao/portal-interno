import { DomainError } from "@apice/domain";
import type { TvFeed } from "@apice/domain";

const base = import.meta.env.VITE_API_BASE ?? "/api/v1";

async function request<T>(path: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${base}${path}`, {
      method: body === undefined ? "GET" : "POST",
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
      headers:
        body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      // Device responses never expose a raw server error, session or credential.
      throw new DomainError(
        "TV_UNAVAILABLE",
        "Não foi possível conectar este painel.",
        response.status,
      );
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new Error(
      "Não foi possível conectar ao servidor. Tentaremos novamente.",
      { cause: error },
    );
  } finally {
    window.clearTimeout(timer);
  }
}

export const tvWatchClient = {
  watch: () => request<TvFeed>("/tv/watch"),
  pair: (code: string) => request<{ paired: true }>("/tv/pair", { code }),
  disconnect: () => request<{ disconnected: true }>("/tv/disconnect", {}),
};
