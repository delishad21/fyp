"use client";

import { useState } from "react";
import { verifyPasswordAction } from "@/services/user/edit-user-actions";

type Target = "name" | "honorific" | "email" | "password";

export function useUnlockFlow(opts: { onVerified: (target: Target) => void }) {
  const { onVerified } = opts;
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<Target | null>(null);
  const [loading, setLoading] = useState(false);

  function request(target: Target) {
    setTarget(target);
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setTarget(null);
  }

  async function submit(password: string) {
    if (!target) return { ok: false as const, error: "No field selected." };
    setLoading(true);
    const res = await verifyPasswordAction({ password });
    setLoading(false);

    if (!res.ok)
      return { ok: false as const, error: res.error || "Incorrect password." };

    // success
    onVerified(target);
    close();
    return { ok: true as const };
  }

  return {
    verifyModal: {
      open,
      loading,
      onClose: close,
      onSubmit: submit,
    },
    request, // call this with the target to prompt verify modal
  };
}
