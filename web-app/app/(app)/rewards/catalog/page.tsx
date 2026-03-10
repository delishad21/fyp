import { getRewardsCatalogAction } from "@/services/game/actions/rewards-actions";
import CosmeticCatalogGallery from "@/components/game/CosmeticCatalogGallery";

export default async function RewardsCatalogPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  void searchParams;
  const catalogRes = await getRewardsCatalogAction();

  return (
    <section className="space-y-4 rounded-md bg-[var(--color-bg2)] p-4 ring-1 ring-black/5">
      <div>
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          Cosmetic Catalog
        </h2>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Browse all available cosmetics by category.
        </p>
      </div>

      {!catalogRes.ok ? (
        <div className="rounded-md border border-red-700/40 bg-red-950/30 p-3 text-sm text-red-200">
          {catalogRes.message}
        </div>
      ) : (
        <CosmeticCatalogGallery cosmetics={catalogRes.data.cosmetics} />
      )}
    </section>
  );
}
