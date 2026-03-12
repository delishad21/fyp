import {
  type AttemptDoc,
  type ItemMCRapid,
  type RapidRenderSpec,
} from "@/src/api/quiz-service";
import { AwardPill } from "@/src/components/ui/AwardPill";
import { OptionRow } from "@/src/components/ui/OptionRow";
import { hexToRgba } from "@/src/lib/color-utils";
import { googlePalette } from "@/src/theme/google-palette";
import { useTheme } from "@/src/theme";
import React, { useMemo } from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Read-only viewer for a finalized Rapid attempt (MC only; all options + awarded pill) */
export default function RapidAttemptViewer({ doc }: { doc: AttemptDoc }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
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
        const selectedIds = Array.isArray(selectedIdsRaw)
          ? (selectedIdsRaw as string[])
          : b.selected || [];
        const correctIds = answersAvailable ? b.correct || [] : [];

        const wholeCorrect =
          answersAvailable &&
          selectedIds.length > 0 &&
          correctIds.length === selectedIds.length &&
          correctIds.every((c) => selectedIds.includes(c));

        const borderColor = answersAvailable
          ? wholeCorrect
            ? colors.success
            : colors.error
          : colors.bg3;
        const backgroundColor = answersAvailable
          ? wholeCorrect
            ? hexToRgba(colors.success, 0.08)
            : hexToRgba(colors.error, 0.08)
          : colors.bg2;
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
            {/* Header row: left = time + image + question; right = awarded pill */}
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <View style={styles.tagRow}>
                  <View style={styles.questionBadge}>
                    <Text style={styles.questionBadgeText}>{`Q${idx + 1}`}</Text>
                  </View>
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
});
