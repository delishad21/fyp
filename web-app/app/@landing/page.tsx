// app/page.tsx
import Link from "next/link";
import { AppTitle } from "@/components/navigation/AppTitle";
import ThemeToggle from "@/components/ui/ThemeToggle";

export default function LandingPage() {
  return (
    <main className="flex min-h-dvh flex-col">
      <header className="border-b border-[var(--color-bg3)] bg-[var(--color-bg2)]">
        <div className="px-6 flex w-full items-center justify-between">
          <AppTitle />
          <div className="flex items-center gap-4">
            <nav className="flex items-center gap-3">
              <Link
                href="/auth/sign-in"
                className="rounded-sm px-4 py-2 text-sm bg-[var(--color-bg2)] hover:bg-[var(--color-bg3)] border-2 border-[var(--color-bg4)] text-[var(--color-text-primary)] hover:text-[var(--color-text-secondary)]"
              >
                Sign in
              </Link>
              <Link
                href="/auth/sign-up"
                className="rounded-sm px-4 py-2 text-sm bg-[var(--color-primary)] text-white hover:opacity-90"
              >
                Create account
              </Link>
            </nav>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <section className="flex-1" />
    </main>
  );
}
