import {
  acknowledgeAttemptRewards,
  getCosmeticPreviewUrl,
  getStudentAttemptOutcome,
  type GameAttemptOutcome,
  type GameAttemptRewardGrant,
} from "@/src/api/game-service";
import { useSession } from "@/src/auth/session";
import { useTheme } from "@/src/theme";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Iconify } from "react-native-iconify";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SvgUri } from "react-native-svg";

const OUTCOME_POLL_MS = 700;
const OUTCOME_TIMEOUT_MS = 15_000;

function isSvgUrl(url?: string | null) {
  const value = String(url || "");
  return value.startsWith("data:image/svg+xml") || /\.svg(?:\?|$)/i.test(value);
}

function RewardThumbnail({
  uri,
  isBadge,
  size,
  bgColor,
  iconColor,
}: {
  uri?: string | null;
  isBadge: boolean;
  size: number;
  bgColor: string;
  iconColor: string;
}) {
  const [failed, setFailed] = useState(false);
  const safeUri = String(uri || "");
  const canRender = !!safeUri && !failed;

  return (
    <View style={{ width: size, height: size }}>
      {canRender ? (
        isSvgUrl(safeUri) ? (
          <SvgUri
            uri={safeUri}
            width={size}
            height={size}
            onError={() => setFailed(true)}
          />
        ) : (
          <Image
            source={{ uri: safeUri }}
            style={{ width: size, height: size }}
            resizeMode="contain"
            onError={() => setFailed(true)}
          />
        )
      ) : (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: 5,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: bgColor,
          }}
        >
          {isBadge ? (
            <Iconify icon="mingcute:award-line" size={18} color={iconColor} />
          ) : (
            <Iconify icon="mingcute:gift-line" size={18} color={iconColor} />
          )}
        </View>
      )}
    </View>
  );
}

function rankChangeText(outcome: GameAttemptOutcome | null) {
  const before =
    typeof outcome?.rankBefore === "number" ? Number(outcome.rankBefore) : null;
  const after =
    typeof outcome?.rankAfter === "number" ? Number(outcome.rankAfter) : null;

  if (before === null && after === null) return "Rank data unavailable";
  if (before === null && after !== null) return `You entered the leaderboard at #${after}`;
  if (before !== null && after === null) return "Rank is being recalculated";

  const delta = Number((outcome?.rankDelta ?? 0) || 0);
  if (delta > 0) {
    return `You climbed ${delta} place${delta === 1 ? "" : "s"} to #${after}`;
  }
  if (delta < 0) {
    const down = Math.abs(delta);
    return `You dropped ${down} place${down === 1 ? "" : "s"} to #${after}`;
  }
  return `No rank change (still #${after})`;
}

function toScoreThresholdProgress(
  outcome: GameAttemptOutcome | null,
  overallScoreAfter: number
) {
  const pointsPerReward = Math.max(
    1,
    Number(outcome?.scoreThresholdProgress?.pointsPerReward || 500)
  );

  const configuredNext = Number(
    outcome?.scoreThresholdProgress?.nextThresholdPoints || 0
  );

  const computedNext =
    (Math.floor(Math.max(0, overallScoreAfter) / pointsPerReward) + 1) *
    pointsPerReward;

  const nextThresholdPoints =
    Number.isFinite(configuredNext) && configuredNext > 0
      ? configuredNext
      : computedNext;

  const previousThreshold = Math.max(0, nextThresholdPoints - pointsPerReward);
  const pointsInBand = Math.max(
    0,
    Math.min(pointsPerReward, overallScoreAfter - previousThreshold)
  );

  return {
    pointsPerReward,
    nextThresholdPoints,
    pointsRemaining: Math.max(0, nextThresholdPoints - overallScoreAfter),
    pct: pointsPerReward > 0 ? pointsInBand / pointsPerReward : 0,
  };
}

export default function QuizResultsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const token = useSession((s) => s.token());
  const account = useSession((s) => s.account);

  const params = useLocalSearchParams<{
    score?: string;
    maxScore?: string;
    quizName?: string;
    classId?: string;
    scheduleId?: string;
    attemptId?: string;
    answerAvailable?: string;
  }>();

  const scoreFromQuizSvc = useMemo(() => {
    const n = Number(params.score ?? "0");
    return Number.isFinite(n) ? n : 0;
  }, [params.score]);

  const maxScoreFromQuizSvc = useMemo(() => {
    const n = Number(params.maxScore ?? "0");
    return Number.isFinite(n) ? n : 0;
  }, [params.maxScore]);

  const quizName = params.quizName ?? "Quiz Results";
  const classId = String(params.classId ?? "");
  const attemptId = String(params.attemptId ?? "");
  const scheduleId = String(params.scheduleId ?? "");

  const answersAvailable =
    params.answerAvailable === "true"
      ? true
      : params.answerAvailable === "false"
      ? false
      : false;

  const [outcome, setOutcome] = useState<GameAttemptOutcome | null>(null);
  const [loadingOutcome, setLoadingOutcome] = useState(true);
  const [pollError, setPollError] = useState<string | null>(null);
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [reloadTick, setReloadTick] = useState(0);
  const [attemptRewardsAcknowledged, setAttemptRewardsAcknowledged] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const deadline = Date.now() + OUTCOME_TIMEOUT_MS;

    async function tick() {
      if (cancelled) return;

      if (!token || !account?.id || !classId || !attemptId) {
        setLoadingOutcome(false);
        setPollError("Missing context to load game outcome");
        return;
      }

      try {
        const data = await getStudentAttemptOutcome(
          token,
          classId,
          account.id,
          attemptId
        );

        if (cancelled) return;

        if (data?.ready) {
          setOutcome(data);
          setLoadingOutcome(false);
          setPollError(null);
          return;
        }
      } catch (e: any) {
        if (!cancelled) {
          setPollError(e?.message || "Failed to load outcome");
        }
      }

      if (Date.now() >= deadline) {
        setLoadingOutcome(false);
        setPollError(
          (prev) =>
            prev ||
            "Still updating your score and rewards. Please retry in a moment."
        );
        return;
      }

      timer = setTimeout(() => {
        void tick();
      }, OUTCOME_POLL_MS);
    }

    setLoadingOutcome(true);
    setPollError(null);
    setOutcome(null);
    setStep(0);
    void tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [account?.id, attemptId, classId, reloadTick, token]);

  useEffect(() => {
    setAttemptRewardsAcknowledged(false);
  }, [attemptId, classId, account?.id]);

  useEffect(() => {
    if (
      attemptRewardsAcknowledged ||
      !token ||
      !account?.id ||
      !classId ||
      !attemptId ||
      !outcome?.ready
    ) {
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        await acknowledgeAttemptRewards(token, classId, account.id, attemptId);
      } catch (e) {
        console.warn("[quiz-results] failed to acknowledge attempt rewards", e);
      } finally {
        if (!cancelled) {
          setAttemptRewardsAcknowledged(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    account?.id,
    attemptId,
    attemptRewardsAcknowledged,
    classId,
    outcome?.ready,
    token,
  ]);

  const resolvedScore =
    typeof outcome?.quizScore === "number"
      ? Number(outcome.quizScore)
      : scoreFromQuizSvc;

  const resolvedMaxScore =
    typeof outcome?.quizMaxScore === "number"
      ? Number(outcome.quizMaxScore)
      : maxScoreFromQuizSvc;

  const pct = resolvedMaxScore > 0 ? Math.round((resolvedScore / resolvedMaxScore) * 100) : 0;

  const rewards: GameAttemptRewardGrant[] = Array.isArray(outcome?.rewards)
    ? outcome!.rewards!
    : [];

  const overallBefore = Number(outcome?.overallScoreBefore || 0);
  const overallAfter = Number(outcome?.overallScoreAfter || 0);
  const overallDelta = Number(outcome?.overallScoreDelta || overallAfter - overallBefore);

  const progress = toScoreThresholdProgress(outcome, overallAfter);

  const performanceData = useMemo(() => {
    if (pct >= 90) {
      return {
        emoji: "🎉",
        title: "Excellent!",
        message: "Outstanding performance!",
        gradient: [colors.success, colors.primary],
      };
    }
    if (pct >= 75) {
      return {
        emoji: "✨",
        title: "Great Job!",
        message: "You are doing really well!",
        gradient: [colors.primary, colors.primaryLight],
      };
    }
    if (pct >= 50) {
      return {
        emoji: "👍",
        title: "Nice Effort!",
        message: "Keep up the good work!",
        gradient: [colors.primary, colors.bg3],
      };
    }
    return {
      emoji: "💪",
      title: "Keep Practicing!",
      message: "You will get better with practice!",
      gradient: [colors.bg3, colors.bg2],
    };
  }, [colors, pct]);

  const styles = getStyles();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg1 }}>
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
          <Iconify icon="mingcute:arrow-left-line" size={23} color={colors.icon} />
        </Pressable>

        <Text numberOfLines={1} style={[styles.title, { color: colors.textPrimary }]}>
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
        {loadingOutcome ? (
          <View
            style={[
              styles.infoCard,
              {
                backgroundColor: colors.bg2,
                borderColor: colors.bg3,
                minHeight: 120,
                alignItems: "center",
                justifyContent: "center",
              },
            ]}
          >
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.infoText, { color: colors.textSecondary, marginTop: 8 }]}> 
              Updating score, ranking, and rewards...
            </Text>
          </View>
        ) : !outcome?.ready ? (
          <>
            <View
              style={[
                styles.infoCard,
                {
                  backgroundColor: colors.bg2,
                  borderColor: colors.bg3,
                },
              ]}
            >
              <Iconify icon="mingcute:information-line" size={21} color={colors.textSecondary} />
              <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                {pollError || "Outcome not ready yet."}
              </Text>
            </View>

            <Pressable
              onPress={() => {
                setReloadTick((v) => v + 1);
                setLoadingOutcome(true);
              }}
              style={({ pressed }) => [
                styles.primaryBtn,
                {
                  backgroundColor: colors.primary,
                  opacity: pressed ? 0.9 : 1,
                },
              ]}
            >
              <Iconify icon="mingcute:refresh-2-line" size={21} color="#fff" />
              <Text style={styles.primaryBtnText}>Retry Update</Text>
            </Pressable>

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
              <Text style={[styles.secondaryBtnText, { color: colors.textPrimary }]}>Back to Home</Text>
            </Pressable>
          </>
        ) : (
          <>
            <View style={styles.stepDotsRow}>
              {[0, 1, 2].map((idx) => (
                <View
                  key={idx}
                  style={[
                    styles.stepDot,
                    {
                      backgroundColor: step === idx ? colors.primary : colors.bg3,
                      borderColor: colors.bg4,
                    },
                  ]}
                />
              ))}
            </View>

            {step === 0 ? (
              <>
                <View
                  style={[
                    styles.scoreCard,
                    {
                      backgroundColor: colors.bg2,
                      borderColor: colors.bg3,
                    },
                  ]}
                >
                  <LinearGradient
                    colors={[...performanceData.gradient, "transparent"] as any}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.gradientOverlay}
                  />

                  <View style={styles.scoreContent}>
                    <Text style={styles.emoji}>{performanceData.emoji}</Text>
                    <View style={[styles.scoreRing, { borderColor: colors.primary }]}> 
                      <Text style={[styles.scorePct, { color: colors.primary }]}>{pct}%</Text>
                    </View>
                    <Text style={[styles.performanceTitle, { color: colors.textPrimary }]}> 
                      Quiz Points: {resolvedMaxScore}
                    </Text>
                    <Text style={[styles.scoreDetail, { color: colors.textPrimary }]}> 
                      Your Score: {resolvedScore} points
                    </Text>
                    <Text style={[styles.message, { color: colors.textSecondary }]}> 
                      {performanceData.message}
                    </Text>
                  </View>
                </View>

                <View
                  style={[
                    styles.infoCard,
                    {
                      backgroundColor: colors.bg2,
                      borderColor: colors.bg3,
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Overall Score</Text>
                    <Text style={[styles.infoMain, { color: colors.textPrimary }]}> 
                      {Math.round(overallBefore)} → {Math.round(overallAfter)} ({overallDelta >= 0 ? "+" : ""}
                      {Math.round(overallDelta)})
                    </Text>
                    <Text style={[styles.infoSub, { color: colors.textSecondary }]}> 
                      {rankChangeText(outcome)}
                    </Text>
                  </View>
                </View>

                <View
                  style={[
                    styles.infoCard,
                    {
                      backgroundColor: colors.bg2,
                      borderColor: colors.bg3,
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Progress to Next Item</Text>
                    <Text style={[styles.infoSub, { color: colors.textSecondary }]}> 
                      {Math.floor(overallAfter)} / {Math.floor(progress.nextThresholdPoints)} points • {Math.ceil(
                        progress.pointsRemaining
                      )} to go
                    </Text>
                    <View style={[styles.progressTrack, { backgroundColor: colors.bg3, marginTop: 8 }]}> 
                      <View
                        style={[
                          styles.progressFill,
                          {
                            width: `${Math.max(0, Math.min(1, progress.pct)) * 100}%`,
                            backgroundColor: colors.primary,
                          },
                        ]}
                      />
                    </View>
                  </View>
                </View>

                <Pressable
                  onPress={() => setStep(1)}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    {
                      backgroundColor: colors.primary,
                      opacity: pressed ? 0.9 : 1,
                    },
                  ]}
                >
                  <Iconify icon="mingcute:arrow-right-line" size={21} color="#fff" />
                  <Text style={styles.primaryBtnText}>Continue</Text>
                </Pressable>
              </>
            ) : null}

            {step === 1 ? (
              <>
                <View
                  style={[
                    styles.rewardCard,
                    {
                      backgroundColor: colors.bg2,
                      borderColor: colors.primary,
                    },
                  ]}
                >
                  <Text style={[styles.rewardTitle, { color: colors.textPrimary }]}> 
                    Rewards and Badges
                  </Text>

                  {rewards.length ? (
                    rewards.map((grant, idx) => {
                      const previewUri =
                        grant.rewardType === "cosmetic"
                          ? getCosmeticPreviewUrl(classId, grant.reward.id) ||
                            grant.reward.assetUrl ||
                            null
                          : grant.reward.imageUrl || grant.reward.assetUrl || null;

                      return (
                        <Pressable
                          key={`${grant.rewardId}-${grant.grantedAt}-${idx}`}
                          onPress={() =>
                            router.push({
                              pathname: "/(main)/reward-item",
                              params: {
                                classId,
                                rewardType: grant.rewardType,
                                rewardId: grant.reward.id,
                              },
                            })
                          }
                          style={({ pressed }) => [
                            styles.rewardRow,
                            {
                              borderColor: colors.bg3,
                              backgroundColor: colors.bg1,
                              opacity: pressed ? 0.92 : 1,
                            },
                          ]}
                        >
                          <View style={styles.rewardImageFrame}>
                            <RewardThumbnail
                              uri={previewUri}
                              isBadge={grant.rewardType === "badge"}
                              size={44}
                              bgColor={colors.bg3}
                              iconColor={colors.icon}
                            />
                          </View>

                          <View style={{ flex: 1 }}>
                            <Text style={[styles.rewardName, { color: colors.textPrimary }]}>
                              {grant.reward.name}
                            </Text>
                            <Text style={[styles.rewardMeta, { color: colors.textSecondary }]}>
                              {grant.rewardType === "badge" ? "Badge" : "Cosmetic"}
                              {grant.thresholdPoints
                                ? ` • Reached ${Math.floor(grant.thresholdPoints)} points`
                                : ""}
                            </Text>
                          </View>
                          <Iconify
                            icon="mingcute:right-line"
                            size={16}
                            color={colors.textSecondary}
                          />
                        </Pressable>
                      );
                    })
                  ) : (
                    <Text style={[styles.rewardLine, { color: colors.textSecondary }]}> 
                      No new rewards this time. Keep going!
                    </Text>
                  )}
                </View>

                <View style={styles.rowButtons}>
                  <Pressable
                    onPress={() => setStep(0)}
                    style={({ pressed }) => [
                      styles.secondaryBtn,
                      {
                        flex: 1,
                        backgroundColor: colors.bg2,
                        borderColor: colors.bg3,
                        opacity: pressed ? 0.9 : 1,
                      },
                    ]}
                  >
                    <Iconify icon="mingcute:arrow-left-line" size={21} color={colors.icon} />
                    <Text style={[styles.secondaryBtnText, { color: colors.textPrimary }]}>Back</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => setStep(2)}
                    style={({ pressed }) => [
                      styles.primaryBtn,
                      {
                        flex: 1,
                        backgroundColor: colors.primary,
                        opacity: pressed ? 0.9 : 1,
                      },
                    ]}
                  >
                    <Iconify icon="mingcute:arrow-right-line" size={21} color="#fff" />
                    <Text style={styles.primaryBtnText}>Continue</Text>
                  </Pressable>
                </View>
              </>
            ) : null}

            {step === 2 ? (
              <>
                <View
                  style={[
                    styles.scoreCard,
                    {
                      backgroundColor: colors.bg2,
                      borderColor: colors.bg3,
                      minHeight: 0,
                    },
                  ]}
                >
                  <View style={styles.summaryContent}>
                    <Text style={[styles.performanceTitle, { color: colors.textPrimary }]}> 
                      Summary
                    </Text>

                    <View style={styles.summaryRow}>
                      <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Quiz Points</Text>
                      <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>{resolvedScore}</Text>
                    </View>

                    <View style={styles.summaryRow}>
                      <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Quiz Score</Text>
                      <Text style={[styles.summaryValue, { color: colors.textPrimary }]}> 
                        {resolvedScore} / {resolvedMaxScore} ({pct}%)
                      </Text>
                    </View>

                    <View style={styles.summaryRow}>
                      <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Overall Score</Text>
                      <Text style={[styles.summaryValue, { color: colors.textPrimary }]}> 
                        {Math.round(overallAfter)}
                      </Text>
                    </View>

                    <View style={styles.summaryRow}>
                      <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Current Rank</Text>
                      <Text style={[styles.summaryValue, { color: colors.textPrimary }]}> 
                        {typeof outcome?.rankAfter === "number" ? `#${outcome.rankAfter}` : "-"}
                      </Text>
                    </View>
                  </View>
                </View>

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
                  <Text style={[styles.secondaryBtnText, { color: colors.textPrimary }]}>Back to Home</Text>
                </Pressable>
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function getStyles() {
  return StyleSheet.create({
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

    stepDotsRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    stepDot: {
      width: 8,
      height: 8,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
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
    summaryContent: {
      padding: 18,
      gap: 12,
    },
    summaryRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: 12,
    },
    summaryLabel: {
      fontSize: 15,
      fontWeight: "700",
    },
    summaryValue: {
      fontSize: 16,
      fontWeight: "900",
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
      fontSize: 26,
      fontWeight: "900",
      marginTop: 8,
    },
    scoreDetail: {
      fontSize: 20,
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
      paddingHorizontal: 12,
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
    infoLabel: {
      fontSize: 13,
      fontWeight: "800",
      marginBottom: 4,
    },
    infoMain: {
      fontSize: 18,
      fontWeight: "900",
      marginBottom: 6,
    },
    infoSub: {
      fontSize: 14,
      fontWeight: "700",
    },

    progressTrack: {
      height: 10,
      borderRadius: 10,
      overflow: "hidden",
    },
    progressFill: {
      height: "100%",
      borderRadius: 10,
    },

    rewardCard: {
      borderRadius: 5,
      borderWidth: StyleSheet.hairlineWidth,
      padding: 16,
      gap: 8,
    },
    rewardTitle: {
      fontSize: 20,
      fontWeight: "900",
      marginBottom: 6,
    },
    rewardLine: {
      fontSize: 15,
      fontWeight: "700",
    },
    rewardRow: {
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 5,
      padding: 10,
      gap: 10,
      flexDirection: "row",
      alignItems: "center",
    },
    rewardImageFrame: {
      width: 44,
      height: 44,
      borderRadius: 5,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
    },
    rewardName: {
      fontSize: 16,
      fontWeight: "900",
    },
    rewardMeta: {
      fontSize: 13,
      fontWeight: "700",
    },

    rowButtons: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
  });
}
