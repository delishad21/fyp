import { getMyProfile } from "@/src/api/class-service";
import {
  equipStudentItem,
  getBadgeImageUrl,
  getCosmeticAssetSvgUrl,
  getRewardsCatalog,
  getStudentBadges,
  getStudentInventory,
  updateStudentDisplayedBadges,
  type AvatarSlot,
  type GameBadgeItem,
  type GameRewardsCatalog,
  type GameStudentInventory,
} from "@/src/api/game-service";
import { useSession } from "@/src/auth/session";
import { useEntranceAnimation } from "@/src/hooks/useEntranceAnimation";
import { hexToRgba } from "@/src/lib/color-utils";
import { useTheme } from "@/src/theme";
import { googlePalette } from "@/src/theme/google-palette";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Animated,
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

function one(value?: string | string[]) {
  if (Array.isArray(value)) return String(value[0] || "");
  return String(value || "");
}

function isSvgUrl(url?: string | null) {
  const value = String(url || "");
  return value.startsWith("data:image/svg+xml") || /\.svg(?:\?|$)/i.test(value);
}

function RewardArt({
  uri,
  size,
  isBadge,
  fallbackColor,
  fallbackBg,
}: {
  uri?: string | null;
  size: number;
  isBadge: boolean;
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
          borderRadius: 7,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: fallbackBg,
        }}
      >
        {isBadge ? (
          <Iconify icon="mingcute:award-line" size={28} color={fallbackColor} />
        ) : (
          <Iconify icon="mingcute:gift-line" size={28} color={fallbackColor} />
        )}
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

export default function RewardItemScreen() {
  const { colors } = useTheme();
  const contentMotion = useEntranceAnimation({
    delayMs: 45,
    fromY: 16,
    durationMs: 280,
  });
  const insets = useSafeAreaInsets();
  const token = useSession((s) => s.token());
  const account = useSession((s) => s.account);

  const params = useLocalSearchParams<{
    classId?: string | string[];
    rewardType?: string | string[];
    rewardId?: string | string[];
  }>();

  const rewardType = one(params.rewardType).toLowerCase() === "badge" ? "badge" : "cosmetic";
  const rewardId = one(params.rewardId).trim();
  const classIdFromParams = one(params.classId).trim();

  const [classId, setClassId] = useState("");
  const [catalog, setCatalog] = useState<GameRewardsCatalog | null>(null);
  const [inventory, setInventory] = useState<GameStudentInventory | null>(null);
  const [badges, setBadges] = useState<BadgeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replaceBadgeModal, setReplaceBadgeModal] =
    useState<ReplaceBadgeModalState | null>(null);

  const load = useCallback(async () => {
    if (!token || !account?.id) {
      setError("Session expired. Please sign in again.");
      setLoading(false);
      void useSession.getState().logout();
      return;
    }
    if (!rewardId) {
      setError("Missing rewardId");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      let resolvedClassId = classIdFromParams;
      if (!resolvedClassId) {
        const profile = await getMyProfile(token);
        resolvedClassId = String(profile?.stats?.classId || "").trim();
      }
      if (!resolvedClassId) {
        setError("No class context found.");
        return;
      }

      const [catalogRes, inventoryRes, badgeRes] = await Promise.all([
        getRewardsCatalog(token, resolvedClassId),
        getStudentInventory(token, resolvedClassId, account.id),
        getStudentBadges(token, resolvedClassId, account.id),
      ]);

      setClassId(resolvedClassId);
      setCatalog(catalogRes);
      setInventory(inventoryRes);
      setBadges(badgeRes);
    } catch (e: any) {
      setError(e?.message || "Failed to load reward item");
    } finally {
      setLoading(false);
    }
  }, [account?.id, classIdFromParams, rewardId, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const cosmetic = useMemo(() => {
    if (!catalog || rewardType !== "cosmetic") return null;
    return (catalog.cosmetics || []).find((item) => String(item.id) === rewardId) || null;
  }, [catalog, rewardId, rewardType]);

  const badge = useMemo(() => {
    if (rewardType !== "badge") return null;
    const owned = (badges?.ownedBadges || []).find((item) => String(item.id) === rewardId);
    if (owned) return owned;
    if (!catalog) return null;
    const fromCatalog = (catalog.badges || []).find((item) => String(item.id) === rewardId);
    if (!fromCatalog) return null;
    return {
      ...fromCatalog,
      kind: "static",
      engraving: null,
      imageUrl: classId ? getBadgeImageUrl(classId, rewardId) : null,
    } as GameBadgeItem;
  }, [badges?.ownedBadges, catalog, classId, rewardId, rewardType]);

  const previewUri =
    rewardType === "badge"
      ? badge?.imageUrl || (classId ? getBadgeImageUrl(classId, rewardId) : null)
      : classId
      ? getCosmeticAssetSvgUrl(classId, rewardId)
      : null;

  const ownsCosmetic = !!rewardId && !!inventory?.ownedCosmeticIds?.includes(rewardId);
  const ownsBadge = !!rewardId && !!badges?.ownedBadgeIds?.includes(rewardId);
  const displayedBadge = !!rewardId && !!badges?.displayBadgeIds?.includes(rewardId);

  async function onEquipCosmetic() {
    if (!token || !account?.id || !classId || !rewardId || saving) return;
    const slot = String(cosmetic?.slot || "") as AvatarSlot;
    if (!slot) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await equipStudentItem(token, classId, account.id, slot, rewardId);
      setInventory(updated);
    } catch (e: any) {
      setError(e?.message || "Failed to equip item");
    } finally {
      setSaving(false);
    }
  }

  async function applyDisplayBadgeIds(next: string[]) {
    if (!token || !account?.id || !classId || saving) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateStudentDisplayedBadges(token, classId, account.id, next);
      setBadges((prev) =>
        prev
          ? {
              ...prev,
              displayBadgeIds: updated.displayBadgeIds,
              displayBadges: updated.displayBadges,
            }
          : null
      );
    } catch (e: any) {
      setError(e?.message || "Failed to update displayed badges");
    } finally {
      setSaving(false);
    }
  }

  function openReplaceDisplayedBadgeModal(currentDisplayIds: string[]) {
    const candidates = currentDisplayIds.slice(0, 4).map((badgeId) => {
      const owned = badges?.ownedBadges.find(
        (item) => String(item.id) === badgeId
      );
      return {
        id: badgeId,
        name: owned?.name || badgeId,
        imageUrl:
          owned?.imageUrl ||
          (classId ? getBadgeImageUrl(classId, String(badgeId)) : null),
      };
    });
    setReplaceBadgeModal({
      targetBadgeId: rewardId,
      candidates,
    });
  }

  function onPickReplaceDisplayedBadge(displayedBadgeId: string) {
    if (!badges || !replaceBadgeModal) return;
    const currentDisplay = Array.from(
      new Set((badges.displayBadgeIds || []).map((id) => String(id)))
    );
    const next = currentDisplay
      .filter((id) => id !== displayedBadgeId)
      .concat(replaceBadgeModal.targetBadgeId);
    setReplaceBadgeModal(null);
    void applyDisplayBadgeIds(next);
  }

  function onToggleDisplayBadge() {
    if (!rewardId || !badges || !ownsBadge) return;
    if (displayedBadge) {
      const next = badges.displayBadgeIds.filter((id) => id !== rewardId);
      void applyDisplayBadgeIds(next);
      return;
    }

    const currentDisplay = Array.from(new Set(badges.displayBadgeIds.map((id) => String(id))));
    if (currentDisplay.length < 4) {
      void applyDisplayBadgeIds([...currentDisplay, rewardId]);
      return;
    }

    openReplaceDisplayedBadgeModal(currentDisplay);
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
          <Iconify icon="mingcute:arrow-left-line" size={21} color={colors.icon} />
        </Pressable>
        <Text numberOfLines={1} style={[styles.headerTitle, { color: colors.textPrimary }]}>
          {rewardType === "badge" ? "Badge" : "Cosmetic Item"}
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
            Could not load reward item
          </Text>
          <Text style={[styles.errorBody, { color: colors.textSecondary }]}>{error}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: Math.max(insets.bottom + 24, 32),
          }}
        >
          <Animated.View style={[styles.scrollContent, contentMotion]}>
          <View
            style={[
              styles.artCard,
              {
                borderColor: colors.bg4,
                backgroundColor: colors.bg2,
              },
            ]}
          >
            <RewardArt
              uri={previewUri}
              size={220}
              isBadge={rewardType === "badge"}
              fallbackBg={colors.bg3}
              fallbackColor={colors.icon}
            />
          </View>

          <View
            style={[
              styles.infoCard,
              {
                borderColor: colors.bg4,
                backgroundColor: colors.bg2,
              },
            ]}
          >
            {rewardType === "badge" ? (
              <>
                <Text style={[styles.itemName, { color: colors.textPrimary }]}>
                  {badge?.name || rewardId}
                </Text>
                {badge?.engraving ? (
                  <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>
                    {badge.engraving}
                  </Text>
                ) : null}
                <Text style={[styles.itemDescription, { color: colors.textSecondary }]}>
                  {badge?.description || "Badge reward"}
                </Text>
                <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>
                  {ownsBadge
                    ? displayedBadge
                      ? "Currently displayed on your profile"
                      : "In your badge inventory"
                    : "You do not own this badge"}
                </Text>
              </>
            ) : (
              <>
                <Text style={[styles.itemName, { color: colors.textPrimary }]}>
                  {cosmetic?.name || rewardId}
                </Text>
                <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>
                  {cosmetic?.slot
                    ? `Category: ${String(cosmetic.slot).replace(/_/g, " ")}`
                    : "Cosmetic reward"}
                </Text>
                <Text style={[styles.itemDescription, { color: colors.textSecondary }]}>
                  {cosmetic?.description || "Cosmetic reward item"}
                </Text>
                <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>
                  {ownsCosmetic
                    ? inventory?.equipped?.[cosmetic?.slot as AvatarSlot] === rewardId
                      ? "Currently equipped"
                      : "In your inventory"
                    : "You do not own this item"}
                </Text>
              </>
            )}
          </View>

            {rewardType === "badge" ? (
              <Pressable
                onPress={onToggleDisplayBadge}
                disabled={!ownsBadge || saving}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  {
                    backgroundColor: googlePalette.green,
                    opacity: !ownsBadge || saving ? 0.45 : pressed ? 0.9 : 1,
                  },
                ]}
              >
                {saving ? <ActivityIndicator size="small" color="#fff" /> : null}
                <Text style={styles.primaryBtnText}>
                  {displayedBadge ? "Remove from Display" : "Display on Profile"}
                </Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={onEquipCosmetic}
                disabled={!ownsCosmetic || saving || !cosmetic?.slot}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  {
                    backgroundColor: googlePalette.green,
                    opacity:
                      !ownsCosmetic || saving || !cosmetic?.slot ? 0.45 : pressed ? 0.9 : 1,
                  },
                ]}
              >
                {saving ? <ActivityIndicator size="small" color="#fff" /> : null}
                <Text style={styles.primaryBtnText}>
                  {inventory?.equipped?.[cosmetic?.slot as AvatarSlot] === rewardId
                    ? "Equipped"
                    : "Equip"}
                </Text>
              </Pressable>
            )}
          </Animated.View>
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
              { backgroundColor: colors.bg1, borderColor: googlePalette.red },
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
                  onPress={() => onPickReplaceDisplayedBadge(candidate.id)}
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
                  <RewardArt
                    uri={candidate.imageUrl}
                    size={72}
                    isBadge
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
                  borderColor: googlePalette.red,
                  backgroundColor: googlePalette.red,
                },
              ]}
            >
              <Text style={[styles.modalCloseText, { color: "#fff" }]}>
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
      paddingHorizontal: 12,
      paddingBottom: 10,
      borderBottomWidth: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    backBtn: {
      width: 38,
      height: 38,
      borderRadius: 8,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    headerTitle: {
      flex: 1,
      fontSize: 18,
      fontWeight: "900",
    },
    headerSpacer: {
      width: 38,
    },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    centerPad: {
      paddingHorizontal: 16,
      paddingTop: 20,
      gap: 6,
    },
    scrollContent: {
      gap: 12,
    },
    errorTitle: {
      fontSize: 17,
      fontWeight: "900",
    },
    errorBody: {
      fontSize: 14,
      fontWeight: "600",
      lineHeight: 20,
    },
    artCard: {
      borderRadius: 10,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 16,
    },
    infoCard: {
      borderRadius: 10,
      borderWidth: 1,
      padding: 14,
      gap: 6,
    },
    itemName: {
      fontSize: 24,
      fontWeight: "900",
    },
    itemDescription: {
      fontSize: 15,
      fontWeight: "600",
      lineHeight: 21,
    },
    itemMeta: {
      fontSize: 13,
      fontWeight: "700",
    },
    primaryBtn: {
      height: 44,
      borderRadius: 9,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
    },
    primaryBtnText: {
      color: "#fff",
      fontSize: 15,
      fontWeight: "900",
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
      borderRadius: 10,
      borderWidth: 1,
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
      borderWidth: 1,
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
      borderRadius: 8,
      borderWidth: 1,
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
