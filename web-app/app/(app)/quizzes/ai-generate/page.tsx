import { Suspense } from "react";
import { Icon } from "@iconify/react";
import GenerationWizard from "@/components/quizzes/ai-generation/GenerationWizard";
import JobsSidebar from "@/components/quizzes/ai-generation/JobsSidebar";
import { getFilterMeta } from "@/services/quiz/actions/quiz-metadata-actions";
import { getAvailableModels } from "@/services/ai-generation/ai-generation-actions";

export default async function AIGeneratePage() {
  const [meta, modelsResult] = await Promise.all([
    getFilterMeta(),
    getAvailableModels(),
  ]);
  const availableModels = modelsResult.models || [];
  const aiGenerationAvailable =
    modelsResult.ok && modelsResult.available && availableModels.length > 0;

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
            {aiGenerationAvailable ? (
              <GenerationWizard
                meta={meta}
                availableModels={availableModels}
                defaultModelId={modelsResult.defaultModelId}
              />
            ) : (
              <div className="rounded-xl border border-[var(--color-bg4)] bg-[var(--color-bg1)] p-5">
                <div className="flex items-start gap-3">
                  <Icon
                    icon="mingcute:warning-fill"
                    className="w-5 h-5 text-[var(--color-warning)] mt-0.5"
                  />
                  <div>
                    <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                      AI generation is currently not available
                    </p>
                    <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                      Configure at least one model API key in the AI service
                      environment to enable quiz generation.
                    </p>
                  </div>
                </div>
              </div>
            )}
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
