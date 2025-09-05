export type Direction = "across" | "down";
export type Cell = { letter: string | null; isBlocked: boolean };

export type InputWord = {
  id: string;
  answer: string; // uppercase, no spaces
  clue: string;
};

export type Entry = {
  id: string;
  answer: string;
  clue: string;
  direction: Direction | null;
  positions: { row: number; col: number }[];
};

type Placed = {
  id: string;
  answer: string;
  clue: string;
  direction: Direction;
  row: number; // start row
  col: number; // start col
};

export type GenerateResult = {
  grid: Cell[][];
  entries: Entry[];
  unplaced: InputWord[];
};

export function generateCrossword(
  words: InputWord[],
  size = 20,
  opts: { allowIslandFallback?: boolean } = {}
): GenerateResult {
  const allowIslandFallback = opts.allowIslandFallback ?? true;

  // sanitize + sort
  const clean = words
    .map((w) => ({ ...w, answer: w.answer.replace(/[^A-Z]/g, "") }))
    .filter((w) => w.answer.length > 0)
    .sort((a, b) => b.answer.length - a.answer.length);

  // grid init (blocked everywhere)
  let grid: Cell[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => ({ letter: null, isBlocked: true }))
  );

  const placed: Placed[] = [];
  const unplaced: InputWord[] = [];

  if (!clean.length) {
    return { grid, entries: [], unplaced };
  }

  // 1) place the longest word roughly at center (across), or first fit
  {
    const first = clean[0];
    const midR = Math.floor(size / 2);
    const startC = Math.max(
      0,
      Math.min(
        size - first.answer.length,
        Math.floor(size / 2) - Math.floor(first.answer.length / 2)
      )
    );
    if (canPlaceWord(grid, first.answer, midR, startC, "across")) {
      writeWord(grid, first.answer, midR, startC, "across");
      placed.push({
        id: first.id,
        answer: first.answer,
        clue: first.clue,
        direction: "across",
        row: midR,
        col: startC,
      });
    } else {
      let ok = false;
      for (let r = 0; r < size && !ok; r++) {
        for (let c = 0; c <= size - first.answer.length && !ok; c++) {
          if (canPlaceWord(grid, first.answer, r, c, "across")) {
            writeWord(grid, first.answer, r, c, "across");
            placed.push({
              id: first.id,
              answer: first.answer,
              clue: first.clue,
              direction: "across",
              row: r,
              col: c,
            });
            ok = true;
          }
        }
      }
      if (!ok) {
        // cannot even place the first word -> mark unplaced and bail
        unplaced.push(first);
        const entriesEmpty: Entry[] = placed.map((p) => ({
          id: p.id,
          answer: p.answer,
          clue: p.clue,
          direction: p.direction,
          positions: positionsOf(p),
        }));
        return { grid, entries: entriesEmpty, unplaced };
      }
    }
  }

  // 2) smarter placement: defer islands; when stuck, place 1 "nearest island"
  {
    const remaining = clean.slice(1);
    let pool = remaining.slice();

    while (pool.length) {
      // Prefer words that share letters with the grid, then longer words.
      pool.sort((a, b) => {
        const oa = overlapScore(grid, a.answer);
        const ob = overlapScore(grid, b.answer);
        if (ob !== oa) return ob - oa;
        return b.answer.length - a.answer.length;
      });

      let placedThisPass = 0;
      const nextPool: InputWord[] = [];

      // Try intersect placements
      for (const w of pool) {
        const best = findBestPlacement(grid, w.answer);
        if (best) {
          writeWord(grid, w.answer, best.row, best.col, best.dir);
          placed.push({
            id: w.id,
            answer: w.answer,
            clue: w.clue,
            direction: best.dir,
            row: best.row,
            col: best.col,
          });
          placedThisPass++;
        } else {
          nextPool.push(w);
        }
      }

      if (nextPool.length === 0) break; // all placed

      if (placedThisPass === 0) {
        // We're stuck: allow exactly one island (nearest to current blob)
        const pick = pickBestIslandWord(nextPool);
        let islanded = false;

        if (allowIslandFallback) {
          const near = sidePlaceNearest(grid, pick.answer);
          if (near) {
            writeWord(grid, pick.answer, near.row, near.col, near.dir);
            placed.push({
              id: pick.id,
              answer: pick.answer,
              clue: pick.clue,
              direction: near.dir,
              row: near.row,
              col: near.col,
            });
            islanded = true;
          }
        }

        if (islanded) {
          // remove pick from nextPool
          const idx = nextPool.findIndex((x) => x.id === pick.id);
          if (idx >= 0) nextPool.splice(idx, 1);
        } else {
          // truly unplaceable
          const idx = nextPool.findIndex((x) => x.id === pick.id);
          if (idx >= 0) nextPool.splice(idx, 1);
          unplaced.push(pick);
        }
      }

      pool = nextPool;
    }

    // any leftovers are unplaceable
    for (const w of pool) unplaced.push(w);
  }

  // 3) entries with positions[]
  const entries: Entry[] = placed.map((p) => ({
    id: p.id,
    answer: p.answer,
    clue: p.clue,
    direction: p.direction,
    positions: positionsOf(p),
  }));

  return { grid, entries, unplaced };
}

/* ----------------- helpers ----------------- */

function inBounds(size: number, r: number, c: number) {
  return r >= 0 && r < size && c >= 0 && c < size;
}

// crossword-ish constraints (no side-touch unless overlapping)
function canPlaceWord(
  grid: Cell[][],
  word: string,
  row: number,
  col: number,
  dir: Direction
): boolean {
  const size = grid.length;

  if (dir === "across") {
    if (col + word.length > size) return false;
    // boundary cells before/after must be empty/out
    if (inBounds(size, row, col - 1) && grid[row][col - 1].letter) return false;
    if (
      inBounds(size, row, col + word.length) &&
      grid[row][col + word.length].letter
    )
      return false;

    for (let i = 0; i < word.length; i++) {
      const r = row,
        c = col + i;
      const cell = grid[r][c];

      // conflict on existing letter
      if (cell.letter && cell.letter !== word[i]) return false;

      // if not overlapping here, avoid side-touch up/down
      if (!cell.letter) {
        if (inBounds(size, r - 1, c) && grid[r - 1][c].letter) return false;
        if (inBounds(size, r + 1, c) && grid[r + 1][c].letter) return false;
      }
    }
    return true;
  } else {
    if (row + word.length > size) return false;
    if (inBounds(size, row - 1, col) && grid[row - 1][col].letter) return false;
    if (
      inBounds(size, row + word.length, col) &&
      grid[row + word.length][col].letter
    )
      return false;

    for (let i = 0; i < word.length; i++) {
      const r = row + i,
        c = col;
      const cell = grid[r][c];

      if (cell.letter && cell.letter !== word[i]) return false;

      if (!cell.letter) {
        if (inBounds(size, r, c - 1) && grid[r][c - 1].letter) return false;
        if (inBounds(size, r, c + 1) && grid[r][c + 1].letter) return false;
      }
    }
    return true;
  }
}

function writeWord(
  grid: Cell[][],
  word: string,
  row: number,
  col: number,
  dir: Direction
) {
  for (let i = 0; i < word.length; i++) {
    const r = dir === "across" ? row : row + i;
    const c = dir === "across" ? col + i : col;
    grid[r][c] = { letter: word[i], isBlocked: false };
  }
}

function positionsOf(p: Placed): { row: number; col: number }[] {
  const out: { row: number; col: number }[] = [];
  for (let i = 0; i < p.answer.length; i++) {
    out.push({
      row: p.direction === "across" ? p.row : p.row + i,
      col: p.direction === "across" ? p.col + i : p.col,
    });
  }
  return out;
}

// score candidates: prioritize intersections, then centrality
function findBestPlacement(
  grid: Cell[][],
  word: string
): { row: number; col: number; dir: Direction } | null {
  const size = grid.length;
  const candidates: {
    row: number;
    col: number;
    dir: Direction;
    score: number;
  }[] = [];
  const centerR = (size - 1) / 2;
  const centerC = (size - 1) / 2;

  // index letters on grid
  const letterSpots: Record<string, { r: number; c: number }[]> = {};
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const ch = grid[r][c].letter;
      if (!ch) continue;
      (letterSpots[ch] ??= []).push({ r, c });
    }
  }

  for (let i = 0; i < word.length; i++) {
    const ch = word[i];
    const spots = letterSpots[ch] || [];
    for (const s of spots) {
      // across
      const startCol = s.c - i;
      if (
        inBounds(size, s.r, startCol) &&
        inBounds(size, s.r, startCol + word.length - 1)
      ) {
        if (canPlaceWord(grid, word, s.r, startCol, "across")) {
          const inter = countIntersections(grid, word, s.r, startCol, "across");
          const centerDist =
            Math.abs(s.r - centerR) +
            Math.abs(startCol + (word.length - 1) / 2 - centerC);
          const score = inter * 10 - centerDist;
          candidates.push({ row: s.r, col: startCol, dir: "across", score });
        }
      }
      // down
      const startRow = s.r - i;
      if (
        inBounds(size, startRow, s.c) &&
        inBounds(size, startRow + word.length - 1, s.c)
      ) {
        if (canPlaceWord(grid, word, startRow, s.c, "down")) {
          const inter = countIntersections(grid, word, startRow, s.c, "down");
          const centerDist =
            Math.abs(startRow + (word.length - 1) / 2 - centerR) +
            Math.abs(s.c - centerC);
          const score = inter * 10 - centerDist;
          candidates.push({ row: startRow, col: s.c, dir: "down", score });
        }
      }
    }
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  return { row: best.row, col: best.col, dir: best.dir };
}

function countIntersections(
  grid: Cell[][],
  word: string,
  row: number,
  col: number,
  dir: Direction
): number {
  let n = 0;
  for (let i = 0; i < word.length; i++) {
    const r = dir === "across" ? row : row + i;
    const c = dir === "across" ? col + i : col;
    if (grid[r][c].letter === word[i]) n++;
  }
  return n;
}

/* --------------- "Nearby island" placement helpers --------------- */

function overlapScore(grid: Cell[][], ans: string): number {
  const H = grid.length,
    W = grid[0].length;
  const seen = new Set<string>();
  for (let r = 0; r < H; r++)
    for (let c = 0; c < W; c++) {
      const ch = grid[r][c].letter;
      if (ch) seen.add(ch);
    }
  let score = 0;
  for (const ch of ans) if (seen.has(ch)) score++;
  return score;
}

function pickBestIslandWord(pool: InputWord[]): InputWord {
  // Heuristic: longest word first (you can tweak to prefer most-overlap too)
  return pool.slice().sort((a, b) => b.answer.length - a.answer.length)[0];
}

function sidePlaceNearest(
  grid: Cell[][],
  word: string
): { row: number; col: number; dir: Direction } | null {
  const size = grid.length;
  const centroid = gridCentroid(grid);
  const candidates: {
    row: number;
    col: number;
    dir: Direction;
    dist: number;
  }[] = [];

  // try every legal placement; score by distance to centroid
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (canPlaceWord(grid, word, r, c, "across")) {
        const midC = c + (word.length - 1) / 2;
        const dist = Math.abs(r - centroid.r) + Math.abs(midC - centroid.c);
        candidates.push({ row: r, col: c, dir: "across", dist });
      }
      if (canPlaceWord(grid, word, r, c, "down")) {
        const midR = r + (word.length - 1) / 2;
        const dist = Math.abs(midR - centroid.r) + Math.abs(c - centroid.c);
        candidates.push({ row: r, col: c, dir: "down", dist });
      }
    }
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => a.dist - b.dist);
  const best = candidates[0];
  return { row: best.row, col: best.col, dir: best.dir };
}

function gridCentroid(grid: Cell[][]): { r: number; c: number } {
  const H = grid.length,
    W = grid[0].length;
  let sr = 0,
    sc = 0,
    n = 0;
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      if (grid[r][c].letter) {
        sr += r;
        sc += c;
        n++;
      }
    }
  }
  if (n === 0) {
    // default to center-ish
    return { r: (H - 1) / 2, c: (W - 1) / 2 };
  }
  return { r: sr / n, c: sc / n };
}
