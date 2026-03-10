"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Button from "@/components/ui/buttons/Button";
import { Pill } from "@/components/ui/ui";

export type CosmeticGalleryItem = {
  id: string;
  name: string;
  slot: string;
  description?: string;
  assetUrl?: string;
  defaultOwned?: boolean;
};

type Props = {
  cosmetics: CosmeticGalleryItem[];
  ownedCosmeticIds?: string[];
  nonRevocableOwnedIds?: string[];
  toggleAction?: (formData: FormData) => void | Promise<void>;
  emptyMessage?: string;
  compactCards?: boolean;
  className?: string;
};

const SLOT_ORDER = [
  "avatar",
  "eyes",
  "mouth",
  "upperwear",
  "lowerwear",
  "hair",
  "outerwear",
  "head_accessory",
  "eye_accessory",
  "wrist_accessory",
  "pet",
  "shoes",
];

const SLOT_LABELS: Record<string, string> = {
  avatar: "Skin Color",
  eyes: "Eyes",
  mouth: "Mouth",
  upperwear: "Upperwear",
  lowerwear: "Lowerwear",
  hair: "Hair",
  outerwear: "Outerwear",
  head_accessory: "Head Accessory",
  eye_accessory: "Eye Accessory",
  wrist_accessory: "Wrist Accessory",
  pet: "Pet",
  shoes: "Shoes",
};

function slotLabel(slot: string) {
  return SLOT_LABELS[slot] || slot.replace(/_/g, " ");
}

function slotRank(slot: string) {
  const idx = SLOT_ORDER.indexOf(slot);
  return idx === -1 ? SLOT_ORDER.length + 1 : idx;
}

export default function CosmeticCatalogGallery({
  cosmetics,
  ownedCosmeticIds = [],
  nonRevocableOwnedIds = [],
  toggleAction,
  emptyMessage = "No cosmetics found in this category.",
  compactCards = false,
  className = "",
}: Props) {
  const [activeSlot, setActiveSlot] = useState<string>("all");
  const ownedSet = useMemo(
    () => new Set(ownedCosmeticIds.map((id) => String(id))),
    [ownedCosmeticIds]
  );
  const nonRevocableOwnedSet = useMemo(
    () => new Set(nonRevocableOwnedIds.map((id) => String(id))),
    [nonRevocableOwnedIds]
  );

  const availableSlots = useMemo(() => {
    const unique = Array.from(
      new Set(cosmetics.map((item) => String(item.slot || "")))
    ).filter(Boolean);
    unique.sort((a, b) => slotRank(a) - slotRank(b) || a.localeCompare(b));
    return unique;
  }, [cosmetics]);

  const filtered = useMemo(() => {
    const base = activeSlot === "all"
      ? cosmetics
      : cosmetics.filter((item) => item.slot === activeSlot);
    return base
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  }, [activeSlot, cosmetics]);

  return (
    <div className={["grid gap-4 md:grid-cols-[220px_1fr]", className].join(" ")}>
      <aside className="h-fit rounded-md bg-[var(--color-bg2)] p-3 ring-1 ring-black/5">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
          Cosmetic Type
        </p>
        <ul className="space-y-1">
          <li>
            <button
              type="button"
              onClick={() => setActiveSlot("all")}
              className={[
                "inline-flex w-full items-center rounded-sm px-3 py-1.5 text-left text-sm transition",
                activeSlot === "all"
                  ? "bg-[var(--color-primary)] text-white"
                  : "text-[var(--color-text-primary)] hover:bg-[var(--color-bg3)]",
              ].join(" ")}
            >
              All
            </button>
          </li>
          {availableSlots.map((slot) => (
            <li key={slot}>
              <button
                type="button"
                onClick={() => setActiveSlot(slot)}
                className={[
                  "inline-flex w-full items-center rounded-sm px-3 py-1.5 text-left text-sm transition",
                  activeSlot === slot
                    ? "bg-[var(--color-primary)] text-white"
                    : "text-[var(--color-text-primary)] hover:bg-[var(--color-bg3)]",
                ].join(" ")}
              >
                {slotLabel(slot)}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="rounded-md bg-[var(--color-bg2)] p-3 ring-1 ring-black/5">
        {filtered.length === 0 ? (
          <div className="rounded-md border border-dashed border-[var(--color-bg4)] bg-[var(--color-bg3)] p-6 text-center text-sm text-[var(--color-text-secondary)]">
            {emptyMessage}
          </div>
        ) : (
          <div
            className={[
              "grid gap-3",
              compactCards
                ? "grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
            ].join(" ")}
          >
            {filtered.map((item) => {
              const isOwned = ownedSet.has(item.id);
              const isNonRevocableOwned =
                isOwned && nonRevocableOwnedSet.has(String(item.id));
              return (
                <article
                  key={item.id}
                  className={[
                    "overflow-hidden rounded-md bg-[var(--color-bg3)] ring-1 ring-black/5",
                    isOwned ? "ring-2 ring-emerald-500/40" : "",
                  ].join(" ")}
                >
                  <div className="relative aspect-square w-full bg-[var(--color-bg4)]">
                    {item.assetUrl ? (
                      <Image
                        src={item.assetUrl}
                        alt={item.name}
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
                        {item.name}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Pill text={slotLabel(item.slot)} />
                        {isOwned ? (
                          <span className="text-xs font-medium text-emerald-400">
                            Unlocked
                          </span>
                        ) : null}
                        {isNonRevocableOwned ? (
                          <span className="text-xs font-medium text-amber-500">
                            Default
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {toggleAction ? (
                      isNonRevocableOwned ? (
                        <Button
                          type="button"
                          variant="ghost"
                          disabled
                          className="w-full text-xs"
                          title="Default items cannot be revoked"
                        >
                          Default (Locked)
                        </Button>
                      ) : (
                        <form action={toggleAction}>
                          <input type="hidden" name="itemId" value={item.id} />
                          <Button
                            type="submit"
                            variant={isOwned ? "error" : "primary"}
                            className="w-full text-xs"
                          >
                            {isOwned ? "Revoke" : "Unlock"}
                          </Button>
                        </form>
                      )
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
