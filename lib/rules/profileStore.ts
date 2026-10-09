// Browser-only storage. The profile, avoid list (and later the routine and reaction log) live in localStorage ONLY, never on a server.
import { EMPTY_PROFILE, type Profile } from "./types";

export const STORAGE_PREFIX = "beautylens.";
export const PROFILE_KEY = `${STORAGE_PREFIX}profile.v1`;

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return { ...EMPTY_PROFILE };
    const p = JSON.parse(raw) as Partial<Profile>;
    return { ...EMPTY_PROFILE, ...p, avoid: Array.isArray(p.avoid) ? p.avoid : [], patchTests: Array.isArray(p.patchTests) ? p.patchTests : [], concerns: Array.isArray(p.concerns) ? p.concerns : [], version: 1 };
  } catch { return { ...EMPTY_PROFILE }; }
}
export function saveProfile(p: Profile): boolean {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); return true; } catch { return false; }
}
/** One-tap "Delete all my data": removes every key this app has written. */
export function deleteAllMyData(): boolean {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(STORAGE_PREFIX)) keys.push(k); }
    keys.forEach((k) => localStorage.removeItem(k));
    return true;
  } catch { return false; }
}
