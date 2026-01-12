"use client";

/**
 * AccountSettingsForm Component
 *
 * Purpose:
 *   - Manages user account settings (honorific, name, email, password change) in a single form.
 *   - Uses a lock->verify->edit workflow for sensitive fields (password-gated edits).
 *   - Coordinates three flows: unlock (password verify), email change (OTP), and password change.
 *
 * Props:
 *   @param {string} userId   - Current user's id (not directly used in UI but available for actions).
 *   @param {string} username - Read-only username display.
 *   @param {string} name     - Initial display name.
 *   @param {string|null|undefined} honorific - Initial honorific (may be empty).
 *   @param {string} email    - Initial email.
 *
 * Internal State:
 *   - Originals (persisted server state mirrors):
 *       origName: string, origHonorific: string, origEmail: string
 *   - Drafts (editable input values):
 *       name: string, honorific: string, email: string
 *   - Locks (per-field edit gating):
 *       nameUnlocked: boolean, honorificUnlocked: boolean, emailUnlocked: boolean
 *   - Field Errors:
 *       nameError?: string|string[], honorificError?: string|string[], emailError?: string|string[]
 *
 * Flows / Hooks:
 *   - useUnlockFlow:
 *       - unlock.request(target: "name"|"honorific"|"email"|"password") prompts password verification.
 *       - onVerified callback unlocks the target or opens password change modal.
 *   - useEmailChangeFlow:
 *       - start(newEmail) -> opens OTP modal; confirm/resend handled inside the flow.
 *       - onConfirmed(newEmail) updates origEmail and re-locks email.
 *       - Toast helpers for success/error feedback.
 *   - usePasswordChangeFlow:
 *       - Opens ChangePasswordModal; submit handles password update with toasts.
 *
 * Save/Cancel Handlers:
 *   - saveName(): trims, validates, calls updateNameAction, updates originals, re-locks, shows toast.
 *   - cancelName(): restores from origName, clears errors, re-locks.
 *   - saveHonorific(): calls updateHonorificAction, updates originals, re-locks, shows toast.
 *   - cancelHonorific(): restores origHonorific, clears errors, re-locks.
 *   - saveEmail(): trims/validates then initiates emailFlow.start (OTP confirm to finalize).
 *   - cancelEmail(): restores origEmail, clears errors, re-locks.
 *
 * UI Composition:
 *   - Header with avatar placeholder + display name.
 *   - ReadOnlyField for Username.
 *   - EditableField rows for Honorific (Select), Name (TextInput), Email (TextInput).
 *       • Locked state shows "Edit"; unlocked shows "Save/Cancel".
 *       • Field-level error messages displayed below inputs.
 *   - "Change Password" button triggers unlock.request("password") to open Verify->Change flow.
 *   - Modals:
 *       • VerifyPasswordModal for password verification (unlock flow).
 *       • ConfirmEmailChangeModal for OTP confirmation during email change (email flow).
 *       • ChangePasswordModal for updating password (password flow).
 *
 * UX Notes:
 *   - Edits are optimistic only after server success; originals mirror server truth to keep drafts consistent.
 *   - Toaster feedback on success/failure throughout.
 *   - Email change remains unlocked during OTP; final lock occurs after successful confirmation.
 *
 * Accessibility / Behavior:
 *   - Inputs respect readOnly when locked.
 *   - Buttons reflect loading/disabled states to prevent duplicate actions.
 *   - Layout keeps action column widths consistent across fields.
 */

import { useState } from "react";
import TextInput from "@/components/ui/text-inputs/TextInput";
import Select from "@/components/ui/selectors/select/Select";
import Button from "@/components/ui/buttons/Button";
import { useToast } from "@/components/ui/toast/ToastProvider";
import { HONORIFICS } from "@/services/user/helpers/constants";
import {
  updateHonorificAction,
  updateNameAction,
} from "@/services/user/edit-user-actions";
import { useEmailChangeFlow } from "@/services/user/account-settings-helpers/hooks/useEmailChangeFlow";
import { usePasswordChangeFlow } from "@/services/user/account-settings-helpers/hooks/usePasswordChangeFlow";
import { useUnlockFlow } from "@/services/user/account-settings-helpers/hooks/useUnlockFlow";
import ChangePasswordModal from "../../form-components/ChangePasswordModal";
import ConfirmEmailChangeModal from "../../form-components/ConfirmEmailChangeModal";
import VerifyPasswordModal from "../../form-components/VerifyPasswordModal";
import EditableField from "./fields/EditableField";
import ReadOnlyField from "./fields/ReadOnlyField";

type Props = {
  username: string;
  name: string;
  honorific: string | null | undefined;
  email: string;
};

export default function AccountSettingsForm({
  username,
  name: initialName,
  honorific: initialHonorific,
  email: initialEmail,
}: Props) {
  const { showToast } = useToast();

  // originals (To keep state consistent until successful updates)
  const [origName, setOrigName] = useState(initialName ?? "");
  const [origHonorific, setOrigHonorific] = useState(initialHonorific || "");
  const [origEmail, setOrigEmail] = useState(initialEmail ?? "");

  // drafts (To store temporary changes)
  const [name, setName] = useState(origName);
  const [honorific, setHonorific] = useState(origHonorific);
  const [email, setEmail] = useState(origEmail);

  // lock state for each editable field
  const [nameUnlocked, setNameUnlocked] = useState(false);
  const [honorificUnlocked, setHonorificUnlocked] = useState(false);
  const [emailUnlocked, setEmailUnlocked] = useState(false);

  // error states for each editable field
  const [nameError, setNameError] = useState<string | string[] | undefined>();
  const [honorificError, setHonorificError] = useState<
    string | string[] | undefined
  >();
  const [emailError, setEmailError] = useState<string | string[] | undefined>();

  // loading states
  const [savingName, setSavingName] = useState(false);
  const [savingHonorific, setSavingHonorific] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);

  // unlock (password verification) flow
  const unlock = useUnlockFlow({
    onVerified: (target) => {
      if (target === "password") {
        passwordFlow.show();
      } else if (target === "name") {
        setNameUnlocked(true);
        showToast({
          variant: "success",
          title: "Verified",
          description: "You can now edit your name.",
        });
      } else if (target === "honorific") {
        setHonorificUnlocked(true);
        showToast({
          variant: "success",
          title: "Verified",
          description: "You can now edit your honorific.",
        });
      } else if (target === "email") {
        setEmailUnlocked(true);
        showToast({
          variant: "success",
          title: "Verified",
          description: "You can now edit your email.",
        });
      }
    },
  });

  // email change flow
  const emailFlow = useEmailChangeFlow({
    onConfirmed: (newEmail) => {
      setOrigEmail(newEmail || email.trim());
      setEmailUnlocked(false);
      setSavingEmail(false);
    },
    onErrorToast: (msg) =>
      showToast({
        title: "Email update failed",
        description: msg,
        variant: "error",
      }),
    onSuccessToast: (title, desc) =>
      showToast({ title, description: desc, variant: "success" }),
  });

  // password change flow
  const passwordFlow = usePasswordChangeFlow({
    onSuccessToast: (title, desc) =>
      showToast({ title, description: desc, variant: "success" }),
    onErrorToast: (title, desc) =>
      showToast({ title, description: desc, variant: "error" }),
  });

  const avatarDisplayName = origName;

  // save handlers

  async function saveName() {
    setSavingName(true);
    setNameError(undefined);
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError("Name is required.");
      return;
    }
    const res = await updateNameAction({ name: trimmed });
    if (!res.ok) {
      setNameError(
        res.fieldErrors?.name || res.error || "Failed to update name."
      );
      setSavingName(false);
      return;
    }
    setOrigName(res.data?.name ?? trimmed);
    setNameUnlocked(false);
    setSavingName(false);
    showToast({
      variant: "success",
      title: "Name updated",
      description: `Your name has been updated to ${
        res.data?.name ?? trimmed
      }.`,
    });
  }

  function cancelName() {
    setName(origName);
    setNameError(undefined);
    setNameUnlocked(false);
  }

  async function saveHonorific() {
    setSavingHonorific(true);
    setHonorificError(undefined);
    const value = (honorific || "").trim();
    const res = await updateHonorificAction({ honorific: value });
    if (!res.ok) {
      setHonorificError(
        res.fieldErrors?.honorific || res.error || "Failed to update honorific."
      );
      setSavingHonorific(false);
      return;
    }
    setOrigHonorific(res.data?.honorific ?? value);
    setHonorificUnlocked(false);
    setSavingHonorific(false);
    showToast({
      variant: "success",
      title: "Honorific updated",
      description: `Your honorific has been updated to ${
        res.data?.honorific ?? value
      }.`,
    });
  }

  function cancelHonorific() {
    setHonorific(origHonorific);
    setHonorificError(undefined);
    setHonorificUnlocked(false);
  }

  async function saveEmail() {
    setSavingEmail(true);
    setEmailError(undefined);
    const trimmed = email.trim();
    if (!trimmed) {
      setEmailError("Email is required.");
      setSavingEmail(false);
      return;
    }
    // Start email change (opens confirm modal)
    const ok = await emailFlow.start(trimmed);
    if (!ok.ok) {
      setEmailError(
        ok.error || "Failed to initiate email change. Please try again."
      );
      setSavingEmail(false);
      return;
    }
    // Stay unlocked; we lock on confirm success
    setSavingEmail(false);
  }

  function cancelEmail() {
    setEmail(origEmail);
    setEmailError(undefined);
    setEmailUnlocked(false);
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-center gap-4">
        <div className="h-16 w-16 rounded-full bg-[var(--color-primary)]" />
        <div>
          <h2 className="text-2xl font-semibold">{avatarDisplayName}</h2>
          <p className="text-[var(--color-text-secondary)] text-sm">
            Teacher’s account
          </p>
        </div>
      </div>

      {/* Username (read-only) */}
      <ReadOnlyField label="Username">
        <TextInput id="username" value={username} readOnly />
      </ReadOnlyField>

      {/* Honorific */}
      <EditableField
        label="Honorific"
        locked={!honorificUnlocked}
        saving={savingHonorific}
        error={honorificError}
        onEdit={() => unlock.request("honorific")}
        onSave={saveHonorific}
        onCancel={cancelHonorific}
      >
        <Select
          id="honorific"
          value={honorific}
          onChange={setHonorific}
          options={HONORIFICS}
          disabled={!honorificUnlocked}
        />
      </EditableField>

      {/* Name */}
      <EditableField
        label="Name"
        locked={!nameUnlocked}
        saving={savingName}
        error={nameError}
        onEdit={() => unlock.request("name")}
        onSave={saveName}
        onCancel={cancelName}
      >
        <TextInput
          id="displayName"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          readOnly={!nameUnlocked}
        />
      </EditableField>

      {/* Email */}
      <EditableField
        label="Email"
        locked={!emailUnlocked}
        saving={savingEmail}
        error={emailError}
        onEdit={() => unlock.request("email")}
        onSave={saveEmail}
        onCancel={cancelEmail}
      >
        <TextInput
          id="email"
          value={email}
          onChange={(e) => setEmail(e.currentTarget.value)}
          readOnly={!emailUnlocked}
        />
      </EditableField>

      {/* Change Password */}
      <div className="mt-8 w-[180px] h-[45px]">
        <Button onClick={() => unlock.request("password")}>
          Change Password
        </Button>
      </div>

      {/* Verify password modal */}
      <VerifyPasswordModal
        open={unlock.verifyModal.open}
        loading={unlock.verifyModal.loading}
        onClose={unlock.verifyModal.onClose}
        onSubmit={unlock.verifyModal.onSubmit}
      />

      {/* Confirm new email modal */}
      {emailFlow.modal.selector && (
        <ConfirmEmailChangeModal
          open={emailFlow.modal.open}
          selector={emailFlow.modal.selector}
          countdown={emailFlow.modal.countdown}
          onClose={emailFlow.modal.onClose}
          onConfirm={(code) => emailFlow.confirm(code)}
          onResend={() => emailFlow.resend()}
        />
      )}

      {/* Change Password Modal */}
      <ChangePasswordModal
        open={passwordFlow.modal.open}
        loading={passwordFlow.modal.loading}
        onClose={passwordFlow.modal.onClose}
        onSubmit={passwordFlow.submit}
      />
    </div>
  );
}
