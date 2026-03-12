import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Iconify } from "react-native-iconify";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  AttemptRow,
  getAttemptById,
  listMyAttemptsForSchedule,
  type AttemptDoc,
} from "@/src/api/quiz-service";
import { useSession } from "@/src/auth/session";
import { AttemptBody } from "@/src/components/quiz-components/quiz/attempts/AttemptBody";
import { AttemptHeader } from "@/src/components/quiz-components/quiz/attempts/AttemptHeader";
import { AttemptPickerModal } from "@/src/components/quiz-components/quiz/attempts/AttemptPickerModal";
import { Center } from "@/src/components/ui/Center";
import { Params, bestTime } from "@/src/lib/attempt-helpers";
import { useTheme } from "@/src/theme";
import { googlePalette } from "@/src/theme/google-palette";

/** ---------- Main coordinator screen ---------- */
export default function AttemptScreenCoordinator() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const token = useSession((s) => s.token());

  /** URL params: which schedule & which attempt (if any) to open */
  const searchParams = useLocalSearchParams<Params>();
  const scheduleId = Array.isArray(searchParams.scheduleId)
    ? searchParams.scheduleId[0]
    : searchParams.scheduleId;
  const displayedAttemptId = Array.isArray(searchParams.displayedAttemptId)
    ? searchParams.displayedAttemptId[0]
    : searchParams.displayedAttemptId;

  /** Data state */
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(
    displayedAttemptId || null
  );
  const [attemptDoc, setAttemptDoc] = useState<AttemptDoc | null>(null);

  /** Loading + error state */
  const [loadingList, setLoadingList] = useState(true);
  const [loadingAttempt, setLoadingAttempt] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** UI state */
  const [pickerOpen, setPickerOpen] = useState(false);

  /** ---------- Effects: load attempt list for schedule ---------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token || !scheduleId) return;
      setLoadingList(true);
      setError(null);
      try {
        const rows = await listMyAttemptsForSchedule(token, scheduleId);
        if (cancelled) return;

        // Show newest attempt first using finished/started/created times
        const sorted = [...rows].sort((a, b) => bestTime(b) - bestTime(a));
        setAttempts(sorted);

        // Prefer deep-linked attemptId; otherwise default to latest attempt
        const initial =
          (displayedAttemptId &&
            sorted.find((r) => r._id === displayedAttemptId)?._id) ||
          sorted[0]?._id ||
          null;
        setSelectedAttemptId(initial);
      } catch (e: any) {
        if (!cancelled)
          setError(String(e?.message || "Failed to load attempts"));
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, scheduleId, displayedAttemptId]);

  /** ---------- Effects: load a single attempt doc when selection changes ---------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token || !selectedAttemptId) {
        setAttemptDoc(null);
        return;
      }
      setLoadingAttempt(true);
      setError(null);
      try {
        const doc = await getAttemptById(token, selectedAttemptId);
        if (!cancelled) setAttemptDoc(doc);
      } catch (e: any) {
        if (!cancelled)
          setError(String(e?.message || "Failed to load attempt"));
      } finally {
        if (!cancelled) setLoadingAttempt(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, selectedAttemptId]);

  /** Currently selected row from the summary list (for fallback meta) */
  const currentRow = useMemo(
    () => attempts.find((r) => r._id === selectedAttemptId) || null,
    [attempts, selectedAttemptId]
  );

  /** Header metadata derived from either the full doc or the row */
  const headerMeta = useMemo(() => {
    const quizName =
      attemptDoc?.quizVersionSnapshot?.meta?.name ||
      currentRow?.quiz?.name ||
      "Quiz";
    const quizVersion = attemptDoc?.quizVersion || currentRow?.quizVersion || 1;
    const subject =
      attemptDoc?.quizVersionSnapshot?.meta?.subject ||
      currentRow?.quiz?.subject ||
      null;
    const subjectColorHex =
      attemptDoc?.quizVersionSnapshot?.meta?.subjectColorHex ||
      currentRow?.quiz?.subjectColorHex ||
      null;
    const topic =
      attemptDoc?.quizVersionSnapshot?.meta?.topic ||
      currentRow?.quiz?.topic ||
      null;
    const score = attemptDoc?.score ?? currentRow?.score ?? null;
    const maxScore = attemptDoc?.maxScore ?? currentRow?.maxScore ?? null;
    const state = attemptDoc?.state || currentRow?.state || null;

    const stateBg =
      state === "finalized"
        ? colors.success
        : state === "in_progress"
        ? googlePalette.blue
        : state === "invalidated"
        ? colors.error
        : colors.bg3;
    const stateFg =
      state === "finalized" ||
      state === "in_progress" ||
      state === "invalidated"
        ? "#fff"
        : colors.textPrimary;

    return {
      quizName,
      quizVersion,
      subject,
      subjectColorHex,
      topic,
      score,
      maxScore,
      state,
      stateBg,
      stateFg,
    };
  }, [attemptDoc, currentRow, colors]);

  /** Viewer type (basic/rapid/crossword/…) */
  const quizType = attemptDoc?.quizVersionSnapshot?.quizType;

  /** ---------- Header instance ---------- */
  const header = (
    <AttemptHeader
      insetsTop={insets.top}
      colors={colors}
      meta={headerMeta}
      onBack={() => router.back()}
    />
  );

  /** ---------- Short-circuit render states (no schedule, loading, error, empty) ---------- */
  if (!scheduleId) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg1 }}>
        {header}
        <Center>
          <Text style={{ color: googlePalette.red }}>Missing scheduleId</Text>
        </Center>
      </View>
    );
  }

  if (loadingList) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg1 }}>
        {header}
        <Center>
          <ActivityIndicator color={googlePalette.blue} />
          <Text style={{ color: googlePalette.blue, marginTop: 8 }}>
            Loading attempts…
          </Text>
        </Center>
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg1 }}>
        {header}
        <Center>
          <Text style={{ color: googlePalette.red, fontWeight: "800" }}>
            {error}
          </Text>
        </Center>
      </View>
    );
  }

  if (!attempts.length) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg1 }}>
        {header}
        <Center>
          <Text style={{ color: googlePalette.green }}>No attempts yet.</Text>
        </Center>
      </View>
    );
  }

  /** ---------- Normal screen: header + attempt body + picker ---------- */
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg1 }}>
      {header}

      <View style={{ flex: 1 }}>
        <AttemptBody
          quizType={quizType}
          attemptDoc={attemptDoc}
          loadingAttempt={loadingAttempt}
        />
      </View>

      <Pressable
        onPress={() => setPickerOpen(true)}
        style={({ pressed }) => [
          styles.fab,
          {
            opacity: pressed ? 0.9 : 1,
            bottom: Math.max(insets.bottom + 16, 24),
            right: 16,
            backgroundColor: googlePalette.blue,
          },
        ]}
      >
        <Iconify icon="mingcute:down-line" size={20} color="#fff" />
        <Text style={styles.fabTxt}>Other Attempts</Text>
      </Pressable>

      <AttemptPickerModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        attempts={attempts}
        selectedId={selectedAttemptId || ""}
        onPick={(id) => {
          setPickerOpen(false);
          setSelectedAttemptId(id);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    minHeight: 46,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  fabTxt: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
  },
});
