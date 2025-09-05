"use client";

/**
 * CreateQuizCard Component
 *
 * Purpose:
 *   - Displays a styled card that links to a quiz creation page.
 *   - Designed for use in quiz creation dashboards or selection menus.
 *
 * Props:
 *   @param {string} color
 *     - Background color for the left panel (applied inline).
 *
 *   @param {string} title
 *     - Title of the quiz type (shown prominently at the top).
 *
 *   @param {string[]} description
 *     - List of short description lines explaining the quiz type.
 *
 *   @param {string} href
 *     - Destination link for the card (navigates via Next.js <Link>).
 *
 *   @param {string} [screenshot]
 *     - Optional screenshot image displayed on the right panel.
 *
 *   @param {string} [screenshotAlt]
 *     - Alt text for the screenshot (defaults to `title` if not provided).
 *
 *   @param {string} [className]
 *     - Optional additional classes for customizing the card wrapper.
 *
 * UI:
 *   - Outer clickable card with hover lift/hover shadow.
 *   - Left panel:
 *       • Colored background (via `color`).
 *       • Title and description list.
 *   - Right panel:
 *       • Optional screenshot filling the panel.
 *       • Black background fallback when no screenshot is provided.
 *
 * Accessibility:
 *   - Entire card is wrapped in a semantic <Link> for easy navigation.
 *   - Alt text is applied to the screenshot (uses `title` if none provided).
 */

import Link from "next/link";
import Image from "next/image";
import * as React from "react";

type CreateQuizCardProps = {
  color: string;
  title: string;
  description: string[];
  href: string;
  screenshot?: string;
  screenshotAlt?: string;
  className?: string;
};

export default function CreateQuizCard({
  color,
  title,
  description,
  href,
  screenshot,
  screenshotAlt = "",
  className,
}: CreateQuizCardProps) {
  return (
    <Link
      href={href}
      className={[
        "group block rounded-2xl border border-black/10 shadow-sm transition",
        "hover:shadow-lg hover:-translate-y-0.5 overflow-hidden",
        "min-w-[400px] max-w-[500px] max-h-[160px]",
        className ?? "",
      ].join(" ")}
    >
      <div className="flex min-h-[160px] items-stretch">
        {/* Left: colored panel */}
        <div
          className="flex flex-1 flex-col justify-start gap-3 p-5 text-[var(--color-text-primary-dark)]"
          style={{ background: color }}
        >
          <h3 className="text-xl font-semibold leading-tight">{title}</h3>
          <ul className="text-sm leading-relaxed">
            {description.map((line, i) => (
              <li key={i} className="mb-1.5 last:mb-0">
                {line}
              </li>
            ))}
          </ul>
        </div>

        {/* Right: screenshot fills whole panel */}
        <div className="relative w-[130px] shrink-0 overflow-hidden">
          {/* Optional: background for when there is no image */}
          <div className="absolute inset-0 bg-black" />
          {screenshot && (
            <Image
              src={screenshot}
              alt={screenshotAlt || title}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 180px"
              priority={false}
            />
          )}
        </div>
      </div>
    </Link>
  );
}
