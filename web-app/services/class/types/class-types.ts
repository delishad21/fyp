import { QuizAttemptDto } from "@/services/quiz/actions/get-quiz-attempt";

export interface ClassValues {
  name: string;
  level: string;
  color?: string;
}

export type ImgMeta = { url?: string; filename?: string; path?: string };

export type ClassItem = {
  _id: string;
  name: string;
  level: string;
  image?: ImgMeta | null;
  studentCount?: number;
  metadata?: { color?: string };
  stats?: {
    totals?: {
      assigned?: number;
      attempts?: number;
      sumScore?: number;
      sumMax?: number;
    };
  };
};

// allow string OR array-of-strings for fields like "students"
export type FieldError = string | string[];

export type IssuedCredential = {
  userId: string;
  name: string;
  username: string;
  email?: string;
  /** Present when includePasswords=true on bulk create */
  temporaryPassword?: string;
};

export type IssuedCredentials = IssuedCredential[];

/**
 * Unified state for both create and edit flows.
 * - `issuedCredentials` is populated only on successful CREATE (when requested).
 * - `redirect` can be set on successful EDIT to navigate back to the class page.
 */
export interface ClassFormState {
  ok: boolean;
  message?: string;
  redirect?: string; // used on edit success
  fieldErrors: {
    name?: string;
    level?: string;
    image?: string;
    color?: string;
    students?: (
      | undefined
      | { name?: string; username?: string; email?: string }
    )[];
    schedule?: (string[] | undefined)[];
    timezone?: string;
  };
  values: ClassValues;
  issuedCredentials?: IssuedCredentials; // used on create success
}

/**
 * SchdulerBoard types
 */

export type QuizLite = {
  id: string;
  title: string;
  subject?: string;
  subjectColorHex?: string;
  topic?: string;
  quizType?: string;
  type?: string;
  createdAt?: string | Date;
  rootQuizId?: string | null;
  version?: number | null;
};

export type DragData =
  | { kind: "quiz-row"; rowId: string; quiz?: QuizLite }
  | {
      kind: "pill";
      clientId: string;
      _id?: string;
      quizId: string;
      title?: string;
      subjectColor?: string;
    }
  | {
      kind: "pill-resize";
      clientId: string;
      _id?: string;
      dir: "left" | "right";
      quizId: string;
      title?: string;
      subjectColor?: string;
    };

/**
 * AttemptHeader types
 */

export type AttemptHeaderData = QuizAttemptDto;

/**
 * AttemptSwitcher types
 */

export type StudentAttemptRow = {
  _id: string;
  finishedAt?: string;
  startedAt?: string;
  createdAt?: string;
  score?: number;
  maxScore?: number;
};

/**
 * BasicOrRapidAttempt types
 */

export type BasicOrRapidAttemptType = {
  answers: Record<string, any>;
  breakdown?: { itemId: string; awarded: number; max: number; meta?: any }[];
  quizVersionSnapshot: {
    renderSpec: {
      items: Array<
        | {
            kind: "mc";
            id: string;
            text: string;
            timeLimit: number | null;
            image?: any;
            options: { id: string; text: string }[];
          }
        | {
            kind: "open";
            id: string;
            text: string;
            timeLimit: number | null;
            image?: any;
          }
        | {
            kind: "context";
            id: string;
            text: string;
            image?: any;
          }
      >;
    };
  };
};

/**
 * CrosswordAttempt types
 */

export type CrosswordAttemptType = {
  answers: Record<string, any>;
  maxScore?: number;
  score?: number;
  breakdown?: { itemId: string; awarded: number; max: number; meta?: any }[];
  quizVersionSnapshot: {
    renderSpec: {
      items: Array<
        | {
            kind: "crossword";
            id: "crossword";
            totalTimeLimit: number | null;
            grid?: Array<Array<{ letter?: string | null; isBlocked: boolean }>>;
            entries: Array<{
              id: string;
              clue: string;
              positions: { row: number; col: number }[];
              direction: "across" | "down" | null;
            }>;
          }
        | any
      >;
    };
  };
};

/**
 * Podium types
 * */

export type WinnerLite = {
  displayName: string;
  photoUrl?: string | null;
  rightText: string;
  subText?: string;
  userId?: string;
  className?: string;
};

/**
 * OverviewScheduleClient types
 */

export type ScheduleItem = {
  clientId: string;
  _id?: string;
  quizId: string;
  quizRootId: string;
  quizVersion: number;
  startDate: string;
  endDate: string;
  quizName?: string;
  subject?: string;
  subjectColor?: string;
  contribution?: number;
  attemptsAllowed?: number;
  showAnswersAfterAttempt?: boolean;
  [k: string]: any;
};

/**
 * ScheuldeItemEditModal
 */

export type ScheduleItemLike = {
  clientId: string;
  _id?: string;
  quizName?: string;
  quizVersion?: number;
  startDate: string; // ISO
  endDate: string; // ISO
  contribution?: number;
  attemptsAllowed?: number;
  showAnswersAfterAttempt?: boolean;
};

export type SaveResult = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string | string[] | undefined>;
};

/**
 * Student Profile types
 * */
