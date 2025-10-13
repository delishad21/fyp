import IconButton from "@/components/ui/buttons/IconButton";
import Link from "next/link";

export function ScheduleTitleComponent({ classId }: { classId: string }) {
  return (
    <div className="flex items-center gap-3">
      <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
        Schedule
      </h3>
      <Link href={`/classes/${encodeURIComponent(classId)}/scheduling`}>
        <IconButton
          icon="mdi:pencil"
          variant="borderless"
          title="Edit Schedule"
          ariaLabel="Edit Schedule"
        />
      </Link>
    </div>
  );
}
