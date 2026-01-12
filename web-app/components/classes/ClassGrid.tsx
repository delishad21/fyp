import ClassCard from "./ClassCard";
import AddClassCard from "./AddClassCard";
import type { ClassItem } from "@/services/class/types/class-types";

export default function ClassGrid({ classes }: { classes: ClassItem[] }) {
  return (
    <div
      className="
        grid gap-6
        sm:grid-cols-2
        lg:grid-cols-3
        xl:grid-cols-4
      "
    >
      {classes?.map((c) => (
        <ClassCard key={c._id} cls={c} />
      ))}
      <AddClassCard href="/classes/create" />
    </div>
  );
}
