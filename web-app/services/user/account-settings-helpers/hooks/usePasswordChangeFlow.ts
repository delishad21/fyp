"use client";

import { useState } from "react";
import { updatePasswordAction } from "@/services/user/edit-user-actions";

export function usePasswordChangeFlow(opts?: {
  onSuccessToast?: (title: string, desc?: string) => void;
  onErrorToast?: (title: string, desc?: string) => void;
}) {
  const { onSuccessToast, onErrorToast } = opts || {};
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  function show() {
    setOpen(true);
  }
  function close() {
    setOpen(false);
  }

  async function submit(newPassword: string, confirmPassword: string) {
    // local guard
    const fieldErrors: Record<string, string> = {};
    if (!newPassword) fieldErrors.password = "Password is required.";
    if (!confirmPassword)
      fieldErrors.confirmPassword = "Please confirm password.";
    if (newPassword && confirmPassword && newPassword !== confirmPassword) {
      fieldErrors.confirmPassword = "Passwords do not match.";
    }
    if (Object.keys(fieldErrors).length) {
      return { ok: false as const, fieldErrors };
    }

    setLoading(true);
    const res = await updatePasswordAction({
      password: newPassword,
      confirmPassword,
    });
    setLoading(false);

    if (!res.ok) {
      onErrorToast?.("Update failed", res.error);
      return {
        ok: false as const,
        error: res.error,
        fieldErrors: res.fieldErrors,
      };
    }

    onSuccessToast?.("Password updated", res.message);
    close();
    return { ok: true as const, message: res.message };
  }

  return {
    modal: { open, loading, onClose: close },
    show,
    submit,
  };
}
