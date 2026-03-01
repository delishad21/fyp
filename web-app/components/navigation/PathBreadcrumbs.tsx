"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@iconify/react";

type Crumb = {
  href: string;
  label: string;
  clickable: boolean;
};

const STATIC_SEGMENT_LABELS: Record<string, string> = {
  home: "Home",
  classes: "Classes",
  create: "Create",
  edit: "Edit",
  overview: "Overview",
  students: "Students",
  add: "Add",
  results: "Results",
  scheduling: "Scheduling",
  settings: "Settings",
  accounts: "Accounts",
  subjects: "Subjects & Topics",
  quizzes: "Quizzes",
  view: "View",
  "ai-generate": "AI Generate",
  review: "Review",
  attempt: "Attempt",
};

const ROUTE_PATTERNS: RegExp[] = [
  /^\/home$/,
  /^\/classes$/,
  /^\/classes\/create$/,
  /^\/classes\/[^/]+$/,
  /^\/classes\/[^/]+\/overview$/,
  /^\/classes\/[^/]+\/scheduling$/,
  /^\/classes\/[^/]+\/students$/,
  /^\/classes\/[^/]+\/students\/add$/,
  /^\/classes\/[^/]+\/students\/[^/]+$/,
  /^\/classes\/[^/]+\/students\/[^/]+\/attempt\/[^/]+$/,
  /^\/classes\/[^/]+\/results$/,
  /^\/classes\/[^/]+\/results\/[^/]+$/,
  /^\/classes\/[^/]+\/edit$/,
  /^\/quizzes$/,
  /^\/quizzes\/create$/,
  /^\/quizzes\/create\/[^/]+$/,
  /^\/quizzes\/edit\/[^/]+$/,
  /^\/quizzes\/view\/[^/]+$/,
  /^\/quizzes\/ai-generate$/,
  /^\/quizzes\/ai-generate\/review\/[^/]+$/,
  /^\/quizzes\/ai-generate\/review\/[^/]+\/edit\/[^/]+$/,
  /^\/quizzes\/ai-generate\/review\/[^/]+\/view\/[^/]+$/,
  /^\/scheduling$/,
  /^\/settings$/,
  /^\/settings\/accounts$/,
  /^\/settings\/subjects$/,
];

const PARENT_PATH_PATTERNS: RegExp[] = [
  /^\/$/,
  /^\/home$/,
  /^\/classes$/,
  /^\/quizzes$/,
  /^\/scheduling$/,
  /^\/settings$/,
];

function normalizePathname(pathname: string | null) {
  if (!pathname) return "/";
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function isLikelyId(raw: string) {
  return (
    /^[a-f0-9]{20,}$/i.test(raw) ||
    /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(raw) ||
    /^[0-9]{10,}$/.test(raw)
  );
}

function toTitleCase(raw: string) {
  return raw.replace(/\b\w/g, (c) => c.toUpperCase());
}

function prettifySegment(segment: string) {
  const decoded = decodeURIComponent(segment);
  const staticLabel = STATIC_SEGMENT_LABELS[decoded];
  if (staticLabel) return staticLabel;

  if (isLikelyId(decoded)) {
    return `${decoded.slice(0, 6)}...${decoded.slice(-4)}`;
  }

  const spaced = decoded.replace(/[-_]+/g, " ").trim();
  if (!spaced) return decoded;

  const titled = toTitleCase(spaced);
  if (titled.length > 30) {
    return `${titled.slice(0, 20)}...`;
  }

  return titled;
}

function isNavigablePath(path: string) {
  return ROUTE_PATTERNS.some((pattern) => pattern.test(path));
}

function isParentPath(path: string) {
  return PARENT_PATH_PATTERNS.some((pattern) => pattern.test(path));
}

function canonicalizePath(path: string) {
  const normalized = normalizePathname(path);

  // /classes/:id is an index route that redirects to /classes/:id/overview.
  const classRoot = normalized.match(/^\/classes\/([^/]+)$/);
  if (classRoot) {
    return `/classes/${classRoot[1]}/overview`;
  }

  // /settings redirects to /settings/accounts.
  if (normalized === "/settings") {
    return "/settings/accounts";
  }

  return normalized;
}

function buildCrumbs(
  pathname: string,
  resolvedLabels: Record<string, string>
): Crumb[] {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) {
    return [{ href: "/home", label: "Home", clickable: true }];
  }

  return parts.map((part, index) => {
    const href = `/${parts.slice(0, index + 1).join("/")}`;
    const isCurrent = index === parts.length - 1;
    return {
      href,
      label: resolvedLabels[href] ?? prettifySegment(part),
      clickable: !isCurrent && isNavigablePath(href),
    };
  });
}

export default function PathBreadcrumbs() {
  const router = useRouter();
  const pathname = normalizePathname(usePathname());
  const [resolvedLabels, setResolvedLabels] = useState<Record<string, string>>(
    {}
  );

  const crumbs = useMemo(
    () => buildCrumbs(pathname, resolvedLabels),
    [pathname, resolvedLabels]
  );
  const backPath = useMemo(() => {
    const parts = pathname.split("/").filter(Boolean);
    if (parts.length <= 1) return null;
    const currentCanonical = canonicalizePath(pathname);

    for (let i = parts.length - 1; i >= 1; i--) {
      const candidate = `/${parts.slice(0, i).join("/")}`;
      if (
        isNavigablePath(candidate) &&
        canonicalizePath(candidate) !== currentCanonical
      ) {
        return candidate;
      }
    }

    return null;
  }, [pathname]);

  useEffect(() => {
    let mounted = true;
    const abort = new AbortController();

    setResolvedLabels({});

    (async () => {
      try {
        const res = await fetch(
          `/api/navigation/resolve?pathname=${encodeURIComponent(pathname)}`,
          {
            method: "GET",
            cache: "no-store",
            signal: abort.signal,
          }
        );
        const json = await res.json().catch(() => null);
        if (!mounted) return;
        if (res.ok && json?.ok && json?.labels && typeof json.labels === "object") {
          setResolvedLabels(json.labels as Record<string, string>);
        }
      } catch {
        if (mounted) setResolvedLabels({});
      }
    })();

    return () => {
      mounted = false;
      abort.abort();
    };
  }, [pathname]);

  const canGoBack = Boolean(backPath) && !isParentPath(pathname);

  return (
    <div className="min-w-0 flex items-center gap-3">
      {canGoBack ? (
        <button
          type="button"
          onClick={() => {
            if (backPath) {
              router.push(backPath);
            }
          }}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--color-bg4)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg3)]"
          aria-label="Go back"
          title="Go back"
        >
          <Icon icon="mingcute:left-line" width={18} />
        </button>
      ) : null}

      <nav
        aria-label="Breadcrumb"
        className="min-w-0 overflow-x-auto whitespace-nowrap [scrollbar-width:thin]"
      >
        <ol className="flex min-w-fit items-center gap-1 text-sm text-[var(--color-text-secondary)]">
          {crumbs.map((crumb, index) => {
            const isLast = index === crumbs.length - 1;

            return (
              <li key={crumb.href} className="flex items-center gap-1">
                {crumb.clickable ? (
                  <Link
                    href={crumb.href}
                    className="rounded px-1 py-0.5 hover:bg-[var(--color-bg3)] hover:text-[var(--color-text-primary)]"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span
                    className={
                      isLast
                        ? "px-1 py-0.5 font-medium text-[var(--color-text-primary)]"
                        : "px-1 py-0.5"
                    }
                  >
                    {crumb.label}
                  </span>
                )}
                {!isLast ? (
                  <Icon
                    icon="mingcute:right-small-line"
                    width={16}
                    className="text-[var(--color-text-secondary)]"
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}
