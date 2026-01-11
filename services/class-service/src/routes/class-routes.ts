import { Router } from "express";
import {
  createClass,
  getClasses,
  getClassById,
  updateClass,
  deleteClass,
  getMyClasses,
  getClassCalculatedStats,
  getTopStudents,
} from "../controller/class-controller";
import {
  verifyAccessToken,
  verifyClassOwnerOrAdmin,
  verifyIsAdmin,
} from "../middleware/access-control";

const router = Router();

/**
 * Routes under prefix: /classes  (mounted in index.ts)
 */

/** POST /classes — Create a new class and seed per-student stats */
router.post("/", verifyAccessToken, createClass);

/** GET /classes — Admin-only list of all classes (light projection, no roster/schedule) */
router.get("/", verifyAccessToken, verifyIsAdmin, getClasses);

/** GET /classes/my — List classes I own or teach (with studentCount but no roster/schedule) */
router.get("/my", verifyAccessToken, getMyClasses);

/** GET /classes/:id — Get a single class with derived statsDoc + leaderboard meta */
router.get("/:id", verifyAccessToken, verifyClassOwnerOrAdmin, getClassById);

/** GET /classes/:id/stats — Aggregated participation/grade stats for a class */
router.get(
  "/:id/stats",
  verifyAccessToken,
  verifyClassOwnerOrAdmin,
  getClassCalculatedStats
);

/** PUT /classes/:id — Update class metadata (name, level, image, metadata, timezone) */
router.put("/:id", verifyAccessToken, verifyClassOwnerOrAdmin, updateClass);

/** DELETE /classes/:id — Delete class, stats, attempts and (best-effort) linked students */
router.delete("/:id", verifyAccessToken, verifyClassOwnerOrAdmin, deleteClass);

/** GET /classes/:id/top — Top students by score, participation, and streak */
router.get(
  "/:id/top",
  verifyAccessToken,
  verifyClassOwnerOrAdmin,
  getTopStudents
);

export default router;
