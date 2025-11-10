import {
  finishAttempt,
  isCrossword,
  saveAnswers,
  type AnswersPayload,
  type AttemptDoc,
  type AttemptSpec,
  type CrosswordAttemptSpec,
} from "@/src/api/quiz-service";
import { useSession } from "@/src/auth/session";
import {
  buildBlockedSet,
  CELL,
  computeInitialGridTransform,
  Entry,
  MAX_SCALE,
  MIN_SCALE,
  TAP_SLOP,
  touchCentroid,
  touchDistance,
} from "@/src/lib/attempt-helpers";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** ====== types & helpers ====== */
type Props = {
  attemptId: string;
  spec: AttemptSpec;
  attempt?: AttemptDoc;
};

function useLatest<T>(v: T) {
  const r = useRef(v);
  useEffect(() => {
    r.current = v;
  }, [v]);
  return r;
}

function useInterval(cb: () => void, delay: number | null) {
  const cbRef = useRef(cb);
  useEffect(() => {
    cbRef.current = cb;
  }, [cb]);
  useEffect(() => {
    if (delay === null) return;
    const id = setInterval(() => cbRef.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}

const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));

/** ====== component ====== */
export default function QuizPlayCrosswordScreen({
  attemptId,
  spec: rawSpec,
  attempt,
}: Props) {
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
  const totalLimit = spec.renderSpec.totalTimeLimit ?? null;
  const [remaining, setRemaining] = useState<number | null>(() => {
    if (typeof totalLimit === "number" && totalLimit > 0) {
      const startedMs = attempt?.startedAt
        ? new Date(attempt.startedAt).getTime()
        : Date.now();
      const elapsed = attempt?.startedAt
        ? Math.floor((Date.now() - startedMs) / 1000)
        : 0;
      return Math.max(0, totalLimit - elapsed);
    }
    return null;
  });
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    if (totalLimit != null && remaining == null) {
      const startedMs = attempt?.startedAt
        ? new Date(attempt.startedAt).getTime()
        : Date.now();
      const elapsed = attempt?.startedAt
        ? Math.floor((Date.now() - startedMs) / 1000)
        : 0;
      setRemaining(Math.max(0, Number(totalLimit) - elapsed));
    }
  }, [totalLimit, attempt?.startedAt, remaining]);

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

  const fmtClock = (secs: number) => {
    const m = Math.max(0, Math.floor(secs / 60));
    const s = Math.max(0, secs % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  };

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
  const [saving, setSaving] = useState<"idle" | "saving" | "error">("idle");
  const saveQueueRef = useRef<Promise<any>>(Promise.resolve());

  const doSaveNow = useCallback(async () => {
    if (!token) return;
    const payload = buildAnswersPayload();
    await saveAnswers(token, attemptId, payload);
  }, [token, attemptId, buildAnswersPayload]);

  const enqueueSave = useCallback(async () => {
    setSaving("saving");
    saveQueueRef.current = saveQueueRef.current
      .then(doSaveNow)
      .then(() => setSaving("idle"))
      .catch(() => setSaving("error"));
    try {
      await saveQueueRef.current;
    } catch {}
  }, [doSaveNow]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveDebounced = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      enqueueSave();
    }, 300);
  }, [enqueueSave]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      void saveQueueRef.current.catch(() => {});
    };
  }, []);

  const flushAndFinish = useCallback(async () => {
    if (finishing) return;
    setFinishing(true);
    try {
      await doSaveNow();
      let finalizeRes: any = null;
      if (token) {
        finalizeRes = await finishAttempt(token, attemptId).catch(() => null);
      }
      goResults(finalizeRes);
    } catch {
      goResults(null);
    }
  }, [finishing, token, attemptId, goResults, doSaveNow]);

  useEffect(() => {
    if (remaining === 0 && !finishing) {
      void flushAndFinish();
    }
  }, [remaining, finishing, flushAndFinish]);

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

  const isCursorCell = useCallback(
    (r: number, c: number) =>
      selectedCell != null && selectedCell.row === r && selectedCell.col === c,
    [selectedCell]
  );

  const letterAt = useCallback(
    (r: number, c: number) => gridLetters[r]?.[c] || "",
    [gridLetters]
  );

  // ====== typing / hidden input ======
  const hiddenInputRef = useRef<TextInput | null>(null);
  const [hiddenValue, setHiddenValue] = useState("");
  const lastKeyWasBackspace = useRef(false);

  const refocusKeyboard = useCallback(() => {
    const i = hiddenInputRef.current;
    if (!i) return;
    i.blur();
    const focusNow = () => i.focus?.();
    if (Platform.OS === "android") {
      requestAnimationFrame(() => setTimeout(focusNow, 0));
    } else {
      setTimeout(focusNow, 0);
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

      saveDebounced();
      moveToNextInActiveEntry();
    },
    [selectedCell, blocked, saveDebounced, moveToNextInActiveEntry]
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
      saveDebounced();
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
    saveDebounced();
  }, [
    selectedCell,
    blocked,
    gridLettersRef,
    moveToPrevInActiveEntry,
    activeEntry,
    saveDebounced,
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

  // ====== PAN + PINCH ZOOM (no snapping) ======
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
          const px = panStartRef.current.x + g.dx;
          const py = panStartRef.current.y + g.dy;
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

  if (!rows || !cols) {
    return (
      <View style={[styles.center, { flex: 1, backgroundColor: colors.bg1 }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg1 }}>
      {/* Header / Timer */}
      <Pressable
        onPress={() => Keyboard.dismiss()}
        style={[
          styles.header,
          { borderBottomColor: colors.bg2, paddingTop: insets.top },
        ]}
      >
        <Text
          numberOfLines={1}
          style={[styles.title, { color: colors.textPrimary, flexShrink: 1 }]}
        >
          {spec.meta.name || "Crossword"}
        </Text>
        {remaining !== null && (
          <View style={styles.timerPill}>
            <Text style={[styles.timerText, { color: colors.textPrimary }]}>
              {fmtClock(remaining)}
            </Text>
          </View>
        )}
      </Pressable>

      {/* Zoomable / pannable area */}
      <View
        onLayout={onGridWrapLayout}
        style={{
          flex: 2,
          backgroundColor: colors.bg1,
          padding: 8,
          overflow: "hidden",
        }}
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
                                refocusKeyboard();
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
        // Android keyboard robustness
        contextMenuHidden
        disableFullscreenUI
        underlineColorAndroid="transparent"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          opacity: 0,
          bottom: -100,
          left: 0,
        }}
      />

      {/* Bottom clues */}
      <Pressable
        onPress={() => Keyboard.dismiss()}
        style={[
          styles.clueWrap,
          {
            backgroundColor: colors.bg1,
            borderTopColor: colors.bg2,
            paddingBottom: Math.max(insets.bottom, 8),
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
              refocusKeyboard();
            }}
            style={[styles.navBtn, { backgroundColor: colors.bg2 }]}
          >
            <Text style={{ color: colors.textPrimary, fontWeight: "800" }}>
              ◀︎
            </Text>
          </Pressable>

          <View style={styles.clueTextWrap}>
            <Text
              style={[
                styles.clueDir,
                { color: colors.textSecondary, marginBottom: 2 },
              ]}
            >
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
              refocusKeyboard();
            }}
            style={[styles.navBtn, { backgroundColor: colors.bg2 }]}
          >
            <Text style={{ color: colors.textPrimary, fontWeight: "800" }}>
              ▶︎
            </Text>
          </Pressable>
        </View>

        {/* Save state + Finish */}
        <View style={styles.bottomBar}>
          <Text
            style={{
              color: saving === "error" ? colors.error : colors.textSecondary,
              fontSize: 12,
            }}
          >
            {saving === "saving"
              ? "Saving…"
              : saving === "error"
              ? "Save failed"
              : "Saved"}
          </Text>

          <Pressable
            onPress={async () => {
              await flushAndFinish();
            }}
            style={[styles.finishBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={{ color: "#fff", fontWeight: "800" }}>Finish</Text>
          </Pressable>
        </View>
      </Pressable>
    </View>
  );
}

/** ====== styles ====== */
const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  header: {
    height: 56,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontWeight: "800", fontSize: 16 },
  timerPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "transparent",
  },
  timerText: { fontSize: 12, fontWeight: "700" },

  cell: {
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  cellText: { fontSize: 16, fontWeight: "800" },
  cursor: {
    position: "absolute",
    left: 2,
    right: 2,
    top: 2,
    bottom: 2,
    borderWidth: 2,
    borderRadius: 4,
  },

  clueWrap: {
    flex: 1,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  clueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 64,
  },
  navBtn: {
    height: 40,
    width: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  clueTextWrap: { flex: 1 },
  clueDir: { fontSize: 12, fontWeight: "700", opacity: 0.8 },
  clue: { fontSize: 14, fontWeight: "700" },
  bottomBar: {
    marginTop: 10,
    paddingTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  finishBtn: {
    height: 40,
    paddingHorizontal: 18,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
});
