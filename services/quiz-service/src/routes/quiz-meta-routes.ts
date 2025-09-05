import { Router } from "express";
import { verifyAccessToken } from "../middleware/access-control";
import {
  getMyMeta,
  addMeta,
  editMeta,
  deleteMeta,
} from "../controller/quiz-meta-controller";

const router = Router();

/** Get current user's meta (subjects, topics, typeColors) */
router.get("/", verifyAccessToken, getMyMeta);

/** Add or upsert a subject/topic */
router.post("/", verifyAccessToken, addMeta);

/** Edit a subject/topic by value (slug) */
router.patch("/:kind/:value", verifyAccessToken, editMeta);

/** Delete a subject/topic by value (slug); blocked if in use */
router.delete("/:kind/:value", verifyAccessToken, deleteMeta);

export default router;
