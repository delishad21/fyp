import Link from "next/link";
import { AppTitle } from "@/components/navigation/AppTitle";
import ThemeToggle from "@/components/ui/ThemeToggle";
import { Icon } from "@iconify/react";

export default function LandingPage() {
  return (
    <main className="relative flex min-h-dvh flex-col">
      <div className="pointer-events-none absolute inset-0 z-0 bg-[var(--color-bg1)]" />

      <header className="border-b border-[var(--color-bg3)] bg-[var(--color-bg2)]/95 backdrop-blur">
        <div className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-3">
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

      <section className="relative z-10 flex flex-1 items-center mb-30">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-6 py-14 lg:grid-cols-[1.1fr_0.9fr] lg:py-20">
          <div className="max-w-2xl">
            <h1 className="mt-5 text-4xl font-extrabold leading-tight text-[var(--color-text-primary)] md:text-5xl">
              Run smarter quiz practice with{" "}
              <span className="text-[var(--color-primary)]">Ember</span>
            </h1>

            <p className="mt-5 text-base leading-7 text-[var(--color-text-secondary)] md:text-lg">
              Create quizzes, schedule them across classes, and track student
              performance. Ember serves as a time saving tool for teachers.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/auth/sign-up"
                className="rounded-md bg-[var(--color-primary)] px-5 py-3 text-sm font-semibold text-white shadow-[var(--drop-shadow-sm)] transition hover:opacity-90"
              >
                Create account
              </Link>
              <Link
                href="/auth/sign-in"
                className="rounded-md border border-[var(--color-bg4)] bg-[var(--color-bg2)] px-5 py-3 text-sm font-semibold text-[var(--color-text-primary)] transition hover:bg-[var(--color-bg3)]"
              >
                Sign in
              </Link>
            </div>
          </div>

          <div className="grid gap-4 self-start mt-10">
            <div className="rounded-md border border-[var(--color-bg4)] bg-[var(--color-bg2)] p-5 shadow-[var(--drop-shadow-sm)]">
              <div className="flex items-center gap-3">
                <span className="text-[var(--color-primary)]">
                  <Icon icon="mingcute:book-2-line" width={30} />
                </span>
                <div>
                  <p className="text-md font-semibold text-[var(--color-primary)]">
                    Quiz Creation
                  </p>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    Multiple quiz types supporting different Learning Outcomes
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-md border border-[var(--color-bg4)] bg-[var(--color-bg2)] p-5 shadow-[var(--drop-shadow-sm)]">
              <div className="flex items-center gap-3">
                <span className="text-[var(--color-error)]">
                  <Icon icon="mingcute:calendar-line" width={30} />
                </span>
                <div>
                  <p className="text-md font-semibold text-[var(--color-error)]">
                    Class and Schedule Management
                  </p>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    Organize students into classes, schedule quizzes, and track
                    results
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-md border border-[var(--color-bg4)] bg-[var(--color-bg2)] p-5 shadow-[var(--drop-shadow-sm)]">
              <div className="flex items-center gap-3">
                <span className="text-[var(--color-success)]">
                  <Icon icon="mingcute:sparkles-line" width={30} />
                </span>
                <div>
                  <p className="text-md font-semibold text-[var(--color-success)]">
                    AI Drafting Support
                  </p>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    Use AI tools to generate large quantities of quizzes for
                    practice.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
