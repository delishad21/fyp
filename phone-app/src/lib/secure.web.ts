const memoryStore = new Map<string, string>();

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    const storage = window.localStorage;
    if (!storage) return null;
    // Some browsers block storage in iframes; probe access.
    const probeKey = "__storage_probe__";
    storage.setItem(probeKey, "1");
    storage.removeItem(probeKey);
    return storage;
  } catch {
    return null;
  }
}

export async function setJSON(key: string, value: any) {
  const storage = getStorage();
  const payload = JSON.stringify(value);
  if (storage) {
    storage.setItem(key, payload);
    return;
  }
  memoryStore.set(key, payload);
}

export async function getJSON<T = any>(key: string): Promise<T | null> {
  const storage = getStorage();
  const raw = storage ? storage.getItem(key) : memoryStore.get(key) ?? null;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function del(key: string) {
  const storage = getStorage();
  if (storage) {
    storage.removeItem(key);
    return;
  }
  memoryStore.delete(key);
}
