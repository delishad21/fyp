import {
  ScheduleSummaryFilters,
  ScheduleSummaryRow,
  getMyScheduleSummary,
} from "@/src/api/class-service";
import { useSession } from "@/src/auth/session";
import { useTheme } from "@/src/theme";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Iconify } from "react-native-iconify";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function formatLatestAt(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const day = d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const time = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${day}, ${time}`;
}

function AttemptCard({
  quizName,
  subject,
  subjectColorHex,
  topic,
  latestAt,
  onPress,
}: {
  quizName: string;
  subject: string | null;
  subjectColorHex: string | null;
  topic: string | null;
  latestAt?: string;
  onPress?: () => void;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{ opacity: pressed ? 0.92 : 1 }]}
    >
      <View
        style={[
          cardStyles.container,
          {
            backgroundColor: subjectColorHex || colors.primary,
            shadowColor: "#000",
          },
        ]}
      >
        {/* Title */}
        <Text numberOfLines={2} style={cardStyles.title}>
          {quizName}
        </Text>

        {/* Subject • Topic */}
        <Text numberOfLines={1} style={cardStyles.metaLine}>
          {[subject, topic].filter(Boolean).join(" • ") || "—"}
        </Text>

        {/* Latest attempt date */}
        <Text numberOfLines={1} style={cardStyles.until}>
          {formatLatestAt(latestAt)}
        </Text>
      </View>
    </Pressable>
  );
}

const cardStyles = StyleSheet.create({
  container: {
    borderRadius: 5,
    paddingVertical: 25,
    paddingHorizontal: 16,
    marginBottom: 12,

    // subtle depth
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  title: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "900",
    marginBottom: 7,
    letterSpacing: 0.2,
  },
  metaLine: {
    color: "#ffffffdd",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 10,
  },
  until: {
    color: "#ffffffcc",
    fontSize: 14, // ~12 * 1.15 = 13.8 → 14
    fontWeight: "700",
  },
});

export default function HistoryScreen() {
  const router = useRouter();

  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const token = useSession((s) => s.token());

  const [rows, setRows] = useState<ScheduleSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter modal state
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<ScheduleSummaryFilters>({});

  // Draft UI states inside modal (so you can cancel)
  const [draftName, setDraftName] = useState("");
  const [draftSubject, setDraftSubject] = useState("");
  const [draftTopic, setDraftTopic] = useState("");
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");

  // Keep draft in sync when filters change from outside (e.g., reset)
  useEffect(() => {
    setDraftName(filters.name ?? "");
    setDraftSubject(filters.subject ?? "");
    setDraftTopic(filters.topic ?? "");
    setDraftFrom(filters.latestFrom ? String(filters.latestFrom) : "");
    setDraftTo(filters.latestTo ? String(filters.latestTo) : "");
  }, [filters]);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!token) return;
      setError(null);
      if (!opts?.silent) setLoading(true);
      try {
        const res = await getMyScheduleSummary(token, filters);
        const sorted = [...res].sort(
          (a, b) =>
            new Date(b.latestAt || 0).getTime() -
            new Date(a.latestAt || 0).getTime()
        );
        setRows(sorted);
      } catch (e: any) {
        setError(String(e?.message || "Failed to load history"));
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [token, filters]
  );

  // ✅ Refresh every time screen is focused (already matches Home behavior)
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load({ silent: true });
    setRefreshing(false);
  }, [load]);

  const applyDraftAndReload = () => {
    const next: ScheduleSummaryFilters = {
      name: draftName.trim() || undefined,
      subject: draftSubject.trim() || undefined,
      topic: draftTopic.trim() || undefined,
      latestFrom: draftFrom.trim() || undefined,
      latestTo: draftTo.trim() || undefined,
    };
    setFilters(next);
    setFilterOpen(false);
  };

  const resetFilters = () => {
    setFilters({});
    setDraftName("");
    setDraftSubject("");
    setDraftTopic("");
    setDraftFrom("");
    setDraftTo("");
  };

  const content = useMemo(() => {
    if (loading) {
      return (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.helperText, { color: colors.textSecondary }]}>
            Loading history…
          </Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.center}>
          <Text style={[styles.errorText, { color: colors.error }]}>
            {error}
          </Text>
          <Pressable
            onPress={() => load()}
            style={({ pressed }) => [
              styles.retryBtn,
              {
                opacity: pressed ? 0.9 : 1,
                borderColor: colors.bg3,
                backgroundColor: colors.bg2,
              },
            ]}
          >
            <Text style={{ color: colors.textPrimary, fontWeight: "900" }}>
              Retry
            </Text>
          </Pressable>
        </View>
      );
    }

    if (!rows.length) {
      return (
        <View style={styles.center}>
          <Text style={[styles.helperText, { color: colors.textSecondary }]}>
            No attempts found.
          </Text>
        </View>
      );
    }

    return (
      <FlatList
        data={rows}
        keyExtractor={(r) => `${r.classId}:${r.scheduleId}`}
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
          paddingBottom: Math.max(insets.bottom + 92, 140),
        }}
        renderItem={({ item }) => (
          <AttemptCard
            quizName={item.quizName}
            subject={item.subject}
            subjectColorHex={item.subjectColorHex}
            topic={item.topic}
            latestAt={item.latestAt}
            onPress={() =>
              router.push({
                pathname: "/(main)/attempt",
                params: {
                  scheduleId: item.scheduleId,
                  displayedAttemptId: item.canonical?.attemptId,
                },
              })
            }
          />
        )}
      />
    );
  }, [
    colors.primary,
    colors.textPrimary,
    colors.textSecondary,
    colors.error,
    colors.bg2,
    colors.bg3,
    insets.bottom,
    loading,
    error,
    rows,
    refreshing,
    onRefresh,
    load,
    router,
  ]);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg1 }]}>
      {/* ✅ Home-style title block (exactly like Home) */}
      <View
        style={{
          paddingTop: insets.top + 16,
          paddingHorizontal: 16,
          paddingBottom: 12,
        }}
      >
        <Text style={[styles.pageTitle, { color: colors.textPrimary }]}>
          History
        </Text>
        <Text style={[styles.pageSubtitle, { color: colors.textSecondary }]}>
          Your past quizzes and attempts
        </Text>
      </View>

      {/* Body */}
      <View style={{ flex: 1, paddingHorizontal: 16 }}>{content}</View>

      {/* FAB */}
      <Pressable
        onPress={() => setFilterOpen(true)}
        style={({ pressed }) => [
          styles.fab,
          {
            opacity: pressed ? 0.9 : 1,
            bottom: Math.max(insets.bottom + 16, 24),
            right: 16,
            backgroundColor: colors.primary,
            shadowColor: "#000",
          },
        ]}
      >
        <Iconify icon="mingcute:filter-line" size={20} color="#fff" />
        <Text style={styles.fabTxt}>Filter</Text>
      </Pressable>

      {/* Filter Modal */}
      <Modal
        visible={filterOpen}
        animationType={Platform.select({ ios: "slide", android: "fade" })}
        transparent
        onRequestClose={() => setFilterOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: colors.bg1, borderColor: colors.bg2 },
            ]}
          >
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
              Filter attempts
            </Text>

            <View style={{ gap: 12 }}>
              <Field
                label="Name contains"
                placeholder='e.g. "water"'
                value={draftName}
                onChangeText={setDraftName}
              />
              <Field
                label="Subject"
                placeholder='e.g. "Science"'
                value={draftSubject}
                onChangeText={setDraftSubject}
              />
              <Field
                label="Topic"
                placeholder='e.g. "Cycles"'
                value={draftTopic}
                onChangeText={setDraftTopic}
              />
              <Field
                label="Latest From (ISO)"
                placeholder="YYYY-MM-DD or full ISO"
                value={draftFrom}
                onChangeText={setDraftFrom}
              />
              <Field
                label="Latest To (ISO)"
                placeholder="YYYY-MM-DD or full ISO"
                value={draftTo}
                onChangeText={setDraftTo}
              />
            </View>

            <View style={styles.modalActions}>
              <Pressable
                onPress={resetFilters}
                style={({ pressed }) => [
                  styles.actionBtn,
                  {
                    opacity: pressed ? 0.9 : 1,
                    borderColor: colors.bg3,
                    backgroundColor: "transparent",
                  },
                ]}
              >
                <Text style={{ color: colors.textPrimary, fontWeight: "900" }}>
                  Reset
                </Text>
              </Pressable>

              <Pressable
                onPress={applyDraftAndReload}
                style={({ pressed }) => [
                  styles.actionBtn,
                  {
                    opacity: pressed ? 0.9 : 1,
                    backgroundColor: colors.primary,
                  },
                ]}
              >
                <Text style={{ color: "#fff", fontWeight: "900" }}>Save</Text>
              </Pressable>
            </View>

            <Pressable
              onPress={() => setFilterOpen(false)}
              style={{ alignSelf: "center", marginTop: 10, padding: 10 }}
            >
              <Text style={{ color: colors.textSecondary, fontSize: 15 }}>
                Close
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/** Small labeled input field */
function Field({
  label,
  value,
  onChangeText,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
}) {
  const { colors } = useTheme();
  return (
    <View>
      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        style={[
          styles.input,
          {
            borderColor: colors.bg2,
            color: colors.textPrimary,
            backgroundColor: colors.bg1,
          },
        ]}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // ✅ Home-style title
  pageTitle: { fontSize: 29, fontWeight: "900" },
  pageSubtitle: { fontSize: 18, fontWeight: "700", marginTop: 2 },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  helperText: { marginTop: 10, fontSize: 15, fontWeight: "600" },
  errorText: { fontSize: 15, fontWeight: "800", textAlign: "center" },

  retryBtn: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
  },

  fab: {
    position: "absolute",
    paddingHorizontal: 16,
    height: 48,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    elevation: 3,
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  fabTxt: { color: "#fff", fontWeight: "900", fontSize: 15 },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "#0008",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  modalCard: {
    width: "100%",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 26,
    borderWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: { fontSize: 18, fontWeight: "900", marginBottom: 12 },

  fieldLabel: { fontSize: 14, fontWeight: "900", marginBottom: 8 },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 17, // ~15 * 1.15 = 17.25 → 17
    fontWeight: "600",
  },

  modalActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 18,
  },
  actionBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
});
