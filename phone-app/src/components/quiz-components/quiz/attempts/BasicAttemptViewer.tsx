import {
  type AttemptDoc,
  type BasicRenderSpec,
  type ItemMCBasic,
  type ItemOpenBasic,
} from "@/src/api/quiz-service";
import { AwardPill } from "@/src/components/ui/AwardPill";
import { Chip } from "@/src/components/ui/Chip";
import { OptionRow } from "@/src/components/ui/OptionRow";
import { hexToRgba } from "@/src/lib/color-utils";
import { googlePalette } from "@/src/theme/google-palette";
import { useTheme } from "@/src/theme";
import React, { useMemo } from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function BasicAttemptViewer({ doc }: { doc: AttemptDoc }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const spec = doc.quizVersionSnapshot.renderSpec as BasicRenderSpec;
  const items = (spec.items ?? []).filter(
    (it) => it.kind === "mc" || it.kind === "open",
  ) as Array<ItemMCBasic | ItemOpenBasic>;

  // Build lookup from breakdown
  const byId = useMemo(() => {
    const b: Record<
      string,
      {
        awarded?: number;
        max?: number;
        selected?: string[];
        correct?: string[];
      }
    > = {};
    (doc.breakdown || []).forEach((row: any) => {
      if (!row?.itemId) return;
      b[row.itemId] = {
        awarded: typeof row.awarded === "number" ? row.awarded : undefined,
        max: typeof row.max === "number" ? row.max : undefined,
        selected: Array.isArray(row?.meta?.selected)
          ? (row.meta.selected as string[])
          : undefined,
        correct: Array.isArray(row?.meta?.correct)
          ? (row.meta.correct as string[])
          : undefined,
      };
    });
    return b;
  }, [doc.breakdown]);

  const gradingKeyItems: any[] =
    (doc as any)?.quizVersionSnapshot?.gradingKey?.items || [];
  const answersAvailable =
    Array.isArray(doc.breakdown) && doc.breakdown.length > 0;
  const accentCycle = [
    googlePalette.blue,
    googlePalette.green,
    googlePalette.red,
    googlePalette.blue,
  ] as const;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        padding: 16,
        paddingBottom: Math.max(insets.bottom + 24, 32),
        gap: 12,
      }}
      keyboardShouldPersistTaps="handled"
    >
      {items.map((it, idx) => {
        const b = byId[it.id] || {};
        const selectedIdsRaw = doc.answers?.[it.id];

        // Normalize user's selection to an array (supports MC & MRQ)
        const selectedIds = Array.isArray(selectedIdsRaw)
          ? (selectedIdsRaw as string[])
          : typeof selectedIdsRaw === "string"
            ? [selectedIdsRaw]
            : Array.isArray(b.selected)
              ? b.selected!
              : [];

        // Correct IDs from breakdown when available
        const correctIds =
          answersAvailable && it.kind === "mc" ? b.correct || [] : [];

        // Is this an MRQ? Prefer explicit flag on item, else infer from #correct
        const isMRQ =
          it.kind === "mc" &&
          (Boolean((it as any).multiSelect) ||
            (answersAvailable && correctIds.length > 1));

        // MC overall correctness (all and only correct options selected)
        const mcOverallCorrect =
          answersAvailable &&
          it.kind === "mc" &&
          selectedIds.length > 0 &&
          correctIds.length === selectedIds.length &&
          correctIds.every((c) => selectedIds.includes(c));

        // ----- Border/background logic -----
        let borderColor = colors.bg3; // default when answers aren't available
        let backgroundColor = colors.bg2;
        if (answersAvailable) {
          if (it.kind === "mc") {
            borderColor = mcOverallCorrect ? colors.success : colors.error;
            backgroundColor = mcOverallCorrect
              ? hexToRgba(colors.success, 0.08)
              : hexToRgba(colors.error, 0.08);
          } else {
            // OPEN: use awarded/max to reflect actual grading outcome
            const awarded = b.awarded;
            const max = b.max;
            if (typeof awarded === "number" && typeof max === "number") {
              if (max > 0 && awarded >= max) {
                borderColor = colors.success;
                backgroundColor = hexToRgba(colors.success, 0.08);
              } else if (awarded > 0) {
                borderColor = colors.bg3;
                backgroundColor = colors.bg2;
              } else {
                borderColor = colors.error;
                backgroundColor = hexToRgba(colors.error, 0.08);
              }
            } else {
              borderColor = colors.bg3;
              backgroundColor = colors.bg2;
            }
          }
        }

        return (
          <View
            key={it.id}
            style={[
              styles.card,
              {
                backgroundColor,
                borderColor,
                borderWidth: 2,
              },
            ]}
          >
            {/* Header row: image + text + awarded pill + (MRQ chip) */}
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <View style={styles.tagRow}>
                  <View style={styles.questionBadge}>
                    <Text style={styles.questionBadgeText}>{`Q${idx + 1}`}</Text>
                  </View>
                  <Chip
                    text={it.kind === "mc" ? "MCQ" : "Open"}
                    bg={colors.bg3}
                    fg={colors.textPrimary}
                  />
                </View>
                <Text style={[styles.itemQ, { color: colors.textPrimary }]}>
                  {it.text}
                </Text>
                {it.image?.url ? (
                  <View style={{ marginTop: 8, marginBottom: 2 }}>
                    <Image
                      source={{ uri: it.image.url }}
                      style={styles.image}
                      resizeMode="contain"
                    />
                  </View>
                ) : null}
                {it.kind === "mc" && isMRQ && (
                  <View style={{ marginTop: 6 }}>
                    <Chip
                      text="Multiple correct answers"
                      bg={googlePalette.blue}
                      fg="#fff"
                    />
                  </View>
                )}
              </View>

              {answersAvailable && (
                <AwardPill awarded={b.awarded} max={b.max} />
              )}
            </View>

            {/* Body */}
            {it.kind === "mc" ? (
              <View style={{ marginTop: 10, gap: 8 }}>
                {it.options.map((opt) => {
                  const sel = selectedIds.includes(opt.id);
                  const cor = correctIds.includes(opt.id);
                  return (
                    <OptionRow
                      key={opt.id}
                      label={opt.text}
                      isSelected={sel}
                      isCorrect={cor}
                      answersAvailable={answersAvailable}
                    />
                  );
                })}
              </View>
            ) : (
              // OPEN
              <View style={{ marginTop: 10, gap: 8 }}>
                <Text
                  style={[styles.subLabel, { color: colors.textSecondary }]}
                >
                  Your answer:
                </Text>
                <View
                  style={[
                    styles.openAnsBox,
                    { borderColor: colors.bg3, backgroundColor: colors.bg1 },
                  ]}
                >
                  {Array.isArray(selectedIdsRaw) ? (
                    <View style={{ gap: 6 }}>
                      {selectedIdsRaw.map((item: string, idx: number) => (
                        <View
                          key={idx}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <Text
                            style={{
                              color: colors.textSecondary,
                              fontSize: 12,
                              fontWeight: "600",
                            }}
                          >
                            {idx + 1}.
                          </Text>
                          <Text
                            style={{
                              color: colors.textPrimary,
                              fontSize: 14,
                              fontWeight: "600",
                              flex: 1,
                            }}
                          >
                            {item || "—"}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text
                      style={{
                        color: colors.textPrimary,
                        fontSize: 14,
                        fontWeight: "600",
                      }}
                    >
                      {typeof selectedIdsRaw === "string"
                        ? selectedIdsRaw
                        : typeof doc.answers?.[it.id] === "string"
                          ? String(doc.answers?.[it.id])
                          : "—"}
                    </Text>
                  )}
                </View>

                {/* Optional accepted examples from grading key */}
                {answersAvailable &&
                  (() => {
                    const g = gradingKeyItems.find((g: any) => g?.id === it.id);
                    if (Array.isArray(g?.accepted) && g.accepted.length) {
                      const firstAns = g.accepted[0];
                      const answerType = firstAns?.answerType || "exact";

                      return (
                        <View style={{ gap: 6 }}>
                          <Text
                            style={[
                              styles.subLabel,
                              { color: colors.textSecondary },
                            ]}
                          >
                            {answerType === "exact" &&
                              "Accepted answers (exact match):"}
                            {answerType === "fuzzy" &&
                              `Accepted answers (fuzzy match, ${Math.round((firstAns?.similarityThreshold || 0.85) * 100)}% similarity):`}
                            {answerType === "keywords" &&
                              `Required keywords (at least ${firstAns?.minKeywords || 0}):`}
                            {answerType === "list" &&
                              `Expected list items (${firstAns?.requireOrder ? "order matters" : "any order"}, at least ${firstAns?.minCorrectItems || 1}):`}
                          </Text>
                          <View style={{ gap: 6 }}>
                            {answerType === "keywords" &&
                            firstAns?.keywords?.length ? (
                              <View
                                style={{
                                  flexDirection: "row",
                                  gap: 6,
                                  flexWrap: "wrap",
                                }}
                              >
                                {firstAns.keywords.map(
                                  (kw: string, idx: number) => (
                                    <Chip
                                      key={idx}
                                      text={kw}
                                      bg={
                                        accentCycle[idx % accentCycle.length]
                                      }
                                      fg="#fff"
                                    />
                                  ),
                                )}
                              </View>
                            ) : answerType === "list" &&
                              firstAns?.listItems?.length ? (
                              <View
                                style={{
                                  flexDirection: "row",
                                  gap: 6,
                                  flexWrap: "wrap",
                                }}
                              >
                                {firstAns.listItems.map(
                                  (item: string, idx: number) => (
                                    <Chip
                                      key={idx}
                                      text={
                                        firstAns.requireOrder
                                          ? `${idx + 1}. ${item}`
                                          : item
                                      }
                                      bg={
                                        accentCycle[idx % accentCycle.length]
                                      }
                                      fg="#fff"
                                    />
                                  ),
                                )}
                              </View>
                            ) : (
                              g.accepted.map((a: any, idx: number) => (
                                <View
                                  key={idx}
                                  style={{
                                    flexDirection: "row",
                                    gap: 8,
                                    flexWrap: "wrap",
                                  }}
                                >
                                  <Chip
                                    text={String(a.text)}
                                    bg={
                                      accentCycle[idx % accentCycle.length]
                                    }
                                    fg="#fff"
                                  />
                                </View>
                              ))
                            )}
                          </View>
                        </View>
                      );
                    }
                    return null;
                  })()}
              </View>
            )}

            {!answersAvailable && (
              <Text
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  color: colors.textSecondary,
                }}
              >
                Answers are not available yet.
              </Text>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 10,
    padding: 16,
    gap: 4,
  },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  tagRow: { flexDirection: "row", gap: 8, marginBottom: 8, flexWrap: "wrap" },
  questionBadge: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 7,
    backgroundColor: googlePalette.blue,
    borderWidth: 1,
    borderColor: googlePalette.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  questionBadgeText: {
    color: "#fff",
    fontSize: 19,
    fontWeight: "900",
    lineHeight: 22,
  },
  itemQ: {
    marginTop: 8,
    fontSize: 19,
    fontWeight: "800",
    lineHeight: 26,
  },
  image: {
    width: "100%",
    height: 170,
    borderRadius: 6,
    backgroundColor: "#d9d9d9",
  },

  subLabel: { fontSize: 13, fontWeight: "800" },
  openAnsBox: {
    borderWidth: 2,
    borderRadius: 8,
    padding: 12,
  },
});
