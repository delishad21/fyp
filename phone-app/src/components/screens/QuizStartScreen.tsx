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

export default function QuizStartScreen() {
  const { params } = useRoute<RouteProp<ParamList, "QuizStart">>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const token = useSession((s) => s.token());

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [spec, setSpec] = useState<AttemptSpec | null>(null);
  const [inProgressAttemptId, setInProgressAttemptId] = useState<
    string | undefined
  >();

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const { spec, inProgressAttemptId } = await getAttemptSpec(
        token,
        params.quizId,
        { scheduleId: params.scheduleId, classId: params.classId }
      );
      setSpec(spec);
      setInProgressAttemptId(inProgressAttemptId);
    } catch (e: any) {
      setError(e?.message || "Failed to load quiz");
    } finally {
      setLoading(false);
    }
  }, [token, params.quizId, params.scheduleId, params.classId]);

  useEffect(() => {
    load();
  }, [load]);

  const title = spec?.meta?.name || params.quizName || "Quiz";
  const pillColor =
    params.subjectColorHex || spec?.meta?.subjectColorHex || colors.primary;

  const { questionCount, timeLine, description } = useMemo(() => {
    if (!spec) return { questionCount: 0, timeLine: "—", description: "" };

    const baseDesc =
      spec.meta.topic && spec.meta.subject
        ? `${spec.meta.topic} • ${spec.meta.subject}`
        : spec.meta.topic || spec.meta.subject || "";

    if (isRapid(spec)) {
      const items = spec.renderSpec.items ?? [];
      return {
        questionCount: items.length,
        timeLine: "Timed test",
        description: baseDesc,
      };
    }

    if (isBasic(spec)) {
      const items = (spec.renderSpec.items ?? []).filter(
        (i) => i.kind !== "context"
      );
      const ttl = (spec.renderSpec as any).totalTimeLimit ?? null;
      const timeLine =
        ttl && ttl > 0 ? `${formatSecs(ttl)} total` : "No time limit";
      return { questionCount: items.length, timeLine, description: baseDesc };
    }

    if (isCrossword(spec)) {
      const first = spec.renderSpec.items?.[0] as any;
      const entriesCount = Array.isArray(first?.entries)
        ? first.entries.length
        : 0;
      const ttlTop = (spec.renderSpec as any).totalTimeLimit ?? null;
      const timeLine =
        ttlTop && ttlTop > 0 ? `${formatSecs(ttlTop)} total` : "No time limit";
      return {
        questionCount: entriesCount,
        timeLine,
        description: spec.meta.topic
          ? `${spec.meta.topic} Crossword`
          : "Crossword",
      };
    }

    return { questionCount: 0, timeLine: "—", description: "" };
  }, [spec]);

  const onStartOrResume = useCallback(async () => {
    if (!token || !spec) return;
    try {
      const result = await startAttempt(token, {
        quizId: spec.quizId,
        scheduleId: params.scheduleId,
        classId: params.classId,
      });

      // Cache (keyed by attemptId)
      useAttemptCache
        .getState()
        .setAttemptPayload(result.attemptId, { spec, attempt: result.attempt });

      // Route to coordinator
      router.push({
        pathname: "/quiz/play",
        params: { attemptId: result.attemptId, quizType: spec.quizType },
      });
    } catch (e: any) {
      setError(e?.message || "Could not start/resume this quiz.");
    }
  }, [token, spec, params.classId, params.scheduleId, router]);

  const styles = getStyles(colors);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg1 }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top,
          paddingBottom: insets.bottom + 24,
        }}
      >
        {/* Header with back button */}
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={({ pressed }) => [
              styles.backBtn,
              { backgroundColor: colors.bg2, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Iconify
              icon="mingcute:arrow-left-line"
              size={22}
              color={colors.icon}
            />
          </Pressable>
        </View>

        <View style={[styles.container, { backgroundColor: colors.bg1 }]}>
          <View
            style={[
              styles.pill,
              { backgroundColor: pillColor || colors.primary },
            ]}
          >
            <Text style={styles.pillText} numberOfLines={2}>
              {title}
            </Text>
          </View>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : error ? (
            <View style={styles.center}>
              <Text style={{ color: colors.error, textAlign: "center" }}>
                {error}
              </Text>
            </View>
          ) : spec ? (
            <>
              <View style={styles.row}>
                <View style={[styles.fact, { backgroundColor: colors.bg2 }]}>
                  <Iconify
                    icon="mingcute:question-line"
                    size={20}
                    color={colors.icon}
                    style={styles.factIcon}
                  />
                  <Text
                    style={[styles.factText, { color: colors.textPrimary }]}
                  >
                    {questionCount}{" "}
                    {questionCount === 1 ? "Question" : "Questions"}
                  </Text>
                </View>
                <View style={[styles.fact, { backgroundColor: colors.bg2 }]}>
                  <Iconify
                    icon="mingcute:time-line"
                    size={20}
                    color={colors.icon}
                    style={styles.factIcon}
                  />
                  <Text
                    style={[styles.factText, { color: colors.textPrimary }]}
                    numberOfLines={2}
                  >
                    {timeLine}
                  </Text>
                </View>
              </View>

              {description ? (
                <Text style={[styles.desc, { color: colors.textSecondary }]}>
                  {description}
                </Text>
              ) : null}

              <Pressable
                onPress={onStartOrResume}
                style={({ pressed }) => [
                  styles.cta,
                  {
                    backgroundColor: colors.primary,
                    opacity: pressed ? 0.9 : 1,
                  },
                ]}
              >
                <Text style={styles.ctaText}>
                  {inProgressAttemptId ? "Resume" : "Start"}
                </Text>
              </Pressable>

              <Text style={[styles.helper, { color: colors.textSecondary }]}>
                {spec.attemptsRemaining} attempt
                {spec.attemptsRemaining === 1 ? "" : "s"} remaining
              </Text>
            </>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    headerRow: {
      paddingHorizontal: 12,
      marginBottom: 4,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-start",
    },
    backBtn: {
      height: 38,
      width: 38,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    container: { paddingHorizontal: 20, paddingTop: 8 },
    pill: {
      alignSelf: "center",
      paddingVertical: 14,
      paddingHorizontal: 18,
      borderRadius: 14,
      marginBottom: 20,
      minWidth: "70%",
    },
    pillText: {
      color: "#fff",
      textAlign: "center",
      fontWeight: "800",
      fontSize: 18,
    },
    row: { gap: 12, marginBottom: 16 },
    fact: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 12,
    },
    factIcon: { marginRight: 10 },
    factText: { fontWeight: "700", fontSize: 16 },
    desc: {
      textAlign: "center",
      marginTop: 12,
      marginBottom: 24,
      fontSize: 14,
      lineHeight: 20,
    },
    cta: {
      alignSelf: "center",
      paddingVertical: 14,
      paddingHorizontal: 28,
      borderRadius: 12,
      minWidth: 220,
    },
    ctaText: {
      color: "#fff",
      fontWeight: "700",
      textAlign: "center",
      fontSize: 16,
    },
    helper: { textAlign: "center", marginTop: 10, fontSize: 12 },
    center: { alignItems: "center", justifyContent: "center", minHeight: 180 },
  });
