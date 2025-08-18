"use client";

import ThemeToggle from "@/components/ui/ThemeToggle";
import { AppTitle } from "@/components/navigation/AppTitle";
import ResetPasswordForm from "@/components/auth/ResetPasswordForm";

export default function ResetPasswordPage() {
  return (
    <>
      <div className="absolute right-6 top-6">
        <ThemeToggle />
      </div>

      <div className="mx-auto grid min-h-dvh w-full max-w-md content-center px-6">
        <div className="flex flex-col justify-centerrounded-md bg-[var(--color-bg2)] p-6 shadow-[var(--drop-shadow)]">
          <div className="mb-4 mr-6 flex justify-center">
            <AppTitle />
          </div>
          <h1 className="text-xl font-semibold text-center">Reset password</h1>
          <p className="mb-5 text-sm text-[var(--color-text-secondary)] text-center">
            Enter your new password below.
          </p>

          <ResetPasswordForm />
        </div>
      </div>
    </>
  );
}
