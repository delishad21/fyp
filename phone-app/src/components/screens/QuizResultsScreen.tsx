import {
  acknowledgeAttemptRewards,
  getCosmeticPreviewUrl,
  getStudentAttemptOutcome,
  type GameAttemptOutcome,
  type GameAttemptRewardGrant,
} from "@/src/api/game-service";
import { useSession } from "@/src/auth/session";
import { useTheme } from "@/src/theme";
import { googlePalette } from "@/src/theme/google-palette";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Iconify } from "react-native-iconify";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SvgUri } from "react-native-svg";
import { useAnimatedProgress } from "@/src/hooks/useAnimatedProgress";
import { useEntranceAnimation } from "@/src/hooks/useEntranceAnimation";

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
            borderRadius: 4,
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
  if (before === null && after !== null)
    return `You entered the leaderboard at #${after}`;
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
  overallScoreAfter: number,
) {
  const pointsPerReward = Math.max(
    1,
    Number(outcome?.scoreThresholdProgress?.pointsPerReward || 500),
  );

  const configuredNext = Number(
    outcome?.scoreThresholdProgress?.nextThresholdPoints || 0,
  );

  const computedNext =
    (Math.floor(Math.max(0, overallScoreAfter) / pointsPerReward) + 1) *
    pointsPerReward;

  const nextThresholdPoints =
    Number.isFinite(configuredNext) && configuredNext > 0
      ? configuredNext
      : computedNext;

  const safeScore = Math.max(0, overallScoreAfter);
  let progressStart = Math.floor(safeScore / pointsPerReward) * pointsPerReward;
  if (progressStart >= nextThresholdPoints) {
    // Defensive fallback for stale state where next threshold lags score.
    progressStart = Math.max(0, nextThresholdPoints - pointsPerReward);
  }

  const progressSpan = Math.max(pointsPerReward, nextThresholdPoints - progressStart);
  const pointsInBand = Math.max(
    0,
    Math.min(progressSpan, safeScore - progressStart),
  );

  return {
    pointsPerReward,
    nextThresholdPoints,
    pointsRemaining: Math.max(0, nextThresholdPoints - safeScore),
    pct: progressSpan > 0 ? pointsInBand / progressSpan : 0,
  };
}

export default function QuizResultsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
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
  const [attemptRewardsAcknowledged, setAttemptRewardsAcknowledged] =
    useState(false);
  const pagerRef = useRef<ScrollView | null>(null);
  const pageWidth = Math.max(1, screenWidth - 32);

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
          attemptId,
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
            "Still updating your score and rewards. Please retry in a moment.",
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
    requestAnimationFrame(() => {
      pagerRef.current?.scrollTo({ x: 0, y: 0, animated: false });
    });
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

  const pct =
    resolvedMaxScore > 0
      ? Math.round((resolvedScore / resolvedMaxScore) * 100)
      : 0;

  const rewards: GameAttemptRewardGrant[] = Array.isArray(outcome?.rewards)
    ? outcome!.rewards!
    : [];

  const overallAfter = Number(outcome?.overallScoreAfter || 0);
  const overallBefore = Number(
    outcome?.overallScoreBefore ?? outcome?.overallScoreAfter ?? 0,
  );
  const overallDelta = Number(
    outcome?.overallScoreDelta ?? overallAfter - overallBefore,
  );

  const progress = toScoreThresholdProgress(outcome, overallAfter);
  const contentMotion = useEntranceAnimation({
    delayMs: 50,
    fromY: 16,
    durationMs: 260,
  });
  const progressAnimated = useAnimatedProgress(progress.pct, 320);
  const progressWidth = progressAnimated.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  const performanceData = useMemo(() => {
    if (pct >= 90) {
      return {
        emoji: "🎉",
        message: "Outstanding performance!",
      };
    }
    if (pct >= 75) {
      return {
        emoji: "✨",
        message: "You are doing really well!",
      };
    }
    if (pct >= 50) {
      return {
        emoji: "👍",
        message: "Keep up the good work!",
      };
    }
    return {
      emoji: "💪",
      message: "You will get better with practice!",
    };
  }, [pct]);

  const styles = getStyles();

  const transitionToStep = useCallback(
    (nextStep: 0 | 1 | 2) => {
      if (nextStep === step) return;
      setStep(nextStep);
      pagerRef.current?.scrollTo({
        x: nextStep * pageWidth,
        y: 0,
        animated: true,
      });
    },
    [pageWidth, step],
  );

  const onPagerMomentumEnd = useCallback(
    (event: any) => {
      const x = Number(event?.nativeEvent?.contentOffset?.x || 0);
      const next = Math.max(0, Math.min(2, Math.round(x / pageWidth))) as
        | 0
        | 1
        | 2;
      if (next !== step) setStep(next);
    },
    [pageWidth, step],
  );

  useEffect(() => {
    if (!outcome?.ready) return;
    requestAnimationFrame(() => {
      pagerRef.current?.scrollTo({
        x: step * pageWidth,
        y: 0,
        animated: false,
      });
    });
  }, [outcome?.ready, pageWidth]);

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
              borderColor: colors.bg4,
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

      {loadingOutcome || !outcome?.ready ? (
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
          <Animated.View style={contentMotion}>
            {loadingOutcome ? (
              <View
                style={[
                  styles.infoCard,
                  {
                    backgroundColor: colors.bg2,
                    borderColor: colors.bg4,
                    minHeight: 120,
                    alignItems: "center",
                    justifyContent: "center",
                  },
                ]}
              >
                <ActivityIndicator size="small" color={googlePalette.blue} />
                <Text
                  style={[
                    styles.infoText,
                    {
                      color: colors.textPrimary,
                      marginTop: 8,
                      textAlign: "center",
                    },
                  ]}
                >
                  Updating score, ranking, and rewards...
                </Text>
              </View>
            ) : (
              <View style={styles.stepSection}>
                <View
                  style={[
                    styles.infoCard,
                    {
                      backgroundColor: colors.bg2,
                      borderColor: colors.bg4,
                    },
                  ]}
                >
                  <Iconify
                    icon="mingcute:information-line"
                    size={21}
                    color={googlePalette.blue}
                  />
                  <Text
                    style={[styles.infoText, { color: colors.textPrimary }]}
                  >
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
                      backgroundColor: googlePalette.blue,
                      opacity: pressed ? 0.9 : 1,
                    },
                  ]}
                >
                  <Iconify
                    icon="mingcute:refresh-2-line"
                    size={21}
                    color="#fff"
                  />
                  <Text style={styles.primaryBtnText}>Retry Update</Text>
                </Pressable>

                <Pressable
                  onPress={() => router.replace("/(main)/(tabs)/home")}
                  style={({ pressed }) => [
                    styles.secondaryBtn,
                    {
                      backgroundColor: googlePalette.red,
                      borderColor: googlePalette.red,
                      opacity: pressed ? 0.9 : 1,
                    },
                  ]}
                >
                  <Iconify icon="mingcute:home-2-line" size={21} color="#fff" />
                  <Text style={[styles.secondaryBtnText, { color: "#fff" }]}>
                    Back to Home
                  </Text>
                </Pressable>
              </View>
            )}
          </Animated.View>
        </ScrollView>
      ) : (
        <View
          style={{
            flex: 1,
            paddingHorizontal: 16,
            paddingTop: 24,
            paddingBottom: Math.max(insets.bottom + 92, 108),
          }}
        >
          <Animated.View style={[contentMotion, { flex: 1 }]}>
            <View style={styles.stepDotsRow}>
              {[0, 1, 2].map((idx) => (
                <View
                  key={idx}
                  style={[
                    styles.stepDot,
                    {
                      backgroundColor: step === idx ? colors.bg4 : colors.bg3,
                      borderColor: colors.bg4,
                    },
                  ]}
                />
              ))}
            </View>

            <ScrollView
              ref={pagerRef}
              horizontal
              pagingEnabled
              decelerationRate="fast"
              bounces={false}
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={onPagerMomentumEnd}
              style={styles.pager}
            >
              <View style={[styles.page, { width: pageWidth }]}>
                <ScrollView
                  style={styles.pageScroll}
                  contentContainerStyle={{
                    paddingTop: 4,
                    paddingBottom: Math.max(insets.bottom + 118, 140),
                    gap: 14,
                  }}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  <View
                    style={[
                      styles.pageMeta,
                      { backgroundColor: colors.bg2, borderColor: colors.bg4 },
                    ]}
                  >
                    <Text
                      style={[
                        styles.pageMetaLabel,
                        { color: colors.textSecondary },
                      ]}
                    >
                      STEP 1 OF 3
                    </Text>
                    <Text
                      style={[
                        styles.pageMetaTitle,
                        { color: colors.textPrimary },
                      ]}
                    >
                      Your Quiz Outcome
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.scoreCard,
                      {
                        backgroundColor: colors.bg2,
                        borderColor: colors.bg4,
                      },
                    ]}
                  >
                    <View style={styles.scoreContent}>
                      <Text
                        style={[
                          styles.cardEyebrow,
                          { color: colors.textSecondary },
                        ]}
                      >
                        This Attempt
                      </Text>
                      <View style={styles.quickStatRow}>
                        <View
                          style={[
                            styles.quickStatCard,
                            {
                              backgroundColor: colors.bg1,
                              borderColor: googlePalette.blue,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.quickStatLabel,
                              { color: colors.textSecondary },
                            ]}
                          >
                            Score:
                          </Text>
                          <Text
                            style={[
                              styles.quickStatValue,
                              { color: googlePalette.blue },
                            ]}
                          >
                            {resolvedScore}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.quickStatCard,
                            {
                              backgroundColor: colors.bg1,
                              borderColor: googlePalette.green,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.quickStatLabel,
                              { color: colors.textSecondary },
                            ]}
                          >
                            Total:
                          </Text>
                          <Text
                            style={[
                              styles.quickStatValue,
                              { color: googlePalette.green },
                            ]}
                          >
                            {resolvedMaxScore}
                          </Text>
                        </View>
                      </View>

                      <View
                        style={[
                          styles.cardDivider,
                          { backgroundColor: colors.bg4 },
                        ]}
                      />

                      <Text style={styles.emoji}>{performanceData.emoji}</Text>
                      <Text
                        style={[
                          styles.message,
                          { color: colors.textSecondary },
                        ]}
                      >
                        {performanceData.message}
                      </Text>
                      <View style={styles.pointsRow}>
                        <View
                          style={[
                            styles.quickStatCard,
                            {
                              backgroundColor: colors.bg1,
                              borderColor:
                                overallDelta >= 0
                                  ? googlePalette.green
                                  : googlePalette.red,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.quickStatLabel,
                              { color: colors.textSecondary },
                            ]}
                          >
                            Points:
                          </Text>
                          <Text
                            style={[
                              styles.quickStatValue,
                              {
                                color:
                                  overallDelta >= 0
                                    ? googlePalette.green
                                    : googlePalette.red,
                              },
                            ]}
                          >
                            {overallDelta >= 0 ? "+" : ""}
                            {Math.round(overallDelta)}
                          </Text>
                        </View>
                      </View>
                      <Text
                        style={[
                          styles.cardEyebrow,
                          { color: colors.textSecondary, marginTop: 8 },
                        ]}
                      >
                        Score Increase
                      </Text>
                      <View style={styles.progressHeadRow}>
                        <View
                          style={[
                            styles.progressPill,
                            {
                              backgroundColor: colors.bg1,
                              borderColor: googlePalette.blue,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.progressPillText,
                              { color: googlePalette.blue },
                            ]}
                          >
                            {Math.round(overallBefore)}
                          </Text>
                        </View>
                        <View style={styles.scoreFlowMid}>
                          <Iconify
                            icon="mingcute:arrow-right-line"
                            size={34}
                            color={colors.textSecondary}
                            style={styles.scoreFlowArrowIcon}
                          />
                        </View>
                        <View
                          style={[
                            styles.progressPill,
                            {
                              backgroundColor: colors.bg1,
                              borderColor: googlePalette.green,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.progressPillText,
                              { color: googlePalette.green },
                            ]}
                          >
                            {Math.round(overallAfter)}
                          </Text>
                        </View>
                      </View>

                      <Text
                        style={[
                          styles.infoLabel,
                          {
                            color: colors.textSecondary,
                            fontSize: 17,
                            lineHeight: 22,
                            textAlign: "center",
                            marginTop: 6,
                          },
                        ]}
                      >
                        {Math.ceil(progress.pointsRemaining)} points to next item
                      </Text>
                      <View
                        style={[
                          styles.progressTrack,
                          {
                            backgroundColor: colors.bg3,
                            borderColor: colors.bg4,
                            marginTop: 1,
                          },
                        ]}
                      >
                        <Animated.View
                          style={[
                            styles.progressFill,
                            {
                              width: progressWidth,
                              backgroundColor: googlePalette.blue,
                            },
                          ]}
                        />
                      </View>

                      <View
                        style={[
                          styles.rankCard,
                          {
                            backgroundColor: colors.bg1,
                            borderColor: colors.bg4,
                            marginTop: 12,
                            marginBottom: 0,
                          },
                        ]}
                      >
                        <Iconify
                          icon="mingcute:chart-bar-line"
                          size={16}
                          color={googlePalette.blue}
                        />
                        <Text
                          style={[
                            styles.rankCardText,
                            { color: colors.textPrimary },
                          ]}
                        >
                          {rankChangeText(outcome)}
                        </Text>
                      </View>
                    </View>
                  </View>

                </ScrollView>
              </View>

              <View style={[styles.page, { width: pageWidth }]}>
                <ScrollView
                  style={styles.pageScroll}
                  contentContainerStyle={{
                    paddingTop: 4,
                    paddingBottom: Math.max(insets.bottom + 118, 140),
                    gap: 14,
                  }}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  <View
                    style={[
                      styles.pageMeta,
                      { backgroundColor: colors.bg2, borderColor: colors.bg4 },
                    ]}
                  >
                    <Text
                      style={[
                        styles.pageMetaLabel,
                        { color: colors.textSecondary },
                      ]}
                    >
                      STEP 2 OF 3
                    </Text>
                    <Text
                      style={[
                        styles.pageMetaTitle,
                        { color: colors.textPrimary },
                      ]}
                    >
                      Rewards Unlocked
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.rewardCard,
                      {
                        backgroundColor: colors.bg2,
                        borderColor: colors.bg4,
                      },
                    ]}
                  >
                    {rewards.length ? (
                      rewards.map((grant, idx) => {
                        const previewUri =
                          grant.rewardType === "cosmetic"
                            ? getCosmeticPreviewUrl(classId, grant.reward.id) ||
                              grant.reward.assetUrl ||
                              null
                            : grant.reward.imageUrl ||
                              grant.reward.assetUrl ||
                              null;
                        const accent =
                          grant.rewardType === "badge"
                            ? googlePalette.yellow
                            : googlePalette.green;

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
                                borderColor: accent,
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
                              <Text
                                style={[
                                  styles.rewardName,
                                  { color: colors.textPrimary },
                                ]}
                              >
                                {grant.reward.name}
                              </Text>
                              <Text
                                style={[
                                  styles.rewardMeta,
                                  { color: colors.textSecondary },
                                ]}
                              >
                                {grant.rewardType === "badge"
                                  ? "Badge"
                                  : "Cosmetic"}
                                {grant.thresholdPoints
                                  ? ` • Reached ${Math.floor(grant.thresholdPoints)} points`
                                  : ""}
                              </Text>
                            </View>
                            <Iconify
                              icon="mingcute:right-line"
                              size={16}
                              color={accent}
                            />
                          </Pressable>
                        );
                      })
                    ) : (
                      <Text
                        style={[
                          styles.rewardLine,
                          { color: colors.textSecondary },
                        ]}
                      >
                        No new rewards this time. Keep going!
                      </Text>
                    )}
                  </View>

                </ScrollView>
              </View>

              <View style={[styles.page, { width: pageWidth }]}>
                <ScrollView
                  style={styles.pageScroll}
                  contentContainerStyle={{
                    paddingTop: 4,
                    paddingBottom: Math.max(insets.bottom + 118, 140),
                    gap: 14,
                  }}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  <View
                    style={[
                      styles.pageMeta,
                      { backgroundColor: colors.bg2, borderColor: colors.bg4 },
                    ]}
                  >
                    <Text
                      style={[
                        styles.pageMetaLabel,
                        { color: colors.textSecondary },
                      ]}
                    >
                      STEP 3 OF 3
                    </Text>
                    <Text
                      style={[
                        styles.pageMetaTitle,
                        { color: colors.textPrimary },
                      ]}
                    >
                      Final Summary
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.scoreCard,
                      {
                        backgroundColor: colors.bg2,
                        borderColor: colors.bg4,
                        minHeight: 0,
                      },
                    ]}
                  >
                    <View style={styles.summaryContent}>
                      <View style={styles.summaryRow}>
                        <Text
                          style={[
                            styles.summaryLabel,
                            { color: colors.textSecondary },
                          ]}
                        >
                          Quiz Points
                        </Text>
                        <Text
                          style={[
                            styles.summaryValue,
                            { color: colors.textPrimary },
                          ]}
                        >
                          {resolvedScore}
                        </Text>
                      </View>

                      <View style={styles.summaryRow}>
                        <Text
                          style={[
                            styles.summaryLabel,
                            { color: colors.textSecondary },
                          ]}
                        >
                          Quiz Score
                        </Text>
                        <Text
                          style={[
                            styles.summaryValue,
                            { color: colors.textPrimary },
                          ]}
                        >
                          {resolvedScore} / {resolvedMaxScore} ({pct}%)
                        </Text>
                      </View>

                      <View style={styles.summaryRow}>
                        <Text
                          style={[
                            styles.summaryLabel,
                            { color: colors.textSecondary },
                          ]}
                        >
                          Overall Score
                        </Text>
                        <Text
                          style={[
                            styles.summaryValue,
                            { color: colors.textPrimary },
                          ]}
                        >
                          {Math.round(overallAfter)}
                        </Text>
                      </View>

                      <View style={styles.summaryRow}>
                        <Text
                          style={[
                            styles.summaryLabel,
                            { color: colors.textSecondary },
                          ]}
                        >
                          Current Rank
                        </Text>
                        <Text
                          style={[
                            styles.summaryValue,
                            { color: colors.textPrimary },
                          ]}
                        >
                          {typeof outcome?.rankAfter === "number"
                            ? `#${outcome.rankAfter}`
                            : "-"}
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
                          backgroundColor: googlePalette.green,
                          opacity: pressed ? 0.9 : 1,
                        },
                      ]}
                    >
                      <Iconify
                        icon="mingcute:search-2-line"
                        size={21}
                        color="#fff"
                      />
                      <Text style={styles.primaryBtnText}>Review Answers</Text>
                    </Pressable>
                  ) : (
                    <View
                      style={[
                        styles.infoCard,
                        {
                          backgroundColor: colors.bg2,
                          borderColor: colors.error,
                        },
                      ]}
                    >
                      <Iconify
                        icon="mingcute:information-line"
                        size={21}
                        color={colors.error}
                      />
                      <Text
                        style={[styles.infoText, { color: colors.textPrimary }]}
                      >
                        Answers will be available after the deadline
                      </Text>
                    </View>
                  )}

                  <Pressable
                    onPress={() => router.replace("/(main)/(tabs)/home")}
                    style={({ pressed }) => [
                      styles.secondaryBtn,
                      {
                        backgroundColor: googlePalette.red,
                        borderColor: googlePalette.red,
                        opacity: pressed ? 0.9 : 1,
                      },
                    ]}
                  >
                    <Iconify
                      icon="mingcute:home-2-line"
                      size={21}
                      color="#fff"
                    />
                    <Text style={[styles.secondaryBtnText, { color: "#fff" }]}>
                      Back to Home
                    </Text>
                  </Pressable>
                </ScrollView>
              </View>
            </ScrollView>
          </Animated.View>

          <View
            style={[
              styles.fixedNavRow,
              { bottom: Math.max(insets.bottom + 12, 18) },
            ]}
          >
            <Pressable
              disabled={step === 0}
              onPress={() => transitionToStep((step - 1) as 0 | 1 | 2)}
              style={({ pressed }) => [
                styles.fixedNavBtn,
                {
                  backgroundColor: step === 0 ? colors.bg3 : googlePalette.red,
                  borderColor: step === 0 ? colors.bg4 : googlePalette.red,
                  opacity: step === 0 ? 0.5 : pressed ? 0.9 : 1,
                },
              ]}
            >
              <Iconify
                icon="mingcute:arrow-left-line"
                size={20}
                color={step === 0 ? colors.textSecondary : "#fff"}
              />
              <Text
                style={[
                  styles.fixedNavBtnText,
                  { color: step === 0 ? colors.textSecondary : "#fff" },
                ]}
              >
                Back
              </Text>
            </Pressable>

            <Pressable
              disabled={step === 2}
              onPress={() => transitionToStep((step + 1) as 0 | 1 | 2)}
              style={({ pressed }) => [
                styles.fixedNavBtn,
                {
                  backgroundColor: step === 2 ? colors.bg3 : googlePalette.green,
                  borderColor: step === 2 ? colors.bg4 : googlePalette.green,
                  opacity: step === 2 ? 0.5 : pressed ? 0.9 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.fixedNavBtnText,
                  { color: step === 2 ? colors.textSecondary : "#fff" },
                ]}
              >
                Continue
              </Text>
              <Iconify
                icon="mingcute:arrow-right-line"
                size={20}
                color={step === 2 ? colors.textSecondary : "#fff"}
              />
            </Pressable>
          </View>
        </View>
      )}
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
      borderRadius: 8,
      borderWidth: 1,
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
      width: 18,
      height: 6,
      borderRadius: 3,
      borderWidth: 1,
    },

    scoreCard: {
      borderRadius: 12,
      borderWidth: 1,
      overflow: "hidden",
      minHeight: 0,
    },
    scoreContent: {
      padding: 22,
      alignItems: "center",
      gap: 14,
    },
    pageMeta: {
      borderRadius: 9,
      borderWidth: 1,
      paddingVertical: 10,
      paddingHorizontal: 12,
      gap: 2,
    },
    pageMetaLabel: {
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0.9,
    },
    pageMetaTitle: {
      fontSize: 18,
      fontWeight: "900",
      lineHeight: 22,
    },
    cardEyebrow: {
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 0.4,
    },
    cardDivider: {
      height: 1,
      width: "100%",
      borderRadius: 1,
      opacity: 0.7,
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
      marginTop: 2,
    },
    performanceTitle: {
      fontSize: 26,
      fontWeight: "900",
      marginTop: 8,
    },
    message: {
      fontSize: 17,
      fontWeight: "700",
      textAlign: "center",
      marginTop: 0,
    },
    quickStatRow: {
      width: "100%",
      flexDirection: "row",
      gap: 12,
    },
    pointsRow: {
      width: "100%",
      marginTop: 10,
    },
    quickStatCard: {
      flex: 1,
      borderWidth: 1,
      borderRadius: 10,
      paddingVertical: 12,
      paddingHorizontal: 14,
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
    },
    quickStatLabel: {
      fontSize: 12,
      fontWeight: "700",
    },
    quickStatValue: {
      fontSize: 29,
      fontWeight: "900",
      lineHeight: 32,
    },

    primaryBtn: {
      height: 46,
      borderRadius: 9,
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
      height: 46,
      borderRadius: 9,
      borderWidth: 1,
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
      borderRadius: 9,
      borderWidth: 1,
      padding: 18,
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
    },
    rankCard: {
      borderRadius: 8,
      borderWidth: 1,
      minHeight: 40,
      paddingHorizontal: 10,
      paddingVertical: 8,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      marginBottom: 6,
    },
    rankCardText: {
      fontSize: 13,
      fontWeight: "700",
      textAlign: "center",
      flex: 1,
      lineHeight: 18,
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
    infoSub: {
      fontSize: 14,
      fontWeight: "700",
    },

    progressTrack: {
      width: "100%",
      height: 12,
      borderRadius: 7,
      overflow: "hidden",
      borderWidth: 1,
    },
    progressFill: {
      height: "100%",
      borderRadius: 7,
    },
    progressHeadRow: {
      marginTop: 8,
      width: "100%",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      paddingHorizontal: 4,
    },
    scoreFlowMid: {
      width: 48,
      alignItems: "center",
      justifyContent: "center",
    },
    scoreFlowArrowIcon: {
      marginTop: 1,
    },
    progressPill: {
      flex: 1,
      minWidth: 0,
      height: 56,
      borderRadius: 12,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 14,
    },
    progressPillText: {
      fontSize: 27,
      fontWeight: "900",
      lineHeight: 30,
    },

    rewardCard: {
      borderRadius: 10,
      borderWidth: 1,
      padding: 16,
      gap: 8,
    },
    rewardTitle: {
      fontSize: 20,
      fontWeight: "900",
      marginBottom: 2,
    },
    rewardHint: {
      fontSize: 13,
      fontWeight: "700",
      marginBottom: 6,
    },
    rewardLine: {
      fontSize: 15,
      fontWeight: "700",
    },
    rewardRow: {
      borderWidth: 1,
      borderRadius: 8,
      padding: 10,
      gap: 10,
      flexDirection: "row",
      alignItems: "center",
    },
    rewardImageFrame: {
      width: 44,
      height: 44,
      borderRadius: 7,
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

    fixedNavRow: {
      position: "absolute",
      left: 16,
      right: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    fixedNavBtn: {
      flex: 1,
      height: 50,
      borderRadius: 10,
      borderWidth: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingHorizontal: 14,
    },
    fixedNavBtnText: {
      fontSize: 15,
      fontWeight: "900",
    },
    pager: {
      flex: 1,
      marginTop: 10,
    },
    page: {
      flex: 1,
    },
    pageScroll: {
      flex: 1,
    },
    stepSection: {
      gap: 14,
      marginTop: 2,
    },
  });
}
