import ThemeToggle from "@/components/ui/ThemeToggle";
import SignInForm from "@/components/auth/forms/SignInForm";
import { AppTitle } from "@/components/navigation/AppTitle";

export default function SignInPage() {
  return (
    <>
      <div className="absolute right-6 top-6">
        <ThemeToggle />
      </div>

      <div className="mx-auto grid min-h-dvh w-full max-w-md content-center px-6">
        <div className="rounded-md bg-[var(--color-bg2)] p-6 shadow-[var(--drop-shadow)]">
          <div className="mb-4 flex justify-center mr-6">
            <AppTitle />
          </div>
          <h1 className="mb-5 text-xl font-semibold text-center">
            Welcome back
          </h1>
          <SignInForm />
        </div>
      </div>
    </>
  );
}
