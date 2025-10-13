import { getClasses } from "@/services/class/actions/class-actions";
import ClassGrid from "@/components/classes/ClassGrid";

export default async function ClassesPage() {
  const classes = await getClasses();

  return (
    <div className="px-6 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Classes</h1>
      </div>

      <ClassGrid classes={classes ?? []} />
    </div>
  );
}
