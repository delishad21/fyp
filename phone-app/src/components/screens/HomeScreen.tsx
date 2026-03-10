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
  Dimensions,
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
import { QuizCard } from "../quiz-components/QuizCard";
import AvatarOrInitials from "../ui/AvatarOrInitials";
import TwoToneSplitBackground from "../ui/TwoToneSplitBackground";

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

  // Two-tone background split control
  const [splitY, setSplitY] = useState<number | null>(null);
  const defaultSplit = Math.round(Dimensions.get("window").height * 0.5);

  const load = useCallback(async () => {
    if (!token) return;
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
    if (!token) return;
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

  const styles = getStyles(colors);

  return (
    <View style={{ flex: 1 }}>
      <TwoToneSplitBackground
        topHeight={splitY ?? defaultSplit}
        topColor={colors.bg1}
        bottomColor={colors.bg3}
      />

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
        <View style={styles.topArea}>
          <View style={styles.headerRow}>
            <View style={{ flexShrink: 1, paddingRight: 12 }}>
              <Text
                numberOfLines={1}
                style={[styles.hi, { color: colors.textPrimary }]}
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
                    backgroundColor: colors.bg2,
                    borderColor: colors.bg4,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Iconify icon="tabler:bell" size={20} color={colors.icon} />
                {notificationUnreadCount > 0 ? (
                  <View
                    style={[
                      styles.notificationBadge,
                      {
                        backgroundColor: colors.primary,
                      },
                    ]}
                  >
                    <Text style={styles.notificationBadgeText}>
                      {notificationUnreadCount > 99 ? "99+" : String(notificationUnreadCount)}
                    </Text>
                  </View>
                ) : null}
              </Pressable>

              <AvatarOrInitials
                uri={
                  gameProfile?.avatarProfileUrl ||
                  gameProfile?.avatarUrl ||
                  profile?.photoUrl
                }
                name={displayName}
                size={44}
                bgFallback={colors.bg3}
                borderWidth={StyleSheet.hairlineWidth}
                borderColor={colors.bg4}
              />
            </View>
          </View>

          {/* Progress Card */}
          <View
            style={[
              styles.streakCard,
              {
                backgroundColor: colors.bg2,
                borderColor: colors.bg4,
                shadowColor: "#000",
              },
            ]}
            onLayout={(e) => {
              const { y, height } = e.nativeEvent.layout;
              setSplitY(Math.max(0, Math.round(insets.top + y + height / 2)));
            }}
          >
            <Text style={[styles.streakTitle, { color: colors.textPrimary }]}>
              🎁 Progress to Next Item
            </Text>
            <Text
              style={[styles.streakSubtitle, { color: colors.textSecondary }]}
            >
              {Math.floor(overallScore)} / {Math.floor(nextThresholdPoints)}{" "}
              points • {Math.ceil(pointsRemaining)} to go
            </Text>

            <View
              style={[styles.progressTrack, { backgroundColor: colors.bg3 }]}
            >
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${nextItemPct * 100}%`,
                    backgroundColor: colors.primary,
                  },
                ]}
              />
            </View>
          </View>
        </View>

        {/* BOTTOM content */}
        <View style={styles.bottomArea}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
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
        </View>
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
    notificationBtn: {
      width: 36,
      height: 36,
      borderRadius: 5,
      borderWidth: StyleSheet.hairlineWidth,
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
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 3,
    },
    notificationBadgeText: {
      color: "#fff",
      fontSize: 9,
      fontWeight: "900",
    },

    hi: { fontSize: 28, fontWeight: "900" },
    subHi: { fontSize: 18, fontWeight: "700", marginTop: 2 },

    streakCard: {
      borderRadius: 5,
      padding: 16,
      marginBottom: 4,
      borderWidth: StyleSheet.hairlineWidth,

      // subtle shadow
      shadowOpacity: 0.08,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 6 },
      elevation: 2,
    },

    streakTitle: { fontSize: 21, fontWeight: "900", marginBottom: 4 },
    streakSubtitle: { fontSize: 18, marginBottom: 12, fontWeight: "700" },

    progressTrack: { height: 10, borderRadius: 10, overflow: "hidden" },
    progressFill: { height: "100%", borderRadius: 10 },

    sectionTitle: {
      fontSize: 29,
      fontWeight: "900",
      marginBottom: 10,
      paddingHorizontal: 16,
    },

    center: { alignItems: "center", justifyContent: "center", minHeight: 140 },
    messageText: { fontSize: 15, fontWeight: "700" },

    emptyWrap: {
      borderRadius: 5,
      padding: 16,
      backgroundColor: colors.bg2,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.bg4,
    },
    emptyTitle: { fontSize: 21, fontWeight: "900", marginBottom: 6 },
    emptySubtitle: { fontSize: 18, fontWeight: "700", lineHeight: 21 },
  });
