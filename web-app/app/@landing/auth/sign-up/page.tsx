import ThemeToggle from "@/components/ui/ThemeToggle";
import SignUpForm from "@/components/auth/SignUpForm";
import { AppTitle } from "@/components/navigation/AppTitle";

export default function SignUpPage() {
  return (
    <>
      {/* theme toggle */}
      <div className="absolute right-6 top-6">
        <ThemeToggle />
      </div>

      {/* Sign up card */}
      <div className="mx-auto grid min-h-dvh w-full max-w-md content-center px-6">
        <div
          className="rounded-md bg-[var(--color-bg2)]
                        p-6 shadow-[var(--drop-shadow)]"
        >
          <div className="mb-4 justify-center flex mr-6">
            <AppTitle />
          </div>
          <h1 className="text-xl font-semibold mb-5 text-center">
            Create your account
          </h1>
          <SignUpForm />
        </div>
      </div>
    </>
  );
}
