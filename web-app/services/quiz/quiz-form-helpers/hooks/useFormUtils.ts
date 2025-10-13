"use client";

import { useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

type ActionState = { ok: boolean; redirect?: string | null | undefined };

export function useRedirectOnSuccess(state: ActionState, delayMs = 1000) {
  const router = useRouter();
  useEffect(() => {
    if (!state.ok || !state.redirect) return;
    const t = setTimeout(() => router.replace(state.redirect!), delayMs);
    return () => clearTimeout(t);
  }, [state.ok, state.redirect, router, delayMs]);
}

/** Prevent Enter-to-submit outside textarea / submit buttons. */
export function useEnterSubmitGuard() {
  return useCallback<React.KeyboardEventHandler<HTMLFormElement>>((e) => {
    if (e.key !== "Enter" || (e.nativeEvent as any).isComposing) return;
    const el = e.target as HTMLElement;
    const tag = el.tagName;
    const isTextArea = tag === "TEXTAREA";
    const isSubmitBtn =
      tag === "BUTTON" && (el as HTMLButtonElement).type === "submit";
    if (!isTextArea && !isSubmitBtn) e.preventDefault();
  }, []);
}
