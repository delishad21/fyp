export type StudentDraft = { name: string; email?: string; username?: string };
export type StudentFieldError =
  | { name?: string; username?: string; email?: string }
  | undefined;
