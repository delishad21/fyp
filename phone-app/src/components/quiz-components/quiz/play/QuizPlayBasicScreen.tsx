import {
  isBasic,
  type AnswersPayload,
  type AttemptDoc,
  type AttemptSpec,
  type BasicAttemptSpec,
} from "@/src/api/quiz-service";
import { useSession } from "@/src/auth/session";
import { useDebouncedSave } from "@/src/hooks/useDebouncedSave";
import { useKeyboardHeight } from "@/src/hooks/useKeyboardHeight";
import { useLatest } from "@/src/hooks/useLatest";
import { useQuizFinish } from "@/src/hooks/useQuizFinish";
import { useQuizTimer } from "@/src/hooks/useQuizTimer";
import { normaliseInitialAnswers } from "@/src/lib/attempt-helpers";
import { hexToRgba, isDarkHex } from "@/src/lib/color-utils";
import { navigateToQuizResults } from "@/src/lib/quiz-navigation";
import { getHalfScreenHeight } from "@/src/lib/ui-helpers";
import { useTheme } from "@/src/theme";
import { LinearGradient } from "expo-linear-gradient";
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
  Image,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Iconify } from "react-native-iconify";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  QuizActionButton,
  QuizHeader,
  SaveStatusBadge,
  TimerBar,
} from "../../shared";

type Props = {
  attemptId: string;
  spec: AttemptSpec;
  attempt?: AttemptDoc;
};

const HALF_SCREEN = getHalfScreenHeight();

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
      <View style={[styles.center, { flex: 1, backgroundColor: colors.bg1 }]}>
        <Text style={{ color: colors.textPrimary }}>
          Wrong screen for this quiz type.
        </Text>
      </View>
    );
  }

  // Include context in question count (no filtering)
  const items = useMemo(() => spec.renderSpec.items ?? [], [spec]);
  const [index, setIndex] = useState(0);

  // ANSWERS STATE
  const [answers, setAnswers] = useState<AnswersPayload>(() =>
    normaliseInitialAnswers(attempt),
  );
  const answersRef = useLatest(answers);

  const current = items[index] as any;
  const isLast = index === items.length - 1;

  // TIMER - using extracted hook
  const { remaining, percent } = useQuizTimer(
    spec.renderSpec.totalTimeLimit,
    attempt,
  );

  // SAVE - using extracted hook
  const { saving, scheduleDebouncedSave, flushSaves, enqueueSave } =
    useDebouncedSave(attemptId, token, () => answersRef.current, 500);
  const pendingSaveRef = useRef(false);
  const openInputRef = useRef<TextInput | null>(null);

  // FINISH - using extracted hook
  const saveNow = useCallback(async () => {
    if (pendingSaveRef.current) {
      pendingSaveRef.current = false;
      await flushSaves();
      return;
    }
    await enqueueSave();
  }, [enqueueSave, flushSaves]);

  const { finishing, finishNow } = useQuizFinish(
    attemptId,
    token,
    (finalizeRes) =>
      navigateToQuizResults(router, attemptId, spec, finalizeRes),
    saveNow,
    remaining === 0,
  );

  const ensureOpenInputCommitted = useCallback(async () => {
    if (current?.kind !== "open") return;
    openInputRef.current?.blur();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }, [current?.kind]);

  // Initialize list answers when navigating to a list question
  useEffect(() => {
    if (current?.kind === "open" && current?.answerType === "list") {
      const existing = answersRef.current[current.id];
      if (!Array.isArray(existing)) {
        // Initialize with the expected number of empty inputs
        const expectedCount = current.minCorrectItems || 1;
        const initialList = Array(expectedCount).fill("");
        const next = { ...answersRef.current, [current.id]: initialList };
        answersRef.current = next;
        setAnswers(next);
      }
    }
  }, [
    current?.id,
    current?.kind,
    current?.answerType,
    current?.minCorrectItems,
  ]);

  const goTo = useCallback(
    async (nextIndex: number) => {
      await ensureOpenInputCommitted();
      await saveNow();
      setIndex(nextIndex);

      // reset scroll affordance state when changing item
      setPromptViewportH(0);
      setPromptContentH(0);
      setPromptScrolledY(0);
    },
    [ensureOpenInputCommitted, saveNow],
  );

  const goPrev = useCallback(() => {
    if (index > 0) void goTo(index - 1);
  }, [index, goTo]);

  const goNext = useCallback(() => {
    if (index < items.length - 1) void goTo(index + 1);
  }, [index, items.length, goTo]);

  // ANSWER UPDATERS
  const toggleMC = useCallback(
    (itemId: string, optionId: string, multiSelect?: boolean) => {
      const curr = answersRef.current[itemId];
      const currArr = Array.isArray(curr) ? (curr as string[]) : [];

      let nextSel: string[];
      if (multiSelect) {
        if (currArr.includes(optionId)) {
          nextSel = currArr.filter((id) => id !== optionId);
        } else {
          nextSel = [...currArr, optionId];
        }
      } else {
        nextSel = [optionId];
      }

      const next = { ...answersRef.current, [itemId]: nextSel };
      answersRef.current = next;
      setAnswers(next);
      void enqueueSave();
    },
    [enqueueSave],
  );

  const setOpen = useCallback(
    (itemId: string, text: string) => {
      const next = { ...answersRef.current, [itemId]: text };
      answersRef.current = next;
      setAnswers(next);
      scheduleDebouncedSave();
      pendingSaveRef.current = true;
    },
    [scheduleDebouncedSave],
  );

  const setListItem = useCallback(
    (itemId: string, index: number, text: string) => {
      const currList = Array.isArray(answersRef.current[itemId])
        ? (answersRef.current[itemId] as string[])
        : [];
      const newList = [...currList];
      newList[index] = text;
      const next = { ...answersRef.current, [itemId]: newList };
      answersRef.current = next;
      setAnswers(next);
      scheduleDebouncedSave();
      pendingSaveRef.current = true;
    },
    [scheduleDebouncedSave],
  );

  const addListItem = useCallback(
    (itemId: string) => {
      const currList = Array.isArray(answersRef.current[itemId])
        ? (answersRef.current[itemId] as string[])
        : [];
      if (currList.length >= 10) return; // max 10 items
      const newList = [...currList, ""];
      const next = { ...answersRef.current, [itemId]: newList };
      answersRef.current = next;
      setAnswers(next);
      scheduleDebouncedSave();
      pendingSaveRef.current = true;
    },
    [scheduleDebouncedSave],
  );

  const removeListItem = useCallback(
    (itemId: string, index: number) => {
      const currList = Array.isArray(answersRef.current[itemId])
        ? (answersRef.current[itemId] as string[])
        : [];
      if (currList.length <= 1) return; // keep at least 1
      const newList = currList.filter((_, i) => i !== index);
      const next = { ...answersRef.current, [itemId]: newList };
      answersRef.current = next;
      setAnswers(next);
      scheduleDebouncedSave();
      pendingSaveRef.current = true;
    },
    [scheduleDebouncedSave],
  );

  const saveOnBlur = useCallback(async () => {
    await saveNow();
  }, [saveNow]);

  const canInteract =
    (remaining === null || remaining > 0) && !finishing && saving !== "saving";

  const keyboardH = useKeyboardHeight();

  if (!current) {
    return (
      <View style={[styles.center, { flex: 1, backgroundColor: colors.bg1 }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const mcSelected = Array.isArray(answers[current.id])
    ? (answers[current.id] as string[])
    : [];

  const isMRQ =
    current?.kind === "mc" ? Boolean(current?.multiSelect ?? false) : false;

  // ===== Scroll affordance state (for BOTH question + context pages) =====
  const [promptViewportH, setPromptViewportH] = useState(0);
  const [promptContentH, setPromptContentH] = useState(0);
  const [promptScrolledY, setPromptScrolledY] = useState(0);

  const promptCanScroll =
    promptViewportH > 0 && promptContentH > promptViewportH + 8;
  const promptCentered =
    (promptViewportH > 0 &&
      promptContentH > 0 &&
      promptContentH <= promptViewportH) ||
    (!promptContentH && shouldCenterPrompt(current.text, !!current.image?.url));

  const onPromptLayout = (e: LayoutChangeEvent) => {
    setPromptViewportH(e.nativeEvent.layout.height);
  };

  const onPromptContentSizeChange = (_w: number, h: number) => {
    setPromptContentH(h);
  };

  const onPromptScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y ?? 0;
    setPromptScrolledY(y);
  };

  const indicatorStyle = isDarkHex(colors.bg1) ? "white" : "black";

  // Gradient colors derived from bg1 so it matches theme
  const fadeTop = [
    hexToRgba(colors.bg1, 1),
    hexToRgba(colors.bg1, 0.0),
  ] as const;
  const fadeBottom = [
    hexToRgba(colors.bg1, 0.0),
    hexToRgba(colors.bg1, 1),
  ] as const;

  const promptFontSize = getPromptFontSize(current.text);
  const promptLineHeight = Math.round(promptFontSize * 1.4);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg1 }}
      behavior={Platform.select({ ios: "padding", android: undefined })}
      keyboardVerticalOffset={Platform.select({ ios: 64, android: 0 })}
    >
      <View style={{ flex: 1, backgroundColor: colors.bg1 }}>
        {/* ===== Header (using extracted component) ===== */}
        <QuizHeader
          title={spec.meta?.name ?? "Quiz"}
          remaining={remaining}
          paddingTop={insets.top + 6}
        />

        {/* ===== Timer bar (using extracted component) ===== */}
        <TimerBar percent={percent} />

        {/* ===== Nav row (below timer bar) ===== */}
        <View
          style={[
            styles.navRow,
            { borderBottomColor: colors.bg2, backgroundColor: colors.bg1 },
          ]}
        >
          <Pressable
            onPress={goPrev}
            disabled={index === 0 || !canInteract}
            style={({ pressed }) => [
              styles.navBtn,
              {
                backgroundColor: colors.bg2,
                borderColor: colors.bg3,
                opacity: pressed ? 0.85 : index === 0 || !canInteract ? 0.5 : 1,
              },
            ]}
          >
            <Iconify icon="mingcute:left-line" size={21} color={colors.icon} />
          </Pressable>

          <Text style={[styles.qCount, { color: colors.textPrimary }]}>
            {index + 1} / {items.length}
          </Text>

          <Pressable
            onPress={goNext}
            disabled={isLast || !canInteract}
            style={({ pressed }) => [
              styles.navBtn,
              {
                backgroundColor: colors.bg2,
                borderColor: colors.bg3,
                opacity: pressed ? 0.85 : isLast || !canInteract ? 0.5 : 1,
              },
            ]}
          >
            <Iconify icon="mingcute:right-line" size={21} color={colors.icon} />
          </Pressable>
        </View>

        {/* ===== Content + bottom dock layout ===== */}
        <View
          style={[
            styles.body,
            {
              paddingBottom: Math.max(insets.bottom + 16, 28),
            },
          ]}
        >
          {/* Top (scrollable image + prompt together) */}
          <View style={{ flex: 1 }}>
            <View style={{ flex: 1 }}>
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{
                  paddingHorizontal: 16,
                  paddingTop: 12,
                  paddingBottom: 18,
                  gap: 12,
                  minHeight: promptViewportH || undefined,
                  justifyContent: promptCentered ? "center" : "flex-start",
                  flexGrow: 1,
                }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator
                persistentScrollbar={Platform.OS === "android"}
                indicatorStyle={indicatorStyle as any}
                scrollIndicatorInsets={{ right: 2 }}
                onLayout={onPromptLayout}
                onContentSizeChange={onPromptContentSizeChange}
                onScroll={onPromptScroll}
                scrollEventThrottle={16}
              >
                {current.image?.url ? (
                  <Image
                    source={{ uri: current.image.url }}
                    style={[styles.image, { backgroundColor: colors.bg3 }]}
                    resizeMode="contain"
                  />
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

              {/* ✅ Real gradient fades (makes scrollability obvious) */}
              {promptCanScroll ? (
                <>
                  {promptScrolledY > 6 ? (
                    <LinearGradient
                      pointerEvents="none"
                      colors={fadeTop as any}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 0, y: 1 }}
                      style={styles.fadeTop}
                    />
                  ) : null}

                  <LinearGradient
                    pointerEvents="none"
                    colors={fadeBottom as any}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={styles.fadeBottom}
                  />

                  {/* optional nudge hint before first scroll */}
                  {promptScrolledY < 4 ? (
                    <View pointerEvents="none" style={styles.scrollHintWrap}>
                      <View
                        style={[
                          styles.scrollHintPill,
                          {
                            backgroundColor: colors.bg2,
                            borderColor: colors.bg3,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.scrollHintText,
                            { color: colors.textSecondary },
                          ]}
                        >
                          Scroll
                        </Text>
                        <Iconify
                          icon="mingcute:down-line"
                          size={18}
                          color={colors.textSecondary}
                        />
                      </View>
                    </View>
                  ) : null}
                </>
              ) : null}
            </View>
          </View>

          {/* Bottom (options + CTA anchored to bottom) */}
          <View style={styles.bottomDock}>
            {current.kind === "mc" ? (
              <View style={{ maxHeight: HALF_SCREEN }}>
                {isMRQ ? (
                  <Text
                    style={[styles.mrqNote, { color: colors.textSecondary }]}
                  >
                    Select all that apply
                  </Text>
                ) : null}

                {/* Using custom OptionsList would go here, but keeping inline for now to preserve exact behavior */}
                <ScrollView
                  contentContainerStyle={{
                    paddingHorizontal: 16,
                    paddingBottom: 10,
                  }}
                >
                  {current.options.map((o: any) => {
                    const selected = mcSelected.includes(o.id);
                    return (
                      <Pressable
                        key={o.id}
                        disabled={!canInteract}
                        onPress={() => toggleMC(current.id, o.id, isMRQ)}
                        style={({ pressed }) => [
                          styles.option,
                          {
                            backgroundColor: selected
                              ? colors.primary
                              : colors.bg2,
                            borderColor: colors.bg3,
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
                  })}
                </ScrollView>
              </View>
            ) : current.kind === "open" ? (
              <View style={{ paddingHorizontal: 12, paddingTop: 6 }}>
                {(() => {
                  const answerType = current.answerType || "exact";
                  const isList = answerType === "list";

                  if (isList) {
                    // List mode: multiple inputs
                    // Initialize with expected number of inputs based on minCorrectItems
                    const expectedCount = current.minCorrectItems || 1;
                    const existingAnswers = Array.isArray(answers[current.id])
                      ? (answers[current.id] as string[])
                      : null;

                    const listAnswers =
                      existingAnswers || Array(expectedCount).fill("");

                    return (
                      <>
                        <View
                          style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: 8,
                          }}
                        >
                          <Text
                            style={[
                              styles.openTitle,
                              { color: colors.textSecondary },
                            ]}
                          >
                            Your Answers{" "}
                            {current.requireOrder ? "(Order Matters)" : ""}
                          </Text>
                          {listAnswers.length < 10 && (
                            <Pressable
                              onPress={() => addListItem(current.id)}
                              disabled={!canInteract}
                              style={({ pressed }) => [
                                {
                                  backgroundColor: colors.primary,
                                  paddingHorizontal: 12,
                                  paddingVertical: 6,
                                  borderRadius: 5,
                                  opacity: pressed ? 0.8 : 1,
                                },
                              ]}
                            >
                              <Text
                                style={{
                                  color: "#fff",
                                  fontSize: 13,
                                  fontWeight: "600",
                                }}
                              >
                                + Add Item
                              </Text>
                            </Pressable>
                          )}
                        </View>

                        <ScrollView style={{ maxHeight: HALF_SCREEN - 60 }}>
                          {listAnswers.map((item, idx) => (
                            <View key={idx} style={{ marginBottom: 10 }}>
                              <View
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  gap: 8,
                                }}
                              >
                                <View style={{ flex: 1 }}>
                                  <TextInput
                                    editable={canInteract}
                                    placeholder={`Item ${idx + 1}`}
                                    placeholderTextColor={colors.textSecondary}
                                    value={item}
                                    onChangeText={(t) =>
                                      setListItem(current.id, idx, t)
                                    }
                                    onBlur={saveOnBlur}
                                    style={[
                                      styles.input,
                                      {
                                        borderColor: colors.primary,
                                        color: colors.textPrimary,
                                        backgroundColor: colors.bg1,
                                      },
                                    ]}
                                    returnKeyType="done"
                                    blurOnSubmit
                                  />
                                </View>

                                {listAnswers.length > 1 && (
                                  <Pressable
                                    onPress={() =>
                                      removeListItem(current.id, idx)
                                    }
                                    disabled={!canInteract}
                                    style={({ pressed }) => [
                                      {
                                        backgroundColor: colors.bg2,
                                        padding: 10,
                                        borderRadius: 5,
                                        opacity: pressed ? 0.7 : 1,
                                      },
                                    ]}
                                  >
                                    <Iconify
                                      icon="mingcute:delete-2-line"
                                      size={20}
                                      color={colors.textSecondary}
                                    />
                                  </Pressable>
                                )}
                              </View>
                            </View>
                          ))}
                        </ScrollView>

                        {Platform.OS === "android" ? (
                          <View style={{ height: keyboardH }} />
                        ) : null}
                      </>
                    );
                  } else {
                    // Normal single input for exact/fuzzy/keywords
                    return (
                      <>
                        <Text
                          style={[
                            styles.openTitle,
                            { color: colors.textSecondary },
                          ]}
                        >
                          Your Answer
                          {answerType === "keywords" && current.minKeywords
                            ? ` (At least ${current.minKeywords} keywords)`
                            : ""}
                        </Text>
                        <TextInput
                          ref={openInputRef}
                          editable={canInteract}
                          placeholder="Type Here..."
                          placeholderTextColor={colors.textSecondary}
                          value={
                            typeof answers[current.id] === "string"
                              ? (answers[current.id] as string)
                              : ""
                          }
                          onChangeText={(t) => setOpen(current.id, t)}
                          onBlur={saveOnBlur}
                          onEndEditing={(e) => {
                            setOpen(current.id, e.nativeEvent.text ?? "");
                            void saveOnBlur();
                          }}
                          style={[
                            styles.input,
                            {
                              borderColor: colors.primary,
                              color: colors.textPrimary,
                              backgroundColor: colors.bg1,
                            },
                          ]}
                          returnKeyType="done"
                          blurOnSubmit
                        />
                        {Platform.OS === "android" ? (
                          <View style={{ height: keyboardH }} />
                        ) : null}
                      </>
                    );
                  }
                })()}
              </View>
            ) : null}

            {/* Footer row (save state + CTA using extracted components) */}
            <View style={[styles.footerRow, { borderTopColor: colors.bg2 }]}>
              <SaveStatusBadge status={saving} />

              <QuizActionButton
                label={isLast ? "Finish" : "Next"}
                onPress={async () => {
                  if (isLast && !finishing) {
                    await ensureOpenInputCommitted();
                    await enqueueSave();
                    await finishNow();
                  } else {
                    await goNext();
                  }
                }}
                disabled={!canInteract}
                loading={finishing}
              />
            </View>

            {/* extra breathing room below CTA */}
            <View style={{ height: 10 }} />
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },

  navRow: {
    marginTop: 10,
    paddingHorizontal: 12,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  navBtn: {
    height: 42,
    width: 42,
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  qCount: { fontWeight: "900", fontSize: 15 },

  body: {
    flex: 1,
    paddingTop: 10,
  },

  image: {
    width: "100%",
    height: 220,
    borderRadius: 5,
  },

  prompt: {
    textAlign: "center",
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 23,
  },

  // gradient fades
  fadeTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 26,
  },
  fadeBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 34,
  },

  scrollHintWrap: {
    position: "absolute",
    bottom: 10,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  scrollHintPill: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  scrollHintText: { fontSize: 14, fontWeight: "900" },

  bottomDock: {
    paddingTop: 10,
  },

  mrqNote: {
    paddingHorizontal: 16,
    marginBottom: 6,
    fontSize: 14,
    fontWeight: "800",
  },

  option: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
  },
  optionText: { fontSize: 16, fontWeight: "900" },

  input: {
    height: 44,
    borderWidth: 2,
    borderRadius: 5,
    paddingHorizontal: 12,
    fontSize: 17,
    fontWeight: "800",
  },
  openTitle: {
    marginBottom: 6,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.4,
  },

  footerRow: {
    marginTop: 10,
    paddingTop: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
  },
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
