import ThemeToggle from "@/components/ui/ThemeToggle";
import { AppTitle } from "@/components/navigation/AppTitle";
import ResetPasswordForm from "@/components/auth/forms/ResetPasswordForm";
import { redirect } from "next/navigation";
import { checkValidSelector } from "@/services/user/reset-password-actions";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: any;
}) {
  const params = await searchParams;

  const selector = params.selector?.toString() || "";
  const validator = params.validator?.toString() || "";

  // Must have both in the URL to continue
  // but we only validate the selector on page load
  if (!selector || !validator) {
    redirect("/");
  }

  const status = await checkValidSelector(selector);

  if (!status) {
    redirect("/");
  }

  return (
    <>
      <div className="absolute right-6 top-6">
        <ThemeToggle />
      </div>

      <div className="mx-auto grid min-h-dvh w-full max-w-md content-center px-6">
        <div className="flex flex-col justify-center rounded-md bg-[var(--color-bg2)] p-6 shadow-[var(--drop-shadow)]">
          <div className="mb-4 mr-6 flex justify-center">
            <AppTitle />
          </div>
          <h1 className="text-xl font-semibold text-center">Reset password</h1>
          <p className="mb-5 text-sm text-[var(--color-text-secondary)] text-center">
            Enter your new password below.
          </p>

          {/* Pass selector & validator to the client form */}
          <ResetPasswordForm selector={selector} validator={validator} />
        </div>
      </div>
    </>
  );
}
