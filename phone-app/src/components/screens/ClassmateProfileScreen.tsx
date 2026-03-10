import { getClassStudentGameProfile } from "@/src/api/game-service";
import { useSession } from "@/src/auth/session";
import { useTheme } from "@/src/theme";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import StudentProfilePage from "./StudentProfilePage";

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

  const [profile, setProfile] = useState<Awaited<
    ReturnType<typeof getClassStudentGameProfile>
  > | null>(null);
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
        setProfile(res);
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
    }, [load]),
  );

  const equippedSummary = useMemo(() => {
    const entries = Object.entries(profile?.equipped || {})
      .filter(([, value]) => !!value)
      .map(([slot, value]) => `${slot}: ${value}`);
    if (!entries.length) return "None";
    return entries.join(", ");
  }, [profile?.equipped]);

  return (
    <StudentProfilePage
      colors={colors}
      insets={insets}
      headerTitle="Student Profile"
      displayName={displayName}
      subtitle={profile?.className || null}
      avatarUrl={profile?.avatarUrl || profile?.avatarProfileUrl || photoUrlParam || null}
      loading={loading}
      error={error}
      onBack={() => router.back()}
      rank={profile?.rank ?? null}
      overallScore={Number(profile?.overallScore || 0)}
      currentStreak={Number(profile?.currentStreak || 0)}
      bestStreakDays={Number(profile?.bestStreakDays || 0)}
      participationPct={Number(profile?.participationPct || 0)}
      avgScorePct={Number(profile?.avgScorePct || 0)}
      equippedSummary={equippedSummary}
      badges={
        Array.isArray(profile?.displayBadges) && profile.displayBadges.length
          ? profile.displayBadges.map((badge) => ({
              id: String(badge.id || ""),
              name: String(badge.name || badge.id || "Badge"),
              description: String(badge.description || "Badge reward"),
              imageUrl: badge.imageUrl || null,
              engraving: badge.engraving || null,
            }))
          : Array.isArray(profile?.badges)
          ? profile.badges.map((badgeId) => ({
              id: String(badgeId),
              name: String(badgeId),
              description: "Badge reward",
              imageUrl: null,
            }))
          : []
      }
      actions={[]}
    />
  );
}
