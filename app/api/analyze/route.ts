import { analyzeBaseline } from "@/lib/baseline";

// Baseline (Phase 0) contract: { text: string } -> { items }. Logs counts/timings only.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { text?: unknown } | null;
  if (!body || typeof body.text !== "string" || body.text.length > 20000) {
    return Response.json({ error: "text (string, <=20000 chars) required" }, { status: 400 });
  }
  const t0 = Date.now();
  const items = await analyzeBaseline(body.text);
  console.log(`analyze items=${items.length} ms=${Date.now() - t0}`);
  return Response.json({ items });
}
