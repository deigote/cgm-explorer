import { DEFAULTS, type Session, type Settings } from "../types";
const PREF_KEY = "cgm-explorer-settings-v1";
export function validSettings(s: Settings) {
  return (
    s &&
    ["mg/dL", "mmol/L"].includes(s.unit) &&
    Array.isArray(s.bands) &&
    s.bands.length === 4 &&
    s.bands.every(
      (v, i) =>
        Number.isFinite(v) &&
        v > 0 &&
        v <= 1000 &&
        (i === 0 || v > s.bands[i - 1]),
    ) &&
    Array.isArray(s.target) &&
    s.target.length === 2 &&
    s.target.every((v) => Number.isFinite(v) && v > 0 && v <= 1000) &&
    s.target[0] < s.target[1]
  );
}
export function loadSettings(): Settings {
  try {
    const value = JSON.parse(localStorage.getItem(PREF_KEY) || "null");
    return validSettings(value) ? value : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}
export function saveSettings(settings: Settings) {
  localStorage.setItem(PREF_KEY, JSON.stringify(settings));
}
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("cgm-explorer-local", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("session");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export async function loadSession(): Promise<Session | null> {
  const db = await openDB();
  try {
    return await new Promise((resolve, reject) => {
      const req = db
        .transaction("session", "readonly")
        .objectStore("session")
        .get("latest");
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}
export async function saveSession(session: Session | null) {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("session", "readwrite");
      const store = tx.objectStore("session");
      if (session) store.put(session, "latest");
      else store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export function clearSettings() {
  localStorage.removeItem(PREF_KEY);
}
