// Browser-only storage for saved products and the reaction log. Nothing here is ever sent to a server.
import { STORAGE_PREFIX } from "@/lib/rules/profileStore";
import type { Reaction, SavedProduct } from "./types";

export const PRODUCTS_KEY = `${STORAGE_PREFIX}products.v1`;
export const REACTIONS_KEY = `${STORAGE_PREFIX}reactions.v1`;
export const REACTION_CONSENT_KEY = `${STORAGE_PREFIX}reactions.consent.v1`;

function read<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; }
}
function write(key: string, v: unknown): boolean { try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch { return false; } }

export const loadProducts = (): SavedProduct[] => { const l = read<SavedProduct[]>(PRODUCTS_KEY, []); return Array.isArray(l) ? l : []; };
export const saveProducts = (l: SavedProduct[]) => write(PRODUCTS_KEY, l);
export function addProduct(p: Omit<SavedProduct, "id" | "savedAt">): SavedProduct {
  const full: SavedProduct = { ...p, id: `prd${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, savedAt: new Date().toISOString() };
  saveProducts([...loadProducts(), full]);
  return full;
}
export const loadReactions = (): Reaction[] => { const l = read<Reaction[]>(REACTIONS_KEY, []); return Array.isArray(l) ? l : []; };
export const saveReactions = (l: Reaction[]) => write(REACTIONS_KEY, l);
export const hasReactionConsent = () => read<boolean>(REACTION_CONSENT_KEY, false) === true;
export const setReactionConsent = (v: boolean) => write(REACTION_CONSENT_KEY, v);
