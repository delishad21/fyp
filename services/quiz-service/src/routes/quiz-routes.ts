import { Router } from "express";
import {
  verifyAccessToken,
  verifyIsAdmin,
  verifyQuizOwnerOrAdmin,
} from "../middleware/access-control";
import { uploadQuizImages } from "../middleware/uploads";
import {
  batchGetQuizzes,
  createQuiz,
  deleteQuiz,
  getQuiz,
  listAllQuizzes,
  listMyQuizzes,
  updateQuiz,
} from "../controller/quiz-controller";
import { generateCrosswordHandler } from "../controller/crossword-generator-controller";

const router = Router();

/**
 * Routes under prefix: /quiz  (mounted in index.ts)
 * Keep more specific/static paths before dynamic (/:id).
 *
 * Each route explains: method, full path, and purpose.
 */

/** GET /quiz/admin/all — Admin-only listing with filters/pagination */
router.get("/admin/all", verifyAccessToken, verifyIsAdmin, listAllQuizzes);

/** GET /quiz — List my quizzes (owner=auth user) with filters/pagination */
router.get("/", verifyAccessToken, listMyQuizzes);

/** POST /quiz/batch — Batch fetch quiz metadata by IDs (forbidden → missing) */
router.post("/batch", verifyAccessToken, batchGetQuizzes);

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
    (f as any).path
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

export default router;
