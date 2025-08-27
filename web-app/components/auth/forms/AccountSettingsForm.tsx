"use client";

import { useEffect, useState } from "react";
import TextInput from "@/components/ui/TextInput";
import {
  verifyPasswordAction,
  updateNameAction,
  updateHonorificAction,
  requestEmailChangeAction,
  confirmEmailChangeAction,
  resendEmailChangeCodeAction,
  updatePasswordAction, // NEW
} from "@/services/user/edit-user-actions";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import ConfirmEmailChangeModal from "../form-components/ConfirmEmailChangeModal";
import VerifyPasswordModal from "../form-components/VerifyPasswordModal";
import ChangePasswordModal from "../form-components/ChangePasswordModal";
import { useToast } from "@/components/ui/toast/ToastProvider";

type Props = {
  userId: string;
  username: string; // always read-only
  name: string;
  honorific: string | null | undefined;
  email: string;
};

export const HONORIFICS = ["None", "Mr.", "Ms.", "Mrs.", "Mx.", "Dr.", "Prof."];

const RESEND_THROTTLE_SECONDS = 60;

// optional helper to pull a specific field error if backend returns fieldErrors
function pickFieldError(
  fieldErrors: Record<string, string | string[]> | undefined,
  field: string
): string | string[] | undefined {
  return fieldErrors?.[field];
}

export default function AccountSettingsForm({
  userId,
  username,
  name: initialName,
  honorific: initialHonorific,
  email: initialEmail,
}: Props) {
  const { showToast } = useToast();
  // Originals (for display & revert on failure)
  const [origName, setOrigName] = useState(initialName ?? "");
  const [origHonorific, setOrigHonorific] = useState(initialHonorific || "");
  const [origEmail, setOrigEmail] = useState(initialEmail ?? "");

  // Drafts (editable when unlocked)
  const [name, setName] = useState(initialName ?? "");
  const [honorific, setHonorific] = useState(initialHonorific || "");
  const [email, setEmail] = useState(initialEmail ?? "");

  // Per-field lock states
  const [nameUnlocked, setNameUnlocked] = useState(false);
  const [honorificUnlocked, setHonorificUnlocked] = useState(false);
  const [emailUnlocked, setEmailUnlocked] = useState(false);

  // Per-field errors (string | string[])
  const [nameErrors, setNameErrors] = useState<string | string[] | undefined>();
  const [honorificErrors, setHonorificErrors] = useState<
    string | string[] | undefined
  >();
  const [emailErrors, setEmailErrors] = useState<
    string | string[] | undefined
  >();

  // Password modal (which field we’re unlocking)
  const [unlockTarget, setUnlockTarget] = useState<
    null | "name" | "honorific" | "email" | "password"
  >(null);
  const [unlocking, setUnlocking] = useState(false);

  // Email confirmation modal
  const [emailConfirm, setEmailConfirm] = useState<{
    open: boolean;
    selector: string | null;
    countdown: number; // seconds remaining
  }>({ open: false, selector: null, countdown: 0 });

  const keyFor = (sel: string) => `email-change-confirm-countdown:${sel}`;

  function openEmailConfirm(selector: string, cooldownSeconds?: number) {
    const initial = cooldownSeconds || RESEND_THROTTLE_SECONDS;

    setEmailConfirm({ open: true, selector, countdown: initial });
  }

  // persist the current countdown under the current selector (including 0)
  useEffect(() => {
    if (!emailConfirm.open || !emailConfirm.selector) return;
    localStorage.setItem(
      keyFor(emailConfirm.selector),
      String(emailConfirm.countdown)
    );
  }, [emailConfirm]);

  // tick down once per second while open and > 0
  useEffect(() => {
    if (!emailConfirm.open || emailConfirm.countdown <= 0) return;
    const t = setInterval(() => {
      setEmailConfirm((s) => ({
        ...s,
        countdown: Math.max(0, s.countdown - 1),
      }));
    }, 1000);
    return () => clearInterval(t);
  }, [emailConfirm.open, emailConfirm.countdown]);

  // Change password modal (after verification)
  const [pwModalOpen, setPwModalOpen] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  // Saving hooks
  const [savingName, setSavingName] = useState(false);
  const [savingHonorific, setSavingHonorific] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);

  // Avatar SHOULD show ORIGINAL name until save succeeds
  const avatarDisplayName = origName;

  async function handleUnlock(
    target: "name" | "honorific" | "email" | "password",
    password: string
  ) {
    setUnlocking(true);
    try {
      const res = await verifyPasswordAction({ password });
      if (!res.ok) {
        return { ok: false, error: res.error || "Incorrect password." };
      }

      // Toggle unlocked state or continue flow
      if (target === "name") setNameUnlocked(true);
      if (target === "honorific") setHonorificUnlocked(true);
      if (target === "email") setEmailUnlocked(true);
      if (target === "password") setPwModalOpen(true); // proceed to password change modal

      return { ok: true };
    } finally {
      setUnlocking(false);
    }
  }

  /* ------- Save handlers with empty-field validation ------- */

  async function saveName() {
    setNameErrors(undefined);
    const trimmed = name.trim();
    if (!trimmed) {
      setNameErrors("Name is required.");
      return;
    }

    setSavingName(true);
    try {
      const res = await updateNameAction({ name: trimmed });
      if (!res.ok) {
        setNameErrors(
          pickFieldError(res.fieldErrors, "name") ||
            res.error ||
            "Failed to update name."
        );
        return;
      }
      setOrigName(res.data?.name ?? trimmed);
      setNameUnlocked(false);
      showToast({
        variant: "success",
        title: "Name updated",
        description:
          "Your name has been updated to " + (res.data?.name ?? trimmed) + ".",
      });
    } finally {
      setSavingName(false);
    }
  }

  async function cancelName() {
    setName(origName);
    setNameErrors(undefined);
    setNameUnlocked(false);
  }

  async function saveHonorific() {
    setHonorificErrors(undefined);
    const value = (honorific || "").trim();

    setSavingHonorific(true);
    try {
      const res = await updateHonorificAction({ honorific: value });
      if (!res.ok) {
        setHonorificErrors(
          pickFieldError(res.fieldErrors, "honorific") ||
            res.error ||
            "Failed to update honorific."
        );
        return;
      }
      setOrigHonorific(res.data?.honorific ?? value);
      setHonorificUnlocked(false);
      showToast({
        variant: "success",
        title: "Honorific updated",
        description:
          "Your honorific has been updated to " +
          (res.data?.honorific ?? value) +
          ".",
      });
    } finally {
      setSavingHonorific(false);
    }
  }

  async function cancelHonorific() {
    setHonorific(origHonorific);
    setHonorificErrors(undefined);
    setHonorificUnlocked(false);
  }

  async function saveEmail() {
    setEmailErrors(undefined);
    const trimmed = email.trim();
    if (!trimmed) {
      setEmailErrors("Email is required.");
      return;
    }

    setSavingEmail(true);
    try {
      const res = await requestEmailChangeAction({ email: trimmed });
      if (!res.ok) {
        setEmailErrors(
          pickFieldError(res.fieldErrors, "email") ||
            res.error ||
            "Failed to request email change."
        );
        return;
      }
      const selector = res.data?.selector;
      const cooldownSeconds = res.data?.cooldownSeconds;
      console.log({ selector, cooldownSeconds });
      if (selector) {
        openEmailConfirm(selector, cooldownSeconds);
      }
    } finally {
      setSavingEmail(false);
    }
  }

  async function cancelEmail() {
    setEmail(origEmail);
    setEmailErrors(undefined);
    setEmailUnlocked(false);
  }

  /* ------- Email confirm flow ------- */

  async function confirmNewEmail(code: string, selector: string) {
    const res = await confirmEmailChangeAction({ selector, code });
    if (!res.ok) {
      return { ok: false, error: res.error || "Invalid or expired code." };
    }
    setOrigEmail(res.data?.email ?? email.trim());
    setEmailUnlocked(false);
    setEmailConfirm({ open: false, selector: null, countdown: 0 });
    return { ok: true, message: res.message || "Email confirmed." };
  }

  async function handleResendFromParent() {
    if (!emailConfirm.selector) {
      return { ok: false, error: "No selector available." };
    }
    if (emailConfirm.countdown > 0) {
      return {
        ok: false,
        error: "Please wait before requesting another code.",
      };
    }

    const res = await resendEmailChangeCodeAction({
      selector: emailConfirm.selector,
    });
    if (!res.ok) {
      return { ok: false, error: res.error || "Failed to resend code." };
    }

    const nextSelector = res.data?.selector ?? emailConfirm.selector;
    const nextCooldown =
      typeof res.data?.cooldownSeconds === "number"
        ? res.data!.cooldownSeconds
        : RESEND_THROTTLE_SECONDS;

    // persist immediately for the next selector key
    localStorage.setItem(keyFor(nextSelector), String(nextCooldown));
    setEmailConfirm({
      open: true,
      selector: nextSelector,
      countdown: nextCooldown,
    });

    return {
      ok: true,
      selector: nextSelector,
      cooldownSeconds: nextCooldown,
    };
  }

  /* ------- Change Password flow ------- */

  async function submitNewPassword(
    newPassword: string,
    confirmPassword: string
  ): Promise<
    | { ok: true; message?: string }
    | {
        ok: false;
        error?: string;
        fieldErrors?: Record<string, string | string[]>;
      }
  > {
    // local guard for empties/mismatch; action double-checks too
    const fieldErrors: Record<string, string> = {};
    if (!newPassword) fieldErrors.password = "Password is required.";
    if (!confirmPassword)
      fieldErrors.confirmPassword = "Please confirm password.";
    if (newPassword && confirmPassword && newPassword !== confirmPassword) {
      fieldErrors.confirmPassword = "Passwords do not match.";
    }
    if (Object.keys(fieldErrors).length) {
      return { ok: false, fieldErrors };
    }

    setChangingPassword(true);
    const res = await updatePasswordAction({
      password: newPassword,
      confirmPassword,
    });
    setChangingPassword(false);

    if (!res.ok) {
      return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
    }
    setPwModalOpen(false);
    return { ok: true, message: res.message || "Password updated." };
  }

  return (
    <div>
      {/* Header row with avatar (left) */}
      <div className="mb-8 flex items-center gap-4">
        <div className="h-16 w-16 rounded-full bg-[var(--color-primary)]" />
        <div>
          <h2 className="text-2xl font-semibold">{avatarDisplayName}</h2>
          <p className="text-[var(--color-text-secondary)] text-sm">
            Teacher’s account
          </p>
        </div>
      </div>

      {/* Username (read-only, no edit button) */}
      <FieldEditRow label="Username" rightButton={null}>
        <TextInput id="username" value={username} readOnly aria-readonly />
      </FieldEditRow>

      <FieldEditRow
        label="Honorific"
        rightButton={
          <InlineEditControls
            locked={!honorificUnlocked}
            onEdit={() => setUnlockTarget("honorific")}
            onSave={saveHonorific}
            onCancel={cancelHonorific}
            saving={savingHonorific}
          />
        }
      >
        <Select
          id="honorific"
          value={honorific}
          onChange={setHonorific}
          options={HONORIFICS}
          disabled={!honorificUnlocked || savingHonorific}
          error={honorificErrors}
        />
      </FieldEditRow>

      <FieldEditRow
        label="Name"
        rightButton={
          <InlineEditControls
            locked={!nameUnlocked}
            onEdit={() => setUnlockTarget("name")}
            onSave={saveName}
            onCancel={cancelName}
            saving={savingName}
          />
        }
      >
        <TextInput
          id="displayName"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          readOnly={!nameUnlocked || savingName}
          error={nameErrors}
        />
      </FieldEditRow>

      <FieldEditRow
        label="Email"
        rightButton={
          <InlineEditControls
            locked={!emailUnlocked}
            onEdit={() => setUnlockTarget("email")}
            onSave={saveEmail}
            onCancel={cancelEmail}
            saving={savingEmail}
          />
        }
      >
        <TextInput
          id="email"
          value={email}
          onChange={(e) => setEmail(e.currentTarget.value)}
          readOnly={!emailUnlocked || savingEmail}
          error={emailErrors}
        />
      </FieldEditRow>

      {/* Change Password */}
      <div className="mt-8 w-[150px] h-[45px]">
        <Button onClick={() => setUnlockTarget("password")}>
          Change Password
        </Button>
      </div>

      {/* Verify password modal (used for unlock + change password) */}
      <VerifyPasswordModal
        open={unlockTarget !== null}
        onClose={() => setUnlockTarget(null)}
        onSubmit={async (password) => {
          if (!unlockTarget) return { ok: false, error: "No field selected." };
          const res = await handleUnlock(unlockTarget, password);
          if (res.ok) setUnlockTarget(null);
          return res;
        }}
        loading={unlocking}
      />

      {/* Confirm new email modal (OTP) */}
      {emailConfirm.selector && (
        <ConfirmEmailChangeModal
          open={emailConfirm.open}
          selector={emailConfirm.selector}
          countdown={emailConfirm.countdown}
          onClose={() =>
            setEmailConfirm({ open: false, selector: null, countdown: 0 })
          }
          onConfirm={confirmNewEmail}
          onResend={handleResendFromParent}
        />
      )}

      {/* Change Password Modal */}
      <ChangePasswordModal
        open={pwModalOpen}
        loading={changingPassword}
        onClose={() => setPwModalOpen(false)}
        onSubmit={submitNewPassword}
      />
    </div>
  );
}

/* ---------- inline components ---------- */

function FieldEditRow({
  label,
  rightButton,
  children,
}: {
  label: string;
  rightButton: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col">
      <label className="text-sm text-[var(--color-text-primary)] mb-2">
        {label}
      </label>

      {/* Fixed control column; stretch heights */}
      <div className="flex items-start h-[45px] gap-2">
        <div className="flex-1 min-w-0">{children}</div>
        <div className="w-[190px] h-full">
          {rightButton ?? <div className="w-full" />}
        </div>
      </div>
    </div>
  );
}

function InlineEditControls({
  locked,
  onEdit,
  onSave,
  onCancel,
  saving = false,
}: {
  locked: boolean;
  onEdit: () => void;
  onSave: () => void | Promise<void>;
  onCancel: () => void;
  saving?: boolean;
}) {
  return locked ? (
    <div className="flex gap-2 h-full w-[90px] items-start">
      <Button onClick={onEdit}>Edit</Button>
    </div>
  ) : (
    <div className="flex gap-2 h-full">
      <Button
        onClick={onSave}
        loading={saving}
        className="bg-[var(--color-success)] text-white hover:opacity-90"
      >
        Save
      </Button>
      <Button variant="ghost" onClick={onCancel} disabled={saving}>
        Cancel
      </Button>
    </div>
  );
}
