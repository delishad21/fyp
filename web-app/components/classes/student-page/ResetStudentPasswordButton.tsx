"use client";

import { useState } from "react";
import Button from "@/components/ui/buttons/Button";
import WarningModal from "@/components/ui/WarningModal";
import InfoModal from "@/components/ui/InfoModal";
import { useToast } from "@/components/ui/toast/ToastProvider";
import { resetStudentPasswordAction } from "@/services/class/actions/reset-student-password-action";

export default function ResetStudentPasswordButton({
  classId,
  studentId,
}: {
  classId: string;
  studentId: string;
}) {
  const { showToast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [tempPassword, setTempPassword] = useState("");

  const onConfirm = async () => {
    setBusy(true);
    const res = await resetStudentPasswordAction(classId, studentId);
    setBusy(false);

    if (!res.ok || !res.data) {
      showToast({
        title: "Reset failed",
        description: res.message || "Could not reset password.",
        variant: "error",
      });
      return;
    }

    setConfirmOpen(false);
    setUsername(res.data.username);
    setTempPassword(res.data.temporaryPassword);
    setResultOpen(true);
  };

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(tempPassword);
      showToast({
        title: "Copied",
        description: "Temporary password copied to clipboard.",
        variant: "success",
      });
    } catch {
      showToast({
        title: "Copy failed",
        description: "Could not copy password. Please copy manually.",
        variant: "error",
      });
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        className="px-4 py-2"
        onClick={() => setConfirmOpen(true)}
        title="Reset student password"
      >
        Reset Password
      </Button>

      <WarningModal
        open={confirmOpen}
        title="Reset this student's password?"
        message="A new random temporary password will be generated and shown once. The student will need it to sign in again."
        cancelLabel="Cancel"
        continueLabel={busy ? "Resetting..." : "Reset Password"}
        onCancel={() => {
          if (!busy) setConfirmOpen(false);
        }}
        onContinue={busy ? () => {} : onConfirm}
      />

      <InfoModal
        open={resultOpen}
        title="Temporary Password Generated"
        onClose={() => setResultOpen(false)}
        closeLabel="Close"
        actions={
          <Button
            variant="ghost"
            className="px-3 py-1.5 text-sm"
            onClick={copyPassword}
            title="Copy temporary password"
          >
            Copy Password
          </Button>
        }
        message={
          <div className="space-y-3">
            <p>
              Share these credentials with the student:
            </p>
            <div className="rounded-md border border-[var(--color-bg4)] bg-[var(--color-bg2)] p-3">
              <div>
                <span className="text-[var(--color-text-secondary)]">Username:</span>{" "}
                <span className="font-medium text-[var(--color-text-primary)]">
                  {username}
                </span>
              </div>
              <div className="mt-1">
                <span className="text-[var(--color-text-secondary)]">Temporary Password:</span>{" "}
                <code className="rounded bg-[var(--color-bg3)] px-1.5 py-0.5 text-[var(--color-text-primary)]">
                  {tempPassword}
                </code>
              </div>
            </div>
          </div>
        }
      />
    </>
  );
}
