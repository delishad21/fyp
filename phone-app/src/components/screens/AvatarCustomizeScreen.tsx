import { getMyProfile } from "@/src/api/class-service";
import {
  AvatarSlot,
  equipStudentItem,
  getCosmeticAssetSvgUrl,
  getRewardsCatalog,
  getStudentInventory,
  setStudentEquippedSlot,
  type GameCosmeticDefinition,
  type GameRewardsCatalog,
  type GameStudentInventory,
} from "@/src/api/game-service";
import { useSession } from "@/src/auth/session";
import { useTheme } from "@/src/theme";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Iconify } from "react-native-iconify";
import { SvgUri } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AvatarOrInitials from "../ui/AvatarOrInitials";

function slotLabel(slot: AvatarSlot) {
  if (slot === "avatar") return "Skin Color";
  return slot
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isSvgUrl(url?: string | null) {
  const value = String(url || "");
  return value.startsWith("data:image/svg+xml") || /\.svg(?:\?|$)/i.test(value);
}

function AvatarCanvasPreview({
  uri,
  name,
  size,
  bgColor,
  borderColor,
}: {
  uri?: string | null;
  name: string;
  size: number;
  bgColor: string;
  borderColor: string;
}) {
  const [failed, setFailed] = useState(false);
  const safeUri = String(uri || "");
  if (!safeUri || failed) {
    return (
      <AvatarOrInitials
        uri={null}
        name={name}
        size={size}
        bgFallback={bgColor}
        borderWidth={StyleSheet.hairlineWidth}
        borderColor={borderColor}
      />
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 12,
        overflow: "hidden",
        borderWidth: StyleSheet.hairlineWidth,
        borderColor,
        backgroundColor: bgColor,
      }}
    >
      {isSvgUrl(safeUri) ? (
        <SvgUri
          uri={safeUri}
          width={size}
          height={size}
          onError={() => setFailed(true)}
        />
      ) : (
        <Image
          source={{ uri: safeUri }}
          style={{ width: size, height: size }}
          resizeMode="contain"
          onError={() => setFailed(true)}
        />
      )}
    </View>
  );
}

function RemoteLayer({
  uri,
  size,
  onError,
}: {
  uri?: string | null;
  size: number;
  onError?: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const safeUri = String(uri || "");
  if (!safeUri || failed) return null;

  if (isSvgUrl(safeUri)) {
    return (
      <SvgUri
        uri={safeUri}
        width={size}
        height={size}
        onError={() => {
          setFailed(true);
          onError?.();
        }}
      />
    );
  }

  return (
    <Image
      source={{ uri: safeUri }}
      style={{ width: size, height: size }}
      resizeMode="contain"
      onError={() => {
        setFailed(true);
        onError?.();
      }}
    />
  );
}

function CosmeticCardPreview({
  previewUri,
  size,
  bgColor,
  borderColor,
}: {
  previewUri?: string | null;
  size: number;
  bgColor: string;
  borderColor: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        overflow: "hidden",
        backgroundColor: bgColor,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor,
      }}
    >
      {!failed ? (
        <RemoteLayer
          uri={previewUri}
          size={size}
          onError={() => setFailed(true)}
        />
      ) : (
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ fontSize: 11, fontWeight: "700", color: "#64748B" }}>
            No Preview
          </Text>
        </View>
      )}
    </View>
  );
}

export default function AvatarCustomizeScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const token = useSession((s) => s.token());
  const account = useSession((s) => s.account);
  const styles = getStyles(colors);

  const [classId, setClassId] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<GameRewardsCatalog | null>(null);
  const [inventory, setInventory] = useState<GameStudentInventory | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<AvatarSlot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const compulsorySlotSet = useMemo(
    () => new Set<AvatarSlot>(catalog?.avatar?.compulsorySlots || []),
    [catalog?.avatar?.compulsorySlots],
  );
  const ownedCosmeticSet = useMemo(
    () => new Set((inventory?.ownedCosmeticIds || []).map((id) => String(id))),
    [inventory?.ownedCosmeticIds],
  );

  const currentSlot = selectedSlot || catalog?.avatar?.slots?.[0] || null;
  const slotCosmetics = useMemo(() => {
    if (!currentSlot) return [] as GameCosmeticDefinition[];
    const equippedInSlot = String(inventory?.equipped?.[currentSlot] || "");
    return (catalog?.cosmetics || []).filter((item) => {
      if (item.slot !== currentSlot) return false;
      if (ownedCosmeticSet.has(item.id)) return true;
      return !!equippedInSlot && equippedInSlot === item.id;
    });
  }, [catalog?.cosmetics, currentSlot, inventory?.equipped, ownedCosmeticSet]);

  const load = useCallback(async () => {
    if (!token || !account?.id) return;
    setLoading(true);
    setError(null);
    try {
      const profile = await getMyProfile(token);
      const c = String(profile?.stats?.classId || "").trim();
      if (!c) {
        setClassId(null);
        setCatalog(null);
        setInventory(null);
        setError("You are not in a class yet.");
        return;
      }

      const [catalogRes, inventoryRes] = await Promise.all([
        getRewardsCatalog(token, c),
        getStudentInventory(token, c, account.id),
      ]);

      setClassId(c);
      setCatalog(catalogRes);
      setInventory(inventoryRes);

      const firstSlot = catalogRes?.avatar?.slots?.[0] || null;
      setSelectedSlot((prev) => prev || firstSlot);
    } catch (e: any) {
      setError(e?.message || "Failed to load avatar customizer");
    } finally {
      setLoading(false);
    }
  }, [token, account?.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {};
    }, [load]),
  );

  const onPick = useCallback(
    async (itemId: string | null) => {
      if (!token || !account?.id || !classId || !currentSlot) return;
      if (saving) return;

      if (!itemId && compulsorySlotSet.has(currentSlot)) {
        return;
      }

      setSaving(true);
      setError(null);
      try {
        const updated = itemId
          ? await equipStudentItem(
              token,
              classId,
              account.id,
              currentSlot,
              itemId,
            )
          : await setStudentEquippedSlot(
              token,
              classId,
              account.id,
              currentSlot,
              null,
            );
        if (updated) {
          setInventory(updated);
        }
      } catch (e: any) {
        setError(e?.message || "Failed to update avatar");
      } finally {
        setSaving(false);
      }
    },
    [account?.id, classId, compulsorySlotSet, currentSlot, saving, token],
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
          Avatar Customization
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
            paddingTop: 14,
            paddingBottom: insets.bottom + 24,
            gap: 14,
          }}
        >
          <View
            style={[
              styles.previewCard,
              { backgroundColor: colors.bg2, borderColor: colors.bg4 },
            ]}
          >
            <AvatarCanvasPreview
              uri={inventory?.avatarUrl || null}
              name={account?.name || "Student"}
              size={184}
              bgColor={colors.bg1}
              borderColor={colors.bg4}
            />
          </View>

          <View style={styles.slotWrap}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              Select Part
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.slotRow}>
                {(catalog?.avatar?.slots || []).map((slot) => {
                  const isActive = slot === currentSlot;
                  return (
                    <Pressable
                      key={slot}
                      onPress={() => setSelectedSlot(slot)}
                      style={[
                        styles.slotChip,
                        {
                          borderColor: isActive ? colors.primary : colors.bg4,
                          backgroundColor: isActive ? colors.bg3 : colors.bg2,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.slotChipText,
                          {
                            color: isActive
                              ? colors.textPrimary
                              : colors.textSecondary,
                          },
                        ]}
                      >
                        {slotLabel(slot)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </View>

          <View style={styles.assetsWrap}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              {(currentSlot && slotLabel(currentSlot)) || "Assets"}
            </Text>
            <Text style={[styles.helperText, { color: colors.textSecondary }]}>
              {currentSlot && compulsorySlotSet.has(currentSlot)
                ? "Compulsory slot: cannot be empty"
                : "Optional slot: you can clear it"}
            </Text>

            {currentSlot && !compulsorySlotSet.has(currentSlot) ? (
              <Pressable
                onPress={() => onPick(null)}
                style={({ pressed }) => [
                  styles.noneChip,
                  {
                    opacity: pressed ? 0.92 : 1,
                    borderColor: colors.bg4,
                    backgroundColor: !inventory?.equipped?.[currentSlot]
                      ? colors.bg3
                      : colors.bg2,
                  },
                ]}
              >
                <Text
                  style={[styles.noneChipText, { color: colors.textPrimary }]}
                >
                  None
                </Text>
              </Pressable>
            ) : null}

            <View style={styles.assetsGrid}>
              {slotCosmetics.map((item) => {
                const selected = currentSlot
                  ? inventory?.equipped?.[currentSlot] === item.id
                  : false;
                const previewUrl = classId
                  ? getCosmeticAssetSvgUrl(classId, item.id)
                  : null;
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => onPick(item.id)}
                    style={({ pressed }) => [
                      styles.assetCard,
                      {
                        opacity: pressed ? 0.92 : 1,
                        borderColor: selected ? colors.primary : colors.bg4,
                        backgroundColor: selected ? colors.bg3 : colors.bg2,
                      },
                    ]}
                  >
                    {previewUrl ? (
                      <CosmeticCardPreview
                        previewUri={previewUrl}
                        size={132}
                        bgColor={colors.bg3}
                        borderColor={colors.bg4}
                      />
                    ) : null}
                    <Text
                      numberOfLines={2}
                      style={[styles.assetLabel, { color: colors.textPrimary }]}
                    >
                      {item.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {slotCosmetics.length === 0 ? (
              <Text
                style={[styles.helperText, { color: colors.textSecondary }]}
              >
                No unlocked items in this category yet.
              </Text>
            ) : null}
          </View>

          {saving ? (
            <View style={styles.savingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text
                style={[styles.savingText, { color: colors.textSecondary }]}
              >
                Saving...
              </Text>
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
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
      fontSize: 17,
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
      fontSize: 16,
      fontWeight: "800",
      lineHeight: 22,
    },
    previewCard: {
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      paddingVertical: 16,
      alignItems: "center",
      gap: 8,
    },
    previewText: {
      fontSize: 13,
      fontWeight: "600",
    },
    slotWrap: {
      gap: 8,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: "900",
      letterSpacing: 0.5,
    },
    slotRow: {
      flexDirection: "row",
      gap: 8,
      paddingRight: 8,
    },
    slotChip: {
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    slotChipText: {
      fontSize: 12,
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: 0.3,
    },
    assetsWrap: {
      gap: 8,
    },
    helperText: {
      fontSize: 13,
      fontWeight: "600",
    },
    noneChip: {
      alignSelf: "flex-start",
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: 12,
      paddingVertical: 6,
      marginBottom: 4,
    },
    noneChipText: {
      fontSize: 13,
      fontWeight: "800",
    },
    assetsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    assetCard: {
      width: "48%",
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      padding: 8,
      gap: 8,
    },
    assetImage: {
      width: "100%",
      aspectRatio: 1,
      borderRadius: 6,
      backgroundColor: colors.bg1,
    },
    assetLabel: {
      fontSize: 13,
      fontWeight: "700",
      lineHeight: 17,
    },
    savingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    savingText: {
      fontSize: 13,
      fontWeight: "700",
    },
  });
