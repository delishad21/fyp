import EditClassForm, {
  ClassEditInitial,
} from "@/components/classes/class-page/EditClassForm";
import { getClass } from "@/services/class/actions/class-actions";
import Button from "@/components/ui/buttons/Button";
import { notFound } from "next/navigation";

export default async function EditClassPage({
  params,
}: {
  params: { id: string };
}) {
  const cls = await getClass(params.id);
  if (!cls) notFound();

  const initial: ClassEditInitial = {
    _id: cls._id ?? cls.id ?? params.id,
    name: cls.name ?? "",
    level: cls.level ?? "",
    timezone: cls.timezone,
    metadata: { color: cls?.metadata?.color },
    image: cls.image ?? null,
  };

  return (
    <div className="px-6 py-6">
      <div className="flex flex-row mb-6 space-x-10 items-start">
        <h1 className="mt-1 text-2xl font-semibold">Edit Class</h1>

        <Button
          href={`/classes/${encodeURIComponent(initial._id)}/students/add`}
          variant="ghost"
          className="w-fit"
        >
          Add New Students
        </Button>
      </div>
      <EditClassForm initial={initial} />
    </div>
  );
}
