import {
  type AttemptDoc,
  type CrosswordRenderSpec,
  type ItemCrossword,
} from "@/src/api/quiz-service";
import { Line } from "@/src/components/ui/Line";
import { Pill } from "@/src/components/ui/Pill";
import { SectionHeader } from "@/src/components/ui/SectionHeader";
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
import { useTheme } from "@/src/theme";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

/** Read-only Crossword attempt viewer (with per-cell correctness) */
export default function CrosswordAttemptViewer({ doc }: { doc: AttemptDoc }) {
  const { colors } = useTheme();
  // NOTE: panSpeed is faster on web to account for lack of touchpad precision. Remove on release. Used only for
  // User testing on web page for now.
  const panSpeed = Platform.OS === "web" ? 2 : 1;

  const spec = doc.quizVersionSnapshot.renderSpec as CrosswordRenderSpec;
  const item = (spec?.items?.[0] || null) as ItemCrossword | null;

  // Defensive guards
  if (!item || item.kind !== "crossword") {
    return (
      <View style={[styles.center, { flex: 1 }]}>
        <Text style={{ color: colors.textSecondary }}>
          No crossword content.
        </Text>
      </View>
    );
  }

  const rows = item.grid.length;
  const cols = item.grid[0]?.length ?? 0;

  const answersAvailable = Boolean((doc as any).answersAvailable);

  /** ===== blocked cells ===== */
  const blocked = useMemo(() => buildBlockedSet(item.grid), [item.grid]);

  /** ===== map breakdown by itemId ===== */
  type Br = {
    itemId: string;
    awarded: number;
    max: number;
    meta?: { given?: string; expected?: string };
  };

  const byId = useMemo(() => {
    const map = new Map<string, Br>();
    (doc.breakdown || []).forEach((b: any) => {
      if (!b?.itemId) return;
      map.set(b.itemId, {
        itemId: String(b.itemId),
        awarded: Number(b.awarded ?? 0),
        max: Number(b.max ?? 0),
        meta: b.meta || {},
      });
    });
    return map;
  }, [doc.breakdown]);

  /** ===== letters from student answers ===== */
  const gridLetters = useMemo(() => {
    const g: string[][] = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => "")
    );

    const ans = (doc.answers?.crossword || {}) as Record<
      string,
      string | undefined
    >;

    // Fill from student's answers
    for (const e of item.entries) {
      const filled = (ans[e.id] || "").toUpperCase();
      e.positions.forEach((p, idx) => {
        if (!blocked.has(`${p.row}:${p.col}`)) {
          const ch = (filled[idx] || "").trim();
          if (ch) g[p.row][p.col] = ch[0];
        }
      });
    }

    return g;
  }, [doc.answers?.crossword, item.entries, item.grid, blocked, rows, cols]);

  /** ===== per-cell correctness from breakdown.meta.expected (no grading key) ===== */
  const cellStatus = useMemo(() => {
    // null = no highlight, 'correct' | 'wrong'
    const status: ("correct" | "wrong" | null)[][] = Array.from(
      { length: rows },
      () =>
        Array.from({ length: cols }, () => null as "correct" | "wrong" | null)
    );

    if (!answersAvailable) return status;

    const ans = (doc.answers?.crossword || {}) as Record<
      string,
      string | undefined
    >;

    for (const e of item.entries) {
      const b = byId.get(e.id);
      const expectedRaw = b?.meta?.expected;
      if (!expectedRaw) continue; // if we don't have the expected, skip highlighting
      const expected = String(expectedRaw).toUpperCase();
      const given = String(ans[e.id] ?? "").toUpperCase();

      for (let i = 0; i < e.positions.length; i++) {
        const { row, col } = e.positions[i];
        if (blocked.has(`${row}:${col}`)) continue;

        const g = i < given.length ? given[i] : "";
        const ex = i < expected.length ? expected[i] : "";
        if (!g) continue; // leave blanks neutral
        status[row][col] = g === ex ? "correct" : "wrong";
      }
    }

    return status;
  }, [
    answersAvailable,
    byId,
    blocked,
    doc.answers?.crossword,
    item.entries,
    rows,
    cols,
  ]);

  /** ===== pan + pinch zoom (no editing) ===== */
  const [wrap, setWrap] = useState({ w: 0, h: 0 });
  const onWrapLayout = (e: any) => {
    const { width, height } = e.nativeEvent.layout || {};
    setWrap({ w: width || 0, h: height || 0 });
  };

  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  const accX = useRef(0);
  const accY = useRef(0);
  const currentScale = useRef(1);

  // initial fit & center
  useEffect(() => {
    const {
      scale: s,
      translateX: tx,
      translateY: ty,
    } = computeInitialGridTransform({
      viewportWidth: wrap.w,
      viewportHeight: wrap.h,
      rows,
      cols,
    });

    scale.setValue(s);
    currentScale.current = s;
    translateX.setValue(tx);
    translateY.setValue(ty);
    accX.current = tx;
    accY.current = ty;
  }, [wrap.w, wrap.h, rows, cols, scale, translateX, translateY]);

  const pinchState = useRef({
    dist0: 0,
    startScale: 1,
    startCx: 0,
    startCy: 0,
    startX: 0,
    startY: 0,
  });

  const panStartRef = useRef({ x: 0, y: 0 });

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        g.numberActiveTouches >= 2 ||
        Math.abs(g.dx) > TAP_SLOP ||
        Math.abs(g.dy) > TAP_SLOP,

      onPanResponderGrant: (evt, g) => {
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
          // pinch zoom
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

          // pan with centroid while pinching
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
          // one finger pan
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

  /** ===== clues (expected from breakdown only) ===== */
  type ClueRow = {
    entry: Entry;
    given: string | null;
    expected?: string | null;
    awarded?: number | null;
    max?: number | null;
  };

  const { across, down } = useMemo(() => {
    const ans = (doc.answers?.crossword || {}) as Record<
      string,
      string | undefined
    >;

    const mk = (e: Entry): ClueRow => {
      const b = byId.get(e.id);
      const given = (b?.meta?.given ?? ans[e.id] ?? "").toUpperCase() || null;
      const expected = answersAvailable
        ? b?.meta?.expected
          ? String(b.meta.expected).toUpperCase()
          : null
        : null;
      const awarded = answersAvailable ? Number(b?.awarded ?? 0) : null;
      const max = answersAvailable ? Number(b?.max ?? 0) : null;
      return { entry: e, given, expected, awarded, max };
    };

    const A: ClueRow[] = [];
    const D: ClueRow[] = [];
    for (const e of item.entries) {
      if (e.direction === "across") A.push(mk(e));
      else D.push(mk(e));
    }
    // sort by first position roughly top-left
    const sortByFirst = (x: ClueRow, y: ClueRow) => {
      const ax = x.entry.positions[0];
      const bx = y.entry.positions[0];
      return ax.row === bx.row ? ax.col - bx.col : ax.row - bx.row;
    };
    A.sort(sortByFirst);
    D.sort(sortByFirst);
    return { across: A, down: D };
  }, [item.entries, byId, answersAvailable, doc.answers?.crossword]);

  const statusPill = (awarded?: number | null, max?: number | null) => {
    if (awarded == null || max == null) return null;
    const txt = `${awarded}/${max}`;
    const full = awarded >= max;
    const none = awarded <= 0;
    const bg = full ? colors.success : none ? colors.error : colors.warning;
    const fg = "#fff";
    return <Pill text={txt} bg={bg} fg={fg} />;
  };

  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      {/* Grid viewport */}
      <View
        onLayout={onWrapLayout}
        style={{
          flex: 1.2,
          padding: 10,
          overflow: "hidden",
          borderRadius: 10,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.bg4,
          backgroundColor: colors.bg2,
          shadowOpacity: 0.06,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 6 },
          elevation: 2,
          shadowColor: "#000",
        }}
        data-drag-scroll="ignore"
      >
        <Animated.View {...responder.panHandlers} style={{ flex: 1 }}>
          <Animated.View
            style={{ transform: [{ translateX }, { translateY }, { scale }] }}
          >
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
                    const ch = !isBlocked ? gridLetters[r]?.[c] || "" : "";

                    // Per-cell correctness styling
                    const status = cellStatus[r]?.[c] ?? null;
                    const borderColor =
                      status === "correct"
                        ? colors.success
                        : status === "wrong"
                        ? colors.error
                        : colors.bg3;
                    const borderWidth = status ? 2 : StyleSheet.hairlineWidth;

                    return (
                      <View
                        key={`c-${c}`}
                        style={[
                          styles.cell,
                          {
                            width: CELL,
                            height: CELL,
                            backgroundColor: isBlocked
                              ? colors.bg3
                              : colors.bg1,
                            borderColor,
                            borderWidth,
                          },
                        ]}
                      >
                        {!isBlocked && (
                          <Text
                            style={[
                              styles.cellText,
                              { color: colors.textPrimary },
                            ]}
                          >
                            {ch}
                          </Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          </Animated.View>
        </Animated.View>
      </View>

      {/* Clues */}
      <View style={{ flex: 1 }}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 24 }}
        >
          <SectionHeader title="Across" />
          {across.map((row) => (
            <View
              key={`A-${row.entry.id}`}
              style={[
                styles.card,
                { backgroundColor: colors.bg2, borderColor: colors.bg4 },
              ]}
            >
              <View style={styles.cardTop}>
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontSize: 12,
                    fontWeight: "900",
                  }}
                >
                  {row.entry.id} • ACROSS
                </Text>
                {statusPill(row.awarded, row.max)}
              </View>

              <Text
                style={{
                  color: colors.textPrimary,
                  fontWeight: "800",
                  fontSize: 14,
                }}
              >
                {row.entry.clue}
              </Text>

              <View style={{ marginTop: 8, gap: 4 }}>
                <Line label="Your answer:" value={row.given || "—"} />
                {answersAvailable && (
                  <Line label="Correct:" value={row.expected || "—"} />
                )}
                {!answersAvailable && (
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                    Answers are not available yet.
                  </Text>
                )}
              </View>
            </View>
          ))}

          <SectionHeader title="Down" />
          {down.map((row) => (
            <View
              key={`D-${row.entry.id}`}
              style={[
                styles.card,
                { backgroundColor: colors.bg2, borderColor: colors.bg4 },
              ]}
            >
              <View style={styles.cardTop}>
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontSize: 12,
                    fontWeight: "900",
                  }}
                >
                  {row.entry.id} • DOWN
                </Text>
                {statusPill(row.awarded, row.max)}
              </View>

              <Text
                style={{
                  color: colors.textPrimary,
                  fontWeight: "800",
                  fontSize: 14,
                }}
              >
                {row.entry.clue}
              </Text>

              <View style={{ marginTop: 8, gap: 4 }}>
                <Line label="Your answer:" value={row.given || "—"} />
                {answersAvailable && (
                  <Line label="Correct:" value={row.expected || "—"} />
                )}
                {!answersAvailable && (
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                    Answers are not available yet.
                  </Text>
                )}
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },

  cell: {
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  cellText: { fontSize: 16, fontWeight: "800" },

  card: {
    marginHorizontal: 0,
    marginTop: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
    shadowColor: "#000",
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
});
