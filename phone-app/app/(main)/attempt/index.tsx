import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
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
import { ScreenContainer } from "react-native-screens";

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
        ? colors.warning
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
      currentRow={currentRow}
      onOpenPicker={() => setPickerOpen(true)}
    />
  );

  /** ---------- Short-circuit render states (no schedule, loading, error, empty) ---------- */
  if (!scheduleId) {
    return (
      <ScreenContainer>
        {header}
        <Center>
          <Text style={{ color: colors.error }}>Missing scheduleId</Text>
        </Center>
      </ScreenContainer>
    );
  }

  if (loadingList) {
    return (
      <ScreenContainer>
        {header}
        <Center>
          <ActivityIndicator color={colors.primary} />
          <Text style={{ color: colors.textSecondary, marginTop: 8 }}>
            Loading attempts…
          </Text>
        </Center>
      </ScreenContainer>
    );
  }

  if (error) {
    return (
      <ScreenContainer>
        {header}
        <Center>
          <Text style={{ color: colors.error, fontWeight: "800" }}>
            {error}
          </Text>
        </Center>
      </ScreenContainer>
    );
  }

  if (!attempts.length) {
    return (
      <ScreenContainer>
        {header}
        <Center>
          <Text style={{ color: colors.textSecondary }}>No attempts yet.</Text>
        </Center>
      </ScreenContainer>
    );
  }

  /** ---------- Normal screen: header + attempt body + picker ---------- */
  return (
    <ScreenContainer>
      {header}

      {/* Body with bottom inset padding so content never hides behind the home indicator */}
      <View style={{ flex: 1, paddingBottom: insets.bottom }}>
        <AttemptBody
          quizType={quizType}
          attemptDoc={attemptDoc}
          loadingAttempt={loadingAttempt}
        />
      </View>

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
    </ScreenContainer>
  );
}
