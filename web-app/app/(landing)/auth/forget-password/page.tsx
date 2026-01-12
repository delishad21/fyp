import ThemeToggle from "@/components/ui/ThemeToggle";
import ForgetPasswordForm from "@/components/auth/forms/ForgetPasswordForm";
import { AppTitle } from "@/components/navigation/AppTitle";

export default function ForgotPasswordPage() {
  return (
    <>
      <div className="absolute right-6 top-6">
        <ThemeToggle />
      </div>

      <div className="mx-auto grid min-h-dvh w-full max-w-md content-center px-6">
        <div className="rounded-md bg-[var(--color-bg2)] p-6 shadow-[var(--drop-shadow)]">
          <div className="mb-4 mr-6 flex justify-center">
            <AppTitle />
          </div>
          <h1 className="text-xl font-semibold text-center">Forgot password</h1>
          <p className="mb-5 text-sm text-[var(--color-text-secondary)] text-center">
            Enter your email and we&apos;ll send you a reset link.
          </p>

          <ForgetPasswordForm />
        </div>
      </div>
    </>
  );
}
