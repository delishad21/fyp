import type { GenerationJob, Metrics } from "../types";
import { estimateUsageCostUsd } from "../pricing";
import QuizPreviewCard from "./QuizPreviewCard";

type RunResultsCardProps = {
  job: GenerationJob | null;
  metrics: Metrics | null;
  onExportPdf: () => void;
  onExportCsv: () => void;
};

export default function RunResultsCard({
  job,
  metrics,
  onExportPdf,
  onExportCsv,
}: RunResultsCardProps) {
  const formatUsd = (value: number | null): string =>
    value === null ? "N/A" : `$${value.toFixed(6)}`;

  const overallInputTokens =
    metrics &&
    (metrics.generationInputTokens !== null || metrics.planningInputTokens !== null)
      ? (metrics.generationInputTokens || 0) + (metrics.planningInputTokens || 0)
      : null;

  const overallOutputTokens =
    metrics &&
    (metrics.generationOutputTokens !== null || metrics.planningOutputTokens !== null)
      ? (metrics.generationOutputTokens || 0) + (metrics.planningOutputTokens || 0)
      : null;

  return (
    <section id="print-report" className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h2 style={{ margin: 0 }}>Run Result</h2>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            Status: <strong>{job?.status || "Not started"}</strong>
            {job ? ` • Progress ${job.progress.current}/${job.progress.total}` : ""}
          </p>
        </div>
        <div className="row no-print">
          <button onClick={onExportCsv} disabled={!job?.results?.quizzes?.length}>
            Export Metrics CSV
          </button>
          <button onClick={onExportPdf} disabled={!job?.results?.quizzes?.length}>
            Export Quizzes to PDF
          </button>
        </div>
      </div>

      {job?.error ? <p className="error-text">{job.error}</p> : null}

      {metrics ? (
        <>
          <h3 style={{ marginBottom: 8 }}>Automatic Metrics</h3>
          <div className="stat-grid">
            <div className="stat">
              <p className="label">Completion Rate</p>
              <p className="value">{metrics.completionRate.toFixed(1)}%</p>
            </div>
            <div className="stat">
              <p className="label">Planning Latency</p>
              <p className="value">
                {metrics.planningLatencyMs !== null
                  ? `${(metrics.planningLatencyMs / 1000).toFixed(1)}s`
                  : "N/A"}
              </p>
            </div>
            <div className="stat">
              <p className="label">Generation Latency</p>
              <p className="value">
                {metrics.generationLatencyMs !== null
                  ? `${(metrics.generationLatencyMs / 1000).toFixed(1)}s`
                  : "N/A"}
              </p>
            </div>
            <div className="stat">
              <p className="label">Total LLM Latency</p>
              <p className="value">
                {metrics.totalLlmLatencyMs !== null
                  ? `${(metrics.totalLlmLatencyMs / 1000).toFixed(1)}s`
                  : metrics.wallClockMs !== null
                    ? `${(metrics.wallClockMs / 1000).toFixed(1)}s*`
                    : "N/A"}
              </p>
              {metrics.totalLlmLatencyMs === null && metrics.wallClockMs !== null ? (
                <p className="muted" style={{ margin: 0 }}>
                  *client fallback
                </p>
              ) : null}
            </div>
            <div className="stat">
              <p className="label">Retry Count</p>
              <p className="value">{metrics.retryCount}</p>
            </div>
            <div className="stat">
              <p className="label">Planning Fallback</p>
              <p className="value">
                {metrics.planningFallbackUsed === null
                  ? "N/A"
                  : metrics.planningFallbackUsed
                    ? "Yes"
                    : "No"}
              </p>
            </div>
            <div className="stat">
              <p className="label">Generation Attempts</p>
              <p className="value">
                {metrics.generationAttemptCount !== null
                  ? String(metrics.generationAttemptCount)
                  : "N/A"}
              </p>
              {metrics.generationSuccessfulAttempts !== null ? (
                <p className="muted" style={{ margin: 0 }}>
                  Success: {metrics.generationSuccessfulAttempts}
                </p>
              ) : null}
            </div>
            <div className="stat">
              <p className="label">Generation Tokens</p>
              <p className="value">
                {metrics.generationTotalTokens !== null
                  ? String(metrics.generationTotalTokens)
                  : "N/A"}
              </p>
              {metrics.generationInputTokens !== null ||
              metrics.generationOutputTokens !== null ? (
                <p className="muted" style={{ margin: 0 }}>
                  in: {metrics.generationInputTokens ?? "N/A"} • out:{" "}
                  {metrics.generationOutputTokens ?? "N/A"}
                </p>
              ) : null}
            </div>
            <div className="stat">
              <p className="label">Planning Tokens</p>
              <p className="value">
                {metrics.planningTotalTokens !== null
                  ? String(metrics.planningTotalTokens)
                  : "N/A"}
              </p>
              {metrics.planningInputTokens !== null ||
              metrics.planningOutputTokens !== null ? (
                <p className="muted" style={{ margin: 0 }}>
                  in: {metrics.planningInputTokens ?? "N/A"} • out:{" "}
                  {metrics.planningOutputTokens ?? "N/A"}
                </p>
              ) : null}
            </div>
            <div className="stat">
              <p className="label">Overall Tokens</p>
              <p className="value">
                {metrics.overallTotalTokens !== null
                  ? String(metrics.overallTotalTokens)
                  : "N/A"}
              </p>
              {overallInputTokens !== null || overallOutputTokens !== null ? (
                <p className="muted" style={{ margin: 0 }}>
                  in: {overallInputTokens ?? "N/A"} • out:{" "}
                  {overallOutputTokens ?? "N/A"}
                </p>
              ) : null}
            </div>
            <div className="stat">
              <p className="label">Estimated Cost (USD)</p>
              <p className="value">{formatUsd(metrics.overallEstimatedCostUsd)}</p>
              <p className="muted" style={{ margin: 0 }}>
                generation: {formatUsd(metrics.generationEstimatedCostUsd)}
              </p>
              <p className="muted" style={{ margin: 0 }}>
                planning: {formatUsd(metrics.planningEstimatedCostUsd)}
              </p>
              {metrics.hasUnpricedCalls ? (
                <p className="muted" style={{ margin: 0 }}>
                  contains unpriced calls
                </p>
              ) : null}
            </div>
          </div>

          <div className="row" style={{ marginTop: 10 }}>
            <span className="badge">
              Analytics:{" "}
              {job?.analytics
                ? "available"
                : "not available (check analytics secret)"}
            </span>
          </div>

          {Array.isArray(job?.analytics?.byProviderModel) &&
          job?.analytics?.byProviderModel?.length ? (
            <div style={{ marginTop: 12 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th>Model</th>
                    <th>Attempts</th>
                    <th>Success</th>
                    <th>Latency (s)</th>
                    <th>In Tokens</th>
                    <th>Out Tokens</th>
                    <th>Total Tokens</th>
                    <th>Est. Cost (USD)</th>
                  </tr>
                </thead>
                <tbody>
                  {(job?.analytics?.byProviderModel || []).map((row) => {
                    const estimate = estimateUsageCostUsd({
                      provider: row.provider,
                      model: row.model,
                      usage: {
                        inputTokens: row.inputTokens,
                        outputTokens: row.outputTokens,
                      },
                    });
                    return (
                      <tr key={`${row.provider}:${row.model}`}>
                        <td>{row.provider}</td>
                        <td>{row.model}</td>
                        <td>{row.attemptCount}</td>
                        <td>{row.successfulAttempts}</td>
                        <td>{(row.llmLatencyMs / 1000).toFixed(2)}</td>
                        <td>{row.inputTokens}</td>
                        <td>{row.outputTokens}</td>
                        <td>{row.totalTokens}</td>
                        <td>
                          {estimate ? `$${estimate.estimatedUsd.toFixed(6)}` : "N/A"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      ) : (
        <p className="muted">Run metrics will appear after generation completes.</p>
      )}

      {job?.results?.quizzes?.length ? (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 8 }}>Generated Quizzes</h3>
          {job.results.quizzes.map((quiz, index) => (
            <QuizPreviewCard
              key={quiz.tempId || `${quiz.name}-${index}`}
              quiz={quiz}
              index={index}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
