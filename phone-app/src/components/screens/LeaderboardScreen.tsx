import { getMyProfile, type ProfileData } from "@/src/api/class-service";
import {
  getClassLeaderboard,
  type GameLeaderboardRow,
} from "@/src/api/game-service";
import { useSession } from "@/src/auth/session";
import { useTheme } from "@/src/theme";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AvatarOrInitials from "../ui/AvatarOrInitials";

export default function LeaderboardScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const token = useSession((s) => s.token());
  const account = useSession((s) => s.account);

  const [rows, setRows] = useState<GameLeaderboardRow[]>([]);
  const [meProfile, setMeProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const myUserId = meProfile?.userId || account?.id || null;
  const classId = meProfile?.stats?.classId || null;

  const load = useCallback(async () => {
    if (!token) return;
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

      const leaderboard = await getClassLeaderboard(token, resolvedClassId);
      setRows(leaderboard);
    } catch (e: any) {
      setError(e?.message || "Failed to load leaderboard");
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

  const onRefresh = useCallback(async () => {
    if (!token) return;
    setRefreshing(true);
    try {
      const me = await getMyProfile(token);
      setMeProfile(me);
      const resolvedClassId = me?.stats?.classId;
      if (!resolvedClassId) {
        setRows([]);
        return;
      }
      const leaderboard = await getClassLeaderboard(token, resolvedClassId);
      setRows(leaderboard);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Failed to refresh leaderboard");
    } finally {
      setRefreshing(false);
    }
  }, [token]);

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
          paddingBottom: insets.bottom + 24,
        },
      ]}
    >
      {/* Title */}
      <Text style={[styles.title, { color: colors.textPrimary }]}>
        Leaderboard
      </Text>

      {/* Subtitle */}
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        See how you stack up against your classmates
      </Text>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <View
          style={[
            styles.card,
            { backgroundColor: colors.bg2, borderColor: colors.bg4 },
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
        <FlatList
          data={rows}
          keyExtractor={(item) => item.userId}
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
            paddingBottom: insets.bottom + 24,
          }}
          renderItem={({ item }) => {
            const isMe = !!myUserId && String(item.userId) === String(myUserId);
            return (
              <Pressable
                onPress={() => openStudent(item)}
                style={({ pressed }) => [
                  styles.row,
                  {
                    backgroundColor: colors.bg2,
                    borderColor: isMe ? colors.primary : colors.bg4,
                    opacity: pressed ? 0.94 : 1,
                  },
                ]}
              >
                <View style={styles.rankWrap}>
                  <Text style={[styles.rank, { color: colors.textPrimary }]}>
                    #{item.rank}
                  </Text>
                </View>

                <AvatarOrInitials
                  uri={item.photoUrl}
                  name={item.displayName || item.userId}
                  size={40}
                  bgFallback={colors.bg3}
                  borderWidth={StyleSheet.hairlineWidth}
                  borderColor={colors.bg4}
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
                    Streak {item.currentStreak} • Avg {Math.round(item.avgScorePct)}
                    %
                  </Text>
                </View>

                <View style={styles.scoreWrap}>
                  <Text style={[styles.score, { color: colors.textPrimary }]}>
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
                { backgroundColor: colors.bg2, borderColor: colors.bg4 },
              ]}
            >
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                No leaderboard data yet
              </Text>
              <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>
                Complete more quizzes to populate class rankings.
              </Text>
            </View>
          }
        />
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
    fontSize: 29,
    fontWeight: "900",
    marginBottom: 4,
  },

  subtitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 16,
  },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  card: {
    borderRadius: 5,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
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
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  rankWrap: {
    width: 42,
    alignItems: "center",
    justifyContent: "center",
  },

  rank: {
    fontSize: 16,
    fontWeight: "900",
  },

  middle: {
    flex: 1,
    minWidth: 0,
  },

  name: {
    fontSize: 16,
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
    fontSize: 18,
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
