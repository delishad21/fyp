import {
  getAttemptSpec,
  isBasic,
  isCrossword,
  isRapid,
  startAttempt,
  type AttemptSpec,
} from "@/src/api/quiz-service";
import { useSession } from "@/src/auth/session";
import { useAttemptCache } from "@/src/services/attempt-cache";
import { useTheme } from "@/src/theme";
import { RouteProp, useRoute } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Iconify } from "react-native-iconify";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type ParamList = {
  QuizStart: {
    scheduleId: string;
    quizId: string;
    classId: string;
    subject?: string | null;
    subjectColorHex?: string | null;
    quizName?: string | null;
    topic?: string | null;
  };
};

const formatSecs = (secs: number) => {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  const mPart = m > 0 ? `${m} ${m === 1 ? "minute" : "minutes"}` : "";
  const sPart = s > 0 ? `${s} ${s === 1 ? "second" : "seconds"}` : "";
  if (!mPart && !sPart) return "0 seconds";
  return [mPart, sPart].filter(Boolean).join(" ");
};

const quizTypeLabel = (spec: AttemptSpec | null) => {
  if (!spec) return null;
  if (isRapid(spec)) return "Rapid";
  if (isBasic(spec)) return "Basic";
  if (isCrossword(spec)) return "Crossword";
  return null;
};

export default function QuizStartScreen() {
  const { params } = useRoute<RouteProp<ParamList, "QuizStart">>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const token = useSession((s) => s.token());

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [spec, setSpec] = useState<AttemptSpec | null>(null);
  const [inProgressAttemptId, setInProgressAttemptId] = useState<string>();

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const { spec, inProgressAttemptId } = await getAttemptSpec(token, {
        scheduleId: params.scheduleId,
      });
      setSpec(spec);
      setInProgressAttemptId(inProgressAttemptId);
    } catch (e: any) {
      setError(e?.message || "Failed to load quiz");
    } finally {
      setLoading(false);
    }
  }, [token, params.scheduleId]);

  useEffect(() => {
    load();
  }, [load]);

  const quizName = spec?.meta?.name || params.quizName || "Quiz";

  const subject = params.subject || spec?.meta?.subject || null;

  const topic =
    (spec?.meta?.topic as string | null | undefined) ||
    (params as any)?.topic ||
    null;

  const pillColor =
    params.subjectColorHex || spec?.meta?.subjectColorHex || colors.primary;

  const typeLabel = useMemo(() => quizTypeLabel(spec), [spec]);

  const { questionCount, timeLine } = useMemo(() => {
    if (!spec) return { questionCount: 0, timeLine: "—" };

    if (isRapid(spec)) {
      const items = spec.renderSpec.items ?? [];
      return { questionCount: items.length, timeLine: "Timed test" };
    }

    if (isBasic(spec)) {
      const items = (spec.renderSpec.items ?? []).filter(
        (i) => i.kind !== "context"
      );
      const ttl = (spec.renderSpec as any).totalTimeLimit ?? null;
      const timeLine =
        ttl && ttl > 0 ? `${formatSecs(ttl)} total` : "No time limit";
      return { questionCount: items.length, timeLine };
    }

    if (isCrossword(spec)) {
      const first = spec.renderSpec.items?.[0] as any;
      const entriesCount = Array.isArray(first?.entries)
        ? first.entries.length
        : 0;
      const ttlTop = (spec.renderSpec as any).totalTimeLimit ?? null;
      const timeLine =
        ttlTop && ttlTop > 0 ? `${formatSecs(ttlTop)} total` : "No time limit";
      return { questionCount: entriesCount, timeLine };
    }

    return { questionCount: 0, timeLine: "—" };
  }, [spec]);

  const onStartOrResume = useCallback(async () => {
    if (!token || !spec) return;
    try {
      const result = await startAttempt(token, params.scheduleId);

      useAttemptCache
        .getState()
        .setAttemptPayload(result.attemptId, { spec, attempt: result.attempt });

      router.replace({
        pathname: "/quiz/play",
        params: { attemptId: result.attemptId, quizType: spec.quizType },
      });
    } catch (e: any) {
      setError(e?.message || "Could not start/resume this quiz.");
    }
  }, [token, spec, params.scheduleId, router]);

  const styles = getStyles();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg1 }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 10,
          paddingBottom: insets.bottom + 28,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={({ pressed }) => [
              styles.backBtn,
              {
                backgroundColor: colors.bg2,
                borderColor: colors.bg3,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Iconify
              icon="mingcute:arrow-left-line"
              size={23}
              color={colors.icon}
            />
          </Pressable>

          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
            Quiz
          </Text>

          <View style={{ width: 42 }} />
        </View>

        <View style={{ paddingHorizontal: 16 }}>
          {/* TITLE CARD (title at top, subject/topic below) */}
          <View
            style={[
              styles.titleCard,
              {
                backgroundColor: pillColor,
                shadowColor: "#000",
              },
            ]}
          >
            <View style={styles.titleTopRow}>
              <Text style={styles.titleCardTitle} numberOfLines={2}>
                {quizName}
              </Text>

              {typeLabel ? (
                <View style={styles.typeBadge}>
                  <Text style={styles.typeBadgeText}>{typeLabel}</Text>
                </View>
              ) : null}
            </View>

            <Text style={styles.titleCardSub} numberOfLines={2}>
              {[subject, topic].filter(Boolean).join(" • ") || "Quiz"}
            </Text>
          </View>

          {/* STATS AREA (separate area) */}
          <View
            style={[
              styles.statsCard,
              { backgroundColor: colors.bg2, borderColor: colors.bg3 },
            ]}
          >
            <View style={styles.statRow}>
              <View
                style={[
                  styles.statIconWrap,
                  { backgroundColor: colors.bg3, borderColor: colors.bg3 },
                ]}
              >
                <Iconify
                  icon="mingcute:question-line"
                  size={21}
                  color={colors.icon}
                />
              </View>

              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={[styles.statLabel, { color: colors.textSecondary }]}
                >
                  Questions
                </Text>
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>
                  {questionCount}{" "}
                  {questionCount === 1 ? "question" : "questions"}
                </Text>
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.bg3 }]} />

            <View style={styles.statRow}>
              <View
                style={[
                  styles.statIconWrap,
                  { backgroundColor: colors.bg3, borderColor: colors.bg3 },
                ]}
              >
                <Iconify
                  icon="mingcute:time-line"
                  size={21}
                  color={colors.icon}
                />
              </View>

              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={[styles.statLabel, { color: colors.textSecondary }]}
                >
                  Time limit
                </Text>
                <Text
                  style={[styles.statValue, { color: colors.textPrimary }]}
                  numberOfLines={2}
                >
                  {timeLine}
                </Text>
              </View>
            </View>
          </View>

          {/* Content */}
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.helper, { color: colors.textSecondary }]}>
                Loading quiz…
              </Text>
            </View>
          ) : error ? (
            <View style={styles.center}>
              <Text style={[styles.errorText, { color: colors.error }]}>
                {error}
              </Text>

              <Pressable
                onPress={load}
                style={({ pressed }) => [
                  styles.retryBtn,
                  {
                    opacity: pressed ? 0.9 : 1,
                    backgroundColor: colors.bg2,
                    borderColor: colors.bg3,
                  },
                ]}
              >
                <Text style={{ color: colors.textPrimary, fontWeight: "900" }}>
                  Retry
                </Text>
              </Pressable>
            </View>
          ) : spec ? (
            <>
              {/* CTA */}
              <Pressable
                onPress={onStartOrResume}
                style={({ pressed }) => [
                  styles.cta,
                  {
                    backgroundColor: colors.primary,
                    opacity: pressed ? 0.92 : 1,
                    shadowColor: "#000",
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.ctaTitle}>
                    {inProgressAttemptId ? "Resume quiz" : "Start quiz"}
                  </Text>
                  <Text style={styles.ctaSub}>
                    {spec.attemptsRemaining} attempt
                    {spec.attemptsRemaining === 1 ? "" : "s"} remaining
                  </Text>
                </View>

                <View style={styles.ctaArrowWrap}>
                  <Iconify
                    icon="mingcute:right-line"
                    size={21}
                    color="#fff"
                  />
                </View>
              </Pressable>

              <Text style={[styles.helper2, { color: colors.textSecondary }]}>
                You can leave and come back later — we’ll keep your progress.
              </Text>
            </>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const getStyles = () =>
  StyleSheet.create({
    headerRow: {
      paddingHorizontal: 12,
      marginBottom: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    backBtn: {
      height: 42,
      width: 42,
      borderRadius: 5,
      borderWidth: StyleSheet.hairlineWidth,
      alignItems: "center",
      justifyContent: "center",
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: "900",
      letterSpacing: 0.2,
    },

    // --- Title card ---
    titleCard: {
      borderRadius: 5,
      paddingHorizontal: 18,
      paddingVertical: 18,
      shadowOpacity: 0.16,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
      elevation: 3,
      marginBottom: 12,
    },
    titleTopRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
      marginBottom: 8,
    },
    titleCardTitle: {
      color: "#fff",
      fontSize: 25,
      fontWeight: "900",
      letterSpacing: 0.2,
      lineHeight: 32,
      flex: 1,
      minWidth: 0,
    },
    titleCardSub: {
      color: "#ffffffdd",
      fontSize: 16,
      fontWeight: "700",
      lineHeight: 23,
    },
    typeBadge: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: "#ffffff22",
      flexShrink: 0,
      alignItems: "center",
      justifyContent: "center",
    },
    typeBadgeText: {
      color: "#fff",
      fontSize: 14,
      fontWeight: "900",
      letterSpacing: 0.3,
      textTransform: "uppercase",
    },

    // --- Stats area ---
    statsCard: {
      borderRadius: 5,
      borderWidth: StyleSheet.hairlineWidth,
      padding: 16,
      marginBottom: 16,
    },
    statRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    statIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 5,
      borderWidth: StyleSheet.hairlineWidth,
      alignItems: "center",
      justifyContent: "center",
    },
    statLabel: {
      fontSize: 14,
      fontWeight: "900",
      letterSpacing: 0.5,
      textTransform: "uppercase",
      marginBottom: 2,
    },
    statValue: {
      fontSize: 18,
      fontWeight: "900",
      letterSpacing: 0.2,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      marginVertical: 14,
      borderRadius: 999,
    },

    // --- Loading / error ---
    center: {
      alignItems: "center",
      justifyContent: "center",
      minHeight: 220,
      paddingTop: 10,
    },
    helper: {
      marginTop: 10,
      fontSize: 15,
      fontWeight: "700",
    },
    helper2: {
      marginTop: 10,
      fontSize: 14,
      fontWeight: "600",
      textAlign: "center",
      opacity: 0.9,
    },
    errorText: {
      textAlign: "center",
      fontSize: 15,
      fontWeight: "800",
      marginBottom: 12,
    },
    retryBtn: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 5,
      borderWidth: StyleSheet.hairlineWidth,
    },

    cta: {
      borderRadius: 5,
      paddingHorizontal: 16,
      paddingVertical: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      shadowOpacity: 0.14,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
      elevation: 3,
    },
    ctaTitle: {
      color: "#fff",
      fontSize: 18,
      fontWeight: "900",
      letterSpacing: 0.2,
      marginBottom: 4,
    },
    ctaSub: {
      color: "#ffffffdd",
      fontSize: 14,
      fontWeight: "800",
    },
    ctaArrowWrap: {
      width: 44,
      height: 44,
      borderRadius: 5,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#ffffff22",
      flexShrink: 0,
    },
  });
