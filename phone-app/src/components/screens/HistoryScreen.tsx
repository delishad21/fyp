import {
  ScheduleSummaryFilters,
  ScheduleSummaryRow,
  getMyScheduleSummary,
} from "@/src/api/class-service";
import { useSession } from "@/src/auth/session";
import { hexToRgba } from "@/src/lib/color-utils";
import { useEntranceAnimation } from "@/src/hooks/useEntranceAnimation";
import { useTheme } from "@/src/theme";
import { googlePalette } from "@/src/theme/google-palette";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Animated,
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

function toDateOnlyInput(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDateOnlyInput(value: string): Date | null {
  const v = String(value || "").trim();
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const date = new Date(y, mo, d);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== mo ||
    date.getDate() !== d
  ) {
    return null;
  }
  return date;
}

function formatDateLabel(value: string): string {
  const date = parseDateOnlyInput(value);
  if (!date) return "";
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function AttemptCard({
  quizName,
  subject,
  subjectColorHex,
  topic,
  latestAt,
  canonicalScore,
  canonicalMaxScore,
  onPress,
}: {
  quizName: string;
  subject: string | null;
  subjectColorHex: string | null;
  topic: string | null;
  latestAt?: string;
  canonicalScore?: number;
  canonicalMaxScore?: number;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const hasCanonical =
    typeof canonicalScore === "number" && typeof canonicalMaxScore === "number";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{ opacity: pressed ? 0.95 : 1 }]}
    >
      <View
        style={[
          cardStyles.container,
          { backgroundColor: subjectColorHex || colors.primary },
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

        <View style={cardStyles.bottomRow}>
          {/* Latest attempt date */}
          <Text numberOfLines={1} style={cardStyles.until}>
            {formatLatestAt(latestAt)}
          </Text>

          {hasCanonical ? (
            <Text style={cardStyles.scoreText}>
              {canonicalScore}/{canonicalMaxScore}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const cardStyles = StyleSheet.create({
  container: {
    borderRadius: 12,
    paddingVertical: 25,
    paddingHorizontal: 16,
    marginBottom: 12,

    // subtle depth
    overflow: "hidden",
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
    flexShrink: 1,
  },
  bottomRow: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 8,
  },
  scoreText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "900",
    textAlign: "right",
  },
});

export default function HistoryScreen() {
  const router = useRouter();

  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const contentMotion = useEntranceAnimation({
    delayMs: 50,
    fromY: 16,
    durationMs: 280,
  });
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
  const [datePickerTarget, setDatePickerTarget] = useState<
    "from" | "to" | null
  >(null);
  const [datePickerValue, setDatePickerValue] = useState<Date>(new Date());

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
      if (!token) {
        setError("Session expired. Please sign in again.");
        if (!opts?.silent) setLoading(false);
        void useSession.getState().logout();
        return;
      }
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
    setDatePickerTarget(null);
  };

  const openDatePicker = useCallback(
    (target: "from" | "to") => {
      const current = target === "from" ? draftFrom : draftTo;
      setDatePickerValue(parseDateOnlyInput(current) || new Date());
      setDatePickerTarget(target);
    },
    [draftFrom, draftTo]
  );

  const applyPickedDate = useCallback(
    (target: "from" | "to", date: Date) => {
      const next = toDateOnlyInput(date);
      if (target === "from") {
        setDraftFrom(next);
        const toDate = parseDateOnlyInput(draftTo);
        if (toDate && toDate.getTime() < date.getTime()) {
          setDraftTo(next);
        }
      } else {
        setDraftTo(next);
        const fromDate = parseDateOnlyInput(draftFrom);
        if (fromDate && fromDate.getTime() > date.getTime()) {
          setDraftFrom(next);
        }
      }
    },
    [draftFrom, draftTo]
  );

  const onDatePickerChange = useCallback(
    (event: DateTimePickerEvent, selectedDate?: Date) => {
      if (!datePickerTarget) return;

      if (Platform.OS === "android") {
        if (event.type === "dismissed") {
          setDatePickerTarget(null);
          return;
        }
        if (selectedDate) {
          applyPickedDate(datePickerTarget, selectedDate);
        }
        setDatePickerTarget(null);
        return;
      }

      if (selectedDate) {
        setDatePickerValue(selectedDate);
        applyPickedDate(datePickerTarget, selectedDate);
      }
    },
    [applyPickedDate, datePickerTarget]
  );

  const pickerMinDate =
    datePickerTarget === "to" ? parseDateOnlyInput(draftFrom) || undefined : undefined;
  const pickerMaxDate =
    datePickerTarget === "from" ? parseDateOnlyInput(draftTo) || undefined : undefined;

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
                borderColor: googlePalette.red,
                backgroundColor: googlePalette.red,
              },
            ]}
          >
            <Text style={{ color: "#fff", fontWeight: "900" }}>
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
      <Animated.View style={contentMotion}>
        <FlatList
          data={rows}
          keyExtractor={(r) => `${r.classId}:${r.scheduleId}`}
          removeClippedSubviews
          initialNumToRender={10}
          maxToRenderPerBatch={12}
          windowSize={7}
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
            paddingBottom: Math.max(insets.bottom + 24, 48),
          }}
          renderItem={({ item }) => (
            <AttemptCard
              quizName={item.quizName}
              subject={item.subject}
              subjectColorHex={item.subjectColorHex}
              topic={item.topic}
              latestAt={item.latestAt}
              canonicalScore={item.canonical?.score}
              canonicalMaxScore={item.canonical?.maxScore}
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
      </Animated.View>
    );
  }, [
    contentMotion,
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
        <View style={styles.headerRow}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={[styles.pageTitle, { color: googlePalette.green }]}>
              History
            </Text>
            <Text style={[styles.pageSubtitle, { color: colors.textSecondary }]}>
              Your past quizzes and attempts
            </Text>
          </View>
          <Pressable
            onPress={() => setFilterOpen(true)}
            style={({ pressed }) => [
              styles.headerFilterBtn,
              {
                opacity: pressed ? 0.9 : 1,
                backgroundColor: googlePalette.green,
              },
            ]}
          >
            <Iconify icon="mingcute:filter-line" size={18} color="#fff" />
            <Text style={styles.headerFilterTxt}>Filter</Text>
          </Pressable>
        </View>
      </View>

      {/* Body */}
      <View style={{ flex: 1, paddingHorizontal: 16 }}>{content}</View>

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
              { backgroundColor: colors.bg1, borderColor: googlePalette.blue },
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
              <DateField
                label="Latest From"
                value={draftFrom}
                placeholder="Select a start date"
                onPress={() => openDatePicker("from")}
                onClear={() => setDraftFrom("")}
              />
              <DateField
                label="Latest To"
                value={draftTo}
                placeholder="Select an end date"
                onPress={() => openDatePicker("to")}
                onClear={() => setDraftTo("")}
              />
            </View>

            {datePickerTarget ? (
              <View
                style={[
                  styles.datePickerWrap,
                  { backgroundColor: colors.bg2, borderColor: colors.bg3 },
                ]}
              >
                <Text
                  style={[
                    styles.datePickerTitle,
                    { color: colors.textPrimary },
                  ]}
                >
                  {datePickerTarget === "from"
                    ? "Pick start date"
                    : "Pick end date"}
                </Text>
                <DateTimePicker
                  value={datePickerValue}
                  mode="date"
                  display={Platform.OS === "ios" ? "inline" : "default"}
                  onChange={onDatePickerChange}
                  minimumDate={pickerMinDate}
                  maximumDate={pickerMaxDate}
                />
                {Platform.OS === "ios" ? (
                  <View style={styles.datePickerActions}>
                    <Pressable
                      onPress={() => setDatePickerTarget(null)}
                      style={({ pressed }) => [
                        styles.doneBtn,
                        {
                          opacity: pressed ? 0.9 : 1,
                          backgroundColor: colors.primary,
                        },
                      ]}
                    >
                      <Text style={styles.doneBtnText}>Done</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ) : null}

            <View style={styles.modalActions}>
              <Pressable
                onPress={resetFilters}
                style={({ pressed }) => [
                  styles.actionBtn,
              {
                opacity: pressed ? 0.9 : 1,
                borderColor: googlePalette.yellow,
                backgroundColor: googlePalette.yellow,
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
                    backgroundColor: googlePalette.green,
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
            borderColor: googlePalette.blue,
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

function DateField({
  label,
  value,
  placeholder,
  onPress,
  onClear,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onPress: () => void;
  onClear: () => void;
}) {
  const { colors } = useTheme();
  const hasValue = !!value.trim();
  return (
    <View>
      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
        {label}
      </Text>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.dateFieldBtn,
          {
            opacity: pressed ? 0.92 : 1,
            borderColor: googlePalette.blue,
            backgroundColor: colors.bg1,
          },
        ]}
      >
        <View style={styles.dateFieldLeft}>
          <Iconify icon="mingcute:calendar-line" size={18} color={colors.icon} />
          <Text
            style={[
              styles.dateFieldText,
              hasValue
                ? { color: colors.textPrimary }
                : { color: colors.textSecondary },
            ]}
          >
            {hasValue ? formatDateLabel(value) : placeholder || "Select date"}
          </Text>
        </View>
        {hasValue ? (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onClear();
            }}
            style={({ pressed }) => [
              styles.clearDateBtn,
              {
                opacity: pressed ? 0.88 : 1,
                backgroundColor: googlePalette.red,
              },
            ]}
          >
            <Iconify icon="mingcute:close-line" size={14} color="#fff" />
          </Pressable>
        ) : (
          <Iconify icon="mingcute:right-line" size={18} color={colors.icon} />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // ✅ Home-style title
  pageTitle: { fontSize: 29, fontWeight: "900" },
  pageSubtitle: { fontSize: 18, fontWeight: "700", marginTop: 2 },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  headerFilterBtn: {
    height: 40,
    borderRadius: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 2,
  },
  headerFilterTxt: { color: "#fff", fontWeight: "900", fontSize: 14 },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  helperText: { marginTop: 10, fontSize: 15, fontWeight: "600" },
  errorText: { fontSize: 15, fontWeight: "800", textAlign: "center" },

  retryBtn: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "#0008",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  modalCard: {
    width: "100%",
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 26,
    borderWidth: 1,
  },
  modalTitle: { fontSize: 18, fontWeight: "900", marginBottom: 12 },

  fieldLabel: { fontSize: 14, fontWeight: "900", marginBottom: 8 },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    fontSize: 17, // ~15 * 1.15 = 17.25 → 17
    fontWeight: "600",
  },
  dateFieldBtn: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  dateFieldLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  dateFieldText: {
    fontSize: 16,
    fontWeight: "700",
  },
  clearDateBtn: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  datePickerWrap: {
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  datePickerTitle: {
    fontSize: 14,
    fontWeight: "900",
    marginBottom: 4,
  },
  datePickerActions: {
    marginTop: 8,
    alignItems: "flex-end",
  },
  doneBtn: {
    minWidth: 88,
    height: 38,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  doneBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
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
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
});
