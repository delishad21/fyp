import {
  ScheduleSummaryFilters,
  ScheduleSummaryRow,
  getMyScheduleSummary,
} from "@/src/api/class-service";
import { useSession } from "@/src/auth/session";
import { useTheme } from "@/src/theme";
import { useRouter } from "expo-router";
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
          { backgroundColor: subjectColorHex || colors.primary },
        ]}
      >
        {/* Title */}
        <Text numberOfLines={2} style={[cardStyles.title /* onPrimary */]}>
          {quizName}
        </Text>

        {/* Subject • Topic */}
        <Text numberOfLines={1} style={[cardStyles.metaLine /* onPrimary */]}>
          {[subject, topic].filter(Boolean).join(" • ") || "—"}
        </Text>

        {/* Latest attempt date */}
        <Text numberOfLines={1} style={[cardStyles.until /* onPrimary */]}>
          {formatLatestAt(latestAt)}
        </Text>
      </View>
    </Pressable>
  );
}

const cardStyles = StyleSheet.create({
  container: {
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  // Using white text on colored card (no onPrimary token provided)
  title: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 6,
  },
  metaLine: {
    color: "#ffffffdd",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 10,
  },
  until: {
    color: "#ffffffcc",
    fontSize: 12,
    fontWeight: "600",
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

  useEffect(() => {
    void load();
  }, [load]);

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
          <Text style={{ color: colors.textSecondary, marginTop: 8 }}>
            Loading history…
          </Text>
        </View>
      );
    }
    if (error) {
      return (
        <View style={styles.center}>
          <Text style={{ color: colors.error, fontWeight: "700" }}>
            {error}
          </Text>
          <Pressable
            onPress={() => load()}
            style={[styles.retryBtn, { borderColor: colors.bg3 }]}
          >
            <Text style={{ color: colors.textPrimary, fontWeight: "800" }}>
              Retry
            </Text>
          </Pressable>
        </View>
      );
    }
    if (!rows.length) {
      return (
        <View style={styles.center}>
          <Text style={{ color: colors.textSecondary }}>
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
            tintColor={colors.textSecondary}
          />
        }
        contentContainerStyle={{
          paddingBottom: Math.max(insets.bottom + 80, 120),
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
                  // if a canonical attempt exists, we’ll select that attempt first
                  displayedAttemptId: item.canonical?.attemptId,
                },
              })
            }
          />
        )}
      />
    );
  }, [
    colors.error,
    colors.textPrimary,
    colors.textSecondary,
    colors.primary,
    colors.bg3,
    insets.bottom,
    loading,
    error,
    rows,
    refreshing,
    onRefresh,
  ]);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg1 }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { borderBottomColor: colors.bg2, paddingTop: insets.top },
        ]}
      >
        <Text style={[styles.headerTxt, { color: colors.textPrimary }]}>
          History
        </Text>
      </View>

      {/* Body */}
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 12 }}>
        {content}
      </View>

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
            // subtle elevation/shadow works for both schemes
            shadowColor: colors.textPrimary,
          },
        ]}
      >
        <Iconify icon="mingcute:filter-line" size={18} color="#fff" />
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
                <Text style={{ color: colors.textPrimary, fontWeight: "800" }}>
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
                <Text style={{ color: "#fff", fontWeight: "800" }}>Save</Text>
              </Pressable>
            </View>

            <Pressable
              onPress={() => setFilterOpen(false)}
              style={{ alignSelf: "center", marginTop: 8, padding: 8 }}
            >
              <Text style={{ color: colors.textSecondary }}>Close</Text>
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
          { borderColor: colors.bg2, color: colors.textPrimary },
        ]}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    height: 56,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    flexDirection: "row",
  },
  headerTxt: { fontWeight: "800", fontSize: 16 },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  retryBtn: {
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },

  fab: {
    position: "absolute",
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    elevation: 3,
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  fabTxt: { color: "#fff", fontWeight: "900" },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "#0008",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  modalCard: {
    width: "100%",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 24,
    borderWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: { fontSize: 16, fontWeight: "900", marginBottom: 10 },

  fieldLabel: { fontSize: 12, fontWeight: "800", marginBottom: 6 },
  input: {
    height: 42,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
  },

  modalActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 16,
  },
  actionBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
});
