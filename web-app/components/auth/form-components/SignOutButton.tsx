"use client";

/**
 * Basic sign out button component that calls the sign out action on button press
 */

import { signOutAction } from "@/services/user/sign-in-actions";
import IconButton from "@/components/ui/buttons/IconButton";

export default function SignOutButton({
  compact = false,
}: {
  compact?: boolean;
}) {
  return (
    <form action={signOutAction}>
      {compact ? (
        <IconButton
          icon="mingcute:log-out-line"
          title="Sign Out"
          ariaLabel="Sign Out"
          variant="error"
          size="md"
          type="submit"
        />
      ) : (
        <button
          type="submit"
          className="rounded-sm text-white bg-[var(--color-error)] hover:opacity-90 transition px-4 py-2"
          title="Sign Out"
        >
          Sign Out
        </button>
      )}
    </form>
  );
}
