import actives from "@/data/actives.json";
import subs from "@/data/substitutions.json";
import { normKey } from "@/lib/rules/data";
import type { Confidence, Source } from "@/lib/rules/types";

export interface ActiveClass { id: string; name: string; sun_sensitising: boolean; members: string[]; note: string; source: Source[]; confidence: Confidence }
export interface Stacking { id: string; a: string; b: string; tier: "caution" | "note"; text: string; source: Source[]; confidence: Confidence }
export const CLASSES = (actives as unknown as { classes: ActiveClass[] }).classes;
export const STACKING = (actives as unknown as { stacking: Stacking[] }).stacking;
export const classById = (id: string) => CLASSES.find((c) => c.id === id)!;

const MEMBER = new Map<string, string>();
for (const c of CLASSES) for (const m of c.members) MEMBER.set(normKey(m), c.id);
/** The notable-active class of one INCI name, or null. */
export const activeClassOf = (inci: string): string | null => MEMBER.get(normKey(inci)) ?? null;
/** Identified ingredients of a list that belong to an active class: [{inci, cls}]. */
export const activesIn = (inci: string[]) => inci.flatMap((n) => { const c = activeClassOf(n); return c ? [{ inci: n, cls: c }] : []; });

export interface SubstitutionOption { inci: string; role: string; tradeoffs: string[]; source: Source[]; confidence: Confidence }
export interface Substitution { id: string; from_label: string; from: string[]; options: SubstitutionOption[] }
export const SUBSTITUTIONS = (subs as unknown as { entries: Substitution[] }).entries;
export const substitutionsFor = (inci: string) => SUBSTITUTIONS.filter((s) => s.from.some((f) => normKey(f) === normKey(inci)));
