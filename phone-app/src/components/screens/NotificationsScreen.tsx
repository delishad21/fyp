import { getMyProfile } from "@/src/api/class-service";
import {
  acknowledgeStudentNotifications,
  getStudentNotifications,
  type GameStudentNotification,
} from "@/src/api/game-service";
import { useSession } from "@/src/auth/session";
import { useTheme } from "@/src/theme";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Iconify } from "react-native-iconify";
import { SvgUri } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function isSvgUrl(url?: string | null) {
  const value = String(url || "");
  return value.startsWith("data:image/svg+xml") || /\.svg(?:\?|$)/i.test(value);
}

function formatWhen(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

function NotificationAsset({
  notification,
  colors,
}: {
  notification: GameStudentNotification;
  colors: any;
}) {
  const uri =
    notification.rewardType === "badge"
      ? notification.reward?.imageUrl || null
      : notification.reward?.assetUrl || null;
  const [failed, setFailed] = useState(false);

  if (!uri || failed) {
    if (notification.type === "reward_revoked") {
      return (
        <View style={[styles.assetFallback, { backgroundColor: colors.bg3 }]}>
          <Iconify icon="mingcute:delete-2-line" size={18} color={colors.icon} />
        </View>
      );
    }
    if (notification.rewardType === "badge") {
      return (
        <View style={[styles.assetFallback, { backgroundColor: colors.bg3 }]}>
          <Iconify icon="mingcute:award-line" size={18} color={colors.icon} />
        </View>
      );
    }
    return (
      <View style={[styles.assetFallback, { backgroundColor: colors.bg3 }]}>
        <Iconify icon="mingcute:gift-line" size={18} color={colors.icon} />
      </View>
    );
  }

  return (
    <View style={styles.assetWrap}>
      {isSvgUrl(uri) ? (
        <SvgUri
          uri={uri}
          width={42}
          height={42}
          onError={() => setFailed(true)}
        />
      ) : (
        <Image
          source={{ uri }}
          style={{ width: 42, height: 42 }}
          resizeMode="contain"
          onError={() => setFailed(true)}
        />
      )}
    </View>
  );
}

const SWIPE_ACK_THRESHOLD = 92;
const SWIPE_DISMISS_DISTANCE = 420;

function SwipeToAcknowledgeRow({
  onAcknowledge,
  children,
}: {
  onAcknowledge: () => void;
  children: React.ReactNode;
}) {
  const [dismissing, setDismissing] = useState(false);
  const translateX = useMemo(() => new Animated.Value(0), []);
  const opacity = useMemo(() => new Animated.Value(1), []);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_evt, gestureState) =>
          !dismissing &&
          Math.abs(gestureState.dx) > 8 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
        onPanResponderMove: (_evt, gestureState) => {
          if (!dismissing) {
            translateX.setValue(gestureState.dx);
          }
        },
        onPanResponderRelease: (_evt, gestureState) => {
          if (dismissing) return;
          const shouldDismiss = Math.abs(gestureState.dx) >= SWIPE_ACK_THRESHOLD;
          if (!shouldDismiss) {
            Animated.spring(translateX, {
              toValue: 0,
              useNativeDriver: true,
              speed: 20,
              bounciness: 7,
            }).start();
            return;
          }

          setDismissing(true);
          const toValue =
            gestureState.dx >= 0 ? SWIPE_DISMISS_DISTANCE : -SWIPE_DISMISS_DISTANCE;
          Animated.parallel([
            Animated.timing(translateX, {
              toValue,
              duration: 170,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0,
              duration: 170,
              useNativeDriver: true,
            }),
          ]).start(() => {
            onAcknowledge();
          });
        },
        onPanResponderTerminate: () => {
          if (dismissing) return;
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            speed: 20,
            bounciness: 7,
          }).start();
        },
      }),
    [dismissing, onAcknowledge, opacity, translateX]
  );

  return (
    <Animated.View
      style={{
        transform: [{ translateX }],
        opacity,
      }}
      {...panResponder.panHandlers}
    >
      {children}
    </Animated.View>
  );
}

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const token = useSession((s) => s.token());
  const account = useSession((s) => s.account);

  const [classId, setClassId] = useState<string>("");
  const [rows, setRows] = useState<GameStudentNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !account?.id) return;
    setLoading(true);
    setError(null);
    try {
      const classProfile = await getMyProfile(token);
      const nextClassId = String(classProfile?.stats?.classId || "").trim();
      setClassId(nextClassId);
      if (!nextClassId) {
        setRows([]);
        setUnreadCount(0);
        return;
      }

      const result = await getStudentNotifications(token, nextClassId, account.id, {
        unreadOnly: true,
        limit: 200,
      });
      setRows(result.notifications);
      setUnreadCount(result.unreadCount);
    } catch (e: any) {
      setError(e?.message || "Failed to load notifications");
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

  const unreadIds = useMemo(() => rows.map((row) => row.id).filter(Boolean), [rows]);

  async function acknowledgeOne(id: string) {
    if (!token || !account?.id || !classId || !id) return;
    const target = rows.find((row) => row.id === id);
    if (!target || target.acknowledgedAt) return;

    try {
      const result = await acknowledgeStudentNotifications(token, classId, account.id, {
        notificationIds: [id],
      });
      setRows((prev) => prev.filter((row) => row.id !== id));
      setUnreadCount(result.unreadCount);
    } catch (e) {
      console.warn("[notifications] acknowledgeOne failed", e);
    }
  }

  async function openNotification(row: GameStudentNotification) {
    if (!row?.id) return;

    await acknowledgeOne(row.id);

    if (!classId || !row.rewardId || !row.rewardType) {
      return;
    }

    router.push({
      pathname: "/(main)/reward-item",
      params: {
        classId,
        rewardType: row.rewardType,
        rewardId: row.rewardId,
      },
    });
  }

  async function acknowledgeAll() {
    if (!token || !account?.id || !classId || !unreadIds.length || markingAll) return;
    setMarkingAll(true);
    try {
      const result = await acknowledgeStudentNotifications(token, classId, account.id, {
        acknowledgeAll: true,
      });
      setRows([]);
      setUnreadCount(result.unreadCount);
    } catch (e) {
      console.warn("[notifications] acknowledgeAll failed", e);
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg1 }}>
      <View
        style={[
          styles.header,
          {
            borderBottomColor: colors.bg4,
            paddingTop: insets.top + 8,
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

        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          Notifications
        </Text>

        <Pressable
          onPress={() => {
            void acknowledgeAll();
          }}
          disabled={!unreadIds.length || markingAll}
          style={({ pressed }) => [
            styles.markAllBtn,
            {
              opacity: !unreadIds.length || markingAll ? 0.45 : pressed ? 0.85 : 1,
              backgroundColor: colors.bg2,
              borderColor: colors.bg4,
            },
          ]}
        >
          <Text style={[styles.markAllText, { color: colors.textPrimary }]}>
            Clear all
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 14,
          paddingBottom: Math.max(insets.bottom + 24, 32),
          gap: 10,
        }}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={{ color: colors.error, fontSize: 14, fontWeight: "700" }}>
              {error}
            </Text>
          </View>
        ) : !rows.length ? (
          <View
            style={[
              styles.emptyCard,
              {
                backgroundColor: colors.bg2,
                borderColor: colors.bg4,
              },
            ]}
          >
            <Iconify
              icon="tabler:bell-off"
              size={20}
              color={colors.textSecondary}
            />
            <Text style={{ color: colors.textSecondary, fontSize: 15, fontWeight: "700" }}>
              No notifications yet.
            </Text>
          </View>
        ) : (
          rows.map((row) => {
            return (
              <SwipeToAcknowledgeRow
                key={row.id}
                onAcknowledge={() => {
                  void acknowledgeOne(row.id);
                }}
              >
                <View
                  style={[
                    styles.rowCard,
                    {
                      backgroundColor: colors.bg2,
                      borderColor: colors.primary,
                    },
                  ]}
                >
                  <Pressable
                    onPress={() => {
                      void openNotification(row);
                    }}
                    style={({ pressed }) => [
                      styles.rowPressable,
                      { opacity: pressed ? 0.92 : 1 },
                    ]}
                  >
                    <NotificationAsset notification={row} colors={colors} />
                    <View style={styles.rowTextWrap}>
                      <View style={styles.rowTop}>
                        <Text style={[styles.rowTitle, { color: colors.textPrimary }]}>
                          {row.title}
                        </Text>
                        <View
                          style={[styles.unreadDot, { backgroundColor: colors.primary }]}
                        />
                      </View>
                      <Text style={[styles.rowMessage, { color: colors.textSecondary }]}>
                        {row.message}
                      </Text>
                      <Text style={[styles.rowWhen, { color: colors.textSecondary }]}>
                        {formatWhen(row.createdAt)}
                      </Text>
                    </View>
                  </Pressable>
                </View>
              </SwipeToAcknowledgeRow>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingBottom: 10,
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
    fontSize: 20,
    fontWeight: "900",
  },
  markAllBtn: {
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  markAllText: {
    fontSize: 12,
    fontWeight: "800",
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 140,
  },
  emptyCard: {
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  rowCard: {
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  rowPressable: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  assetWrap: {
    width: 42,
    height: 42,
    borderRadius: 5,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  assetFallback: {
    width: 42,
    height: 42,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: "900",
    flexShrink: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  rowMessage: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  rowWhen: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: "600",
  },
});
