export type ProductType = "" | "cleanser" | "toner" | "serum" | "moisturizer" | "sunscreen" | "treatment" | "other";
export const PRODUCT_TYPES: { v: ProductType; label: string }[] = [
  { v: "", label: "Not marked" }, { v: "cleanser", label: "Cleanser" }, { v: "toner", label: "Toner / exfoliant" }, { v: "serum", label: "Serum" },
  { v: "moisturizer", label: "Moisturizer" }, { v: "sunscreen", label: "Sunscreen" }, { v: "treatment", label: "Spot / acne treatment" }, { v: "other", label: "Other" },
];
export type When = "" | "am" | "pm" | "both";
export interface SavedProduct {
  id: string; name: string; type: ProductType; when: When;
  ingredients: string[];         // identified INCI names only (resolved, or suggestions the user accepted)
  unresolved: string[];          // printed text that is still unconfirmed; never treated as safe
  mrp?: number; volumeMl?: number; barcode?: string; savedAt: string;
}
export interface Reaction { id: string; productId: string; date: string; note: string }
