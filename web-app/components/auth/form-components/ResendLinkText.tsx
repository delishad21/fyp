"use client";

/**
 * Renders text for resending OTP code.
 */

export default function ResendLinkText({
  countdown,
  resending,
  handleResend,
}: {
  countdown: number;
  resending: boolean;
  handleResend: () => void;
}) {
  return (
    <div className="text-center">
      {countdown === 0 ? (
        resending ? (
          <p className="text-sm text-[var(--color-text-secondary)]">Sending…</p>
        ) : (
          <p className="text-sm text-[var(--color-text-secondary)]">
            Didn’t receive the code?{" "}
            <button
              type="button"
              onClick={handleResend}
              className="bg-transparent p-0 text-[var(--color-primary)] underline underline-offset-4 hover:opacity-80"
            >
              Click here to send the code again
            </button>
          </p>
        )
      ) : (
        <p className="text-sm text-[var(--color-text-secondary)]">
          Please wait {countdown}s before sending again.
        </p>
      )}
    </div>
  );
}
