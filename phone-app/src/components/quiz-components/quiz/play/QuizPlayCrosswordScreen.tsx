import {
  isCrossword,
  type AnswersPayload,
  type AttemptDoc,
  type AttemptSpec,
  type CrosswordAttemptSpec,
} from "@/src/api/quiz-service";
import { useSession } from "@/src/auth/session";
import {
  buildBlockedSet,
  CELL,
  clamp,
  computeInitialGridTransform,
  Entry,
  MAX_SCALE,
  MIN_SCALE,
  TAP_SLOP,
  touchCentroid,
  touchDistance,
} from "@/src/lib/attempt-helpers";
import { navigateToQuizResults } from "@/src/lib/quiz-navigation";
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
  Animated,
  Keyboard,
  LayoutChangeEvent,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Iconify } from "react-native-iconify";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLatest } from "@/src/hooks/useLatest";
import { useKeyboardHeight } from "@/src/hooks/useKeyboardHeight";
import { useDebouncedSave } from "@/src/hooks/useDebouncedSave";
import { useQuizTimer } from "@/src/hooks/useQuizTimer";
import { useQuizFinish } from "@/src/hooks/useQuizFinish";
import {
  QuizHeader,
  TimerBar,
  SaveStatusBadge,
} from "@/src/components/quiz-components/shared";

/** ====== types & helpers ====== */
type Props = {
  attemptId: string;
  spec: AttemptSpec;
  attempt?: AttemptDoc;
};

/** ====== component ====== */
export default function QuizPlayCrosswordScreen({
  attemptId,
  spec: rawSpec,
  attempt,
}: Props) {
  const panSpeed = Platform.OS === "web" ? 2 : 1;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const token = useSession((s) => s.token());

  // ----- validate spec -----
  const spec = rawSpec as CrosswordAttemptSpec;
  if (!isCrossword(spec)) {
    return (
      <View style={[styles.center, { flex: 1, backgroundColor: colors.bg1 }]}>
        <Text style={{ color: colors.textPrimary }}>
          Wrong screen for this quiz type.
        </Text>
      </View>
    );
  }

  const crossword = spec.renderSpec.items[0];
  const rows = crossword.grid.length;
  const cols = crossword.grid[0]?.length ?? 0;

  // ====== blocked cells set ======
  const blocked = useMemo(
    () => buildBlockedSet(crossword.grid),
    [crossword.grid]
  );

  // ====== entries & membership ======
  const entries = crossword.entries;
  const membership = useMemo(() => {
    const map: Record<string, { across?: Entry; down?: Entry }> = {};
    for (const e of entries) {
      for (const p of e.positions) {
        const key = `${p.row}:${p.col}`;
        const slot = (map[key] ||= {});
        if (e.direction === "across") slot.across = e;
        else slot.down = e;
      }
    }
    return map;
  }, [entries]);

  // ====== GRID LETTERS (UI source of truth) ======
  const initialGrid = useMemo(() => {
    const g: string[][] = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => "")
    );
    const existing =
      (attempt?.answers?.crossword as Record<string, string> | undefined) || {};
    for (const e of entries) {
      const saved = existing[e.id] || "";
      e.positions.forEach((p, idx) => {
        const raw = saved[idx] ?? "";
        const ch = raw === " " ? "" : (raw || "").toUpperCase();
        if (ch && !blocked.has(`${p.row}:${p.col}`)) {
          g[p.row][p.col] = ch;
        }
      });
    }
    return g;
  }, [attempt?.answers?.crossword, entries, blocked, rows, cols]);

  const [gridLetters, setGridLetters] = useState<string[][]>(initialGrid);
  const gridLettersRef = useLatest(gridLetters);

  // ====== timer (total quiz) ======
  const { remaining, percent } = useQuizTimer(
    spec.renderSpec.totalTimeLimit,
    attempt
  );

  // ---- convert gridLetters -> per-entry strings (for saving only)
  const buildAnswersPayload = useCallback((): AnswersPayload => {
    const crosswordAns: Record<string, string> = {};
    for (const e of entries) {
      const s = e.positions
        .map(({ row, col }) => {
          const ch = gridLettersRef.current[row][col] || "";
          return ch === "" ? " " : ch.toUpperCase();
        })
        .join("");
      crosswordAns[e.id] = s;
    }
    return { crossword: crosswordAns };
  }, [entries, gridLettersRef]);

  // ====== debounced save ======
  const { saving, scheduleDebouncedSave, flushSaves } = useDebouncedSave(
    attemptId,
    token,
    buildAnswersPayload,
    250
  );

  // ====== finish logic ======
  const { finishing, finishNow } = useQuizFinish(
    attemptId,
    token,
    (finalizeRes) =>
      navigateToQuizResults(router, attemptId, spec, finalizeRes),
    flushSaves,
    remaining === 0
  );

  // ====== selection state ======
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeDir, setActiveDir] = useState<"across" | "down">(
    entries[0]?.direction ?? "across"
  );
  const [selectedCell, setSelectedCell] = useState<{
    row: number;
    col: number;
  } | null>(() => {
    const e0 = entries[0];
    const p0 = e0?.positions[0];
    return p0 ? { row: p0.row, col: p0.col } : null;
  });

  const activeEntry = entries[activeIndex];

  useEffect(() => {
    const e = entries[activeIndex];
    if (!e) return;
    if (activeDir !== e.direction) setActiveDir(e.direction);
    if (
      selectedCell &&
      !e.positions.some(
        (p) => p.row === selectedCell.row && p.col === selectedCell.col
      )
    ) {
      const p0 = e.positions[0];
      if (p0) setSelectedCell({ row: p0.row, col: p0.col });
    }
  }, [activeIndex, activeDir, entries, selectedCell]);

  // ====== helpers for UI ======
  const isActiveCell = useCallback(
    (r: number, c: number) =>
      !!activeEntry?.positions.some((p) => p.row === r && p.col === c),
    [activeEntry]
  );

  const letterAt = useCallback(
    (r: number, c: number) => gridLetters[r]?.[c] || "",
    [gridLetters]
  );

  // ====== typing / hidden input ======
  const hiddenInputRef = useRef<TextInput | null>(null);
  const [hiddenValue, setHiddenValue] = useState("");
  const lastKeyWasBackspace = useRef(false);

  // critical: do NOT blur() — that causes the keyboard snap.
  const refocusKeyboard = useCallback(() => {
    const i = hiddenInputRef.current;
    if (!i) return;

    const focusNow = () => i.focus?.();

    if (Platform.OS === "android") {
      requestAnimationFrame(() => focusNow());
    } else {
      focusNow();
    }
  }, []);

  const moveToNextInActiveEntry = useCallback(() => {
    if (!activeEntry || !selectedCell) return;
    const idx = activeEntry.positions.findIndex(
      (p) => p.row === selectedCell.row && p.col === selectedCell.col
    );
    if (idx < 0) return;
    const nextIdx = idx + 1;
    if (nextIdx < activeEntry.positions.length) {
      const p = activeEntry.positions[nextIdx];
      setSelectedCell({ row: p.row, col: p.col });
    }
  }, [activeEntry, selectedCell]);

  const moveToPrevInActiveEntry = useCallback(() => {
    if (!activeEntry || !selectedCell) return -1;
    const idx = activeEntry.positions.findIndex(
      (p) => p.row === selectedCell.row && p.col === selectedCell.col
    );
    if (idx < 0) return -1;
    const prevIdx = Math.max(0, idx - 1);
    const p = activeEntry.positions[prevIdx];
    setSelectedCell({ row: p.row, col: p.col });
    return prevIdx;
  }, [activeEntry, selectedCell]);

  const setSelectedCellLetter = useCallback(
    (ch: string) => {
      if (!selectedCell) return;
      const { row, col } = selectedCell;
      if (blocked.has(`${row}:${col}`)) return;

      setGridLetters((prev) => {
        const next = prev.map((r) => r.slice());
        next[row][col] = ch.toUpperCase();
        return next;
      });

      scheduleDebouncedSave();
      moveToNextInActiveEntry();
    },
    [selectedCell, blocked, scheduleDebouncedSave, moveToNextInActiveEntry]
  );

  // Backspace behavior: delete current if non-empty; else go to previous & delete there.
  const onBackspace = useCallback(() => {
    if (!selectedCell) return;
    const { row, col } = selectedCell;
    if (blocked.has(`${row}:${col}`)) return;

    const currentChar = gridLettersRef.current[row]?.[col] || "";

    if (currentChar) {
      setGridLetters((prev) => {
        const next = prev.map((r) => r.slice());
        next[row][col] = "";
        return next;
      });
      scheduleDebouncedSave();
      return;
    }

    const prevIdx = moveToPrevInActiveEntry();
    if (prevIdx === -1 || !activeEntry) return;

    const p = activeEntry.positions[Math.max(0, prevIdx)];
    if (!p) return;
    if (blocked.has(`${p.row}:${p.col}`)) return;

    setGridLetters((prev) => {
      const next = prev.map((r) => r.slice());
      next[p.row][p.col] = "";
      return next;
    });
    scheduleDebouncedSave();
  }, [
    selectedCell,
    blocked,
    gridLettersRef,
    moveToPrevInActiveEntry,
    activeEntry,
    scheduleDebouncedSave,
  ]);

  const onHiddenKeyPress = useCallback(
    (e: any) => {
      const key: string = e?.nativeEvent?.key ?? "";
      if (key === "Backspace") {
        lastKeyWasBackspace.current = true;
        onBackspace();
        setHiddenValue("");
      }
    },
    [onBackspace]
  );

  const onHiddenChange = useCallback(
    (text: string) => {
      if (lastKeyWasBackspace.current) {
        lastKeyWasBackspace.current = false;
        if (!text) {
          setHiddenValue("");
          return;
        }
      }

      if (!text) {
        setHiddenValue("");
        return;
      }

      const ch = text.slice(-1);
      if (!/[a-zA-Z]/.test(ch)) {
        setHiddenValue("");
        return;
      }

      setSelectedCellLetter(ch);
      setHiddenValue("");
    },
    [setSelectedCellLetter]
  );

  // ====== PAN + PINCH ZOOM ======
  const [gridWrapSize, setGridWrapSize] = useState({ w: 0, h: 0 });
  const onGridWrapLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setGridWrapSize({ w: width, h: height });
  };

  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  const accX = useRef(0);
  const accY = useRef(0);
  const currentScale = useRef(1);

  useEffect(() => {
    const {
      scale: s,
      translateX: tx,
      translateY: ty,
    } = computeInitialGridTransform({
      viewportWidth: gridWrapSize.w,
      viewportHeight: gridWrapSize.h,
      rows,
      cols,
    });

    scale.setValue(s);
    currentScale.current = s;
    translateX.setValue(tx);
    translateY.setValue(ty);
    accX.current = tx;
    accY.current = ty;
  }, [
    gridWrapSize.w,
    gridWrapSize.h,
    rows,
    cols,
    scale,
    translateX,
    translateY,
  ]);

  const pinchState = useRef({
    dist0: 0,
    startScale: 1,
    startCx: 0,
    startCy: 0,
    startX: 0,
    startY: 0,
  });

  const panStartRef = useRef({ x: 0, y: 0 });
  const movedRef = useRef(false);

  const gestureResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        g.numberActiveTouches >= 2 ||
        Math.abs(g.dx) > TAP_SLOP ||
        Math.abs(g.dy) > TAP_SLOP,

      onPanResponderGrant: (evt) => {
        movedRef.current = false;

        translateX.stopAnimation((vx: number) => {
          accX.current = typeof vx === "number" ? vx : accX.current;
          panStartRef.current.x = accX.current;
        });
        translateY.stopAnimation((vy: number) => {
          accY.current = typeof vy === "number" ? vy : accY.current;
          panStartRef.current.y = accY.current;
        });
        scale.stopAnimation((sv: number) => {
          if (typeof sv === "number") currentScale.current = sv;
        });

        const touches = evt.nativeEvent.touches || [];
        if (touches.length >= 2) {
          pinchState.current.dist0 = touchDistance(evt.nativeEvent);
          pinchState.current.startScale = currentScale.current;
          const { x, y } = touchCentroid(evt.nativeEvent);
          pinchState.current.startCx = x;
          pinchState.current.startCy = y;
          pinchState.current.startX = accX.current;
          pinchState.current.startY = accY.current;
        }
      },

      onPanResponderMove: (evt, g) => {
        const touches = evt.nativeEvent.touches || [];
        if (touches.length >= 2) {
          movedRef.current = true;
          const d = touchDistance(evt.nativeEvent);
          const ratio = pinchState.current.dist0
            ? d / pinchState.current.dist0
            : 1;
          const nextScale = clamp(
            pinchState.current.startScale * ratio,
            MIN_SCALE,
            MAX_SCALE
          );
          scale.setValue(nextScale);
          currentScale.current = nextScale;

          const { x, y } = touchCentroid(evt.nativeEvent);
          const dx = x - pinchState.current.startCx;
          const dy = y - pinchState.current.startCy;

          const px = pinchState.current.startX + dx;
          const py = pinchState.current.startY + dy;

          translateX.setValue(px);
          translateY.setValue(py);
          accX.current = px;
          accY.current = py;
        } else {
          if (Math.abs(g.dx) > TAP_SLOP || Math.abs(g.dy) > TAP_SLOP) {
            movedRef.current = true;
          }
          const px = panStartRef.current.x + g.dx * panSpeed;
          const py = panStartRef.current.y + g.dy * panSpeed;
          translateX.setValue(px);
          translateY.setValue(py);
          accX.current = px;
          accY.current = py;
        }
      },

      onPanResponderRelease: () => {},
      onPanResponderTerminationRequest: () => true,
      onPanResponderTerminate: () => {},
    })
  ).current;

  // For tap-direction toggling inside the inline handler
  const lastTappedKeyRef = useRef<string | null>(null);

  // ====== keyboard height tracking (to lift clues bar) ======
  const keyboardHeight = useKeyboardHeight();

  if (!rows || !cols) {
    return (
      <View style={[styles.center, { flex: 1, backgroundColor: colors.bg1 }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg1 }}>
      {/* Header (title + time pill) */}
      <QuizHeader
        title={spec.meta.name || "Crossword"}
        showBackButton
        onBack={() => router.back()}
        remaining={remaining}
        paddingTop={insets.top + 6}
      />

      {/* Timer bar (below title) */}
      <TimerBar percent={percent} />

      {/* Zoomable / pannable area */}
      <View
        onLayout={onGridWrapLayout}
        style={{
          flex: 2,
          backgroundColor: colors.bg1,
          padding: 10,
          overflow: "hidden",
        }}
        data-drag-scroll="ignore"
      >
        <View
          style={[
            styles.gridStage,
            { backgroundColor: colors.bg2, borderColor: colors.bg3 },
          ]}
        >
          <Animated.View {...gestureResponder.panHandlers} style={{ flex: 1 }}>
            <Animated.View
              style={{
                transform: [{ translateX }, { translateY }, { scale }],
              }}
            >
              {/* Grid */}
              <View
                style={{
                  width: cols * CELL,
                  height: rows * CELL,
                  backgroundColor: colors.bg2,
                }}
              >
                {Array.from({ length: rows }).map((_, r) => (
                  <View key={`r-${r}`} style={{ flexDirection: "row" }}>
                    {Array.from({ length: cols }).map((__, c) => {
                      const key = `${r}:${c}`;
                      const isBlocked = blocked.has(key);
                      const active = isActiveCell(r, c);
                      const atCursor =
                        selectedCell != null &&
                        selectedCell.row === r &&
                        selectedCell.col === c;
                      const ch = !isBlocked ? letterAt(r, c) : "";

                      return (
                        <Pressable
                          key={`c-${c}`}
                          onPress={() =>
                            isBlocked
                              ? Keyboard.dismiss()
                              : (() => {
                                  const m = membership[key];
                                  if (!m) return;

                                  const prevKey = lastTappedKeyRef.current;
                                  lastTappedKeyRef.current = key;

                                  const wantDir: "across" | "down" =
                                    prevKey === key
                                      ? m.across && m.down
                                        ? activeDir === "across"
                                          ? "down"
                                          : "across"
                                        : m.across
                                        ? "across"
                                        : "down"
                                      : m.across
                                      ? "across"
                                      : "down";

                                  const e =
                                    wantDir === "across" ? m.across : m.down;
                                  if (!e) return;

                                  const idx = entries.findIndex(
                                    (en) => en.id === e.id
                                  );
                                  setActiveIndex(Math.max(0, idx));
                                  if (wantDir !== activeDir)
                                    setActiveDir(wantDir);
                                  setSelectedCell({ row: r, col: c });

                                  requestAnimationFrame(() =>
                                    refocusKeyboard()
                                  );
                                })()
                          }
                          style={[
                            styles.cell,
                            {
                              width: CELL,
                              height: CELL,
                              backgroundColor: isBlocked
                                ? colors.bg3
                                : active
                                ? colors.primaryLight
                                : colors.bg1,
                              borderColor: active ? colors.primary : colors.bg3,
                            },
                          ]}
                        >
                          {!isBlocked && (
                            <>
                              <Text
                                style={[
                                  styles.cellText,
                                  { color: colors.textPrimary },
                                ]}
                              >
                                {ch}
                              </Text>
                              {atCursor && (
                                <View
                                  style={[
                                    styles.cursor,
                                    { borderColor: colors.primaryDark },
                                  ]}
                                />
                              )}
                            </>
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </View>
            </Animated.View>
          </Animated.View>
        </View>
      </View>

      {/* Hidden input to capture typing */}
      <TextInput
        ref={hiddenInputRef}
        value={hiddenValue}
        maxLength={1}
        autoFocus
        showSoftInputOnFocus
        blurOnSubmit={false}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        caretHidden
        keyboardType="visible-password"
        importantForAutofill="no"
        onKeyPress={onHiddenKeyPress}
        onChangeText={onHiddenChange}
        contextMenuHidden
        disableFullscreenUI
        underlineColorAndroid="transparent"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          opacity: 0,
          bottom: 0,
          left: 0,
        }}
      />

      {/* Bottom clues */}
      <View
        style={[
          styles.clueWrap,
          {
            backgroundColor: colors.bg2,
            borderTopColor: colors.bg3,
            paddingBottom: Math.max(insets.bottom, 10),
            marginBottom: keyboardHeight,
          },
        ]}
      >
        <View style={styles.clueRow}>
          <Pressable
            onPress={() => {
              setActiveIndex((i) => {
                const ni = (i - 1 + entries.length) % entries.length;
                const e = entries[ni];
                const p0 = e.positions[0];
                if (p0) setSelectedCell({ row: p0.row, col: p0.col });
                setActiveDir(e.direction);
                return ni;
              });

              requestAnimationFrame(() => refocusKeyboard());
            }}
            style={({ pressed }) => [
              styles.navBtn,
              {
                backgroundColor: colors.bg1,
                borderColor: colors.bg3,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Iconify icon="mingcute:left-line" size={21} color={colors.icon} />
          </Pressable>

          <View style={styles.clueTextWrap}>
            <Text style={[styles.clueDir, { color: colors.textSecondary }]}>
              {activeEntry?.direction?.toUpperCase()} • {activeEntry?.id}
            </Text>
            <Text style={[styles.clue, { color: colors.textPrimary }]}>
              {activeEntry?.clue}
            </Text>
          </View>

          <Pressable
            onPress={() => {
              setActiveIndex((i) => {
                const ni = (i + 1) % entries.length;
                const e = entries[ni];
                const p0 = e.positions[0];
                if (p0) setSelectedCell({ row: p0.row, col: p0.col });
                setActiveDir(e.direction);
                return ni;
              });

              requestAnimationFrame(() => refocusKeyboard());
            }}
            style={({ pressed }) => [
              styles.navBtn,
              {
                backgroundColor: colors.bg1,
                borderColor: colors.bg3,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Iconify icon="mingcute:right-line" size={21} color={colors.icon} />
          </Pressable>
        </View>

        {/* Save state + Finish */}
        <View style={styles.bottomBar}>
          <SaveStatusBadge status={saving} />

          <Pressable
            onPress={async () => {
              await finishNow();
            }}
            style={({ pressed }) => [
              styles.finishBtn,
              {
                backgroundColor: colors.primary,
                opacity: pressed ? 0.9 : 1,
              },
            ]}
          >
            {finishing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Text
                  style={{ color: "#fff", fontWeight: "900", fontSize: 15 }}
                >
                  Finish
                </Text>
                <Iconify icon="mingcute:right-line" size={18} color="#fff" />
              </>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/** ====== styles ====== */
const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },

  gridStage: {
    flex: 1,
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },

  cell: {
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  cellText: { fontSize: 16, fontWeight: "900" },
  cursor: {
    position: "absolute",
    left: 2,
    right: 2,
    top: 2,
    bottom: 2,
    borderWidth: 2,
    borderRadius: 5,
  },

  clueWrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  clueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 68,
  },
  navBtn: {
    height: 42,
    width: 42,
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  clueTextWrap: { flex: 1, minWidth: 0 },
  clueDir: { fontSize: 14, fontWeight: "900", opacity: 0.85 },
  clue: { fontSize: 16, fontWeight: "800" },

  bottomBar: {
    marginTop: 10,
    paddingTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  finishBtn: {
    height: 42,
    paddingHorizontal: 16,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
});
