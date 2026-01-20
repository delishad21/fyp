import AddStudentsForm from "@/components/classes/class-page/AddStudentsForm";

type Props = { params: Promise<{ id: string }> };

export default async function AddStudentsPage({ params }: Props) {
  const { id: classId } = await params;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Add Students</h1>
      </div>

      <AddStudentsForm classId={classId} />
    </div>
  );
}
