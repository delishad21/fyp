import { Router } from "express";
import {
  getSchedule,
  getScheduleItemById,
  editScheduleItem,
  removeScheduleItem,
  removeAllForQuizId,
  getAvailableScheduleWithStats,
  addScheduleItem,
  getAllClassesScheduleForTeacher,
  getTodaySchedulesForTeacher,
} from "../controller/schedule-controller";
import {
  verifyAccessToken,
  verifyClassOwnerOrAdmin,
} from "../middleware/access-control";

const router = Router();

/**
 * Routes under prefix: /classes  (mounted in index.ts)
 * - Class-scoped scheduling routes live under a specific class id (:id).
 * - Teacher-wide schedule views live under /classes/schedule/*.
 */

/** POST /classes/:id/schedule — Create a schedule entry for a quiz */
router.post(
  "/:id/schedule",
  verifyAccessToken,
  verifyClassOwnerOrAdmin,
  addScheduleItem
);

/** GET /classes/:id/schedule — List schedule entries for the class */
router.get(
  "/:id/schedule",
  verifyAccessToken,
  verifyClassOwnerOrAdmin,
  getSchedule
);

/** GET /classes/:id/schedule/available — List available entries (startDate <= now) with stats */
router.get(
  "/:id/schedule/available",
  verifyAccessToken,
  verifyClassOwnerOrAdmin,
  getAvailableScheduleWithStats
);

/** GET /classes/:id/schedule/item/:scheduleId — Get a schedule entry with meta, canonicals, and stats */
router.get(
  "/:id/schedule/item/:scheduleId",
  verifyAccessToken,
  verifyClassOwnerOrAdmin,
  getScheduleItemById
);

/** PATCH /classes/:id/schedule/item/:scheduleId — Edit a single schedule entry */
router.patch(
  "/:id/schedule/item/:scheduleId",
  verifyAccessToken,
  verifyClassOwnerOrAdmin,
  editScheduleItem
);

/** DELETE /classes/:id/schedule/item/:scheduleId — Delete a single schedule entry */
router.delete(
  "/:id/schedule/item/:scheduleId",
  verifyAccessToken,
  verifyClassOwnerOrAdmin,
  removeScheduleItem
);

/** DELETE /classes/:id/schedule/quiz/:quizId — Delete all entries for a quiz in this class */
router.delete(
  "/:id/schedule/quiz/:quizId",
  verifyAccessToken,
  verifyClassOwnerOrAdmin,
  removeAllForQuizId
);

/**
 * GET /classes/schedule/all
 * All schedule items for all of the requesting teacher's classes,
 * grouped by class.
 */
router.get("/schedule/all", verifyAccessToken, getAllClassesScheduleForTeacher);

/**
 * GET /classes/schedule/today
 * "Today's" schedule items (time window overlapping the requested day)
 * across all of the teacher's classes, with basic stats.
 */
router.get("/schedule/today", verifyAccessToken, getTodaySchedulesForTeacher);

export default router;
