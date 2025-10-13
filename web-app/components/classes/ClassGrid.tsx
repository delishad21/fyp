import ClassCard from "./ClassCard";
import AddClassCard from "./AddClassCard";

type ImgMeta = { url?: string; filename?: string; path?: string };
type ClassItem = {
  _id: string;
  name: string;
  level: string;
  image?: ImgMeta | null;
  students?: Array<any>;
  metadata?: { color?: string };
};

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
