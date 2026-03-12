import { getMyProfile } from "@/src/api/class-service";
import {
  getClassStudentGameProfile,
  type GameStudentProfile,
} from "@/src/api/game-service";
import { useSession } from "@/src/auth/session";
import { useTheme } from "@/src/theme";
import { googlePalette } from "@/src/theme/google-palette";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import StudentProfilePage from "./StudentProfilePage";

export default function ProfileScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const token = useSession((s) => s.token());
  const account = useSession((s) => s.account);
  const logout = useSession((s) => s.logout);

  const [gameProfile, setGameProfile] = useState<GameStudentProfile | null>(null);
  const [className, setClassName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !account?.id) {
      setError("Session expired. Please sign in again.");
      setLoading(false);
      void useSession.getState().logout();
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const classProfile = await getMyProfile(token);
      const classId = String(classProfile?.stats?.classId || "").trim();
      setEmail(String((account as any)?.email || ""));

      if (!classId) {
        setGameProfile(null);
        setClassName("");
        setError("You are not in a class yet.");
        return;
      }

      const profile = await getClassStudentGameProfile(token, classId, account.id);
      setGameProfile(profile);
      setClassName(String(profile?.className || ""));
    } catch (e: any) {
      setError(e?.message || "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }, [token, account?.id, account]);

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {};
    }, [load]),
  );

  const equippedSummary = useMemo(() => {
    const entries = Object.entries(gameProfile?.equipped || {})
      .filter(([, value]) => !!value)
      .map(([slot, value]) => `${slot}: ${value}`);
    if (!entries.length) return "None";
    return entries.join(", ");
  }, [gameProfile?.equipped]);

  const displayName = account?.name || "Student";
  const subtitle = className || email || null;
  const showBack = false;

  async function onLogout() {
    await logout();
    router.replace("/");
  }

  return (
    <StudentProfilePage
      colors={colors}
      insets={insets}
      headerTitle="Profile"
      displayName={displayName}
      subtitle={subtitle}
      avatarUrl={gameProfile?.avatarUrl || null}
      loading={loading}
      error={error}
      onBack={() => router.back()}
      showBack={showBack}
      tabMode
      navAccentColor={googlePalette.yellow}
      rank={gameProfile?.rank ?? null}
      overallScore={Number(gameProfile?.overallScore || 0)}
      currentStreak={Number(gameProfile?.currentStreak || 0)}
      bestStreakDays={Number(gameProfile?.bestStreakDays || 0)}
      participationPct={Number(gameProfile?.participationPct || 0)}
      avgScorePct={Number(gameProfile?.avgScorePct || 0)}
      equippedSummary={equippedSummary}
      badges={
        Array.isArray(gameProfile?.displayBadges) && gameProfile.displayBadges.length
          ? gameProfile.displayBadges.map((badge) => ({
              id: String(badge.id || ""),
              name: String(badge.name || badge.id || "Badge"),
              description: String(badge.description || "Badge reward"),
              imageUrl: badge.imageUrl || null,
              engraving: badge.engraving || null,
            }))
          : Array.isArray(gameProfile?.badges)
          ? gameProfile.badges.map((badgeId) => ({
              id: String(badgeId),
              name: String(badgeId),
              description: "Badge reward",
              imageUrl: null,
            }))
          : []
      }
      actions={[
        {
          key: "customize-avatar",
          label: "Customize Avatar",
          icon: "mingcute:paint-2-line",
          onPress: () => router.push("/(main)/avatar-customize"),
        },
        {
          key: "badge-inventory",
          label: "Manage Badges",
          icon: "mingcute:award-line",
          onPress: () => router.push("/(main)/badge-inventory"),
        },
        {
          key: "settings",
          label: "Settings",
          icon: "mingcute:settings-2-line",
          onPress: () => router.push("/(main)/(tabs)/settings"),
        },
        {
          key: "logout",
          label: "Log Out",
          icon: "mingcute:exit-line",
          onPress: () => {
            void onLogout();
          },
          tone: "danger",
        },
      ]}
    />
  );
}
