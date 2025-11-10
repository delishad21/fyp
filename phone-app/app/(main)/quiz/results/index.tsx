// screens/quiz/results/index.tsx
import { useTheme } from "@/src/theme";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function QuizResultsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const params = useLocalSearchParams<{
    score?: string;
    maxScore?: string;
    quizName?: string;
    scheduleId?: string;
    attemptId?: string;
    answerAvailable?: string; // "true" | "false"
  }>();

  // Parse primitives defensively
  const score = useMemo(() => {
    const n = Number(params.score ?? "0");
    return Number.isFinite(n) ? n : 0;
  }, [params.score]);

  const maxScore = useMemo(() => {
    const n = Number(params.maxScore ?? "0");
    return Number.isFinite(n) ? n : 0;
  }, [params.maxScore]);

  const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;

  const quizName = params.quizName ?? "Quiz Results";
  const attemptId = params.attemptId ?? "";
  const scheduleId = params.scheduleId ?? "";

  const answersAvailable =
    params.answerAvailable === "true"
      ? true
      : params.answerAvailable === "false"
      ? false
      : false;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg1 }}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { borderBottomColor: colors.bg2, paddingTop: insets.top },
        ]}
      >
        <Text
          numberOfLines={1}
          style={[styles.title, { color: colors.textPrimary }]}
        >
          {quizName}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: Math.max(insets.bottom + 16, 24),
          gap: 16,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Score Card */}
        <View style={[styles.card, { backgroundColor: colors.bg2 }]}>
          <View style={styles.scoreRow}>
            <View style={[styles.scoreRing, { borderColor: colors.primary }]}>
              <Text style={[styles.scorePct, { color: colors.primary }]}>
                {pct}%
              </Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={[styles.big, { color: colors.textPrimary }]}>
                {score} / {maxScore}
              </Text>
              <Text style={{ color: colors.textSecondary, marginTop: 4 }}>
                {pct >= 90
                  ? "Excellent!"
                  : pct >= 75
                  ? "Great job!"
                  : pct >= 50
                  ? "Nice effort!"
                  : "Keep practicing!"}
              </Text>
            </View>
          </View>

          {answersAvailable && attemptId ? (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/(main)/attempt",
                  params: { scheduleId, displayedAttemptId: attemptId },
                })
              }
              style={[
                styles.ctaBtn,
                { backgroundColor: colors.primary, marginTop: 12 },
              ]}
            >
              <Text style={{ color: "#fff", fontWeight: "800" }}>
                Review answers
              </Text>
            </Pressable>
          ) : (
            <Text
              style={{
                color: colors.textSecondary,
                marginTop: 12,
                fontSize: 12,
              }}
            >
              Answers are hidden for now.
            </Text>
          )}
        </View>

        {/* Actions */}
        <View style={{ height: 4 }} />
        <Pressable
          onPress={() => router.replace("/(main)/(tabs)/home")}
          style={[styles.ctaBtn, { backgroundColor: colors.bg3 }]}
        >
          <Text style={{ color: colors.textPrimary, fontWeight: "800" }}>
            Back to Home
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 56,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  title: { fontSize: 16, fontWeight: "800" },

  card: {
    borderRadius: 12,
    padding: 14,
  },

  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  scoreRing: {
    width: 72,
    height: 72,
    borderRadius: 72,
    borderWidth: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  scorePct: { fontSize: 18, fontWeight: "900" },
  big: { fontSize: 22, fontWeight: "900" },

  ctaBtn: {
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
});
