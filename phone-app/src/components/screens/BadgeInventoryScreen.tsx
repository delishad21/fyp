import { getMyProfile } from "@/src/api/class-service";
import {
  getBadgeImageUrl,
  getStudentBadges,
  updateStudentDisplayedBadges,
  type GameBadgeItem,
} from "@/src/api/game-service";
import { useSession } from "@/src/auth/session";
import { useTheme } from "@/src/theme";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Iconify } from "react-native-iconify";
import { SvgUri } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type BadgeState = {
  classId: string;
  ownedBadgeIds: string[];
  displayBadgeIds: string[];
  ownedBadges: GameBadgeItem[];
  displayBadges: GameBadgeItem[];
};

type ReplaceBadgeModalState = {
  targetBadgeId: string;
  candidates: Array<{
    id: string;
    name: string;
    imageUrl?: string | null;
  }>;
};

function isSvgUrl(url?: string | null) {
  const value = String(url || "");
  return value.startsWith("data:image/svg+xml") || /\.svg(?:\?|$)/i.test(value);
}

function BadgeImage({
  uri,
  size,
  fallbackColor,
  fallbackBg,
}: {
  uri?: string | null;
  size: number;
  fallbackColor: string;
  fallbackBg: string;
}) {
  const [failed, setFailed] = useState(false);
  const safeUri = String(uri || "");

  if (!safeUri || failed) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: 6,
          backgroundColor: fallbackBg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Iconify icon="mingcute:award-line" size={20} color={fallbackColor} />
      </View>
    );
  }

  if (isSvgUrl(safeUri)) {
    return <SvgUri uri={safeUri} width={size} height={size} onError={() => setFailed(true)} />;
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

export default function BadgeInventoryScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const token = useSession((s) => s.token());
  const account = useSession((s) => s.account);

  const [state, setState] = useState<BadgeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replaceBadgeModal, setReplaceBadgeModal] =
    useState<ReplaceBadgeModalState | null>(null);

  const load = useCallback(async () => {
    if (!token || !account?.id) return;
    setLoading(true);
    setError(null);
    try {
      const profile = await getMyProfile(token);
      const classId = String(profile?.stats?.classId || "").trim();
      if (!classId) {
        setState(null);
        setError("You are not in a class yet.");
        return;
      }

      const badges = await getStudentBadges(token, classId, account.id);
      setState({
        classId,
        ...badges,
      });
    } catch (e: any) {
      setError(e?.message || "Failed to load badge inventory");
    } finally {
      setLoading(false);
    }
  }, [account?.id, token]);

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {};
    }, [load])
  );

  const displayIdSet = useMemo(
    () => new Set((state?.displayBadgeIds || []).map((id) => String(id))),
    [state?.displayBadgeIds]
  );

  async function applyDisplayBadgeIds(nextIds: string[]) {
    if (!token || !account?.id || !state?.classId || saving) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateStudentDisplayedBadges(
        token,
        state.classId,
        account.id,
        nextIds
      );
      setState((prev) =>
        prev
          ? {
              ...prev,
              displayBadgeIds: updated.displayBadgeIds,
              displayBadges: updated.displayBadges,
            }
          : prev
      );
    } catch (e: any) {
      setError(e?.message || "Failed to update displayed badges");
    } finally {
      setSaving(false);
    }
  }

  function openReplaceBadgeModal(targetBadgeId: string) {
    if (!state) return;
    const currentDisplay = Array.from(
      new Set((state.displayBadgeIds || []).map((id) => String(id)))
    );
    const candidates = currentDisplay.slice(0, 4).map((displayId) => {
      const owned = state.ownedBadges.find(
        (item) => String(item.id) === displayId
      );
      return {
        id: displayId,
        name: owned?.name || displayId,
        imageUrl:
          owned?.imageUrl ||
          getBadgeImageUrl(String(state.classId || ""), String(displayId)),
      };
    });

    setReplaceBadgeModal({
      targetBadgeId,
      candidates,
    });
  }

  function onPickReplaceBadge(displayedBadgeId: string) {
    if (!state || !replaceBadgeModal) return;
    const currentDisplay = Array.from(
      new Set((state.displayBadgeIds || []).map((id) => String(id)))
    );
    const next = currentDisplay
      .filter((id) => id !== displayedBadgeId)
      .concat(replaceBadgeModal.targetBadgeId);
    setReplaceBadgeModal(null);
    void applyDisplayBadgeIds(next);
  }

  function onToggleBadgeDisplay(badgeId: string) {
    if (!state || !badgeId) return;
    const currentDisplay = Array.from(
      new Set((state.displayBadgeIds || []).map((id) => String(id)))
    );
    const isDisplayed = currentDisplay.includes(badgeId);
    if (isDisplayed) {
      void applyDisplayBadgeIds(currentDisplay.filter((id) => id !== badgeId));
      return;
    }
    if (currentDisplay.length < 4) {
      void applyDisplayBadgeIds([...currentDisplay, badgeId]);
      return;
    }
    openReplaceBadgeModal(badgeId);
  }

  const styles = getStyles();

  return (
    <View style={[styles.container, { backgroundColor: colors.bg1 }]}>
      <View
        style={[
          styles.header,
          {
            borderBottomColor: colors.bg4,
            paddingTop: insets.top + 10,
            backgroundColor: colors.bg1,
          },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.backBtn,
            {
              backgroundColor: colors.bg2,
              borderColor: colors.bg4,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Iconify icon="mingcute:arrow-left-line" size={20} color={colors.icon} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          Badge Inventory
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
            {error}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: Math.max(insets.bottom + 24, 32),
            gap: 14,
          }}
        >
          <View
            style={[
              styles.infoCard,
              { borderColor: colors.bg4, backgroundColor: colors.bg2 },
            ]}
          >
            <Text style={[styles.infoTitle, { color: colors.textPrimary }]}>
              Displayed Badges ({state?.displayBadgeIds.length || 0}/4)
            </Text>
            <Text style={[styles.infoBody, { color: colors.textSecondary }]}>
              Select up to 4 badges to display on your profile.
            </Text>
            <View style={styles.displayRow}>
              {(state?.displayBadges || []).map((badge) => (
                <View key={badge.id} style={styles.displayBadge}>
                  <BadgeImage
                    uri={
                      badge.imageUrl ||
                      getBadgeImageUrl(String(state?.classId || ""), String(badge.id || ""))
                    }
                    size={52}
                    fallbackBg={colors.bg3}
                    fallbackColor={colors.icon}
                  />
                </View>
              ))}
              {(state?.displayBadges || []).length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                  Nothing displayed yet.
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.grid}>
            {(state?.ownedBadges || []).map((badge) => {
              const isDisplayed = displayIdSet.has(String(badge.id));
              return (
                <Pressable
                  key={badge.id}
                  onPress={() => onToggleBadgeDisplay(String(badge.id))}
                  disabled={saving}
                  style={({ pressed }) => [
                    styles.card,
                    {
                      borderColor: isDisplayed ? colors.primary : colors.bg4,
                      backgroundColor: colors.bg2,
                      opacity: saving ? 0.5 : pressed ? 0.92 : 1,
                    },
                  ]}
                >
                  <BadgeImage
                    uri={
                      badge.imageUrl ||
                      getBadgeImageUrl(String(state?.classId || ""), String(badge.id || ""))
                    }
                    size={98}
                    fallbackBg={colors.bg3}
                    fallbackColor={colors.icon}
                  />
                  <Text numberOfLines={2} style={[styles.badgeName, { color: colors.textPrimary }]}>
                    {badge.name}
                  </Text>
                  <Text
                    style={[
                      styles.badgeStatus,
                      { color: isDisplayed ? colors.primary : colors.textSecondary },
                    ]}
                  >
                    {isDisplayed ? "Displayed" : "Tap to display"}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {(state?.ownedBadges || []).length === 0 ? (
            <View
              style={[
                styles.emptyCard,
                { borderColor: colors.bg4, backgroundColor: colors.bg2 },
              ]}
            >
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                You have not unlocked any badges yet.
              </Text>
            </View>
          ) : null}
        </ScrollView>
      )}
      <Modal
        visible={!!replaceBadgeModal}
        transparent
        animationType="fade"
        onRequestClose={() => setReplaceBadgeModal(null)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: colors.bg1, borderColor: colors.bg4 },
            ]}
          >
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
              Display shelf full
            </Text>
            <Text style={[styles.modalBody, { color: colors.textSecondary }]}>
              Choose which displayed badge to replace.
            </Text>
            <View style={styles.modalBadgeGrid}>
              {(replaceBadgeModal?.candidates || []).map((candidate) => (
                <Pressable
                  key={candidate.id}
                  onPress={() => onPickReplaceBadge(candidate.id)}
                  disabled={saving}
                  style={({ pressed }) => [
                    styles.modalBadgeBtn,
                    {
                      borderColor: colors.bg4,
                      backgroundColor: colors.bg2,
                      opacity: saving ? 0.55 : pressed ? 0.9 : 1,
                    },
                  ]}
                >
                  <BadgeImage
                    uri={candidate.imageUrl}
                    size={72}
                    fallbackBg={colors.bg3}
                    fallbackColor={colors.icon}
                  />
                  <Text
                    numberOfLines={2}
                    style={[styles.modalBadgeName, { color: colors.textPrimary }]}
                  >
                    {candidate.name}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              onPress={() => setReplaceBadgeModal(null)}
              style={({ pressed }) => [
                styles.modalCloseBtn,
                {
                  opacity: pressed ? 0.9 : 1,
                  borderColor: colors.bg4,
                  backgroundColor: colors.bg2,
                },
              ]}
            >
              <Text style={[styles.modalCloseText, { color: colors.textPrimary }]}>
                Cancel
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const getStyles = () =>
  StyleSheet.create({
    container: { flex: 1 },
    header: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: 12,
      paddingBottom: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    backBtn: {
      width: 38,
      height: 38,
      borderRadius: 5,
      borderWidth: StyleSheet.hairlineWidth,
      alignItems: "center",
      justifyContent: "center",
    },
    headerTitle: {
      flex: 1,
      fontSize: 18,
      fontWeight: "900",
    },
    headerSpacer: { width: 38 },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    centerPad: {
      paddingHorizontal: 16,
      paddingTop: 20,
    },
    errorTitle: {
      fontSize: 16,
      fontWeight: "800",
      lineHeight: 22,
    },
    infoCard: {
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 6,
      padding: 12,
      gap: 6,
    },
    infoTitle: {
      fontSize: 15,
      fontWeight: "900",
    },
    infoBody: {
      fontSize: 13,
      fontWeight: "600",
    },
    displayRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 2,
    },
    displayBadge: {
      borderRadius: 6,
      overflow: "hidden",
    },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    card: {
      width: "48%",
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 6,
      padding: 10,
      alignItems: "center",
      gap: 6,
    },
    badgeName: {
      fontSize: 13,
      fontWeight: "800",
      textAlign: "center",
      minHeight: 34,
    },
    badgeStatus: {
      fontSize: 11,
      fontWeight: "700",
    },
    emptyCard: {
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 6,
      padding: 12,
      alignItems: "center",
    },
    emptyText: {
      fontSize: 13,
      fontWeight: "700",
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.42)",
      alignItems: "center",
      justifyContent: "center",
      padding: 20,
    },
    modalCard: {
      width: "100%",
      maxWidth: 420,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      padding: 14,
      gap: 10,
    },
    modalTitle: {
      fontSize: 17,
      fontWeight: "900",
    },
    modalBody: {
      fontSize: 13,
      fontWeight: "600",
      lineHeight: 18,
    },
    modalBadgeGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    modalBadgeBtn: {
      width: "48%",
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      padding: 10,
      alignItems: "center",
      gap: 6,
    },
    modalBadgeName: {
      fontSize: 12,
      fontWeight: "800",
      textAlign: "center",
      minHeight: 30,
    },
    modalCloseBtn: {
      borderRadius: 6,
      borderWidth: StyleSheet.hairlineWidth,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 2,
    },
    modalCloseText: {
      fontSize: 14,
      fontWeight: "800",
    },
  });
