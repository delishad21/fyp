import { ReactNode } from "react";
import { DEFAULT_IMG } from "@/services/class/helpers/class-helpers";
import TabsNav from "@/components/navigation/TabNav";
import { getClass } from "@/services/class/actions/class-actions";
import Button from "@/components/ui/buttons/Button";

export default async function ClassLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { id: string };
}) {
  const classId = (await params).id;
  const cls = await getClass(classId);
  const imgUrl = cls?.image?.url || DEFAULT_IMG;
  const color = cls?.metadata?.color || "#3D5CFF";

  return (
    <>
      <section
        className="
          relative overflow-hiddenbg-[var(--color-bg2)]
        "
      >
        <div className="relative h-70 w-full">
          <img
            src={imgUrl}
            alt={`${cls?.name ?? "Class"} cover`}
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
          />
          {/* gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-black/10" />

          {/* Title + level */}
          <div className="absolute left-5 bottom-4">
            <h1 className="text-4xl font-bold text-white drop-shadow">
              {cls?.name ?? "Class"}
            </h1>
            {cls?.level && <p className="text-xl drop-shadow">{cls.level}</p>}
          </div>

          {/* Edit button */}
          <div className="absolute right-4 bottom-4">
            <Button
              href={`/classes/${classId}/edit`}
              variant="primary"
              title="Edit Class info"
            >
              Edit Class info
            </Button>
          </div>
        </div>

        {/* Accent bar (uses class color) */}
        <div className="h-4 w-full" style={{ backgroundColor: color }} />
      </section>

      {/* Tabs */}
      <TabsNav id={classId} />

      {/* Tab content */}
      <section className="m-5">{children}</section>
    </>
  );
}
