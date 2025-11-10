import {
  finishAttempt,
  isRapid,
  saveAnswers,
  type AnswersPayload,
  type AttemptDoc,
  type AttemptSpec,
  type RapidAttemptSpec,
} from "@/src/api/quiz-service";
import { useSession } from "@/src/auth/session";
import { fmtClock, normaliseInitialAnswers } from "@/src/lib/attempt-helpers";
import { useTheme } from "@/src/theme";
import { useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  attemptId: string;
  spec: AttemptSpec;
  attempt?: AttemptDoc;
};

const HALF_SCREEN = Math.round(Dimensions.get("window").height * 0.45);

function useInterval(cb: () => void, delayMs: number | null) {
  const cbRef = useRef(cb);
  useEffect(() => void (cbRef.current = cb), [cb]);
  useEffect(() => {
    if (delayMs === null) return;
    const id = setInterval(() => cbRef.current(), delayMs);
    return () => clearInterval(id);
  }, [delayMs]);
}

export default function QuizPlayRapidScreen({
  attemptId,
  spec: rawSpec,
  attempt,
}: Props) {
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const token = useSession((s) => s.token());

  const spec = rawSpec as RapidAttemptSpec;
  if (!isRapid(spec)) {
    return (
      <View style={[styles.center, { flex: 1, backgroundColor: colors.bg1 }]}>
        <Text style={{ color: colors.textPrimary }}>
          Wrong screen for this quiz type.
        </Text>
      </View>
    );
  }

  const items = useMemo(() => spec.renderSpec.items ?? [], [spec]);

  // figure out where to start: first unanswered index
  const initialIndex = useMemo(() => {
    const answered = new Set(Object.keys(attempt?.answers || {}));
    const firstUnanswered = items.findIndex((it) => !answered.has(it.id));
    return firstUnanswered === -1 ? items.length : firstUnanswered;
    // if all answered, we'll finalize immediately in an effect
  }, [items, attempt?.answers]);

  const [index, setIndex] = useState(initialIndex);
  const current = items[index];
  const isLast = index === items.length - 1;

  const [answers, setAnswers] = useState<AnswersPayload>(() =>
    normaliseInitialAnswers(attempt)
  );

  // selection + transitions
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState<"idle" | "saving" | "error">("idle");
  const [finishing, setFinishing] = useState(false);
  const transitioningRef = useRef(false); // guard against double-advance

  // PER-QUESTION TIMER
  const [qRemaining, setQRemaining] = useState<number>(() => {
    // When resuming, we *skip* the in-flight question (unsaved), so this is always a fresh question.
    const t = current?.timeLimit ?? 0;
    return Math.max(0, Number.isFinite(t) ? t : 0);
  });

  // reset per-question clock when index changes
  useEffect(() => {
    const t = current?.timeLimit ?? 0;
    setQRemaining(Math.max(0, Number.isFinite(t) ? t : 0));
    setSelected(null);
  }, [index, current?.timeLimit]);

  // global: if everything is already answered, finalize immediately
  useEffect(() => {
    if (index >= items.length && !finishing && token) {
      setFinishing(true);
      (async () => {
        try {
          let finalizeRes: any = null;
          if (token) {
            finalizeRes = await finishAttempt(token, attemptId).catch(
              () => null
            );
          }
          goResults(finalizeRes);
        } catch (e) {
          goResults(null);
        }
      })();
    }
  }, [index, items.length, finishing, token, attemptId, router]);

  // tick per second for per-question timer
  useInterval(
    () => {
      setQRemaining((r) => {
        const next = r - 1;
        if (next <= 0) {
          // time’s up for this question → advance WITHOUT saving
          void advance(false);
          return 0;
        }
        return next;
      });
    },
    current ? 1000 : null
  );

  const goResults = useCallback(
    (finalizeRes: any | null) => {
      const answersAvailable = finalizeRes?.answersAvailable;

      // Derive safe primitives for routing params
      const score = Number(finalizeRes?.score ?? 0);
      const maxScore = Number(finalizeRes?.maxScore ?? 0);
      const scheduleId = finalizeRes?.scheduleId ?? "";

      router.replace({
        pathname: "/(main)/quiz/results",
        params: {
          attemptId,
          scheduleId,
          score: String(Number.isFinite(score) ? score : 0),
          maxScore: String(Number.isFinite(maxScore) ? maxScore : 0),
          quizName: spec.meta?.name ?? "Quiz Results",
          answerAvailable: String(!!answersAvailable),
        },
      });
    },
    [router, spec.meta?.name, attemptId]
  );

  const finalizeNow = useCallback(async () => {
    if (!token || finishing) return;
    setFinishing(true);
    try {
      let finalizeRes: any = null;
      if (token) {
        finalizeRes = await finishAttempt(token, attemptId).catch(() => null);
      }
      goResults(finalizeRes);
    } catch {
      goResults(null);
    }
  }, [token, attemptId, finishing, goResults]);

  const advance = useCallback(
    async (saveThisAnswer: boolean) => {
      if (transitioningRef.current) return;
      transitioningRef.current = true;

      try {
        // if we should persist the selection, save just this item’s answer
        if (saveThisAnswer && token && current && selected) {
          setSaving("saving");
          const delta: AnswersPayload = { [current.id]: [selected] };
          // merge locally for snappy UI (server also merges)
          setAnswers((prev) => ({ ...prev, ...delta }));
          await saveAnswers(token, attemptId, delta);
          setSaving("idle");
        }

        // move to next question or finalize
        if (isLast) {
          await finalizeNow();
        } else {
          setIndex((i) => i + 1);
        }
      } catch (e) {
        setSaving("error");
      } finally {
        transitioningRef.current = false;
      }
    },
    [token, attemptId, current, selected, isLast, finalizeNow]
  );

  const canInteract =
    !!current && !finishing && saving !== "saving" && qRemaining > 0;

  if (!current) {
    // waiting for finalize (all answered) or initial compute
    return (
      <View style={[styles.center, { flex: 1, backgroundColor: colors.bg1 }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const prevSaved = Array.isArray(answers[current.id])
    ? (answers[current.id] as string[])
    : [];
  const alreadyAnswered = prevSaved.length > 0;

  // Safety: if we somehow land on an already-answered question,
  // skip it immediately to keep "no back/forward" invariant.
  useEffect(() => {
    if (alreadyAnswered && !transitioningRef.current) {
      void advance(false);
    }
  }, [alreadyAnswered, advance]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg1 }}
      behavior={Platform.select({ ios: "padding", android: undefined })}
      keyboardVerticalOffset={Platform.select({ ios: 64, android: 0 })}
    >
      <View
        style={{
          flex: 1,
          paddingTop: insets.top,
          paddingBottom: Math.max(insets.bottom, 12),
          backgroundColor: colors.bg1,
        }}
      >
        {/* Header — just question counter and per-question timer */}
        <View style={[styles.header, { borderBottomColor: colors.bg2 }]}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Question {index + 1} / {items.length}
          </Text>
          <View style={styles.timerRow}>
            <Text style={[styles.timerLabel, { color: colors.textSecondary }]}>
              Time
            </Text>
            <Text style={[styles.timerClock, { color: colors.textPrimary }]}>
              {fmtClock(qRemaining)}
            </Text>
          </View>
        </View>

        {/* Body */}
        <View style={{ flex: 1 }}>
          {current.image?.url ? (
            <View style={styles.imageWrap}>
              <Image
                source={{ uri: current.image.url }}
                style={[styles.image, { backgroundColor: colors.bg3 }]}
                resizeMode="contain"
              />
            </View>
          ) : null}

          {current.text ? (
            <Text
              style={[
                styles.prompt,
                { color: colors.textPrimary, opacity: canInteract ? 1 : 0.6 },
              ]}
            >
              {current.text}
            </Text>
          ) : null}

          <View style={{ height: HALF_SCREEN }}>
            <FlatList
              data={current.options}
              keyExtractor={(o) => o.id}
              contentContainerStyle={{
                paddingHorizontal: 16,
                paddingBottom: 12,
              }}
              renderItem={({ item: o }) => {
                const isSelected = selected === o.id;
                return (
                  <Pressable
                    disabled={!canInteract}
                    onPress={() => setSelected(o.id)}
                    style={({ pressed }) => [
                      styles.option,
                      {
                        backgroundColor: isSelected
                          ? colors.primary
                          : colors.bg2,
                        opacity: pressed ? 0.92 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        { color: isSelected ? "#fff" : colors.textPrimary },
                      ]}
                    >
                      {o.text}
                    </Text>
                  </Pressable>
                );
              }}
            />
          </View>
        </View>

        {/* Footer: Confirm / Next */}
        <View style={[styles.footer, { borderTopColor: colors.bg2 }]}>
          <Text
            style={[
              styles.saveBadge,
              {
                color:
                  saving === "saving"
                    ? colors.textSecondary
                    : saving === "error"
                    ? colors.error
                    : colors.textSecondary,
              },
            ]}
          >
            {saving === "saving"
              ? "Saving…"
              : saving === "error"
              ? "Save failed"
              : " "}
          </Text>

          <Pressable
            disabled={!canInteract || !selected}
            onPress={() => advance(true)}
            style={({ pressed }) => [
              styles.primaryBtn,
              {
                backgroundColor: selected ? colors.primary : colors.bg3,
                opacity: pressed ? 0.9 : 1,
              },
            ]}
          >
            <Text style={styles.primaryBtnTxt}>
              {isLast ? "Confirm & Finish" : "Confirm"}
            </Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  header: {
    height: 64,
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontWeight: "700", fontSize: 16 },
  timerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  // theme-applied in-line for color
  timerLabel: { fontSize: 12, fontWeight: "600" },
  timerClock: { fontSize: 12, fontWeight: "700" },
  imageWrap: { paddingHorizontal: 16, paddingTop: 12 },
  image: {
    width: "100%",
    height: 200,
    borderRadius: 8,
  },
  prompt: {
    textAlign: "center",
    marginTop: 12,
    marginBottom: 12,
    fontSize: 15,
    fontWeight: "600",
  },
  option: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 10,
  },
  optionText: { fontSize: 15, fontWeight: "700" },
  footer: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  primaryBtn: {
    paddingHorizontal: 18,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 160,
  },
  primaryBtnTxt: { color: "#fff", fontWeight: "700", fontSize: 15 },
  saveBadge: { fontSize: 12 },
});
