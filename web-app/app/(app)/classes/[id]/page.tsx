import { redirect } from "next/navigation";

export default async function ClassIndex({
  params,
}: {
  params: { id: string };
}) {
  redirect(`/classes/${encodeURIComponent((await params).id)}/overview`);
}
