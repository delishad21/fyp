import AddStudentsForm from "@/components/classes/class-page/AddStudentsForm";

type Props = { params: { id: string } };

export default async function AddStudentsPage({ params }: Props) {
  const classId = (await params).id;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Add Students</h1>
      </div>

      <AddStudentsForm classId={classId} />
    </div>
  );
}
