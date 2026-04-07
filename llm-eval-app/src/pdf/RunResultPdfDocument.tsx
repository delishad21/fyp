import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  pdf,
} from "@react-pdf/renderer";
import type { TestcaseRunRecord } from "../types";

type OpenAnswerType = "exact" | "fuzzy" | "keywords" | "list";

type CrosswordCellState = { blocked: boolean; letter: string };

const styles = StyleSheet.create({
  page: {
    paddingTop: 24,
    paddingBottom: 24,
    paddingHorizontal: 24,
    backgroundColor: "#f3f5f7",
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#1f2937",
  },
  card: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d8dde3",
    padding: 14,
  },
  title: {
    fontSize: 16,
    fontWeight: 700,
    marginBottom: 6,
  },
  muted: {
    color: "#5b6572",
    fontSize: 9.5,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    marginTop: 6,
    marginBottom: 8,
  },
  metricsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -4,
    marginBottom: 2,
  },
  metricTile: {
    width: "33.333%",
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  metricInner: {
    minHeight: 78,
    borderWidth: 1,
    borderColor: "#d8dde3",
    backgroundColor: "#fbfcfd",
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 8,
    justifyContent: "space-between",
  },
  metricLabel: {
    fontSize: 8.5,
    color: "#5b6572",
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 4,
  },
  metricDetail: {
    fontSize: 8.2,
    color: "#6b7280",
  },
  quizCard: {
    borderWidth: 1,
    borderColor: "#d8dde3",
    backgroundColor: "#ffffff",
    marginTop: 10,
    padding: 10,
  },
  quizTitle: {
    fontSize: 11.5,
    fontWeight: 700,
    marginBottom: 4,
  },
  quizMeta: {
    fontSize: 8.8,
    color: "#5b6572",
    marginBottom: 8,
  },
  questionBox: {
    borderWidth: 1,
    borderColor: "#d8dde3",
    backgroundColor: "#fbfcfd",
    paddingHorizontal: 8,
    paddingVertical: 7,
    marginBottom: 6,
  },
  questionText: {
    fontSize: 9.8,
    lineHeight: 1.35,
    fontWeight: 700,
    marginBottom: 3,
  },
  optionText: {
    fontSize: 9.2,
    lineHeight: 1.35,
    marginBottom: 2,
  },
  answerText: {
    fontSize: 9,
    lineHeight: 1.35,
    color: "#0f5132",
    fontWeight: 700,
    marginTop: 2,
    marginBottom: 2,
  },
  openDetailText: {
    fontSize: 8.6,
    lineHeight: 1.3,
    color: "#5b6572",
    marginBottom: 1,
  },
  crosswordHeader: {
    borderWidth: 1,
    borderColor: "#d8dde3",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginBottom: 6,
  },
  crosswordHeaderText: {
    fontSize: 9,
    color: "#5b6572",
    fontWeight: 700,
  },
  crosswordGridWrap: {
    borderWidth: 1,
    borderColor: "#d8dde3",
    backgroundColor: "#ffffff",
    padding: 6,
    marginBottom: 8,
    alignSelf: "flex-start",
  },
  crosswordRow: {
    flexDirection: "row",
  },
  crosswordCell: {
    width: 14,
    height: 14,
    borderWidth: 0.5,
    borderColor: "#bec6d1",
    alignItems: "center",
    justifyContent: "center",
  },
  crosswordBlockedCell: {
    width: 14,
    height: 14,
  },
  crosswordCellLetter: {
    fontSize: 8,
    fontWeight: 700,
    color: "#111827",
  },
  cluesTitle: {
    fontSize: 10,
    fontWeight: 700,
    marginBottom: 4,
  },
  clueText: {
    fontSize: 9.2,
    lineHeight: 1.35,
    marginBottom: 2,
  },
  promptBox: {
    borderWidth: 1,
    borderColor: "#d8dde3",
    backgroundColor: "#fbfcfd",
    paddingHorizontal: 8,
    paddingVertical: 7,
    marginBottom: 4,
  },
  promptText: {
    fontSize: 9.2,
    lineHeight: 1.35,
    color: "#1f2937",
  },
});

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function formatLatency(value: number | null): string {
  return value !== null ? `${(value / 1000).toFixed(1)}s` : "N/A";
}

function formatCost(value: number | null): string {
  return value === null ? "N/A" : `$${value.toFixed(6)}`;
}

function toOpenAnswerFormatLabel(format: OpenAnswerType): string {
  if (format === "keywords") return "keywords";
  if (format === "list") return "list";
  if (format === "fuzzy") return "fuzzy";
  return "exact match";
}

function normalizeOpenAnswerType(value: unknown): OpenAnswerType {
  const token = toText(value).toLowerCase();
  if (token === "fuzzy") return "fuzzy";
  if (token === "keywords") return "keywords";
  if (token === "list") return "list";
  return "exact";
}

function getOpenAnswerDetails(answer: any): { title: string; details: string[] } {
  const answerType = normalizeOpenAnswerType(answer?.answerType);
  const details: string[] = [];
  const text = toText(answer?.text);
  if (text) details.push(`Accepted text: ${text}`);

  if (answerType === "exact" && answer?.caseSensitive) {
    details.push("Case-sensitive matching enabled");
  }

  if (answerType === "keywords") {
    const keywords = Array.isArray(answer?.keywords)
      ? answer.keywords.map((entry: unknown) => toText(entry)).filter(Boolean)
      : [];
    if (keywords.length > 0) details.push(`Keywords: ${keywords.join(", ")}`);
    const minKeywords = Number(answer?.minKeywords);
    if (Number.isFinite(minKeywords)) {
      details.push(`Minimum keywords required: ${minKeywords}`);
    }
  }

  if (answerType === "list") {
    const listItems = Array.isArray(answer?.listItems)
      ? answer.listItems.map((entry: unknown) => toText(entry)).filter(Boolean)
      : [];
    if (listItems.length > 0) details.push(`List items: ${listItems.join(", ")}`);
    const minCorrect = Number(answer?.minCorrectItems);
    if (Number.isFinite(minCorrect)) {
      details.push(`Minimum correct items required: ${minCorrect}`);
    }
    if (answer?.requireOrder === true) details.push("Order must match");
  }

  if (details.length === 0) details.push("No additional answer details");

  return { title: `[${answerType.toUpperCase()}]`, details };
}

function buildOpenAnswerSummary(answers: any[]): {
  format: OpenAnswerType;
  lines: string[];
} | null {
  if (!answers.length) return null;
  const format = normalizeOpenAnswerType(answers[0]?.answerType);

  if (format === "keywords") {
    const first = answers[0] || {};
    const keywords = Array.isArray(first?.keywords)
      ? first.keywords.map((entry: unknown) => toText(entry)).filter(Boolean)
      : [];
    const minKeywords = Number(first?.minKeywords);
    return {
      format,
      lines: [
        `Keywords: ${keywords.length > 0 ? keywords.join(", ") : "(none provided)"}`,
        `Minimum keywords required: ${Number.isFinite(minKeywords) ? minKeywords : 1}`,
      ],
    };
  }

  if (format === "list") {
    const first = answers[0] || {};
    const listItems = Array.isArray(first?.listItems)
      ? first.listItems.map((entry: unknown) => toText(entry)).filter(Boolean)
      : [];
    const minCorrect = Number(first?.minCorrectItems);
    const lines = [
      `List items: ${listItems.length > 0 ? listItems.join(", ") : "(none provided)"}`,
      `Minimum correct items required: ${Number.isFinite(minCorrect) ? minCorrect : 1}`,
    ];
    if (first?.requireOrder === true) lines.push("Order required: yes");
    return { format, lines };
  }

  if (format === "fuzzy") {
    const first = answers[0] || {};
    const details = getOpenAnswerDetails(first).details;
    return { format, lines: details };
  }

  const acceptedTexts = answers
    .map((answer: any) => toText(answer?.text))
    .filter(Boolean);
  const anyCaseSensitive = answers.some((answer: any) => answer?.caseSensitive === true);
  const lines = [
    `Matches any of: ${acceptedTexts.length > 0 ? acceptedTexts.join(" | ") : "(none provided)"}`,
  ];
  if (anyCaseSensitive) lines.push("Case-sensitive matching enabled");
  return { format, lines };
}

function getCrosswordCellState(cell: unknown): CrosswordCellState {
  if (cell == null) return { blocked: true, letter: "" };

  if (typeof cell === "string") {
    const normalized = cell.trim();
    const blocked =
      normalized.length === 0 ||
      normalized === "#" ||
      normalized === "." ||
      normalized === "*";
    return {
      blocked,
      letter: blocked ? "" : normalized.slice(0, 1).toUpperCase(),
    };
  }

  if (typeof cell === "object") {
    const value = cell as { isBlocked?: unknown; letter?: unknown };
    const letter = toText(value.letter);
    if (!letter) return { blocked: true, letter: "" };
    const isBlocked = value.isBlocked === true;
    return { blocked: isBlocked && !letter, letter: letter.slice(0, 1).toUpperCase() };
  }

  return { blocked: true, letter: "" };
}

function RunResultPdfDocument({ record }: { record: TestcaseRunRecord }) {
  const m = record.metrics;
  const quizzes = Array.isArray(record.job.results?.quizzes)
    ? record.job.results.quizzes
    : [];
  const overallInputTokens =
    m.generationInputTokens !== null || m.planningInputTokens !== null
      ? (m.generationInputTokens || 0) + (m.planningInputTokens || 0)
      : null;
  const overallOutputTokens =
    m.generationOutputTokens !== null || m.planningOutputTokens !== null
      ? (m.generationOutputTokens || 0) + (m.planningOutputTokens || 0)
      : null;

  const metrics: Array<{ label: string; value: string; detail?: string }> = [
    { label: "Completion rate", value: `${m.completionRate.toFixed(1)}%` },
    { label: "Planning latency", value: formatLatency(m.planningLatencyMs) },
    { label: "Generation latency", value: formatLatency(m.generationLatencyMs) },
    { label: "Total LLM latency", value: formatLatency(m.totalLlmLatencyMs) },
    { label: "Retry count", value: String(m.retryCount) },
    {
      label: "Generation attempts",
      value: m.generationAttemptCount !== null ? String(m.generationAttemptCount) : "N/A",
      detail:
        m.generationSuccessfulAttempts !== null
          ? `Successful attempts: ${m.generationSuccessfulAttempts}`
          : undefined,
    },
    {
      label: "Generation tokens",
      value: m.generationTotalTokens !== null ? String(m.generationTotalTokens) : "N/A",
      detail: `in: ${m.generationInputTokens ?? "N/A"} | out: ${m.generationOutputTokens ?? "N/A"}`,
    },
    {
      label: "Planning tokens",
      value: m.planningTotalTokens !== null ? String(m.planningTotalTokens) : "N/A",
      detail: `in: ${m.planningInputTokens ?? "N/A"} | out: ${m.planningOutputTokens ?? "N/A"}`,
    },
    {
      label: "Overall tokens",
      value: m.overallTotalTokens !== null ? String(m.overallTotalTokens) : "N/A",
      detail: `in: ${overallInputTokens ?? "N/A"} | out: ${overallOutputTokens ?? "N/A"}`,
    },
    {
      label: "Estimated cost (USD)",
      value: formatCost(m.overallEstimatedCostUsd),
      detail: `Generation: ${formatCost(m.generationEstimatedCostUsd)} | Planning: ${formatCost(m.planningEstimatedCostUsd)}`,
    },
  ];

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.card}>
          <Text style={styles.title}>LLM Evaluation Run Result</Text>
          <Text style={styles.muted}>
            Testcase: {record.testcaseId} | {record.testcaseTitle}
          </Text>
          <Text style={styles.muted}>
            Model: {record.modelLabel} ({record.modelProvider}/{record.modelName})
          </Text>
          <Text style={styles.muted}>
            Status: {record.jobStatus} | Job: {record.jobId} | Completed: {record.runCompletedAt}
          </Text>

          <Text style={styles.sectionTitle}>Testcase Prompt</Text>
          <View style={styles.promptBox}>
            <Text style={styles.promptText}>
              {toText(record.testcaseInstructions) || "(No testcase prompt provided)"}
            </Text>
          </View>

          <Text style={styles.sectionTitle}>Automatic Metrics</Text>
          <View style={styles.metricsRow}>
            {metrics.map((metric, idx) => (
              <View key={`${metric.label}-${idx}`} style={styles.metricTile}>
                <View style={styles.metricInner}>
                  <View>
                    <Text style={styles.metricLabel}>{metric.label}</Text>
                    <Text style={styles.metricValue}>{metric.value}</Text>
                  </View>
                  {metric.detail ? <Text style={styles.metricDetail}>{metric.detail}</Text> : <Text style={styles.metricDetail}> </Text>}
                </View>
              </View>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Generated Quizzes</Text>
          {quizzes.length === 0 ? (
            <Text style={styles.muted}>No generated quizzes were returned for this run.</Text>
          ) : (
            quizzes.map((quiz: any, quizIndex: number) => {
              const quizType = toText(quiz?.quizType) || "-";
              const items = Array.isArray(quiz?.items) ? quiz.items : [];
              const entries = Array.isArray(quiz?.entries) ? quiz.entries : [];
              const grid = Array.isArray(quiz?.grid) ? quiz.grid : [];

              return (
                <View style={styles.quizCard} key={`${quiz?.tempId || quizIndex}-${quizIndex}`}>
                  <Text style={styles.quizTitle}>
                    {quizIndex + 1}. {toText(quiz?.name) || `Quiz ${quizIndex + 1}`}
                  </Text>
                  <Text style={styles.quizMeta}>
                    {quizType} | {toText(quiz?.subject) || "-"} | {toText(quiz?.topic) || "-"}
                  </Text>

                  {quizType === "crossword" ? (
                    <View>
                      <View style={styles.crosswordHeader}>
                        <Text style={styles.crosswordHeaderText}>Crossword Grid</Text>
                      </View>

                      {grid.length > 0 ? (
                        <View style={styles.crosswordGridWrap}>
                          {grid.map((row: any, rowIndex: number) => {
                            const cells = Array.isArray(row) ? row : [];
                            return (
                              <View style={styles.crosswordRow} key={`row-${rowIndex}`}>
                                {cells.map((cell: unknown, cellIndex: number) => {
                                  const state = getCrosswordCellState(cell);
                                  return (
                                    <View
                                      key={`cell-${rowIndex}-${cellIndex}`}
                                      style={state.blocked ? styles.crosswordBlockedCell : styles.crosswordCell}
                                    >
                                      {!state.blocked && state.letter ? (
                                        <Text style={styles.crosswordCellLetter}>{state.letter}</Text>
                                      ) : null}
                                    </View>
                                  );
                                })}
                              </View>
                            );
                          })}
                        </View>
                      ) : (
                        <Text style={styles.muted}>No crossword grid was returned for this quiz.</Text>
                      )}

                      {entries.length > 0 ? <Text style={styles.cluesTitle}>Clues</Text> : null}
                      {entries.map((entry: any, idx: number) => (
                        <View key={`clue-${idx}`} style={styles.questionBox}>
                          <Text style={styles.clueText}>
                            {idx + 1}. {toText(entry?.clue) || "(Missing clue)"}
                          </Text>
                          <Text style={styles.answerText}>
                            Answer: {toText(entry?.answer).toUpperCase() || "(Missing answer)"}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <View>
                      {items.length === 0 ? (
                        <Text style={styles.muted}>No questions were returned for this quiz.</Text>
                      ) : (
                        items.map((item: any, itemIndex: number) => {
                          const options = Array.isArray(item?.options) ? item.options : [];
                          const correctOptions = options
                            .filter((opt: any) => !!opt?.correct)
                            .map((opt: any) => toText(opt?.text))
                            .filter(Boolean);
                          const answers = Array.isArray(item?.answers) ? item.answers : [];

                          return (
                            <View style={styles.questionBox} key={`q-${quizIndex}-${itemIndex}`} wrap={false}>
                              <Text style={styles.questionText}>
                                {itemIndex + 1}. {toText(item?.text) || "(Empty question text)"}
                              </Text>

                              {options.map((opt: any, optIndex: number) => {
                                const label = String.fromCharCode(65 + (optIndex % 26));
                                return (
                                  <Text style={styles.optionText} key={`opt-${itemIndex}-${optIndex}`}>
                                    {label}. {toText(opt?.text) || "(Empty option)"}
                                  </Text>
                                );
                              })}

                              {correctOptions.length > 0 ? (
                                <Text style={styles.answerText}>
                                  Answer: {correctOptions.join(", ")}
                                </Text>
                              ) : null}

                              {(() => {
                                const openAnswerSummary = buildOpenAnswerSummary(answers);
                                if (!openAnswerSummary) return null;
                                return (
                                  <View>
                                    <Text style={styles.answerText}>Accepted answers</Text>
                                    <Text style={styles.openDetailText}>
                                      Format: {toOpenAnswerFormatLabel(openAnswerSummary.format)}
                                    </Text>
                                    {openAnswerSummary.lines.map((detail, detailIndex) => (
                                      <Text
                                        style={styles.openDetailText}
                                        key={`open-detail-${itemIndex}-${detailIndex}`}
                                      >
                                        {detail}
                                      </Text>
                                    ))}
                                  </View>
                                );
                              })()}
                            </View>
                          );
                        })
                      )}
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>
      </Page>
    </Document>
  );
}

export async function buildRunResultPdfBlob(
  record: TestcaseRunRecord,
): Promise<Blob> {
  const instance = pdf(<RunResultPdfDocument record={record} />);
  return instance.toBlob();
}
