// What an ingredient is LISTED as doing in cosmetics (CosIng-style function terms), from data/ingredient_functions.json.
// This is a role label, not proof of an effect in a given product or at a given amount, and it is separate from identity, hazard and compatibility.
import fns from "../../data/ingredient_functions.json";
import { GLOSSARY, normKey } from "../rules/data";
import type { Source } from "../rules/types";

export type FamilyId = "moisture" | "soften" | "texture" | "cleanse" | "keep" | "base" | "sun" | "scent" | "colour" | "care" | "other";
export interface Family { id: FamilyId; label: string; short: string; hue: number; blurb: string }
/** Display families. Hues are spread around the colour wheel; meaning is always carried by the text label too, never by colour alone. */
export const FAMILIES: Family[] = [
  { id: "moisture", label: "Moisture", short: "Moisture", hue: 222, blurb: "Draws in or holds water at the skin's surface." },
  { id: "soften", label: "Softening and smoothing", short: "Softening", hue: 345, blurb: "Leaves skin or hair feeling softer or smoother." },
  { id: "texture", label: "Texture and stability", short: "Texture", hue: 188, blurb: "Gives the product its body, feel and keeps it mixed." },
  { id: "cleanse", label: "Cleansing", short: "Cleansing", hue: 262, blurb: "Lifts dirt and oil, foams, or gently scrubs." },
  { id: "keep", label: "Keeps the product fresh", short: "Freshness", hue: 128, blurb: "Slows spoilage by microbes or air." },
  { id: "base", label: "Base and balance", short: "Base", hue: 245, blurb: "The liquid it is dissolved in, or what sets its acidity." },
  { id: "sun", label: "Sun filters", short: "Sun", hue: 62, blurb: "Absorbs or reflects ultraviolet light." },
  { id: "scent", label: "Scent", short: "Scent", hue: 312, blurb: "Adds or covers up smell." },
  { id: "colour", label: "Colour", short: "Colour", hue: 28, blurb: "Adds colour or tint." },
  { id: "care", label: "Skin and hair care", short: "Care", hue: 160, blurb: "Listed as conditioning, soothing or otherwise caring for skin or hair." },
  { id: "other", label: "Other roles", short: "Other", hue: 95, blurb: "Another role listed for this ingredient." },
];
const BY_ID = Object.fromEntries(FAMILIES.map((f) => [f.id, f])) as Record<FamilyId, Family>;
export const familyById = (id: FamilyId) => BY_ID[id];

// ordered: the first matching rule wins (specific terms before general ones)
const RULES: [RegExp, FamilyId][] = [
  [/SURFACTANT.*(EMULSIF|SOLUBILI)/, "texture"],
  [/ANTIFOAM|DISPERSING|PLASTICI|SLIP MODIFIER/, "texture"],
  [/LIGHT STABILI/, "keep"],
  [/DENATUR|ORAL CARE|OXIDISING/, "other"],
  [/ASTRINGENT|SKIN BRIGHTENING|ANTI-?SEBORRH/, "care"],
  [/HUMECTANT|MOISTURI[SZ]ING/, "moisture"],
  [/EMOLLIENT|SMOOTHING|OCCLUSIVE|REFATTING|LUBRICANT/, "soften"],
  [/UV (FILTER|ABSORBER)|SUNSCREEN/, "sun"],
  [/PERFUMING|FRAGRANCE|MASKING|DEODORANT|FLAVOU?RING/, "scent"],
  [/COLORANT|PIGMENT|COLOU?R/, "colour"],
  [/PRESERVATIVE|ANTIMICROBIAL|ANTIOXIDANT|CHELATING/, "keep"],
  [/SURFACTANT|CLEANSING|FOAM|ABRASIVE|EXFOLIATING|KERATOLYTIC/, "cleanse"],
  [/SOLVENT|BUFFERING|PH ADJUST|ALKALI|ACID/, "base"],
  [/VISCOSITY|EMULSIF|BINDING|FILM FORMING|OPACIFYING|BULKING|ABSORBENT|ANTICAKING|GEL|SUSPENDING|STABILI[SZ]ING|SLIP|PLASTICI/, "texture"],
  [/CONDITIONING|SOOTHING|TONIC|SKIN PROTECTING|ANTISTATIC|ANTIDANDRUFF|ANTISEBORRHEIC|HAIR/, "care"],
];
/** Which family leads when an ingredient has several: what it is most usefully known for first, scent and "other" last. */
const PRIORITY: FamilyId[] = ["moisture", "soften", "cleanse", "sun", "colour", "texture", "keep", "care", "base", "scent", "other"];
export function familyOf(fn: string): FamilyId {
  const u = fn.toUpperCase();
  for (const [re, id] of RULES) if (re.test(u)) return id;
  return "other";
}

export interface Roles { functions: string[]; families: FamilyId[]; source: Source; kind: "official" | "reference" | "secondary"; quote?: string }
interface Entry { inci: string; functions: string[]; kind: "official" | "reference" | "secondary" | "unverified"; label: string; url: string; quote?: string }
const MAP = new Map<string, Entry>();
for (const e of (fns as unknown as { entries: Entry[] }).entries) if (e.functions.length && e.kind !== "unverified" && e.url) MAP.set(normKey(e.inci), e);
export const FUNCTION_COVERAGE = MAP.size;

export function rolesFor(inci: string | null | undefined): Roles | null {
  if (!inci) return null;
  const e = MAP.get(normKey(inci));
  if (!e) return null;
  const fam = [...new Set(e.functions.map(familyOf))].sort((a, b) => PRIORITY.indexOf(a) - PRIORITY.indexOf(b));
  return { functions: e.functions, families: fam, source: { label: e.label, url: e.url }, kind: e.kind as Roles["kind"], quote: e.quote };
}

const PLAIN = new Map(GLOSSARY.terms.map((t) => [t.function.toUpperCase(), t.en]));
/** Plain-language wording for a function term (project paraphrase, not CosIng text). Falls back to the family blurb. */
export function plainFor(fn: string): string {
  const u = fn.toUpperCase();
  return PLAIN.get(u) ?? PLAIN.get(u.split(" - ").pop() ?? "") ?? BY_ID[familyOf(fn)].blurb;
}
/** "SKIN CONDITIONING - EMOLLIENT" -> "Skin conditioning, emollient" */
export const prettyFn = (fn: string) => { const s = fn.toLowerCase().replace(/\s*-\s*/g, ", "); return s.charAt(0).toUpperCase() + s.slice(1); };
