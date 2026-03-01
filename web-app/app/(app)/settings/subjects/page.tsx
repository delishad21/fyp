import QuizMetaManager from "@/components/settings/meta-manager/QuizMetaManager";
import { getFilterMeta } from "@/services/quiz/actions/quiz-metadata-actions";

export default async function SubjectTopicSettingsPage() {
  const meta = await getFilterMeta();

  return (
    <div className="max-w-6xl">
      <QuizMetaManager initialMeta={meta} />
    </div>
  );
}
