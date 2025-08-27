"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import TextInput from "@/components/ui/TextInput";
import { useToast } from "@/components/ui/toast/ToastProvider";

type Props = {
  open: boolean;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (password: string) => Promise<{ ok: boolean; error?: string }>;
};

export default function VerifyPasswordModal({
  open,
  loading,
  onClose,
  onSubmit,
}: Props) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const { showToast } = useToast();

  useEffect(() => {
    if (open) {
      setPassword("");
      setError(undefined);
    }
  }, [open]);

  if (!open) return null;

  async function handleUnlock() {
    setError(undefined);
    const res = await onSubmit(password);
    if (!res.ok) {
      setError(res.error || "Incorrect password.");
    } else {
      showToast({
        variant: "success",
        title: "Verified",
        description: "You can now edit this field.",
      });
    }
  }

  function handleEnterKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (password && !loading) void handleUnlock();
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40">
      <div className="w-full max-w-sm rounded-md bg-[var(--color-bg2)] p-5 shadow-lg">
        <h3 className="mb-2 text-lg font-semibold">Re-enter password</h3>
        <p className="mb-4 text-sm text-[var(--color-text-secondary)]">
          For security, please enter your password to edit this field.
        </p>

        <div className="mb-4">
          <TextInput
            id="unlock-password"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            error={error}
            onKeyDown={handleEnterKeyDown}
          />
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleUnlock} loading={loading} disabled={!password}>
            Unlock
          </Button>
        </div>
      </div>
    </div>
  );
}
