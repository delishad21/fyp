import { Suspense } from "react";
import { Icon } from "@iconify/react";
import GenerationWizard from "@/components/quizzes/ai-generation/GenerationWizard";
import JobsSidebar from "@/components/quizzes/ai-generation/JobsSidebar";
import { getFilterMeta } from "@/services/quiz/actions/quiz-metadata-actions";

export default async function AIGeneratePage() {
  const meta = await getFilterMeta();

  return (
    <div className="px-10 pt-6 pb-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">
          AI Quiz Generation
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          Generate quizzes with AI and review your previous generation jobs
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content - Generation Wizard */}
        <div className="lg:col-span-2">
          <div className="bg-[var(--color-bg2)] rounded-lg p-6">
            <h2 className="text-xl font-semibold text-[var(--color-text-primary)] mb-4">
              Create New Generation Job
            </h2>
            <GenerationWizard meta={meta} />
          </div>
        </div>

        {/* Sidebar - Previous Jobs */}
        <div className="lg:col-span-1">
          <div className="bg-[var(--color-bg2)] rounded-lg p-6 sticky top-6">
            <Suspense
              fallback={
                <div className="flex items-center justify-center py-8">
                  <Icon
                    icon="mdi:loading"
                    className="w-6 h-6 animate-spin text-[var(--color-accent)]"
                  />
                </div>
              }
            >
              <JobsSidebar />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
