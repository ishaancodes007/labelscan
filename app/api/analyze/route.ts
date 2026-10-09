import { analyzeBaseline } from "@/lib/baseline";
import { resolveIdentities } from "@/lib/resolverClient";

// Contract: { text: string, useAgent?: boolean } -> { engine, items, removed?, meta?, notice? }.
// engine "enhanced": identities from the Python service. engine "fallback": TypeScript starter path
// (exact seed match + PubChem name lookup); the notice must be shown to the user. Logs counts/timings only.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { text?: unknown; useAgent?: unknown; noMerge?: unknown } | null;
  if (!body || typeof body.text !== "string" || body.text.length > 20000) {
    return Response.json({ error: "text (string, <=20000 chars) required" }, { status: 400 });
  }
  const t0 = Date.now();
  const enhanced = await resolveIdentities({ tokens: [{ index: 0, raw: body.text }], useAgent: body.useAgent === true, noMerge: Array.isArray(body.noMerge) ? body.noMerge.filter((x): x is string => typeof x === "string").slice(0, 50) : [] });
  if (enhanced) {
    console.log(`analyze engine=enhanced items=${enhanced.items.length} removed=${enhanced.removed.length} ms=${Date.now() - t0}`);
    return Response.json({ engine: "enhanced", ...enhanced });
  }
  const items = await analyzeBaseline(body.text);
  console.log(`analyze engine=fallback items=${items.length} ms=${Date.now() - t0}`);
  return Response.json({ engine: "fallback", notice: "Enhanced recognition unavailable.", items });
}
