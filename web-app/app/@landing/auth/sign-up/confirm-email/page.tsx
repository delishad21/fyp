import ThemeToggle from "@/components/ui/ThemeToggle";
import { AppTitle } from "@/components/navigation/AppTitle";
import ConfirmEmailForm from "@/components/auth/ConfirmEmailForm";

export default function ConfirmEmailPage() {
  return (
    <>
      <div className="absolute right-6 top-6">
        <ThemeToggle />
      </div>

      <div className="mx-auto grid min-h-dvh w-full max-w-md content-center px-6">
        <div className="rounded-md bg-[var(--color-bg2)] p-6 shadow-[var(--drop-shadow)]">
          <div className="mb-8 mr-6 flex justify-center">
            <AppTitle />
          </div>
          <h1 className="text-xl font-semibold text-center">
            Email confirmation
          </h1>
          <p className="mb-7 text-sm text-[var(--color-text-secondary)] text-center">
            Enter the 6-digit code sent to your email.
          </p>
          <ConfirmEmailForm />
        </div>
      </div>
    </>
  );
}
