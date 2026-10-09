// Server-side proxy to Open Beauty Facts (ODbL). Sends only the barcode or product name the user typed; no photo, profile or ingredient list.
// Logs counts/timings only.
const OBF = "https://world.openbeautyfacts.org";
const UA = "BeautyLens/0.1 (reference lookup)";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const barcode = (u.searchParams.get("barcode") ?? "").replace(/\D/g, ""), q = (u.searchParams.get("q") ?? "").trim().slice(0, 80);
  if (!barcode && !q) return Response.json({ error: "barcode or q required" }, { status: 400 });
  const t0 = Date.now();
  try {
    const url = barcode
      ? `${OBF}/api/v2/product/${barcode}.json?fields=code,product_name,brands,ingredients_text`
      : `${OBF}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=6&fields=code,product_name,brands,ingredients_text`;
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const j = (await res.json()) as { product?: Record<string, string>; products?: Record<string, string>[]; status?: number };
    const list = barcode ? (j.status === 1 && j.product ? [j.product] : []) : (j.products ?? []);
    const products = list.map((p) => ({ code: p.code, name: p.product_name ?? "", brands: p.brands ?? "", ingredients_text: p.ingredients_text ?? "", url: `${OBF}/product/${p.code}` }));
    console.log(`reference lookup kind=${barcode ? "barcode" : "name"} results=${products.length} ms=${Date.now() - t0}`);
    return Response.json({ source: "Open Beauty Facts", license: "ODbL (Open Database License)", licenseUrl: "https://opendatacommons.org/licenses/odbl/1-0/", crowdSourced: true, products });
  } catch {
    console.log(`reference lookup failed ms=${Date.now() - t0}`);
    return Response.json({ source: "Open Beauty Facts", error: "unavailable", products: [] }, { status: 502 });
  }
}
