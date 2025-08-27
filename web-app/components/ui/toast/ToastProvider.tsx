"use client";

import React, {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

type ToastVariant = "default" | "success" | "error" | "warning";

export type ToastOptions = {
  id?: string;
  title?: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number; // ms (0 = sticky)
};

// Internal toast with animation flags
type InternalToast = Required<ToastOptions> & {
  id: string;
  createdAt: number;
  entering?: boolean;
  leaving?: boolean;
};

type ToastContextValue = {
  toasts: InternalToast[];
  showToast: (opts: ToastOptions) => string;
  dismiss: (id: string) => void;
  clear: () => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<InternalToast[]>([]);
  const timers = useRef(new Map<string, number>());
  const ANIM_MS = 300; // transition duration

  const dismiss = (id: string) => {
    // Set leaving to true to activate animation out
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, leaving: true } : t))
    );
    // remove after leaving animation is done
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      const tm = timers.current.get(id);
      if (tm) {
        window.clearTimeout(tm);
        timers.current.delete(id);
      }
    }, ANIM_MS);
  };

  const showToast: ToastContextValue["showToast"] = (opts) => {
    const id = opts.id ?? crypto.randomUUID();
    const toast: InternalToast = {
      id,
      title: opts.title ?? "",
      description: opts.description ?? "",
      variant: opts.variant ?? "default",
      duration: opts.duration ?? 3000,
      createdAt: Date.now(),
      entering: true, // activate enter animation
    };

    // Newest on top; older ones push down
    setToasts((prev) => [toast, ...prev]);

    // Flip entering to false on next frame to trigger transition
    // double rAF ensures layout is committed before class change
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        setToasts((prev) =>
          prev.map((t) => (t.id === id ? { ...t, entering: false } : t))
        )
      )
    );

    // auto-dismiss
    if (toast.duration > 0) {
      const handle = window.setTimeout(() => dismiss(id), toast.duration);
      timers.current.set(id, handle);
    }

    return id;
  };

  const clear = () => {
    // animate all out, then remove
    setToasts((prev) => prev.map((t) => ({ ...t, leaving: true })));
    window.setTimeout(() => {
      setToasts([]);
      timers.current.forEach((tm) => window.clearTimeout(tm));
      timers.current.clear();
    }, ANIM_MS);
  };

  const value = useMemo(
    () => ({ toasts, showToast, dismiss, clear }),
    [toasts]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

function Toaster() {
  const { toasts, dismiss } = useToast();

  return (
    <div
      className="pointer-events-none fixed right-4 top-4 z-[1000] flex w-[min(92vw,26rem)] flex-col gap-3"
      aria-live="polite"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((t) => {
        const leftAccent =
          t.variant === "success"
            ? "border-l-[var(--color-success)]"
            : t.variant === "error"
            ? "border-l-[var(--color-error)]"
            : t.variant === "warning"
            ? "border-l-[var(--color-warning)]" //
            : "border-l-[var(--color-primary)]";

        return (
          <div
            key={t.id}
            role="status"
            className={[
              // shell
              "pointer-events-auto rounded-md bg-[var(--color-bg2)] text-[var(--color-text-primary)]",
              "border-[var(--color-bg4)] border-l-[10px]",
              leftAccent,
              // animation
              "transform transition-all duration-300 ease-out",
              t.entering ? "translate-x-full" : "",
              t.leaving ? "translate-x-full" : "translate-x-0",
              // shadow
              "shadow-[var(--drop-shadow)]",
            ].join(" ")}
            style={{ boxShadow: "var(--drop-shadow)" }}
          >
            <div className="p-4">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  {t.title ? (
                    <div className="text-sm font-semibold">{t.title}</div>
                  ) : null}
                  {t.description ? (
                    <div className="mt-1 text-sm/5 text-[var(--color-text-secondary)]">
                      {t.description}
                    </div>
                  ) : null}
                </div>
                <button
                  onClick={() => dismiss(t.id)}
                  className="rounded-md p-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-bg3)] hover:text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  aria-label="Dismiss notification"
                >
                  ×
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
