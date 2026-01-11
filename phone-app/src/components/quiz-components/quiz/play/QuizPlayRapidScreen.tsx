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
import {
  QuizHeader,
  SaveStatusBadge,
  TimerBar,
} from "@/src/components/quiz-components/shared";
import { useInterval } from "@/src/hooks/useInterval";
import { normaliseInitialAnswers } from "@/src/lib/attempt-helpers";
import { navigateToQuizResults } from "@/src/lib/quiz-navigation";
import { getHalfScreenHeight } from "@/src/lib/ui-helpers";
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
  AppState,
  AppStateStatus,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
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

const HALF_SCREEN = getHalfScreenHeight();

function computeRapidResumeState(
  spec: RapidAttemptSpec,
  attempt?: AttemptDoc
): { initialIndex: number; initialQRemaining: number } {
  const items = spec.renderSpec.items ?? [];
  if (!items.length) {
    return { initialIndex: 0, initialQRemaining: 0 };
  }

  const startedAt = attempt?.startedAt ? new Date(attempt.startedAt) : null;

  if (!startedAt || Number.isNaN(startedAt.getTime())) {
    const firstLimit = Number(items[0]?.timeLimit ?? 0) || 0;
    return {
      initialIndex: 0,
      initialQRemaining: Math.max(0, firstLimit),
    };
  }

  const nowMs = Date.now();
  const elapsedSec = Math.max(
    0,
    Math.floor((nowMs - startedAt.getTime()) / 1000)
  );

  const limits = items.map((it) => Math.max(0, Number(it.timeLimit ?? 0) || 0));
  const total = limits.reduce((acc, v) => acc + v, 0);

  if (total <= 0) {
    return { initialIndex: 0, initialQRemaining: 0 };
  }

  if (elapsedSec >= total) {
    return { initialIndex: items.length, initialQRemaining: 0 };
  }

  let acc = 0;
  for (let i = 0; i < items.length; i++) {
    const dur = limits[i];
    const blockStart = acc;
    const blockEnd = acc + dur;
    if (elapsedSec < blockEnd) {
      const elapsedInThis = elapsedSec - blockStart;
      const remaining = Math.max(0, dur - elapsedInThis);
      return {
        initialIndex: i,
        initialQRemaining: remaining,
      };
    }
    acc = blockEnd;
  }

  return { initialIndex: items.length, initialQRemaining: 0 };
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

  // figure out where we "should" be in real time
  const { initialIndex, initialQRemaining } = useMemo(
    () => computeRapidResumeState(spec, attempt),
    [spec, attempt]
  );

  const [index, setIndex] = useState(initialIndex);
  const current = items[index];
  const isLast = index === items.length - 1;

  const [answers, setAnswers] = useState<AnswersPayload>(() =>
    normaliseInitialAnswers(attempt)
  );

  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState<"idle" | "saving" | "error">("idle");
  const [finishing, setFinishing] = useState(false);
  const transitioningRef = useRef(false);

  // PER-QUESTION TIMER
  const [qRemaining, setQRemaining] = useState<number>(() => initialQRemaining);

  const firstRenderRef = useRef(true);
  useEffect(() => {
    if (!current) return;

    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      setQRemaining(initialQRemaining);
    } else {
      const t = current.timeLimit ?? 0;
      setQRemaining(Math.max(0, Number.isFinite(t) ? t : 0));
    }
    setSelected(null);
  }, [index, current?.timeLimit, initialQRemaining]);

  // Fix "timer freezing" on background:
  // Rapid is per-question, but we still recompute based on startedAt → wall-clock.
  // Easiest: when app becomes active, recompute the resume state and jump + set qRemaining.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s: AppStateStatus) => {
      if (s !== "active") return;

      const { initialIndex: ri, initialQRemaining: rr } =
        computeRapidResumeState(spec, attempt);

      // If resume says quiz should already be over, jump past end and let finalize effect run.
      setIndex(ri);
      setQRemaining(rr);
      setSelected(null);
    });

    return () => sub.remove();
  }, [spec, attempt]);

  const goResults = useCallback(
    (finalizeRes: any | null) => {
      navigateToQuizResults(router, attemptId, spec, finalizeRes);
    },
    [router, spec, attemptId]
  );

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
        } catch {
          goResults(null);
        }
      })();
    }
  }, [index, items.length, finishing, token, attemptId, goResults]);

  const advance = useCallback(
    async (saveThisAnswer: boolean) => {
      if (transitioningRef.current) return;
      transitioningRef.current = true;

      try {
        if (saveThisAnswer && token && current && selected) {
          setSaving("saving");
          const delta: AnswersPayload = { [current.id]: [selected] };
          setAnswers((prev) => ({ ...prev, ...delta }));
          await saveAnswers(token, attemptId, delta);
          setSaving("idle");
        }

        if (isLast) {
          await finalizeNow();
        } else {
          setIndex((i) => i + 1);
        }
      } catch {
        setSaving("error");
      } finally {
        transitioningRef.current = false;
      }
    },
    [token, attemptId, current, selected, isLast]
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

  // tick per second for per-question timer
  useInterval(
    () => {
      setQRemaining((r) => {
        const next = r - 1;
        if (next <= 0) {
          // time's up → advance WITHOUT saving
          void advance(false);
          return 0;
        }
        return next;
      });
    },
    current && qRemaining > 0 ? 1000 : null
  );

  const canInteract =
    !!current && !finishing && saving !== "saving" && qRemaining > 0;

  if (!current) {
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

  useEffect(() => {
    if (alreadyAnswered && !transitioningRef.current) {
      void advance(false);
    }
  }, [alreadyAnswered, advance]);

  // timer percent for THIS question
  const qLimit = Math.max(0, Number(current?.timeLimit ?? 0) || 0);
  const pct = qLimit > 0 ? Math.max(0, Math.min(1, qRemaining / qLimit)) : null;
  const [promptViewportH, setPromptViewportH] = useState(0);
  const [promptContentH, setPromptContentH] = useState(0);
  const promptCentered =
    (promptViewportH > 0 &&
      promptContentH > 0 &&
      promptContentH <= promptViewportH) ||
    (!promptContentH && shouldCenterPrompt(current?.text, !!current?.image?.url));
  const promptFontSize = getPromptFontSize(current?.text);
  const promptLineHeight = Math.round(promptFontSize * 1.4);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg1 }}
      behavior={Platform.select({ ios: "padding", android: undefined })}
      keyboardVerticalOffset={Platform.select({ ios: 64, android: 0 })}
    >
      <View style={{ flex: 1, backgroundColor: colors.bg1 }}>
        {/* Header (title) */}
        <QuizHeader
          title={spec.meta?.name ?? "Rapid Quiz"}
          showBackButton
          onBack={() => router.back()}
          remaining={qRemaining}
          paddingTop={insets.top + 6}
        />

        {/* Timer bar (below title) */}
        <TimerBar percent={pct} />

        {/* Question count row (below timer bar) */}
        <View
          style={[
            styles.qRow,
            { borderBottomColor: colors.bg2, backgroundColor: colors.bg1 },
          ]}
        >
          <Text style={[styles.qCount, { color: colors.textPrimary }]}>
            {index + 1} / {items.length}
          </Text>
        </View>

        {/* Content + bottom dock layout */}
        <View
          style={[
            styles.body,
            {
              paddingBottom: Math.max(insets.bottom + 16, 28),
            },
          ]}
        >
          {/* Top (scrollable image+prompt) */}
          <View style={{ flex: 1 }}>
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{
                paddingHorizontal: 16,
                paddingTop: 12,
                paddingBottom: 12,
                minHeight: promptViewportH || undefined,
                justifyContent: promptCentered ? "center" : "flex-start",
                flexGrow: 1,
              }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
              indicatorStyle={Platform.OS === "ios" ? "white" : undefined}
              onLayout={(e) => setPromptViewportH(e.nativeEvent.layout.height)}
              onContentSizeChange={(_w, h) => setPromptContentH(h)}
            >
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
                    {
                      color: colors.textPrimary,
                      opacity: canInteract ? 1 : 0.6,
                      fontSize: promptFontSize,
                      lineHeight: promptLineHeight,
                    },
                  ]}
                >
                  {current.text}
                </Text>
              ) : null}
            </ScrollView>
          </View>

          {/* Bottom (options + CTA anchored to bottom) */}
          <View style={styles.bottomDock}>
            <View style={{ maxHeight: HALF_SCREEN }}>
              <FlatList
                data={current.options}
                keyExtractor={(o) => o.id}
                contentContainerStyle={{
                  paddingHorizontal: 16,
                  paddingBottom: 10,
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
                          borderColor: colors.bg3,
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

            {/* Footer row (save state + CTA) */}
            <View style={[styles.footerRow, { borderTopColor: colors.bg2 }]}>
              <SaveStatusBadge status={saving} />

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
                {finishing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnTxt}>
                    {isLast ? "Confirm & Finish" : "Confirm"}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },

  qRow: {
    marginTop: 10,
    paddingHorizontal: 12,
    paddingBottom: 10,
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  qCount: { fontWeight: "900", fontSize: 15 },

  body: {
    flex: 1,
    paddingTop: 10,
  },

  imageWrap: { marginBottom: 12 },
  image: {
    width: "100%",
    height: 200,
    borderRadius: 5,
  },

  prompt: {
    textAlign: "center",
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 23,
  },

  bottomDock: {
    paddingTop: 10,
  },

  option: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
  },
  optionText: { fontSize: 16, fontWeight: "900" },

  footerRow: {
    marginTop: 10,
    paddingTop: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
  },

  primaryBtn: {
    paddingHorizontal: 18,
    height: 42,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 160,
    flexDirection: "row",
    gap: 8,
  },
  primaryBtnTxt: { color: "#fff", fontWeight: "900", fontSize: 15 },
});

function getPromptFontSize(text?: string | null) {
  if (!text) return 20;
  const len = text.length;
  if (len < 20) return 40;
  if (len < 40) return 22;
  if (len < 80) return 20;
  if (len < 140) return 18;
  if (len < 220) return 16;
  if (len < 320) return 15;
  return 14;
}

function shouldCenterPrompt(text?: string | null, hasImage?: boolean) {
  if (hasImage) return false;
  if (!text) return true;
  return text.length <= 140;
}
