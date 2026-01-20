import { ReactNode } from "react";
import Image from "next/image";
import { DEFAULT_IMG } from "@/services/class/helpers/class-helpers";
import TabsNav from "@/components/navigation/TabNav";
import { getClass } from "@/services/class/actions/class-actions";
import Button from "@/components/ui/buttons/Button";

export default async function ClassLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id: classId } = await params;
  const cls = await getClass(classId);

  const imgUrl = cls?.image?.url || DEFAULT_IMG;
  const color = cls?.metadata?.color || "#3D5CFF";

  return (
    <>
      <section className="relative overflow-hidden bg-[var(--color-bg2)]">
        <div className="relative h-72 w-full">
          <Image
            src={imgUrl}
            alt={`${cls?.name ?? "Class"} cover`}
            fill
            className="object-cover"
            sizes="100vw"
            priority={false}
            unoptimized
          />

          {/* Stronger bottom scrim for readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />

          {/* Title block (glass card) */}
          <div className="absolute left-5 bottom-4 right-5 flex items-end justify-between gap-4">
            <div
              className={[
                "max-w-[75%] rounded-lg px-4 py-3",
                "bg-black/35 backdrop-blur-md",
                "border border-white/10",
              ].join(" ")}
            >
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold text-white drop-shadow-sm">
                  {cls?.name ?? "Class"}
                </h1>
              </div>

              {cls?.level && (
                <p className="mt-1 text-sm text-white/80 drop-shadow-sm">
                  {cls.level}
                </p>
              )}
            </div>

            <Button
              href={`/classes/${classId}/edit`}
              variant="primary"
              title="Edit Class info"
              className="shrink-0"
            >
              Edit Class info
            </Button>
          </div>
        </div>

        {/* Accent bar (class color) */}
        <div className="h-6 w-full" style={{ backgroundColor: color }} />
      </section>

      {/* Tabs */}
      <TabsNav id={classId} />

      {/* Tab content */}
      <section className="m-5">{children}</section>
    </>
  );
}
