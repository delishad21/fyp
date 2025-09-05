declare module "crossword-layout-generator" {
  interface WordLayout {
    word: string;
    clue: string;
    startx: number;
    starty: number;
    orientation: "across" | "down" | "none";
  }

  interface CrosswordResult {
    grid: string[][];
    words: WordLayout[];
  }

  export default class CrosswordLayout {
    constructor(words: string[], clues?: string[]);
    getSquareGrid(
      width: number,
      height: number,
      fillBlanks?: boolean
    ): CrosswordResult;
  }
}
