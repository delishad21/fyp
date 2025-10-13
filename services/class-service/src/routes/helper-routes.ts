import { Router } from "express";
import {
  checkAttemptEligibilityBySchedule,
  checkIfTeacherOfClass,
  checkIfTeacherOfSchedule,
  checkIfTeacherOfStudent,
} from "../controller/helper-controller";
import { verifySharedSecret } from "../middleware/access-control";

const router = Router();

/**
 * Routes under prefix: /helper  (mounted in index.ts)
 * S2S endpoints; auth is enforced in controller via x-quiz-secret.
 */

/** POST /helper/attempt-eligibility — Check if a student may attempt a scheduled quiz */
router.post(
  "/attempt-eligibility",
  verifySharedSecret,
  checkAttemptEligibilityBySchedule
);

/** POST /helper/check-teacher-of-class — Verify if user is a teacher of a class */
router.post(
  "/check-teacher-of-class",
  verifySharedSecret,
  checkIfTeacherOfClass
);

/** POST /helper/check-teacher-of-schedule — Verify if user teaches the class that owns scheduleId */
router.post(
  "/check-teacher-of-schedule",
  verifySharedSecret,
  checkIfTeacherOfSchedule
);

router.post(
  "/check-teacher-of-student",
  verifySharedSecret,
  checkIfTeacherOfStudent
);

export default router;
