import { getMyProfile, type ProfileData } from "@/src/api/class-service";
import {
  getClassLeaderboard,
  type GameLeaderboardRow,
} from "@/src/api/game-service";
import { useSession } from "@/src/auth/session";
import { useEntranceAnimation } from "@/src/hooks/useEntranceAnimation";
import { googlePalette } from "@/src/theme/google-palette";
import { useTheme } from "@/src/theme";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Iconify } from "react-native-iconify";
import { SvgUri } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AvatarOrInitials from "../ui/AvatarOrInitials";

function isSvgUrl(url?: string | null) {
  const value = String(url || "");
  return value.startsWith("data:image/svg+xml") || /\.svg(?:\?|$)/i.test(value);
}

function PodiumAvatar({
  uri,
  name,
  size,
}: {
  uri?: string | null;
  name: string;
  size: number;
}) {
  const [failed, setFailed] = useState(false);
  const safeUri = String(uri || "");

  if (!safeUri || failed) {
    return (
      <AvatarOrInitials
        uri={null}
        name={name}
        size={Math.max(56, Math.round(size * 0.62))}
        bgFallback="#FFFFFF33"
        borderWidth={1}
        borderColor="#FFFFFF88"
      />
    );
  }

  if (isSvgUrl(safeUri)) {
    return (
      <SvgUri uri={safeUri} width={size} height={size} onError={() => setFailed(true)} />
    );
  }

  return (
    <Image
      source={{ uri: safeUri }}
      style={{ width: size, height: size }}
      resizeMode="contain"
      onError={() => setFailed(true)}
    />
  );
}

export default function LeaderboardScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const token = useSession((s) => s.token());
  const account = useSession((s) => s.account);

  const [rows, setRows] = useState<GameLeaderboardRow[]>([]);
  const [period, setPeriod] = useState<"overall" | "week" | "month">("overall");
  const [meProfile, setMeProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const myUserId = meProfile?.userId || account?.id || null;
  const classId = meProfile?.stats?.classId || null;
  const sortedRows = [...rows].sort(
    (a, b) => {
      const rankDiff = Number(a.rank || 0) - Number(b.rank || 0);
      if (rankDiff !== 0) return rankDiff;
      const scoreDiff = Number(b.overallScore || 0) - Number(a.overallScore || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return String(a.userId).localeCompare(String(b.userId));
    }
  );
  const podiumRows = sortedRows.slice(0, 3);
  const podiumLayout = [
    { placement: 2 as const, row: podiumRows[1] ?? null },
    { placement: 1 as const, row: podiumRows[0] ?? null },
    { placement: 3 as const, row: podiumRows[2] ?? null },
  ].filter((entry): entry is { placement: 1 | 2 | 3; row: GameLeaderboardRow } =>
    Boolean(entry.row)
  );
  const podiumUserIds = new Set(podiumRows.map((row) => String(row.userId)));
  const listRows = sortedRows.filter((row) => !podiumUserIds.has(String(row.userId)));
  const tabAccent = {
    overall: googlePalette.red,
    week: googlePalette.green,
    month: googlePalette.blue,
  } as const;
  const contentMotion = useEntranceAnimation({
    delayMs: 40,
    fromY: 16,
    durationMs: 280,
  });

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
      const me = await getMyProfile(token);
      setMeProfile(me);

      const resolvedClassId = me?.stats?.classId;
      if (!resolvedClassId) {
        setRows([]);
        return;
      }

      const leaderboard = await getClassLeaderboard(token, resolvedClassId, period);
      setRows(leaderboard);
    } catch (e: any) {
      setError(e?.message || "Failed to load leaderboard");
    } finally {
      setLoading(false);
    }
  }, [token, period]);

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {};
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    if (!token) {
      setError("Session expired. Please sign in again.");
      void useSession.getState().logout();
      return;
    }
    setRefreshing(true);
    try {
      const me = await getMyProfile(token);
      setMeProfile(me);
      const resolvedClassId = me?.stats?.classId;
      if (!resolvedClassId) {
        setRows([]);
        return;
      }
      const leaderboard = await getClassLeaderboard(token, resolvedClassId, period);
      setRows(leaderboard);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Failed to refresh leaderboard");
    } finally {
      setRefreshing(false);
    }
  }, [token, period]);

  const openStudent = useCallback(
    (row: GameLeaderboardRow) => {
      if (!classId) return;
      router.push({
        pathname: "/(main)/students/[studentId]",
        params: {
          studentId: row.userId,
          classId,
          displayName: row.displayName || row.userId,
          photoUrl: row.photoUrl || "",
        },
      });
    },
    [classId]
  );

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.bg1,
          paddingTop: insets.top + 16,
          paddingBottom: 0,
        },
      ]}
    >
      {/* Title */}
      <Text style={[styles.title, { color: googlePalette.red }]}>
        Leaderboard
      </Text>

      {/* Subtitle */}
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        See how you stack up against your classmates
      </Text>

      <Animated.View
        style={styles.tabWrap}
      >
        {[
          { id: "overall", label: "Overall" },
          { id: "week", label: "Weekly" },
          { id: "month", label: "Monthly" },
        ].map((tab) => {
          const active = period === tab.id;
          return (
            <Pressable
              key={tab.id}
              onPress={() => setPeriod(tab.id as typeof period)}
              style={({ pressed }) => [
                styles.tabBtn,
                {
                  backgroundColor: active ? tabAccent[tab.id as "overall" | "week" | "month"] : colors.bg1,
                  borderColor: active
                    ? tabAccent[tab.id as "overall" | "week" | "month"]
                    : colors.bg4,
                  opacity: pressed ? 0.9 : 1,
                },
              ]}
            >
              <Text
                style={{
                  color: active ? "#fff" : colors.textPrimary,
                  fontSize: 13,
                  fontWeight: "800",
                }}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </Animated.View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.bg2,
              borderColor: "#FFFFFF88",
            },
          ]}
        >
          <Text style={[styles.errorTitle, { color: colors.error }]}>
            Failed to load leaderboard
          </Text>
          <Text style={[styles.errorBody, { color: colors.textSecondary }]}>
            {error}
          </Text>
        </View>
      ) : (
        <Animated.View style={[styles.listWrap, contentMotion]}>
          {podiumRows.length ? (
            <View style={styles.podiumWrap}>
              {podiumLayout.map(({ placement, row }) => {
                  const isMe = !!myUserId && String(row.userId) === String(myUserId);
                  const rank = Number(row.rank || 0);
                  const podiumColor =
                    placement === 1
                      ? googlePalette.gold
                      : placement === 2
                      ? googlePalette.silver
                      : googlePalette.bronze;
                  const blockHeight =
                    placement === 1 ? 148 : placement === 2 ? 120 : 104;
                  const avatarSize = placement === 1 ? 130 : 112;
                  return (
                    <Pressable
                      key={`podium-${placement}-${row.userId}`}
                      onPress={() => openStudent(row)}
                      style={({ pressed }) => [
                        styles.podiumColumn,
                        {
                          opacity: pressed ? 0.94 : 1,
                        },
                      ]}
                    >
                      <View style={styles.podiumAvatarWrap}>
                        <PodiumAvatar
                          uri={row.avatarUrl || row.photoUrl || null}
                          name={row.displayName || row.userId}
                          size={avatarSize}
                        />
                      </View>
                      <View
                        style={[
                          styles.podiumBlock,
                          {
                            height: blockHeight,
                            backgroundColor: podiumColor,
                            borderColor: isMe ? "#FFFFFF" : podiumColor,
                            borderWidth: isMe ? 3 : 1,
                          },
                        ]}
                      >
                        <Text style={styles.podiumRank}>#{rank}</Text>
                        <Text numberOfLines={1} style={styles.podiumName}>
                          {row.displayName || row.userId}
                          {isMe ? " (You)" : ""}
                        </Text>
                        <Text style={styles.podiumPoints}>
                          {Math.round(row.overallScore)} pts
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
            </View>
          ) : null}

          <FlatList
            data={listRows}
            keyExtractor={(item) => item.userId}
            initialNumToRender={12}
            maxToRenderPerBatch={14}
            windowSize={7}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.primary}
                colors={[colors.primary]}
                progressBackgroundColor={colors.bg2}
              />
            }
            contentContainerStyle={{
              gap: 10,
              paddingBottom: 16,
            }}
            style={styles.list}
            renderItem={({ item }) => {
            const isMe = !!myUserId && String(item.userId) === String(myUserId);
            const rank = Number(item.rank || 0);
            const isTopThree = rank > 0 && rank <= 3;
            const rankColor =
              rank === 1
                ? googlePalette.gold
                : rank === 2
                ? googlePalette.silver
                : rank === 3
                ? googlePalette.bronze
                : colors.textPrimary;
            return (
              <Pressable
                onPress={() => openStudent(item)}
                style={({ pressed }) => [
                  styles.row,
                  {
                    backgroundColor: colors.bg2,
                    borderColor: isMe ? "#FFFFFF" : "#FFFFFF88",
                    borderWidth: isMe ? 3 : 1,
                    opacity: pressed ? 0.95 : 1,
                  },
                ]}
              >
                <View style={styles.rankWrap}>
                  {isTopThree ? (
                    <Iconify
                      icon="mingcute:medal-line"
                      size={16}
                      color={rankColor}
                    />
                  ) : null}
                  <Text style={[styles.rank, { color: rankColor }]}>
                    #{item.rank}
                  </Text>
                </View>

                <AvatarOrInitials
                  uri={item.photoUrl}
                  name={item.displayName || item.userId}
                  size={40}
                  bgFallback={colors.bg3}
                  borderWidth={1}
                  borderColor="#FFFFFF88"
                />

                <View style={styles.middle}>
                  <Text
                    numberOfLines={1}
                    style={[styles.name, { color: colors.textPrimary }]}
                  >
                    {item.displayName || item.userId}
                    {isMe ? " (You)" : ""}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[styles.sub, { color: colors.textSecondary }]}
                  >
                    {period === "overall"
                      ? `Streak ${item.currentStreak} • Avg ${Math.round(
                          item.avgScorePct
                        )}%`
                      : `Attempts ${item.participationCount} • Avg ${Math.round(
                          item.avgScorePct
                        )}%`}
                  </Text>
                </View>

                <View style={styles.scoreWrap}>
                  <Text style={[styles.score, { color: tabAccent[period] }]}>
                    {Math.round(item.overallScore)}
                  </Text>
                  <Text style={[styles.scoreLabel, { color: colors.textSecondary }]}>
                    pts
                  </Text>
                </View>
              </Pressable>
            );
            }}
            ListEmptyComponent={
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.bg2,
                    borderColor: "#FFFFFF88",
                  },
                ]}
              >
                {podiumRows.length ? (
                  <>
                    <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                      No more ranks below the podium
                    </Text>
                    <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>
                      The top 3 students are shown above.
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                      No leaderboard data yet
                    </Text>
                    <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>
                      Complete more quizzes to populate class rankings.
                    </Text>
                  </>
                )}
              </View>
            }
          />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
  },

  title: {
    fontSize: 31,
    fontWeight: "900",
    marginBottom: 4,
  },

  subtitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 14,
  },

  tabWrap: {
    padding: 0,
    marginBottom: 16,
    flexDirection: "row",
    gap: 8,
  },

  tabBtn: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 9,
    alignItems: "center",
    justifyContent: "center",
  },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listWrap: {
    flex: 1,
  },
  podiumWrap: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 10,
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  podiumColumn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  podiumAvatarWrap: {
    width: "100%",
    alignItems: "center",
    justifyContent: "flex-end",
    marginBottom: -10,
    zIndex: 2,
  },
  podiumBlock: {
    width: "100%",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingTop: 14,
    paddingBottom: 10,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  podiumRank: {
    fontSize: 17,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  podiumName: {
    fontSize: 13,
    fontWeight: "800",
    color: "#FFFFFF",
    textAlign: "center",
    marginTop: 2,
  },
  podiumPoints: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFFE6",
    marginTop: 2,
  },
  list: {
    flex: 1,
  },

  card: {
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
  },

  errorTitle: {
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 4,
  },

  errorBody: {
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 20,
  },

  row: {
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  rankWrap: {
    width: 50,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },

  rank: {
    fontSize: 15,
    fontWeight: "900",
  },

  middle: {
    flex: 1,
    minWidth: 0,
  },

  name: {
    fontSize: 17,
    fontWeight: "800",
  },

  sub: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "600",
  },

  scoreWrap: {
    alignItems: "flex-end",
  },

  score: {
    fontSize: 20,
    fontWeight: "900",
  },

  scoreLabel: {
    fontSize: 12,
    fontWeight: "700",
  },

  emptyTitle: {
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 4,
  },

  emptyBody: {
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 20,
  },
});
