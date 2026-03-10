"use client";

import Image from "next/image";
import Button from "@/components/ui/buttons/Button";
import type { StudentBadgeItem } from "@/services/game/actions/rewards-actions";

type Props = {
  badges: StudentBadgeItem[];
  ownedBadgeIds?: string[];
  displayedBadgeIds?: string[];
  toggleAction?: (formData: FormData) => void | Promise<void>;
  allowGrant?: boolean;
  emptyMessage?: string;
  className?: string;
};

export default function BadgeCatalogGallery({
  badges,
  ownedBadgeIds = [],
  displayedBadgeIds = [],
  toggleAction,
  allowGrant = true,
  emptyMessage = "No badges unlocked yet.",
  className = "",
}: Props) {
  const ownedSet = new Set((ownedBadgeIds || []).map((id) => String(id)));
  const displaySet = new Set((displayedBadgeIds || []).map((id) => String(id)));

  return (
    <section className={["rounded-md bg-[var(--color-bg2)] p-3 ring-1 ring-black/5", className].join(" ")}>
      {badges.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--color-bg4)] bg-[var(--color-bg3)] p-6 text-center text-sm text-[var(--color-text-secondary)]">
          {emptyMessage}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {badges
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
            .map((badge) => {
              const isOwned = ownedSet.has(String(badge.id));
              const isDisplayed = displaySet.has(String(badge.id));
              return (
                <article
                  key={badge.id}
                  className={[
                    "overflow-hidden rounded-md bg-[var(--color-bg3)] ring-1 ring-black/5",
                    isOwned ? "ring-2 ring-emerald-500/35" : "",
                    isDisplayed ? "ring-2 ring-[var(--color-primary)]/45" : "",
                  ].join(" ")}
                >
                  <div className="relative aspect-square w-full bg-[var(--color-bg4)]">
                    {badge.imageUrl ? (
                      <Image
                        src={badge.imageUrl}
                        alt={badge.name}
                        fill
                        className="object-contain"
                        sizes="(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 25vw"
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-[var(--color-text-secondary)]">
                        No image
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 p-3">
                    <div className="space-y-1">
                      <p className="line-clamp-1 text-sm font-semibold text-[var(--color-text-primary)]">
                        {badge.name}
                      </p>
                      {badge.engraving ? (
                        <p className="line-clamp-1 text-xs text-[var(--color-text-secondary)]">
                          {badge.engraving}
                        </p>
                      ) : null}
                      {isDisplayed ? (
                        <span className="text-xs font-semibold text-[var(--color-primary)]">
                          Displayed on profile
                        </span>
                      ) : null}
                      {!isOwned ? (
                        <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                          Locked
                        </span>
                      ) : null}
                    </div>

                    {toggleAction && (isOwned || allowGrant) ? (
                      <form action={toggleAction}>
                        <input type="hidden" name="badgeId" value={badge.id} />
                        <Button
                          type="submit"
                          variant={isOwned ? "error" : "primary"}
                          className="w-full text-xs"
                        >
                          {isOwned ? "Revoke" : "Unlock"}
                        </Button>
                      </form>
                    ) : null}
                  </div>
                </article>
              );
            })}
        </div>
      )}
    </section>
  );
}
