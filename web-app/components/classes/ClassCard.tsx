import Link from "next/link";
import Image from "next/image";
import { ClassItem } from "@/services/class/types/class-types";
import { DEFAULT_IMG } from "@/services/class/helpers/class-helpers";

export default function ClassCard({ cls }: { cls: ClassItem }) {
  const color = cls?.metadata?.color || "#3D5CFF";
  const imgUrl = cls?.image?.url || DEFAULT_IMG;
  const studentCount = cls?.studentCount ?? 0;

  return (
    <Link
      href={`/classes/${encodeURIComponent(cls._id)}`}
      className="
        group relative flex h-[220px] flex-col overflow-hidden rounded-2xl
        shadow-lg ring-1 ring-black/5 bg-[var(--color-bg2)]
        transition-transform hover:-translate-y-[5px]
      "
    >
      {/* Image */}
      <div className="relative h-full w-full">
        <img
          src={imgUrl}
          alt={`${cls.name} cover`}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
        />
      </div>

      {/* Colored bar pinned to bottom */}
      <div
        className="
          absolute bottom-0 left-0 right-0
          mt-auto flex items-center justify-between
          px-4 py-3 text-white
        "
        style={{ backgroundColor: color }}
      >
        <div className="truncate text-lg font-semibold leading-none">
          {cls.name}
        </div>
        <div className="text-right text-xs opacity-95 leading-tight">
          <div className="truncate">{cls.level}</div>
          <div className="truncate">{studentCount} Students</div>
        </div>
      </div>
    </Link>
  );
}
