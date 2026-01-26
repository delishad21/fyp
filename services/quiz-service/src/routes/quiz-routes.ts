import { Router } from "express";
import {
  verifyAccessToken,
  verifyIsAdmin,
  verifyQuizOwnerOrAdmin,
} from "../middleware/access-control";
import { uploadQuizImages } from "../middleware/uploads";
import {
  batchGetCanonicalQuizzesInternal,
  batchGetQuizzesInternal,
  cloneQuiz,
  createQuiz,
  deleteQuiz,
  getQuizTypeColors,
  getQuiz,
  getQuizVersionsInternal,
  listAllQuizzes,
  listMyQuizzes,
  updateQuiz,
} from "../controller/quiz-controller";
import { generateCrosswordHandler } from "../controller/crossword-generator-controller";
import { getQuizStructureAndRules } from "../controller/quiz-structure-controller";
import {
  createQuizzesBatch,
  createQuizzesBatchInternal,
} from "../controller/quiz-batch-controller";

const router = Router();

/**
 * Routes under prefix: /quiz  (mounted in index.ts)
 * Keep more specific/static paths before dynamic (/:id).
 *
 * Each route explains: method, full path, and purpose.
 */

/** GET /quiz/admin/all — Admin-only listing with filters/pagination */
router.get("/admin/all", verifyAccessToken, verifyIsAdmin, listAllQuizzes);

/** GET /quiz/type-colors — Static quiz-type colors */
router.get("/type-colors", verifyAccessToken, getQuizTypeColors);

/** GET /quiz/structure-and-rules — Get quiz schemas + AI rules (public for service-to-service) */
router.get("/structure-and-rules", getQuizStructureAndRules);

/** POST /quiz/batch — Batch create quizzes (for AI service) */
router.post("/batch", verifyAccessToken, createQuizzesBatch);

/** GET /quiz — List my quizzes (owner=auth user) with filters/pagination */
router.get("/", verifyAccessToken, listMyQuizzes);

/** POST /quiz — Create a quiz (any registered quiz type via discriminator) */
router.post("/", verifyAccessToken, createQuiz);

/** POST /quiz/generate-crossword — Generate crossword content (utility) */
router.post("/generate-crossword", verifyAccessToken, generateCrosswordHandler);

/** POST /quiz/upload — Upload image file used by quizzes */
router.post("/upload", verifyAccessToken, uploadQuizImages, (req, res) => {
  /** Step 1: basic validation */
  const files = (req.files ?? []) as Express.Multer.File[];
  const f = files[0];
  if (!f) return res.status(400).json({ ok: false, message: "No file" });

  /** Step 2: build public URL from disk path (behind IMAGE_UPLOAD_URL) */
  const url = `${process.env.IMAGE_UPLOAD_URL}/${require("path").basename(
    (f as any).path,
  )}`;

  /** Step 3: respond with minimal file metadata */
  console.log(`[IMAGE] Uploaded image ${url}`);
  return res.json({
    ok: true,
    data: {
      url,
      filename: f.originalname,
      mimetype: f.mimetype,
      size: f.size,
    },
  });
});

/** GET /quiz/:id — Read a single quiz (owner or admin) */
router.get("/:id", verifyAccessToken, verifyQuizOwnerOrAdmin, getQuiz);

/** PATCH /quiz/:id — Update quiz (owner/admin). Purges attempts on content change. */
router.patch("/:id", verifyAccessToken, verifyQuizOwnerOrAdmin, updateQuiz);

/** DELETE /quiz/:id — Delete quiz (owner/admin). Emits QuizDeleted event. */
router.delete("/:id", verifyAccessToken, verifyQuizOwnerOrAdmin, deleteQuiz);

/** POST /quiz/:id/clone — Duplicate a quiz as a new quiz (version = 1). */
router.post("/:id/clone", verifyAccessToken, verifyQuizOwnerOrAdmin, cloneQuiz);

// internal routes guarded by shared secret
router.post("/internal/batch", batchGetQuizzesInternal);
router.post("/internal/batch-create", createQuizzesBatchInternal); // For AI service batch creation
router.post("/internal/versions", getQuizVersionsInternal);
router.post("/internal/canonical-batch", batchGetCanonicalQuizzesInternal);
router.post("/internal/generate-crossword", generateCrosswordHandler); // For AI service

export default router;
