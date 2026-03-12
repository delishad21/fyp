import {
  getAttemptSpec,
  isBasic,
  isCrossword,
  isRapid,
  startAttempt,
  type AttemptSpec,
} from "@/src/api/quiz-service";
import { useSession } from "@/src/auth/session";
import { hexToRgba } from "@/src/lib/color-utils";
import { useEntranceAnimation } from "@/src/hooks/useEntranceAnimation";
import { useAttemptCache } from "@/src/services/attempt-cache";
import { useTheme } from "@/src/theme";
import { googlePalette } from "@/src/theme/google-palette";
import { RouteProp, useRoute } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
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
  if (isRapid(spec)) {
    if (spec.quizType === "true-false") return "True / False";
    if (spec.quizType === "rapid-arithmetic") return "Rapid Arithmetic";
    return "Rapid";
  }
  if (isBasic(spec)) return "Basic";
  if (isCrossword(spec)) {
    return spec.quizType === "crossword-bank" ? "Crossword Bank" : "Crossword";
  }
  return null;
};

const QUIZ_TYPE_COLOR_FALLBACK: Record<string, string> = {
  basic: "#22c55e",
  rapid: "#f59e0b",
  crossword: "#3b82f6",
  "rapid-arithmetic": "#eab308",
  "crossword-bank": "#0ea5e9",
  "true-false": "#ef4444",
};

export default function QuizStartScreen() {
  const { params } = useRoute<RouteProp<ParamList, "QuizStart">>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const contentMotion = useEntranceAnimation({
    delayMs: 40,
    fromY: 14,
    durationMs: 270,
  });
  const token = useSession((s) => s.token());

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [spec, setSpec] = useState<AttemptSpec | null>(null);
  const [inProgressAttemptId, setInProgressAttemptId] = useState<string>();

  const load = useCallback(async () => {
    if (!token) {
      setError("Session expired. Please sign in again.");
      setLoading(false);
      void useSession.getState().logout();
      return;
    }
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
  const typeTag = useMemo(() => {
    const type = spec?.quizType;
    const serverTypeColor = String(spec?.meta?.typeColorHex || "").trim();
    if (serverTypeColor) {
      return {
        bg: serverTypeColor,
        fg:
          serverTypeColor.toLowerCase() === "#eab308" ? "#1F1F1F" : "#fff",
      };
    }
    if (!type) {
      return {
        bg: colors.bg3,
        fg: colors.textPrimary,
      };
    }
    const fallbackColor = QUIZ_TYPE_COLOR_FALLBACK[String(type)] || colors.bg3;
    return {
      bg: fallbackColor,
      fg: fallbackColor.toLowerCase() === "#eab308" ? "#1F1F1F" : "#fff",
    };
  }, [colors.bg3, colors.textPrimary, spec?.meta?.typeColorHex, spec?.quizType]);

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
  const accent = { green: googlePalette.green } as const;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg1 }}>
      <View style={[styles.headerRow, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={({ pressed }) => [
            styles.backBtn,
            {
              backgroundColor: colors.bg2,
              borderColor: colors.bg4,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Iconify
            icon="mingcute:arrow-left-line"
            size={22}
            color={colors.icon}
          />
        </Pressable>
      </View>

      <View style={styles.splitRoot}>
        <Animated.View
          style={[
            styles.topHalf,
            { backgroundColor: pillColor },
            contentMotion,
          ]}
        >
          <View style={styles.topInner}>
            <Text style={styles.topTitle}>{quizName}</Text>
          </View>
        </Animated.View>

        <View style={[styles.bottomHalf, { backgroundColor: colors.bg1 }]}>
          <Animated.View style={[styles.bottomInner, contentMotion]}>
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
                      backgroundColor: googlePalette.red,
                      borderColor: googlePalette.red,
                    },
                  ]}
                >
                  <Text style={{ color: "#fff", fontWeight: "900" }}>
                    Retry
                  </Text>
                </Pressable>
              </View>
            ) : spec ? (
              <View style={styles.bottomContent}>
                <Pressable
                  onPress={onStartOrResume}
                  style={({ pressed }) => [
                    styles.cta,
                    {
                      backgroundColor: accent.green,
                      opacity: pressed ? 0.92 : 1,
                    },
                  ]}
                >
                  <View style={styles.ctaRow}>
                    <Iconify
                      icon="mingcute:play-fill"
                      size={22}
                      color="#fff"
                    />
                    <Text style={styles.ctaTitle}>
                      {inProgressAttemptId ? "Resume Quiz" : "Start Quiz"}
                    </Text>
                  </View>
                </Pressable>
                <Text style={[styles.attemptsText, { color: colors.textSecondary }]}>
                  {spec.attemptsRemaining} attempt
                  {spec.attemptsRemaining === 1 ? "" : "s"} remaining
                </Text>

                <View style={styles.bottomInfoArea}>
                <View
                  style={[
                    styles.statsCard,
                    {
                      backgroundColor: colors.bg2,
                      borderColor: colors.bg4,
                    },
                  ]}
                >
                  <View style={styles.statRow}>
                    <View style={styles.statLabelGroup}>
                      <Iconify
                        icon="mingcute:book-2-line"
                        size={18}
                        color={colors.icon}
                      />
                      <Text
                        style={[styles.statLabel, { color: colors.textSecondary }]}
                      >
                        Subject
                      </Text>
                    </View>
                    <View style={styles.subjectValueWrap}>
                      <View
                        style={[
                          styles.subjectDot,
                          { backgroundColor: pillColor || colors.primary },
                        ]}
                      />
                      <Text
                        style={[styles.subjectValueText, { color: colors.textPrimary }]}
                        numberOfLines={1}
                      >
                        {subject || "—"}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={[styles.divider, { backgroundColor: colors.bg4 }]}
                  />

                  <View style={styles.statRow}>
                    <View style={styles.statLabelGroup}>
                      <Iconify
                        icon="mingcute:tag-2-line"
                        size={18}
                        color={colors.icon}
                      />
                      <Text
                        style={[styles.statLabel, { color: colors.textSecondary }]}
                      >
                        Topic
                      </Text>
                    </View>
                    <Text
                      style={[styles.statValue, { color: colors.textPrimary }]}
                      numberOfLines={1}
                    >
                      {topic || "—"}
                    </Text>
                  </View>

                  <View
                    style={[styles.divider, { backgroundColor: colors.bg4 }]}
                  />

                  <View style={styles.statRow}>
                    <View style={styles.statLabelGroup}>
                      <Iconify
                        icon="mingcute:award-line"
                          size={18}
                          color={colors.icon}
                        />
                        <Text
                          style={[styles.statLabel, { color: colors.textSecondary }]}
                        >
                          Quiz Type
                        </Text>
                      </View>
                      <View style={styles.statValueWrap}>
                        <View
                          style={[
                            styles.typeTag,
                            {
                              backgroundColor: typeTag.bg,
                              borderColor: typeTag.bg,
                            },
                          ]}
                        >
                          <Text style={[styles.typeTagText, { color: typeTag.fg }]}>
                            {typeLabel || "—"}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <View
                      style={[styles.divider, { backgroundColor: colors.bg4 }]}
                    />

                    <View style={styles.statRow}>
                      <View style={styles.statLabelGroup}>
                        <Iconify
                          icon="mingcute:question-line"
                          size={18}
                          color={colors.icon}
                        />
                        <Text
                          style={[styles.statLabel, { color: colors.textSecondary }]}
                        >
                          Questions
                        </Text>
                      </View>
                      <Text
                        style={[styles.statValue, { color: colors.textPrimary }]}
                      >
                        {questionCount}
                      </Text>
                    </View>

                    <View
                      style={[styles.divider, { backgroundColor: colors.bg4 }]}
                    />

                    <View style={styles.statRow}>
                      <View style={styles.statLabelGroup}>
                        <Iconify
                          icon="mingcute:time-line"
                          size={18}
                          color={colors.icon}
                        />
                        <Text
                          style={[styles.statLabel, { color: colors.textSecondary }]}
                        >
                          Time Limit
                        </Text>
                      </View>
                      <Text
                        style={[styles.statValue, { color: colors.textPrimary }]}
                        numberOfLines={2}
                      >
                        {timeLine}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            ) : null}
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

const getStyles = () =>
  StyleSheet.create({
    headerRow: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      zIndex: 20,
      paddingHorizontal: 12,
      paddingBottom: 10,
    },
    backBtn: {
      height: 42,
      width: 42,
      borderRadius: 8,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    splitRoot: {
      flex: 1,
      position: "relative",
    },
    topHalf: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 24,
      paddingTop: 0,
      paddingBottom: 0,
    },
    topInner: {
      alignItems: "center",
      justifyContent: "center",
      maxWidth: 560,
      width: "96%",
    },
    topTitle: {
      color: "#fff",
      fontSize: 38,
      fontWeight: "900",
      lineHeight: 44,
      textAlign: "center",
    },
    bottomHalf: {
      flex: 3,
      paddingHorizontal: 16,
      paddingBottom: 20,
    },
    bottomInner: {
      flex: 1,
    },
    bottomContent: {
      gap: 16,
      paddingTop: 16,
    },
    bottomInfoArea: {
      marginTop: 0,
    },
    statsCard: {
      borderRadius: 10,
      borderWidth: 1,
      padding: 16,
      gap: 2,
    },
    statRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 14,
      minHeight: 48,
    },
    statLabelGroup: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      minWidth: 0,
      flexShrink: 1,
    },
    statLabel: {
      fontSize: 14,
      fontWeight: "900",
      letterSpacing: 0.5,
      textTransform: "uppercase",
      flexShrink: 0,
    },
    statValue: {
      fontSize: 18,
      fontWeight: "900",
      letterSpacing: 0.2,
      textAlign: "right",
      flex: 1,
    },
    statValueWrap: {
      flex: 1,
      alignItems: "flex-end",
      justifyContent: "center",
    },
    subjectValueWrap: {
      flex: 1,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: 8,
    },
    subjectDot: {
      width: 10,
      height: 10,
      borderRadius: 999,
      flexShrink: 0,
    },
    subjectValueText: {
      fontSize: 17,
      fontWeight: "800",
      textAlign: "right",
    },
    typeTag: {
      alignSelf: "flex-end",
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
      maxWidth: "100%",
    },
    typeTagText: {
      fontSize: 13,
      fontWeight: "900",
      letterSpacing: 0.2,
      textTransform: "uppercase",
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      marginVertical: 10,
      borderRadius: 2,
    },
    center: {
      alignItems: "center",
      justifyContent: "center",
      minHeight: 180,
      paddingTop: 24,
    },
    helper: {
      marginTop: 10,
      fontSize: 15,
      fontWeight: "700",
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
      borderRadius: 8,
      borderWidth: 1,
    },
    cta: {
      borderRadius: 10,
      width: "100%",
      minHeight: 86,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderWidth: 1,
      borderColor: "#00000010",
    },
    ctaRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    ctaTitle: {
      color: "#fff",
      fontSize: 23,
      fontWeight: "900",
      letterSpacing: 0.2,
    },
    attemptsText: {
      fontSize: 14,
      fontWeight: "700",
      textAlign: "center",
      marginTop: 0,
      marginBottom: 0,
    },
  });
