import { useState } from "react";
import type { AIModel, TestcaseRecord } from "../types";

type TestcaseRunnerCardProps = {
  testcases: TestcaseRecord[];
  activeTestcaseId: string;
  isRunningQueue: boolean;
  runAllTotalCount: number;
  runAllDoneCount: number;
  runnerModelId: string;
  models: AIModel[];
  onRunnerModelChange: (value: string) => void;
  onImportFile: (file: File) => void;
  onRunTestcase: (testcaseId: string) => void;
  onRunAllTestcases: (delaySeconds: number) => void;
  onDownloadTestcaseCsv: (testcaseId: string) => void;
  onDownloadTestcaseJson: (testcaseId: string) => void;
  onDownloadTestcaseFinalEvalCsv: (testcaseId: string) => void;
  onDownloadTestcasePdf: (testcaseId: string) => void;
  onDownloadCombinedCsv: () => void;
  onDownloadCombinedJson: () => void;
  onDownloadCombinedFinalEvalCsv: () => void;
  onDownloadAllPdfsZip: () => void;
  onDownloadAllDocumentsZip: () => void;
  onClearTestcases: () => void;
  onUseTestcaseInForm: (testcaseId: string) => void;
};

export default function TestcaseRunnerCard({
  testcases,
  activeTestcaseId,
  isRunningQueue,
  runAllTotalCount,
  runAllDoneCount,
  runnerModelId,
  models,
  onRunnerModelChange,
  onImportFile,
  onRunTestcase,
  onRunAllTestcases,
  onDownloadTestcaseCsv,
  onDownloadTestcaseJson,
  onDownloadTestcaseFinalEvalCsv,
  onDownloadTestcasePdf,
  onDownloadCombinedCsv,
  onDownloadCombinedJson,
  onDownloadCombinedFinalEvalCsv,
  onDownloadAllPdfsZip,
  onDownloadAllDocumentsZip,
  onClearTestcases,
  onUseTestcaseInForm,
}: TestcaseRunnerCardProps) {
  const [showRunAllSettings, setShowRunAllSettings] = useState(false);
  const [runAllDelaySecondsInput, setRunAllDelaySecondsInput] = useState("0");
  const hasCompleted = testcases.some(
    (testcase) => testcase.status === "completed",
  );
  const runAllPercent =
    runAllTotalCount > 0
      ? Math.max(
          0,
          Math.min(100, Math.round((runAllDoneCount / runAllTotalCount) * 100)),
        )
      : 0;
  const runAllCurrentIndex =
    runAllTotalCount > 0
      ? Math.min(
          runAllTotalCount,
          runAllDoneCount + (activeTestcaseId ? 1 : 0),
        )
      : 0;

  return (
    <section className="card no-print">
      <h2 style={{ margin: "0 0 10px" }}>Testcase Runner</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Import testcases (`.json` or `.csv`) and run them one-by-one. Completed
        runs expose row-level downloads for metrics CSV and a styled quiz PDF
        report. Testcases can define `documents` using `path` + `documentType`.
      </p>

      <div className="row">
        <div style={{ minWidth: 280 }}>
          <label style={{ marginBottom: 4 }}>Runner Model</label>
          <select
            value={runnerModelId}
            onChange={(event) => onRunnerModelChange(event.target.value)}
            disabled={models.length === 0}
          >
            {models.length === 0 ? (
              <option value="">Load models first</option>
            ) : null}
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </select>
        </div>
        <input
          type="file"
          accept=".json,.csv,application/json,text/csv,text/plain"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onImportFile(file);
            event.currentTarget.value = "";
          }}
        />
        <button
          onClick={() => {
            setRunAllDelaySecondsInput("0");
            setShowRunAllSettings(true);
          }}
          disabled={
            testcases.length === 0 ||
            !runnerModelId ||
            !!activeTestcaseId ||
            isRunningQueue
          }
        >
          {isRunningQueue ? "Running All..." : "Run All Testcases"}
        </button>
        <button onClick={onDownloadCombinedCsv} disabled={!hasCompleted}>
          Download All Metrics CSV
        </button>
        <button onClick={onDownloadCombinedJson} disabled={!hasCompleted}>
          Download All JSON ZIP
        </button>
        <button
          onClick={onDownloadCombinedFinalEvalCsv}
          disabled={!hasCompleted}
        >
          Download Final Evaluation CSV (ALL)
        </button>
        <button onClick={onDownloadAllPdfsZip} disabled={!hasCompleted}>
          Download All PDFs ZIP
        </button>
        <button onClick={onDownloadAllDocumentsZip} disabled={!hasCompleted}>
          Download All Documents ZIP
        </button>
        <button onClick={onClearTestcases} disabled={testcases.length === 0}>
          Clear Imported Testcases
        </button>
        <span className="muted">{testcases.length} testcase(s) loaded</span>
      </div>

      <p className="muted" style={{ margin: "8px 0 0" }}>
        For document-backed runs, attach files in Run Configuration and
        reference them per testcase using path fields in the testcase file.
      </p>

      {isRunningQueue && runAllTotalCount > 0 ? (
        <div style={{ marginTop: 10 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="muted">
              Run-all progress: {runAllDoneCount}/{runAllTotalCount} completed
              {activeTestcaseId ? ` · Running ${runAllCurrentIndex}/${runAllTotalCount}` : ""}
            </span>
            <span className="muted">{runAllPercent}%</span>
          </div>
          <div
            style={{
              height: 8,
              width: "100%",
              border: "1px solid #d4d4d8",
              background: "#f4f4f5",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${runAllPercent}%`,
                background: "#0f172a",
                transition: "width 200ms ease",
              }}
            />
          </div>
        </div>
      ) : null}

      {testcases.length > 0 ? (
        <div style={{ marginTop: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Title</th>
                <th>Subject</th>
                <th>Level</th>
                <th>Quiz Types</th>
                <th>Docs</th>
                <th>Status</th>
                <th>Last Job</th>
                <th>Last Model</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {testcases.map((testcase) => (
                <tr key={testcase.id}>
                  <td>{testcase.id}</td>
                  <td>{testcase.title}</td>
                  <td>{testcase.subject}</td>
                  <td>{testcase.educationLevel}</td>
                  <td>{testcase.quizTypes.join(", ")}</td>
                  <td>
                    {Array.isArray(testcase.documents)
                      ? testcase.documents.length
                      : 0}
                  </td>
                  <td>{testcase.status}</td>
                  <td>{testcase.lastJobId || "-"}</td>
                  <td>{testcase.lastModelLabel || "-"}</td>
                  <td>
                    <div className="row">
                      <button
                        type="button"
                        onClick={() => onUseTestcaseInForm(testcase.id)}
                      >
                        Use in Form
                      </button>
                      <button
                        type="button"
                        onClick={() => onRunTestcase(testcase.id)}
                        disabled={
                          !runnerModelId ||
                          isRunningQueue ||
                          (activeTestcaseId.length > 0 &&
                            activeTestcaseId !== testcase.id)
                        }
                      >
                        {activeTestcaseId === testcase.id
                          ? "Running..."
                          : "Run This Testcase"}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDownloadTestcaseCsv(testcase.id)}
                        disabled={testcase.status !== "completed"}
                      >
                        Download CSV
                      </button>
                      <button
                        type="button"
                        onClick={() => onDownloadTestcaseJson(testcase.id)}
                        disabled={testcase.status !== "completed"}
                      >
                        Download JSON
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onDownloadTestcaseFinalEvalCsv(testcase.id)
                        }
                        disabled={testcase.status !== "completed"}
                      >
                        Download CSV (Eval Formatted)
                      </button>
                      <button
                        type="button"
                        onClick={() => onDownloadTestcasePdf(testcase.id)}
                        disabled={testcase.status !== "completed"}
                      >
                        Download PDF
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted" style={{ marginTop: 10 }}>
          No imported testcases yet.
        </p>
      )}

      {showRunAllSettings ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 40,
          }}
        >
          <div className="card" style={{ width: "min(520px, 92vw)" }}>
            <h3 style={{ margin: "0 0 8px" }}>Run All Testcases</h3>
            <p className="muted" style={{ marginTop: 0 }}>
              Only run the next testcase if this amount of time has passed
              since the previous testcase ended.
            </p>
            <div className="row" style={{ alignItems: "end" }}>
              <div style={{ minWidth: 240 }}>
                <label style={{ marginBottom: 4 }}>Delay Between Testcases (seconds)</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={runAllDelaySecondsInput}
                  onChange={(event) =>
                    setRunAllDelaySecondsInput(event.target.value)
                  }
                />
              </div>
              <button
                type="button"
                onClick={() => setShowRunAllSettings(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const parsed = Number(runAllDelaySecondsInput);
                  const delaySeconds =
                    Number.isFinite(parsed) && parsed >= 0
                      ? Math.floor(parsed)
                      : 0;
                  setShowRunAllSettings(false);
                  onRunAllTestcases(delaySeconds);
                }}
              >
                Start Run All
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
