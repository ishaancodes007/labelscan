import type { ResolveRequest, ResolveResponse } from "./resolverTypes";

// Server-only. PYTHON_API_BASE_URL is never exposed to the browser. Returns null on any failure so the caller
// can fall back to the TypeScript path ("Enhanced recognition unavailable.").
export async function resolveIdentities(req: ResolveRequest, timeoutMs = Number(process.env.RESOLVER_TIMEOUT_MS) || 8000): Promise<ResolveResponse | null> {
  const base = process.env.PYTHON_API_BASE_URL;
  if (!base) return null;
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/v1/ingredients/resolve`, {
      method: "POST", headers: { "content-type": "application/json", ...(process.env.PYTHON_API_TOKEN ? { "x-service-token": process.env.PYTHON_API_TOKEN } : {}) },
      body: JSON.stringify(req), signal: AbortSignal.timeout(timeoutMs), cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as ResolveResponse;
  } catch {
    return null;
  }
}
