import {
  DOCUMENT_TYPE_OPTIONS,
  LEVEL_OPTIONS,
  MAX_DOCUMENTS,
  MAX_DOCUMENT_SIZE_MB,
  QUIZ_TYPE_OPTIONS,
} from "../constants";
import type {
  AIModel,
  DocumentType,
  QuizType,
  TimerType,
  UploadedReferenceDocument,
} from "../types";
import { formatBytes } from "../utils";

type RunConfigurationCardProps = {
  subject: string;
  onSubjectChange: (value: string) => void;
  educationLevel: string;
  onEducationLevelChange: (value: string) => void;
  numQuizzes: number;
  onNumQuizzesChange: (value: number) => void;
  questionsPerQuiz: number;
  onQuestionsPerQuizChange: (value: number) => void;
  selectedModel: string;
  onSelectedModelChange: (value: string) => void;
  models: AIModel[];
  selectedQuizTypes: QuizType[];
  onToggleQuizType: (value: QuizType) => void;
  timerType: TimerType;
  onTimerTypeChange: (value: TimerType) => void;
  customTimerSeconds: number;
  onCustomTimerSecondsChange: (value: number) => void;
  documents: UploadedReferenceDocument[];
  onAddDocuments: (files: FileList | File[] | null) => void;
  onUpdateDocumentType: (id: string, value: DocumentType) => void;
  onRemoveDocument: (id: string) => void;
  instructions: string;
  onInstructionsChange: (value: string) => void;
  onStartRun: () => void;
  isSubmitting: boolean;
  jobId: string;
  error: string;
};

export default function RunConfigurationCard({
  subject,
  onSubjectChange,
  educationLevel,
  onEducationLevelChange,
  numQuizzes,
  onNumQuizzesChange,
  questionsPerQuiz,
  onQuestionsPerQuizChange,
  selectedModel,
  onSelectedModelChange,
  models,
  selectedQuizTypes,
  onToggleQuizType,
  timerType,
  onTimerTypeChange,
  customTimerSeconds,
  onCustomTimerSecondsChange,
  documents,
  onAddDocuments,
  onUpdateDocumentType,
  onRemoveDocument,
  instructions,
  onInstructionsChange,
  onStartRun,
  isSubmitting,
  jobId,
  error,
}: RunConfigurationCardProps) {
  return (
    <section className="card no-print">
      <h2 style={{ margin: "0 0 10px" }}>Run Configuration</h2>
      <div className="grid-2">
        <div>
          <label>Subject</label>
          <input
            value={subject}
            onChange={(event) => onSubjectChange(event.target.value)}
            placeholder="Math / English / Science / Custom"
          />
        </div>
        <div>
          <label>Education Level</label>
          <select
            value={educationLevel}
            onChange={(event) => onEducationLevelChange(event.target.value)}
          >
            {LEVEL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Number of Quizzes: {numQuizzes}</label>
          <input
            type="range"
            min={1}
            max={20}
            step={1}
            value={numQuizzes}
            onChange={(event) => onNumQuizzesChange(Number(event.target.value))}
          />
          <div className="row">
            <span className="muted">1</span>
            <span className="muted" style={{ marginLeft: "auto" }}>
              20
            </span>
          </div>
        </div>
        <div>
          <label>Questions Per Quiz: {questionsPerQuiz}</label>
          <input
            type="range"
            min={5}
            max={20}
            step={1}
            value={questionsPerQuiz}
            onChange={(event) =>
              onQuestionsPerQuizChange(Number(event.target.value))
            }
          />
          <div className="row">
            <span className="muted">5</span>
            <span className="muted" style={{ marginLeft: "auto" }}>
              20
            </span>
          </div>
        </div>

        <div>
          <label>Model</label>
          <select
            value={selectedModel}
            onChange={(event) => onSelectedModelChange(event.target.value)}
            disabled={models.length === 0}
          >
            {models.length === 0 ? <option value="">Load models first</option> : null}
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <label>Quiz Types</label>
        <div className="row">
          {QUIZ_TYPE_OPTIONS.map((quizType) => {
            const selected = selectedQuizTypes.includes(quizType.value);
            return (
              <button
                key={quizType.value}
                type="button"
                onClick={() => onToggleQuizType(quizType.value)}
                style={{
                  borderColor: selected ? "var(--primary)" : undefined,
                  background: selected ? "rgba(22,101,52,0.08)" : undefined,
                }}
              >
                {quizType.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <label>Timer Settings</label>
        <div className="row">
          <button
            type="button"
            onClick={() => onTimerTypeChange("default")}
            style={{
              borderColor: timerType === "default" ? "var(--primary)" : undefined,
              background:
                timerType === "default" ? "rgba(22,101,52,0.08)" : undefined,
            }}
          >
            Default
          </button>
          <button
            type="button"
            onClick={() => onTimerTypeChange("custom")}
            style={{
              borderColor: timerType === "custom" ? "var(--primary)" : undefined,
              background:
                timerType === "custom" ? "rgba(22,101,52,0.08)" : undefined,
            }}
          >
            Custom
          </button>
          <button
            type="button"
            onClick={() => onTimerTypeChange("none")}
            style={{
              borderColor: timerType === "none" ? "var(--primary)" : undefined,
              background:
                timerType === "none" ? "rgba(22,101,52,0.08)" : undefined,
            }}
          >
            No Timer
          </button>
        </div>
        {timerType === "custom" ? (
          <div style={{ marginTop: 8 }}>
            <label>Custom Timer (seconds)</label>
            <input
              type="number"
              min={60}
              max={3600}
              step={60}
              value={customTimerSeconds}
              onChange={(event) =>
                onCustomTimerSecondsChange(Number(event.target.value))
              }
            />
          </div>
        ) : null}
      </div>

      <div style={{ marginTop: 12 }}>
        <label>
          Reference Documents (optional, up to {MAX_DOCUMENTS}, {MAX_DOCUMENT_SIZE_MB}
          MB each)
        </label>
        <input
          type="file"
          accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          multiple
          onChange={(event) => {
            onAddDocuments(event.target.files);
            event.currentTarget.value = "";
          }}
        />
        {documents.length > 0 ? (
          <div style={{ marginTop: 10 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Source Path</th>
                  <th>File</th>
                  <th>Size</th>
                  <th>Document Type</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((document) => (
                  <tr key={document.id}>
                    <td>{document.sourcePath || document.file.name}</td>
                    <td>{document.file.name}</td>
                    <td>{formatBytes(document.file.size)}</td>
                    <td>
                      <select
                        value={document.documentType}
                        onChange={(event) =>
                          onUpdateDocumentType(
                            document.id,
                            event.target.value as DocumentType,
                          )
                        }
                      >
                        {DOCUMENT_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button type="button" onClick={() => onRemoveDocument(document.id)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted" style={{ marginTop: 8 }}>
            No documents attached.
          </p>
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        <label>Teacher Instructions</label>
        <textarea
          value={instructions}
          onChange={(event) => onInstructionsChange(event.target.value)}
        />
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <span className="badge">numQuizzes: {numQuizzes}</span>
        <span className="badge">questionsPerQuiz: {questionsPerQuiz}</span>
        <span className="badge">timer: {timerType}</span>
        {timerType === "custom" ? (
          <span className="badge">customTimer: {customTimerSeconds}s</span>
        ) : null}
        <span className="badge">documents: {documents.length}</span>
      </div>

      <div className="row" style={{ marginTop: 14 }}>
        <button className="primary" onClick={onStartRun} disabled={isSubmitting}>
          {isSubmitting ? "Starting..." : "Start Generation Run"}
        </button>
        {jobId ? <span className="muted">Current Job ID: {jobId}</span> : null}
      </div>

      {error ? <p className="error-text">{error}</p> : null}
    </section>
  );
}
