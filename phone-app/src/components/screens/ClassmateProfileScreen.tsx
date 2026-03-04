import { getClassStudentGameProfile } from "@/src/api/game-service";
import { useSession } from "@/src/auth/session";
import { useTheme } from "@/src/theme";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
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
import AvatarOrInitials from "../ui/AvatarOrInitials";

function one(value?: string | string[]) {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

export default function ClassmateProfileScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const token = useSession((s) => s.token());
  const account = useSession((s) => s.account);

  const params = useLocalSearchParams<{
    studentId?: string | string[];
    classId?: string | string[];
    displayName?: string | string[];
    photoUrl?: string | string[];
  }>();

  const studentId = one(params.studentId);
  const classId = one(params.classId);
  const displayNameParam = one(params.displayName);
  const photoUrlParam = one(params.photoUrl);

  const [profile, setProfile] = useState<{
    classId: string;
    className: string;
    rank: number | null;
    overallScore: number;
    participationPct: number;
    avgScorePct: number;
    currentStreak: number;
    bestStreakDays: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const displayName = useMemo(() => {
    if (displayNameParam) return displayNameParam;
    if (account?.id && account.id === studentId) return account.name || studentId;
    return studentId || "Student";
  }, [account?.id, account?.name, displayNameParam, studentId]);

  const load = useCallback(async () => {
    if (!token) return;
    if (!classId || !studentId) {
      setError("Missing class or student context.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await getClassStudentGameProfile(token, classId, studentId);
      if (!res) {
        setProfile(null);
        setError("Student profile not found.");
      } else {
        setProfile({
          classId: res.classId,
          className: res.className,
          rank: res.rank,
          overallScore: res.overallScore,
          participationPct: res.participationPct,
          avgScorePct: res.avgScorePct,
          currentStreak: res.currentStreak,
          bestStreakDays: res.bestStreakDays,
        });
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load student profile");
    } finally {
      setLoading(false);
    }
  }, [token, classId, studentId]);

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {};
    }, [load])
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.bg1 }]}>
      <View
        style={[
          styles.headerRow,
          { paddingTop: insets.top + 12, borderBottomColor: colors.bg4 },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.backBtn,
            {
              opacity: pressed ? 0.9 : 1,
              backgroundColor: colors.bg2,
              borderColor: colors.bg4,
            },
          ]}
        >
          <Iconify icon="mingcute:left-line" size={18} color={colors.icon} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          Student Profile
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.centerPad}>
          <Text style={[styles.errorTitle, { color: colors.error }]}>
            Could not load profile
          </Text>
          <Text style={[styles.errorBody, { color: colors.textSecondary }]}>
            {error}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: insets.bottom + 24,
            gap: 12,
          }}
        >
          <View
            style={[
              styles.profileCard,
              { backgroundColor: colors.bg2, borderColor: colors.bg4 },
            ]}
          >
            <AvatarOrInitials
              uri={photoUrlParam || null}
              name={displayName}
              size={64}
              bgFallback={colors.bg3}
              borderWidth={StyleSheet.hairlineWidth}
              borderColor={colors.bg4}
            />
            <View style={styles.profileMeta}>
              <Text style={[styles.name, { color: colors.textPrimary }]}>
                {displayName}
              </Text>
              <Text style={[styles.className, { color: colors.textSecondary }]}>
                {profile?.className || "Class"}
              </Text>
            </View>
          </View>

          <View style={styles.kpiGrid}>
            <View
              style={[
                styles.kpiCard,
                { backgroundColor: colors.bg2, borderColor: colors.bg4 },
              ]}
            >
              <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>
                Rank
              </Text>
              <Text style={[styles.kpiValue, { color: colors.textPrimary }]}>
                {profile?.rank != null ? `#${profile.rank}` : "-"}
              </Text>
            </View>
            <View
              style={[
                styles.kpiCard,
                { backgroundColor: colors.bg2, borderColor: colors.bg4 },
              ]}
            >
              <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>
                Overall Score
              </Text>
              <Text style={[styles.kpiValue, { color: colors.textPrimary }]}>
                {Math.round(profile?.overallScore || 0)}
              </Text>
            </View>
            <View
              style={[
                styles.kpiCard,
                { backgroundColor: colors.bg2, borderColor: colors.bg4 },
              ]}
            >
              <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>
                Current Streak
              </Text>
              <Text style={[styles.kpiValue, { color: colors.textPrimary }]}>
                {profile?.currentStreak || 0}
              </Text>
            </View>
            <View
              style={[
                styles.kpiCard,
                { backgroundColor: colors.bg2, borderColor: colors.bg4 },
              ]}
            >
              <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>
                Best Streak
              </Text>
              <Text style={[styles.kpiValue, { color: colors.textPrimary }]}>
                {profile?.bestStreakDays || 0}
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.card,
              { backgroundColor: colors.bg2, borderColor: colors.bg4 },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              Performance
            </Text>
            <Text style={[styles.rowText, { color: colors.textSecondary }]}>
              Participation: {Math.round(profile?.participationPct || 0)}%
            </Text>
            <Text style={[styles.rowText, { color: colors.textSecondary }]}>
              Average Score: {Math.round(profile?.avgScorePct || 0)}%
            </Text>
          </View>

          <View
            style={[
              styles.card,
              { backgroundColor: colors.bg2, borderColor: colors.bg4 },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              Badges
            </Text>
            <Text style={[styles.rowText, { color: colors.textSecondary }]}>
              Badge display will be enabled after badge APIs are implemented.
            </Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  headerRow: {
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 10,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "900",
  },
  headerSpacer: { width: 34 },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  centerPad: {
    paddingHorizontal: 16,
    paddingTop: 24,
  },

  errorTitle: {
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 6,
  },
  errorBody: {
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 20,
  },

  profileCard: {
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  profileMeta: { flex: 1, minWidth: 0 },
  name: { fontSize: 20, fontWeight: "900" },
  className: { fontSize: 15, fontWeight: "700", marginTop: 2 },

  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  kpiCard: {
    width: "48.5%",
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
  },
  kpiLabel: {
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 6,
  },
  kpiValue: {
    fontSize: 22,
    fontWeight: "900",
  },

  card: {
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "900",
    marginBottom: 8,
  },
  rowText: {
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
  },
});
