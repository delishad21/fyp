import {
  getAttemptables,
  getMyProfile,
  type AttemptableRow,
  type ProfileData,
} from "@/src/api/class-service";
import {
  getClassStudentGameProfile,
  getStudentNotifications,
  type GameStudentProfile,
} from "@/src/api/game-service";
import { useSession } from "@/src/auth/session";
import { useTheme } from "@/src/theme";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Iconify } from "react-native-iconify";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAnimatedProgress } from "@/src/hooks/useAnimatedProgress";
import { useEntranceAnimation } from "@/src/hooks/useEntranceAnimation";
import { hexToRgba } from "@/src/lib/color-utils";
import { googlePalette } from "@/src/theme/google-palette";
import { QuizCard } from "../quiz-components/QuizCard";
import AvatarOrInitials from "../ui/AvatarOrInitials";

export default function HomeScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const token = useSession((s) => s.token());
  const account = useSession((s) => s.account);

  const [attemptables, setAttemptables] = useState<AttemptableRow[] | null>(
    null
  );
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [gameProfile, setGameProfile] = useState<GameStudentProfile | null>(
    null
  );
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // pull-to-refresh state
  const [refreshing, setRefreshing] = useState(false);

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
      const [a, p] = await Promise.all([
        getAttemptables(token),
        getMyProfile(token),
      ]);
      let g: GameStudentProfile | null = null;
      let unreadCount = 0;
      if (p?.stats?.classId && p?.userId) {
        const [gameResult, inboxResult] = await Promise.allSettled([
          getClassStudentGameProfile(token, p.stats.classId, p.userId),
          getStudentNotifications(token, p.stats.classId, p.userId, {
            unreadOnly: true,
            limit: 1,
          }),
        ]);

        if (gameResult.status === "fulfilled") {
          g = gameResult.value;
        } else {
          console.warn("[home] game profile load failed", gameResult.reason);
        }

        if (inboxResult.status === "fulfilled") {
          unreadCount = Number(inboxResult.value.unreadCount || 0);
        } else {
          console.warn("[home] notifications load failed", inboxResult.reason);
        }
      }
      setAttemptables(a);
      setProfile(p);
      setGameProfile(g);
      setNotificationUnreadCount(unreadCount);
    } catch (e: any) {
      setError(e?.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {};
    }, [load])
  );

  // Pull-to-refresh handler (uses same loader)
  const onRefresh = useCallback(async () => {
    if (!token) {
      setError("Session expired. Please sign in again.");
      void useSession.getState().logout();
      return;
    }
    setRefreshing(true);
    try {
      const [a, p] = await Promise.all([
        getAttemptables(token),
        getMyProfile(token),
      ]);
      let g: GameStudentProfile | null = null;
      let unreadCount = 0;
      if (p?.stats?.classId && p?.userId) {
        const [gameResult, inboxResult] = await Promise.allSettled([
          getClassStudentGameProfile(token, p.stats.classId, p.userId),
          getStudentNotifications(token, p.stats.classId, p.userId, {
            unreadOnly: true,
            limit: 1,
          }),
        ]);

        if (gameResult.status === "fulfilled") {
          g = gameResult.value;
        } else {
          console.warn("[home] game profile refresh failed", gameResult.reason);
        }

        if (inboxResult.status === "fulfilled") {
          unreadCount = Number(inboxResult.value.unreadCount || 0);
        } else {
          console.warn("[home] notifications refresh failed", inboxResult.reason);
        }
      }
      setAttemptables(a);
      setProfile(p);
      setGameProfile(g);
      setNotificationUnreadCount(unreadCount);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Failed to refresh");
    } finally {
      setRefreshing(false);
    }
  }, [token]);

  const displayName = profile?.displayName || account?.name || "Student";
  const overallScore = Math.max(0, Number(gameProfile?.overallScore || 0));
  const pointsPerReward = Math.max(
    1,
    Number(gameProfile?.scoreThresholdProgress?.pointsPerReward || 500)
  );
  const configuredNextThreshold = Number(
    gameProfile?.scoreThresholdProgress?.nextThresholdPoints || 0
  );
  const computedNextThreshold =
    (Math.floor(overallScore / pointsPerReward) + 1) * pointsPerReward;
  const nextThresholdPoints =
    Number.isFinite(configuredNextThreshold) && configuredNextThreshold > 0
      ? configuredNextThreshold
      : computedNextThreshold;
  const previousThresholdPoints = Math.max(
    0,
    nextThresholdPoints - pointsPerReward
  );
  const pointsRemaining = Math.max(0, nextThresholdPoints - overallScore);
  const pointsInCurrentBand = Math.max(
    0,
    Math.min(pointsPerReward, overallScore - previousThresholdPoints)
  );
  const nextItemPct = pointsPerReward > 0 ? pointsInCurrentBand / pointsPerReward : 0;
  const topMotion = useEntranceAnimation({ fromY: 14, durationMs: 250 });
  const bottomMotion = useEntranceAnimation({
    delayMs: 70,
    fromY: 18,
    durationMs: 280,
  });
  const animatedProgress = useAnimatedProgress(nextItemPct, 320);
  const progressWidth = animatedProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  const styles = getStyles(colors);
  const accent = {
    blue: googlePalette.blue,
    red: googlePalette.red,
    yellow: googlePalette.yellow,
    green: googlePalette.green,
  } as const;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg1,
      }}
    >

      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 24,
        }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
            progressBackgroundColor={colors.bg2}
          />
        }
      >
        {/* TOP content */}
        <Animated.View style={[styles.topArea, topMotion]}>
          <View style={styles.headerRow}>
            <View style={{ flexShrink: 1, paddingRight: 12 }}>
              <Text
                numberOfLines={1}
                style={[styles.hi, { color: accent.blue }]}
              >
                Hi, {displayName.split(" ")[0]}
              </Text>
              <Text
                numberOfLines={1}
                style={[styles.subHi, { color: colors.textSecondary }]}
              >
                Ready for today's practice?
              </Text>
            </View>

            <View style={styles.headerActions}>
              <Pressable
                onPress={() => router.push("/(main)/notifications")}
                style={({ pressed }) => [
                  styles.notificationBtn,
                  {
                    backgroundColor: accent.blue,
                    borderColor: accent.blue,
                    opacity: pressed ? 0.88 : 1,
                  },
                ]}
              >
                <Iconify icon="tabler:bell" size={20} color="#FFFFFF" />
                {notificationUnreadCount > 0 ? (
                  <View
                    style={[
                      styles.notificationBadge,
                      {
                        backgroundColor: accent.red,
                      },
                    ]}
                  >
                    <Text style={styles.notificationBadgeText}>
                      {notificationUnreadCount > 99 ? "99+" : String(notificationUnreadCount)}
                    </Text>
                  </View>
                ) : null}
              </Pressable>

              <Pressable
                onPress={() => router.push("/(main)/(tabs)/profile")}
                style={({ pressed }) => [
                  styles.profileBtn,
                  { opacity: pressed ? 0.88 : 1 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Open profile"
              >
                <AvatarOrInitials
                  uri={
                    gameProfile?.avatarProfileUrl ||
                    gameProfile?.avatarUrl ||
                    profile?.photoUrl
                  }
                  name={displayName}
                  size={52}
                  bgFallback={hexToRgba(accent.blue, 0.16)}
                  borderWidth={2}
                  borderColor={accent.blue}
                />
              </Pressable>
            </View>
          </View>

          {/* Progress Card */}
          <View
            style={[
              styles.streakCard,
              {
                backgroundColor: accent.blue,
                borderColor: accent.blue,
              },
            ]}
          >
            <Text style={[styles.streakTitle, { color: "#FFFFFF" }]}>
              🎁 Progress to Next Item
            </Text>
            <Text
              style={[styles.streakSubtitle, { color: "#FFFFFFE6" }]}
            >
              {Math.floor(overallScore)} / {Math.floor(nextThresholdPoints)}{" "}
              points • {Math.ceil(pointsRemaining)} to go
            </Text>

            <View
              style={[
                styles.progressTrack,
                { backgroundColor: "rgba(255,255,255,0.3)" },
              ]}
            >
              <Animated.View
                style={[
                  styles.progressFill,
                  {
                    width: progressWidth,
                    backgroundColor: googlePalette.yellow,
                  },
                ]}
              />
            </View>
          </View>
        </Animated.View>

        {/* BOTTOM content */}
        <Animated.View style={[styles.bottomArea, bottomMotion]}>
          <Text style={[styles.sectionTitle, { color: googlePalette.blue }]}>
            Today's Quizzes
          </Text>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : error ? (
            <View style={styles.center}>
              <Text style={[styles.messageText, { color: colors.error }]}>
                {error}
              </Text>
            </View>
          ) : (
            <FlatList
              data={attemptables || []}
              keyExtractor={(item) => item.scheduleId}
              scrollEnabled={false}
              removeClippedSubviews
              initialNumToRender={8}
              maxToRenderPerBatch={8}
              windowSize={5}
              contentContainerStyle={{
                paddingBottom: 0,
                paddingHorizontal: 16,
              }}
              renderItem={({ item }) => (
                <QuizCard
                  title={item.quizName || "Untitled"}
                  subject={item.subject || "Quiz"}
                  colorHex={item.subjectColor || colors.primary}
                  endDateISO={item.endDate}
                  onPress={() => {
                    router.navigate({
                      pathname: "/(main)/quiz/[quizId]/start",
                      params: {
                        quizId: item.quizId,
                        scheduleId: item.scheduleId,
                        classId: item.classId,
                        subject: item.subject ?? "",
                        subjectColorHex: item.subjectColor ?? "",
                        quizName: item.quizName ?? "",
                      },
                    });
                  }}
                />
              )}
              ListEmptyComponent={
                <View style={styles.emptyWrap}>
                  <Text
                    style={[styles.emptyTitle, { color: colors.textPrimary }]}
                  >
                    Nothing scheduled right now
                  </Text>
                  <Text
                    style={[
                      styles.emptySubtitle,
                      { color: colors.textSecondary },
                    ]}
                  >
                    Check back later, or ask your teacher to assign a quiz.
                  </Text>
                </View>
              }
            />
          )}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    topArea: {
      paddingHorizontal: 16,
      paddingBottom: 12,
    },
    bottomArea: {
      paddingTop: 12,
      backgroundColor: "transparent",
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12,
    },
    headerActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    profileBtn: {
      borderRadius: 26,
    },
    notificationBtn: {
      width: 40,
      height: 40,
      borderRadius: 9,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
    },
    notificationBadge: {
      position: "absolute",
      top: -4,
      right: -6,
      minWidth: 16,
      height: 16,
      borderRadius: 6,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 3,
    },
    notificationBadgeText: {
      color: "#fff",
      fontSize: 9,
      fontWeight: "900",
    },

    hi: { fontSize: 32, fontWeight: "900" },
    subHi: { fontSize: 17, fontWeight: "700", marginTop: 2 },

    streakCard: {
      borderRadius: 12,
      padding: 18,
      marginBottom: 4,
      borderWidth: 1,

      // subtle shadow
    },

    streakTitle: { fontSize: 22, fontWeight: "900", marginBottom: 4 },
    streakSubtitle: { fontSize: 16, marginBottom: 12, fontWeight: "700" },

    progressTrack: { height: 12, borderRadius: 6, overflow: "hidden" },
    progressFill: { height: "100%", borderRadius: 6 },

    sectionTitle: {
      fontSize: 30,
      fontWeight: "900",
      marginBottom: 10,
      paddingHorizontal: 16,
    },

    center: { alignItems: "center", justifyContent: "center", minHeight: 140 },
    messageText: { fontSize: 15, fontWeight: "700" },

    emptyWrap: {
      borderRadius: 12,
      padding: 18,
      backgroundColor: googlePalette.yellow,
      borderWidth: 2,
      borderColor: googlePalette.yellow,
    },
    emptyTitle: { fontSize: 20, fontWeight: "900", marginBottom: 6 },
    emptySubtitle: { fontSize: 16, fontWeight: "700", lineHeight: 22 },
  });
