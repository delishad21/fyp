"use client";
import { useEffect, useState } from "react";
export function useDebounced<T>(val: T, ms: number) {
  const [d, setD] = useState(val);
  useEffect(() => {
    const t = setTimeout(() => setD(val), ms);
    return () => clearTimeout(t);
  }, [val, ms]);
  return d;
}
