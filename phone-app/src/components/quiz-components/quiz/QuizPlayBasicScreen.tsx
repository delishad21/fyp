import {
  finishAttempt,
  isBasic,
  saveAnswers,
  type AnswersPayload,
  type AttemptDoc,
  type AttemptSpec,
  type BasicAttemptSpec,
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
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  attemptId: string;
  spec: AttemptSpec;
  attempt?: AttemptDoc;
};

// simple interval hook
function useInterval(cb: () => void, delayMs: number | null) {
  const cbRef = useRef(cb);
  useEffect(() => {
    cbRef.current = cb;
  }, [cb]);
  useEffect(() => {
    if (delayMs === null) return;
    const id = setInterval(() => cbRef.current(), delayMs);
    return () => clearInterval(id);
  }, [delayMs]);
}

const HALF_SCREEN = Math.round(Dimensions.get("window").height * 0.45);

// small helper to keep latest value in a ref
function useLatest<T>(value: T) {
  const r = useRef(value);
  useEffect(() => {
    r.current = value;
  }, [value]);
  return r;
}

function useKeyboardHeight() {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showEvt =
      Platform.OS === "android" ? "keyboardDidShow" : "keyboardWillShow";
    const hideEvt =
      Platform.OS === "android" ? "keyboardDidHide" : "keyboardWillHide";

    const onShow = (e: any) => setHeight(e?.endCoordinates?.height ?? 0);
    const onHide = () => setHeight(0);

    const subShow = Keyboard.addListener(showEvt, onShow);
    const subHide = Keyboard.addListener(hideEvt, onHide);
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);

  return height;
}

export default function QuizPlayBasicScreen({
  attemptId,
  spec: rawSpec,
  attempt,
}: Props) {
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const token = useSession((s) => s.token());

  const spec = rawSpec as BasicAttemptSpec;
  if (!isBasic(spec)) {
    return (
      <View style={[styles.center, { flex: 1 }]}>
        <Text>Wrong screen for this quiz type.</Text>
      </View>
    );
  }

  const items = useMemo(() => spec.renderSpec.items ?? [], [spec]);
  const [index, setIndex] = useState(0);

  // ANSWERS STATE
  const [answers, setAnswers] = useState<AnswersPayload>(() =>
    normaliseInitialAnswers(attempt)
  );
  const answersRef = useLatest(answers);

  const [attemptVersion, setAttemptVersion] = useState<number | undefined>(
    attempt?.attemptVersion
  );

  const [saving, setSaving] = useState<"idle" | "saving" | "error">("idle");
  const [finishing, setFinishing] = useState(false); // prevent double-finish
  // serialize saves to avoid overlap
  const saveQueueRef = useRef<Promise<any>>(Promise.resolve());

  const current = items[index] as any;
  const isLast = index === items.length - 1;

  // TIMER (global)
  const totalLimit = spec.renderSpec.totalTimeLimit; // seconds | null

  // compute remaining from startedAt if present, else full limit
  const [remaining, setRemaining] = useState<number | null>(() => {
    if (typeof totalLimit === "number" && totalLimit > 0) {
      const startedMs = attempt?.startedAt
        ? new Date(attempt.startedAt).getTime()
        : Date.now();
      const elapsedSec = attempt?.startedAt
        ? Math.floor((Date.now() - startedMs) / 1000)
        : 0;
      return Math.max(0, totalLimit - elapsedSec);
    }
    return null;
  });

  useInterval(
    () => {
      setRemaining((r) => {
        if (r === null) return null;
        const next = r - 1;
        return next >= 0 ? next : 0;
      });
    },
    remaining === null || remaining <= 0 ? null : 1000
  );

  // ----- RESULTS NAV helper -----
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

  // ----- SAVE HELPERS -----

  // core save that pulls the freshest answers from ref and never sends attemptVersion
  const doSaveNow = useCallback(async () => {
    if (!token) return;
    const snapshot = answersRef.current;
    const res = await saveAnswers(token, attemptId, snapshot /* no version */);
    setAttemptVersion(res.attemptVersion);
  }, [token, attemptId, answersRef]);

  // queue saves so they don't race
  const enqueueSave = useCallback(async () => {
    setSaving("saving");
    saveQueueRef.current = saveQueueRef.current
      .then(doSaveNow)
      .then(() => setSaving("idle"))
      .catch(() => setSaving("error"));
    try {
      await saveQueueRef.current;
    } catch {
      // UI already shows "Save failed"
    }
  }, [doSaveNow]);

  // debounced saving (500ms) — used for MC taps only
  type TimeoutHandle = ReturnType<typeof setTimeout>;
  const debounceTimerRef = useRef<TimeoutHandle | null>(null);

  const scheduleDebouncedSave = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    debounceTimerRef.current = setTimeout(() => {
      enqueueSave();
    }, 500);
  }, [enqueueSave]);

  // flush any pending debounce and wait for queued saves
  const flushSaves = useCallback(async () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
      await enqueueSave();
    } else {
      await saveQueueRef.current.catch(() => {});
    }
  }, [enqueueSave]);

  // Auto-save on timeout, then finish and go to results
  useEffect(() => {
    if (remaining === 0 && !finishing) {
      setFinishing(true);
      (async () => {
        try {
          await flushSaves();
          let finalizeRes: any = null;
          if (token) {
            finalizeRes = await finishAttempt(token, attemptId).catch(
              () => null
            );
          }
          goResults(finalizeRes);
        } catch {
          goResults(null);
        }
      })();
    }
  }, [remaining, finishing, flushSaves, token, attemptId, goResults]);

  // Save when changing questions: flush any pending debounce first
  const goTo = useCallback(
    async (nextIndex: number) => {
      await flushSaves(); // save current answers before moving
      setIndex(nextIndex);
    },
    [flushSaves]
  );

  const goPrev = useCallback(() => {
    if (index > 0) void goTo(index - 1);
  }, [index, goTo]);

  const goNext = useCallback(() => {
    if (index < items.length - 1) void goTo(index + 1);
  }, [index, items.length, goTo]);

  // Save on unmount (best effort) and clear debounce
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      void flushSaves();
    };
  }, [flushSaves]);

  // ANSWER UPDATERS
  const toggleMC = useCallback(
    (itemId: string, optionId: string, multiSelect?: boolean) => {
      setAnswers((prev) => {
        const curr = prev[itemId];
        const currArr = Array.isArray(curr) ? (curr as string[]) : [];

        let nextSel: string[];
        if (multiSelect) {
          // MRQ: toggle membership
          if (currArr.includes(optionId)) {
            nextSel = currArr.filter((id) => id !== optionId);
          } else {
            nextSel = [...currArr, optionId];
          }
        } else {
          // MCQ: single select
          nextSel = [optionId];
        }

        return { ...prev, [itemId]: nextSel };
      });
      scheduleDebouncedSave();
    },
    [scheduleDebouncedSave]
  );

  // Open answers: update local state only — DO NOT save while typing
  const setOpen = useCallback((itemId: string, text: string) => {
    setAnswers((prev) => {
      const next = { ...prev, [itemId]: text };
      return next;
    });
  }, []);

  // Save open answer when the field blurs / user presses "done"
  const saveOnBlur = useCallback(async () => {
    await enqueueSave();
  }, [enqueueSave]);

  const canInteract =
    (remaining === null || remaining > 0) && !finishing && saving !== "saving";

  const keyboardH = useKeyboardHeight();

  if (!current) {
    return (
      <View style={[styles.center, { flex: 1 }]}>
        <ActivityIndicator />
      </View>
    );
  }

  const mcSelected = Array.isArray(answers[current.id])
    ? (answers[current.id] as string[])
    : [];

  const isMRQ =
    current?.kind === "mc" ? Boolean(current?.multiSelect ?? false) : false;
  console.log("Rendering item", index, "MRQ=", isMRQ);

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
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.bg2 }]}>
          <Pressable
            onPress={goPrev}
            disabled={index === 0 || !canInteract}
            style={styles.navBtn}
          >
            <Text
              style={[styles.navBtnTxt, { color: colors.icon }]}
              accessibilityLabel="Previous question"
            >
              ◀︎
            </Text>
          </Pressable>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Question {index + 1} / {items.length}
          </Text>
          <Pressable
            onPress={goNext}
            disabled={isLast || !canInteract}
            style={styles.navBtn}
          >
            <Text
              style={[styles.navBtnTxt, { color: colors.icon }]}
              accessibilityLabel="Next question"
            >
              ▶︎
            </Text>
          </Pressable>
        </View>

        {/* Timer */}
        {remaining !== null && (
          <View style={styles.timerWrap}>
            <View style={styles.timerRow}>
              <Text
                style={[styles.timerLabel, { color: colors.textSecondary }]}
              >
                Time
              </Text>
              <Text style={[styles.timerClock, { color: colors.textPrimary }]}>
                {fmtClock(remaining)}
              </Text>
            </View>
            <View style={[styles.timerBar, { backgroundColor: colors.bg2 }]}>
              <View
                style={[
                  styles.timerFill,
                  {
                    width: `${
                      Math.max(0, Math.min(1, remaining / (totalLimit || 1))) *
                      100
                    }%`,
                    backgroundColor: colors.primary,
                  },
                ]}
              />
            </View>
          </View>
        )}

        {/* Body */}
        <View style={{ flex: 1 }}>
          {current.image?.url ? (
            <View style={styles.imageWrap}>
              <Image
                source={{ uri: current.image.url }}
                style={[
                  styles.image,
                  { backgroundColor: colors.bg3 }, // theme-based placeholder bg
                ]}
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

          {current.kind === "mc" ? (
            <View style={{ height: HALF_SCREEN }}>
              {/* MRQ note */}
              {isMRQ && (
                <Text
                  style={{
                    paddingHorizontal: 16,
                    marginBottom: 6,
                    color: colors.textSecondary,
                    fontSize: 12,
                    fontWeight: "700",
                  }}
                >
                  Select all that apply
                </Text>
              )}

              <FlatList
                data={current.options}
                keyExtractor={(o) => o.id}
                contentContainerStyle={{
                  paddingHorizontal: 16,
                  paddingBottom: 12,
                }}
                renderItem={({ item: o }) => {
                  const selected = mcSelected.includes(o.id);
                  return (
                    <Pressable
                      disabled={!canInteract}
                      onPress={() =>
                        toggleMC(current.id, o.id, /* multi */ isMRQ)
                      }
                      style={({ pressed }) => [
                        styles.option,
                        {
                          backgroundColor: selected
                            ? colors.primary
                            : colors.bg2,
                          opacity: pressed ? 0.9 : 1,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.optionText,
                          { color: selected ? "#fff" : colors.textPrimary },
                        ]}
                      >
                        {o.text}
                      </Text>
                    </Pressable>
                  );
                }}
              />
            </View>
          ) : current.kind === "open" ? (
            <View style={{ flex: 1 }} />
          ) : (
            <ScrollView
              contentContainerStyle={{
                paddingHorizontal: 16,
                paddingBottom: 16,
              }}
              style={{ flex: 1 }}
            />
          )}
        </View>

        {/* Open answer dock */}
        {current.kind === "open" && (
          <View
            style={[
              styles.openWrap,
              {
                backgroundColor: colors.bg1,
                // Lift the input above the keyboard on Android
                marginBottom: Platform.OS === "android" ? keyboardH : 0,
              },
            ]}
          >
            <TextInput
              editable={canInteract}
              placeholder="Type Here..."
              placeholderTextColor={colors.textSecondary}
              value={
                typeof answers[current.id] === "string"
                  ? (answers[current.id] as string)
                  : ""
              }
              onChangeText={(t) => setOpen(current.id, t)}
              // Save only when user stops focusing / hits "done"
              onBlur={saveOnBlur}
              onEndEditing={saveOnBlur}
              style={[
                styles.input,
                {
                  borderColor: colors.bg2,
                  color: colors.textPrimary,
                },
              ]}
              returnKeyType="done"
              blurOnSubmit
            />
          </View>
        )}

        {/* Footer */}
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
              : "Saved"}
          </Text>

          <Pressable
            disabled={!canInteract}
            onPress={async () => {
              if (isLast && !finishing) {
                setFinishing(true);
                try {
                  await flushSaves();
                  let finalizeRes: any = null;
                  if (token) {
                    finalizeRes = await finishAttempt(token, attemptId).catch(
                      () => null
                    );
                  }
                  goResults(finalizeRes);
                } catch {
                  goResults(null);
                }
              } else {
                await goNext();
              }
            }}
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: colors.primary, opacity: pressed ? 0.9 : 1 },
            ]}
          >
            <Text style={styles.primaryBtnTxt}>
              {isLast ? "Finish" : "Next"}
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
    height: 52,
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  navBtn: {
    height: 36,
    width: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  navBtnTxt: { fontSize: 18 },
  title: { fontWeight: "700", fontSize: 16 },
  timerWrap: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6 },
  timerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  timerLabel: { fontSize: 12, fontWeight: "600" },
  timerClock: { fontSize: 12, fontWeight: "700" },
  timerBar: { height: 8, borderRadius: 999, overflow: "hidden" },
  timerFill: { height: "100%" },
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
  openWrap: { paddingHorizontal: 12, paddingTop: 6 },
  input: {
    height: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 16,
  },
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
    minWidth: 120,
  },
  primaryBtnTxt: { color: "#fff", fontWeight: "700", fontSize: 15 },
  saveBadge: { fontSize: 12 },
});
