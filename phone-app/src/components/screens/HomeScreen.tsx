import {
  getAttemptables,
  getMyProfile,
  type AttemptableRow,
  type ProfileData,
} from "@/src/api/class-service";
import { useSession } from "@/src/auth/session";
import { useTheme } from "@/src/theme";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
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
      setAttemptables(a);
      setProfile(p);
    } catch (e: any) {
      setError(e?.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  // Pull-to-refresh handler (uses same loader)
  const onRefresh = useCallback(async () => {
    if (!token) return;
    setRefreshing(true);
    try {
      const [a, p] = await Promise.all([
        getAttemptables(token),
        getMyProfile(token),
      ]);
      setAttemptables(a);
      setProfile(p);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Failed to refresh");
    } finally {
      setRefreshing(false);
    }
  }, [token]);

  const displayName = profile?.displayName || account?.name || "Student";
  const streakDays = Math.max(0, Math.min(7, profile?.stats?.streakDays ?? 0));
  const streakPct = streakDays / 7;
  const streakMsg = streakDays > 3 ? "Keep it up!" : "Let’s build your streak!";

  const styles = getStyles(colors);

  return (
    <View style={{ flex: 1 }}>
      <TwoToneSplitBackground
        topHeight={splitY ?? defaultSplit}
        topColor={colors.bg1}
        bottomColor={colors.bg3}
      />

      {/* One scroll container for the whole page with pull-to-refresh */}
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top,
          paddingBottom: insets.bottom + 24,
        }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary} // iOS spinner color
            colors={[colors.primary]} // Android spinner colors
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
            </View>
            <AvatarOrInitials
              uri={profile?.photoUrl}
              name={displayName}
              size={40}
              bgFallback={colors.bg3}
            />
          </View>

          {/* Streak Card—its midpoint sets the split line */}
          <View
            style={[styles.streakCard, { backgroundColor: colors.bg4 }]}
            onLayout={(e) => {
              const { y, height } = e.nativeEvent.layout;
              setSplitY(Math.max(0, Math.round(insets.top + y + height / 2)));
            }}
          >
            <Text style={[styles.streakTitle, { color: colors.textPrimary }]}>
              🔥 Weekly Streak Progress
            </Text>
            <Text
              style={[styles.streakSubtitle, { color: colors.textPrimary }]}
            >
              {streakDays} {streakDays === 1 ? "Day" : "Days"} • {streakMsg}
            </Text>
            <View
              style={[styles.progressTrack, { backgroundColor: colors.bg3 }]}
            >
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${streakPct * 100}%`,
                    backgroundColor: colors.primary,
                  },
                ]}
              />
            </View>
          </View>
        </View>

        {/* BOTTOM content (cards) */}
        <View style={styles.bottomArea}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            Today’s Quizzes
          </Text>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : error ? (
            <View style={styles.center}>
              <Text style={{ color: colors.error }}>{error}</Text>
            </View>
          ) : (
            <FlatList
              data={attemptables || []}
              keyExtractor={(item) => item.scheduleId}
              scrollEnabled={false} // outer ScrollView controls the scroll
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
                    router.push({
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
                <View style={styles.center}>
                  <Text style={{ color: colors.textSecondary }}>
                    No quizzes available right now.
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

// ------- styles (kept local to the screen) -------
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
    hi: { fontSize: 24, fontWeight: "700" },
    streakCard: {
      borderRadius: 12,
      padding: 14,
      marginBottom: 4,
    },
    streakTitle: { fontSize: 14, fontWeight: "700", marginBottom: 4 },
    streakSubtitle: { fontSize: 13, marginBottom: 10, fontWeight: "600" },
    progressTrack: { height: 8, borderRadius: 8, overflow: "hidden" },
    progressFill: { height: "100%", borderRadius: 8 },
    sectionTitle: {
      fontSize: 18,
      fontWeight: "700",
      marginBottom: 10,
      paddingHorizontal: 16,
    },
    center: { alignItems: "center", justifyContent: "center", minHeight: 120 },
  });
