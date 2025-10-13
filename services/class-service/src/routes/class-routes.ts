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

router.post("/", verifyAccessToken, createClass);

// Owners/admins only
router.get("/", verifyAccessToken, verifyIsAdmin, getClasses);
router.get("/my", verifyAccessToken, getMyClasses); // all classes owned by the user
router.get("/:id", verifyAccessToken, verifyClassOwnerOrAdmin, getClassById);
router.get(
  "/:id/stats",
  verifyAccessToken,
  verifyClassOwnerOrAdmin,
  getClassCalculatedStats
);
router.put("/:id", verifyAccessToken, verifyClassOwnerOrAdmin, updateClass);
router.delete("/:id", verifyAccessToken, verifyClassOwnerOrAdmin, deleteClass);
router.get(
  "/:id/top",
  verifyAccessToken,
  verifyClassOwnerOrAdmin,
  getTopStudents
);

export default router;
