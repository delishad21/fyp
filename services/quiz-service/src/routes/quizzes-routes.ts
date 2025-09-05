import { Router } from "express";
import { BaseQuizLean, QuizBaseModel } from "../model/quiz-base-model";
import {
  makeVerifyOwnerOrAdmin,
  verifyAccessToken,
  verifyIsAdmin,
} from "../middleware/access-control";
import { uploadQuizImages } from "../middleware/uploads";
import {
  createQuiz,
  deleteQuiz,
  getQuiz,
  listAllQuizzes,
  listMyQuizzes,
  updateQuiz,
} from "../controller/quiz-controller";
import { generateCrosswordHandler } from "../controller/crossword-generator-controller";

const router = Router();

/** Guard: owner or admin for a given :id (works for any discriminator) */
const verifyQuizOwnerOrAdmin = makeVerifyOwnerOrAdmin(async (req) => {
  const id = req.params.id;
  if (!id) return null;
  const doc = await QuizBaseModel.findById(id)
    .select("owner")
    .lean<BaseQuizLean>();
  return doc ? String(doc.owner) : null;
});

/* ------- Order matters: put specific routes before `/:id` ------- */

/** List all (admin only, optional) */
router.get("/admin/all", verifyAccessToken, verifyIsAdmin, listAllQuizzes);

/** List my quizzes (by owner) */
router.get("/", verifyAccessToken, listMyQuizzes);

/** Create (all quiz types via discriminator) */
router.post("/", verifyAccessToken, createQuiz);

/** Read one */
router.get("/:id", verifyAccessToken, verifyQuizOwnerOrAdmin, getQuiz);

/** Update (all quiz types) */
router.patch("/:id", verifyAccessToken, verifyQuizOwnerOrAdmin, updateQuiz);

/** Delete */
router.delete("/:id", verifyAccessToken, verifyQuizOwnerOrAdmin, deleteQuiz);

router.post("/generate-crossword", generateCrosswordHandler);

router.post(
  "/upload",
  verifyAccessToken,
  uploadQuizImages, // disk storage to /uploads
  (req, res) => {
    const files = (req.files ?? []) as Express.Multer.File[];
    const f = files[0];
    if (!f) return res.status(400).json({ ok: false, message: "No file" });

    const url = `${process.env.IMAGE_UPLOAD_URL}/${require("path").basename(
      (f as any).path
    )}`;

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
  }
);

export default router;
