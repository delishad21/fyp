import * as SecureStore from "expo-secure-store";

export async function setJSON(key: string, value: any) {
  await SecureStore.setItemAsync(key, JSON.stringify(value));
}
export async function getJSON<T = any>(key: string): Promise<T | null> {
  const raw = await SecureStore.getItemAsync(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
export async function del(key: string) {
  await SecureStore.deleteItemAsync(key);
}
