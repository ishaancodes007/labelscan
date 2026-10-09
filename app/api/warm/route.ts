// Wakes a sleeping Python service (free hosting tiers sleep when idle) as soon as someone opens /analyze. Sends nothing, returns nothing useful.
export async function GET() {
  const base = process.env.PYTHON_API_BASE_URL;
  if (base) { try { await fetch(`${base.replace(/\/$/, "")}/healthz`, { signal: AbortSignal.timeout(4000), cache: "no-store" }); } catch { /* it is waking up; /api/analyze waits for it */ } }
  return Response.json({ ok: true });
}
