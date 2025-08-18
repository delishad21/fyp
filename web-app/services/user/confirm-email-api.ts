export async function confirmEmail(
  code: string
): Promise<{ error?: string; message?: string }> {
  await new Promise((r) => setTimeout(r, 600)); // simulate network

  if (!/^\d{6}$/.test(code)) return { error: "Please enter a 6-digit code." };
  if (code !== "123456") return { error: "Invalid code. Please try again." };

  return { message: "Email confirmed successfully!" };
}

export async function resendCode(): Promise<{ error?: string; ok?: boolean }> {
  await new Promise((r) => setTimeout(r, 600));
  return { ok: true };
}
