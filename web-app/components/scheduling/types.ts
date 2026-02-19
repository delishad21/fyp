import type { FilterOption, RowData } from "@/services/quiz/types/quiz-table-types";
import type { ScheduleItem } from "@/services/class/types/class-types";

export type QuizRowPayload = {
  id: string;
  rootQuizId?: string;
  version?: number;
  title: string;
  subject?: string;
  subjectColorHex?: string;
  topic?: string;
  type?: string;
  createdAt?: string | Date;
};

export type QuizBankState = {
  rows: RowData[];
  page: number;
  pageCount: number;
  total: number;
};

export type ScheduleClassBundle = {
  classId: string;
  className?: string;
  classTimezone: string;
  colorHex?: string;
  schedule: ScheduleItem[];
};

export type ScheduleDropAction =
  | {
      kind: "single";
      classId: string;
      dayKey: string;
    }
  | {
      kind: "bulk";
      dayKey: string;
    };

export type QuizFilterMeta = {
  subjects: FilterOption[];
  topics: FilterOption[];
  types: FilterOption[];
};
