export type GenerationLimits = {
  maxQuizzesPerGeneration: number;
  minQuestionsPerQuiz: number;
  maxQuestionsPerQuiz: number;
};

const DEV_DEFAULT_MAX_QUIZZES_PER_GENERATION = 10;
const PROD_DEFAULT_MAX_QUIZZES_PER_GENERATION = 5;
const DEV_DEFAULT_MAX_QUESTIONS_PER_QUIZ = 15;
const PROD_DEFAULT_MAX_QUESTIONS_PER_QUIZ = 10;
const DEFAULT_MIN_QUESTIONS_PER_QUIZ = 5;

function parseInteger(raw: string | undefined, fallback: number) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.floor(value);
}

function getRuntimeDefaults() {
  const nodeEnv = String(process.env.NODE_ENV || "").trim().toLowerCase();
  const appEnv = String(process.env.ENV || "").trim().toLowerCase();
  const isProduction = nodeEnv === "production" || appEnv === "prod";

  return {
    maxQuizzesPerGeneration: isProduction
      ? PROD_DEFAULT_MAX_QUIZZES_PER_GENERATION
      : DEV_DEFAULT_MAX_QUIZZES_PER_GENERATION,
    maxQuestionsPerQuiz: isProduction
      ? PROD_DEFAULT_MAX_QUESTIONS_PER_QUIZ
      : DEV_DEFAULT_MAX_QUESTIONS_PER_QUIZ,
  };
}

export function getGenerationLimits(): GenerationLimits {
  const defaults = getRuntimeDefaults();

  const maxQuizzesPerGeneration = Math.max(
    1,
    parseInteger(
      process.env.AI_MAX_QUIZZES_PER_GENERATION,
      defaults.maxQuizzesPerGeneration,
    ),
  );

  const maxQuestionsPerQuiz = Math.max(
    DEFAULT_MIN_QUESTIONS_PER_QUIZ,
    parseInteger(
      process.env.AI_MAX_QUESTIONS_PER_QUIZ,
      defaults.maxQuestionsPerQuiz,
    ),
  );

  return {
    maxQuizzesPerGeneration,
    minQuestionsPerQuiz: DEFAULT_MIN_QUESTIONS_PER_QUIZ,
    maxQuestionsPerQuiz,
  };
}
