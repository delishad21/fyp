// src/utils/crossword/pack-top-left.ts
import type { Cell, Entry } from "./crossword-algorithm";

/**
 * Moves the entire crossword (all letters from all islands) so the topmost/leftmost
 * letter lands at (0,0), then crops the grid to the minimal bounding box that
 * contains every letter. Relative spacing between islands is preserved.
 *
 * Returns cropped grid + updated entries + packed size (height/width).
 */
export function packTopLeftAndCrop(
  grid: Cell[][],
  entries: Entry[]
): { grid: Cell[][]; entries: Entry[]; height: number; width: number } {
  const H = grid.length;
  const W = grid[0]?.length ?? 0;

  // find bounding box of all letters
  let minR = Infinity,
    minC = Infinity,
    maxR = -1,
    maxC = -1;

  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      if (grid[r][c].letter) {
        if (r < minR) minR = r;
        if (c < minC) minC = c;
        if (r > maxR) maxR = r;
        if (c > maxC) maxC = c;
      }
    }
  }

  // no letters: return a 1x1 empty grid
  if (maxR === -1) {
    return {
      grid: [[{ letter: null, isBlocked: true }]],
      entries: [],
      height: 1,
      width: 1,
    };
  }

  const dr = -minR;
  const dc = -minC;
  const height = maxR - minR + 1;
  const width = maxC - minC + 1;

  // build cropped grid, translating all letters by (dr, dc)
  const out: Cell[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ letter: null, isBlocked: true }))
  );

  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      const cell = grid[r][c];
      if (cell.letter) {
        out[r + dr][c + dc] = { letter: cell.letter, isBlocked: false };
      }
    }
  }

  // translate all entry positions by the same (dr, dc)
  const outEntries: Entry[] = entries.map((e) => ({
    ...e,
    positions: e.positions.map((p) => ({ row: p.row + dr, col: p.col + dc })),
  }));

  return { grid: out, entries: outEntries, height, width };
}

/**
 * If you want to keep the original grid size but just shift the whole shape
 * to the top-left (no cropping), use this:
 */
export function packTopLeftSameSize(
  grid: Cell[][],
  entries: Entry[]
): { grid: Cell[][]; entries: Entry[] } {
  const H = grid.length;
  const W = grid[0]?.length ?? 0;

  // compute bbox
  let minR = Infinity,
    minC = Infinity;
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      if (grid[r][c].letter) {
        if (r < minR) minR = r;
        if (c < minC) minC = c;
      }
    }
  }
  if (minR === Infinity) {
    // no letters
    return { grid, entries };
  }

  const dr = -minR;
  const dc = -minC;

  const out: Cell[][] = Array.from({ length: H }, () =>
    Array.from({ length: W }, () => ({ letter: null, isBlocked: true }))
  );
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const cell = grid[r][c];
      if (cell.letter) {
        out[r + dr][c + dc] = { letter: cell.letter, isBlocked: false };
      }
    }
  }

  const outEntries: Entry[] = entries.map((e) => ({
    ...e,
    positions: e.positions.map((p) => ({ row: p.row + dr, col: p.col + dc })),
  }));

  return { grid: out, entries: outEntries };
}
