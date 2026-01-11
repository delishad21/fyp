import {
  type AttemptDoc,
  type ItemMCRapid,
  type RapidRenderSpec,
} from "@/src/api/quiz-service";
import { AwardPill } from "@/src/components/ui/AwardPill";
import { OptionRow } from "@/src/components/ui/OptionRow";
import { useTheme } from "@/src/theme";
import React, { useMemo } from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";

/** Read-only viewer for a finalized Rapid attempt (MC only; all options + awarded pill) */
export default function RapidAttemptViewer({ doc }: { doc: AttemptDoc }) {
  const { colors } = useTheme();
  const spec = doc.quizVersionSnapshot.renderSpec as RapidRenderSpec;
  const items = (spec?.items ?? []) as ItemMCRapid[];

  // Authoritative breakdown map
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

  const answersAvailable =
    Array.isArray(doc.breakdown) && doc.breakdown.length > 0;

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 12 }}
      keyboardShouldPersistTaps="handled"
    >
      {items.map((it) => {
        const b = byId[it.id] || {};
        const selectedIdsRaw = doc.answers?.[it.id];
        const selectedIds = Array.isArray(selectedIdsRaw)
          ? (selectedIdsRaw as string[])
          : b.selected || [];
        const correctIds = answersAvailable ? b.correct || [] : [];

        const wholeCorrect =
          answersAvailable &&
          selectedIds.length > 0 &&
          correctIds.length === selectedIds.length &&
          correctIds.every((c) => selectedIds.includes(c));

        return (
          <View
            key={it.id}
            style={[
              styles.card,
              {
                backgroundColor: colors.bg2,
                borderColor: answersAvailable
                  ? wholeCorrect
                    ? colors.success
                    : colors.error
                  : colors.bg3,
                borderWidth: StyleSheet.hairlineWidth,
                shadowColor: "#000",
              },
            ]}
          >
            {/* Header row: left = time + image + question; right = awarded pill */}
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                {it.image?.url ? (
                  <View style={{ marginBottom: 8 }}>
                    <Image
                      source={{ uri: it.image.url }}
                      style={styles.image}
                      resizeMode="contain"
                    />
                  </View>
                ) : null}

                <Text style={[styles.itemQ, { color: colors.textPrimary }]}>
                  {it.text}
                </Text>
              </View>

              {answersAvailable && (
                <AwardPill awarded={b.awarded} max={b.max} />
              )}
            </View>

            {/* Show all options with badges */}
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
    padding: 14,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
    gap: 2,
  },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  itemQ: { fontSize: 16, fontWeight: "800" },
  image: {
    width: "100%",
    height: 170,
    borderRadius: 8,
    backgroundColor: "#d9d9d9",
  },
});
