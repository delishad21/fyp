export async function requestPasswordReset(
  identifier: string
): Promise<{ error?: string; message?: string }> {
  await new Promise((r) => setTimeout(r, 600)); // simulate network

  if (!identifier || identifier.length < 3) {
    return { error: "Please provide a valid username or email." };
  }

  // Accept anything as “valid” for now
  return {
    message:
      "Password reset link sent. Ensure you open the link in the same browser.",
  };
}

export async function resendResetLink(): Promise<{
  error?: string;
  ok?: boolean;
}> {
  await new Promise((r) => setTimeout(r, 600)); // simulate network
  return { ok: true };
}
