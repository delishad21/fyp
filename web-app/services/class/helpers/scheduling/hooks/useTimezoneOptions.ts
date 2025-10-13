import { useMemo } from "react";

export function useTimezoneOptions() {
  return useMemo(() => {
    const fallback = [
      "Asia/Singapore",
      "Asia/Kuala_Lumpur",
      "Asia/Jakarta",
      "Asia/Manila",
      "Asia/Bangkok",
      "Asia/Tokyo",
      "Asia/Seoul",
      "Europe/London",
      "Europe/Berlin",
      "America/New_York",
      "America/Los_Angeles",
    ];
    try {
      // @ts-ignore (Node 20+/modern browsers)
      const list: string[] = Intl.supportedValuesOf?.("timeZone") ?? fallback;
      const preferred = new Set([
        "Asia/Singapore",
        "Asia/Kuala_Lumpur",
        "Asia/Jakarta",
        "Asia/Manila",
        "Asia/Bangkok",
      ]);
      const top = list.filter((z) => preferred.has(z));
      const rest = list.filter((z) => !preferred.has(z));
      return [...top, ...rest];
    } catch {
      return fallback;
    }
  }, []);
}
