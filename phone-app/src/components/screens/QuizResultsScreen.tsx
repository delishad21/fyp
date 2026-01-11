import { useTheme } from "@/src/theme";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Iconify } from "react-native-iconify";
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

  // Determine performance message and color
  const performanceData = useMemo(() => {
    if (pct >= 90) {
      return {
        emoji: "🎉",
        title: "Excellent!",
        message: "Outstanding performance!",
        gradient: [colors.success, colors.primary],
      };
    } else if (pct >= 75) {
      return {
        emoji: "✨",
        title: "Great Job!",
        message: "You're doing really well!",
        gradient: [colors.primary, colors.primaryLight],
      };
    } else if (pct >= 50) {
      return {
        emoji: "👍",
        title: "Nice Effort!",
        message: "Keep up the good work!",
        gradient: [colors.primary, colors.bg3],
      };
    } else {
      return {
        emoji: "💪",
        title: "Keep Practicing!",
        message: "You'll get better with practice!",
        gradient: [colors.bg3, colors.bg2],
      };
    }
  }, [pct, colors]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg1 }}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            borderBottomColor: colors.bg2,
            paddingTop: insets.top + 6,
            backgroundColor: colors.bg1,
          },
        ]}
      >
        <Pressable
          onPress={() => router.replace("/(main)/(tabs)/home")}
          style={({ pressed }) => [
            styles.backBtn,
            {
              backgroundColor: colors.bg2,
              borderColor: colors.bg3,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Go back to home"
        >
          <Iconify
            icon="mingcute:arrow-left-line"
            size={23}
            color={colors.icon}
          />
        </Pressable>

        <Text
          numberOfLines={1}
          style={[styles.title, { color: colors.textPrimary }]}
        >
          {quizName}
        </Text>

        <View style={{ width: 42 }} />
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 24,
          paddingBottom: Math.max(insets.bottom + 24, 40),
          gap: 16,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Score Card with Gradient */}
        <View
          style={[
            styles.scoreCard,
            {
              backgroundColor: colors.bg2,
              borderColor: colors.bg3,
            },
          ]}
        >
          {/* Gradient Overlay */}
          <LinearGradient
            colors={[...performanceData.gradient, "transparent"] as any}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gradientOverlay}
          />

          {/* Content */}
          <View style={styles.scoreContent}>
            {/* Emoji */}
            <Text style={styles.emoji}>{performanceData.emoji}</Text>

            {/* Score Circle */}
            <View style={[styles.scoreRing, { borderColor: colors.primary }]}>
              <Text style={[styles.scorePct, { color: colors.primary }]}>
                {pct}%
              </Text>
            </View>

            {/* Performance Title */}
            <Text
              style={[styles.performanceTitle, { color: colors.textPrimary }]}
            >
              {performanceData.title}
            </Text>

            {/* Score Details */}
            <Text style={[styles.scoreDetail, { color: colors.textPrimary }]}>
              {score} / {maxScore} points
            </Text>

            {/* Message */}
            <Text style={[styles.message, { color: colors.textSecondary }]}>
              {performanceData.message}
            </Text>
          </View>
        </View>

        {/* Review Answers Button (if available) */}
        {answersAvailable && attemptId ? (
          <Pressable
            onPress={() =>
              router.replace({
                pathname: "/(main)/attempt",
                params: { scheduleId, displayedAttemptId: attemptId },
              })
            }
            style={({ pressed }) => [
              styles.primaryBtn,
              {
                backgroundColor: colors.primary,
                opacity: pressed ? 0.9 : 1,
              },
            ]}
          >
            <Iconify icon="mingcute:search-2-line" size={21} color="#fff" />
            <Text style={styles.primaryBtnText}>Review Answers</Text>
          </Pressable>
        ) : (
          <View
            style={[
              styles.infoCard,
              {
                backgroundColor: colors.bg2,
                borderColor: colors.bg3,
              },
            ]}
          >
            <Iconify
              icon="mingcute:information-line"
              size={21}
              color={colors.textSecondary}
            />
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              Answers will be available after the deadline
            </Text>
          </View>
        )}

        {/* Back to Home Button */}
        <Pressable
          onPress={() => router.replace("/(main)/(tabs)/home")}
          style={({ pressed }) => [
            styles.secondaryBtn,
            {
              backgroundColor: colors.bg2,
              borderColor: colors.bg3,
              opacity: pressed ? 0.9 : 1,
            },
          ]}
        >
          <Iconify icon="mingcute:home-2-line" size={21} color={colors.icon} />
          <Text
            style={[styles.secondaryBtnText, { color: colors.textPrimary }]}
          >
            Back to Home
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 80,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    height: 42,
    width: 42,
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    textAlign: "center",
    fontWeight: "900",
    fontSize: 21,
    letterSpacing: 0.2,
  },

  scoreCard: {
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    minHeight: 320,
  },
  gradientOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.1,
  },
  scoreContent: {
    padding: 24,
    alignItems: "center",
    gap: 12,
  },

  emoji: {
    fontSize: 48,
    marginBottom: 8,
  },

  scoreRing: {
    width: 120,
    height: 120,
    borderRadius: 120,
    borderWidth: 6,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 8,
  },
  scorePct: {
    fontSize: 42,
    fontWeight: "900",
  },

  performanceTitle: {
    fontSize: 28,
    fontWeight: "900",
    marginTop: 8,
  },

  scoreDetail: {
    fontSize: 21,
    fontWeight: "800",
  },

  message: {
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 4,
  },

  primaryBtn: {
    height: 42,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
  },
  primaryBtnText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 15,
  },

  secondaryBtn: {
    height: 42,
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  secondaryBtnText: {
    fontWeight: "800",
    fontSize: 15,
  },

  infoCard: {
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
  },
});
