// PubChem PUG-REST name lookup (identity confirmation only). Returns "unavailable" on any network error.
export type PubChemResult = { status: "match"; cid: number } | { status: "not_found" } | { status: "unavailable" };

export async function pubchemByName(name: string): Promise<PubChemResult> {
  try {
    const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(name)}/cids/JSON`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (res.status === 404) return { status: "not_found" };
    if (!res.ok) return { status: "unavailable" };
    const j = (await res.json()) as { IdentifierList?: { CID?: number[] } };
    const cid = j.IdentifierList?.CID?.[0];
    return cid ? { status: "match", cid } : { status: "not_found" };
  } catch {
    return { status: "unavailable" };
  }
}
