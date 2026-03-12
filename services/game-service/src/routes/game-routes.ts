import { Router } from "express";
import {
  getClassLeaderboard,
  getClassStudentProfile,
  getStudentAttemptOutcome,
  getServiceHealth,
  getTopLeaderboardRows,
} from "../controller/game-controller";
import {
  createClassRewardRule,
  deleteClassRewardRule,
  equipStudentItem,
  acknowledgeAttemptRewards,
  acknowledgeStudentNotifications,
  getClassBadgeConfig,
  getClassScoreRewardConfig,
  getClassRewardInventories,
  getBadgeImageSvg,
  getCosmeticAssetSvg,
  getCosmeticPreviewSvg,
  getClassRewardRules,
  getRewardsCatalog,
  getStudentBadges,
  getStudentAttemptRewards,
  getStudentNotifications,
  getStudentAvatarProfileSvg,
  getStudentAvatarSvg,
  getStudentInventory,
  grantStudentReward,
  updateClassBadgeConfig,
  updateClassScoreRewardConfig,
  updateClassRewardRule,
  updateStudentDisplayedBadges,
  updateStudentInventory,
} from "../controller/rewards-controller";
import {
  verifyTeacherOfStudentOrSelf,
  verifyAttemptOwnerOrPrivileged,
  verifyAccessToken,
} from "../middleware/access-control";

const router = Router();

/**
 * Routes under prefix:
 * - /         (mounted in src/index.ts)
 * - /api/game (mounted in src/index.ts)
 */

/** Health */
router.get("/health", getServiceHealth);

/** Leaderboards and profile */
router.get("/classes/:classId/leaderboard", getClassLeaderboard);
router.get("/classes/:classId/leaderboard/top", getTopLeaderboardRows);
router.get("/classes/:classId/students/:studentId/profile", getClassStudentProfile);

/** Protected attempt outcome */
router.get(
  "/classes/:classId/students/:studentId/attempts/:attemptId/outcome",
  verifyAccessToken,
  verifyAttemptOwnerOrPrivileged,
  getStudentAttemptOutcome
);

/** Rewards catalog and class reward config */
router.get("/rewards/catalog", getRewardsCatalog);
router.get("/rewards/cosmetics/:cosmeticId/preview.svg", getCosmeticPreviewSvg);
router.get("/rewards/cosmetics/:cosmeticId/asset.svg", getCosmeticAssetSvg);
router.get("/classes/:classId/rewards/catalog", getRewardsCatalog);
router.get("/classes/:classId/rewards/score-config", getClassScoreRewardConfig);
router.put("/classes/:classId/rewards/score-config", updateClassScoreRewardConfig);
router.get("/classes/:classId/badges/config", getClassBadgeConfig);
router.put("/classes/:classId/badges/config", updateClassBadgeConfig);
router.get("/classes/:classId/rewards/rules", getClassRewardRules);
router.post("/classes/:classId/rewards/rules", createClassRewardRule);
router.put("/classes/:classId/rewards/rules/:ruleId", updateClassRewardRule);
router.delete("/classes/:classId/rewards/rules/:ruleId", deleteClassRewardRule);
router.get("/classes/:classId/rewards/inventories", getClassRewardInventories);
router.get("/classes/:classId/students/:studentId/inventory", getStudentInventory);
router.get("/classes/:classId/students/:studentId/badges", getStudentBadges);
router.put(
  "/classes/:classId/students/:studentId/badges/display",
  updateStudentDisplayedBadges
);

/** Protected attempt reward reveal + acknowledge */
router.get(
  "/classes/:classId/students/:studentId/rewards/attempt/:attemptId",
  verifyAccessToken,
  verifyAttemptOwnerOrPrivileged,
  getStudentAttemptRewards
);
router.post(
  "/classes/:classId/students/:studentId/rewards/attempt/:attemptId/ack",
  verifyAccessToken,
  verifyAttemptOwnerOrPrivileged,
  acknowledgeAttemptRewards
);

/** Protected notifications feed + acknowledge */
router.get(
  "/classes/:classId/students/:studentId/notifications",
  verifyAccessToken,
  verifyTeacherOfStudentOrSelf,
  getStudentNotifications
);
router.post(
  "/classes/:classId/students/:studentId/notifications/ack",
  verifyAccessToken,
  verifyTeacherOfStudentOrSelf,
  acknowledgeStudentNotifications
);

/** Avatar and badge rendering */
router.get(
  "/classes/:classId/students/:studentId/avatar-profile.svg",
  getStudentAvatarProfileSvg
);
router.get("/classes/:classId/students/:studentId/avatar.svg", getStudentAvatarSvg);
router.get("/classes/:classId/badges/:badgeId/image.svg", getBadgeImageSvg);
router.get(
  "/classes/:classId/rewards/cosmetics/:cosmeticId/preview.svg",
  getCosmeticPreviewSvg
);
router.get(
  "/classes/:classId/rewards/cosmetics/:cosmeticId/asset.svg",
  getCosmeticAssetSvg
);

/** Inventory/equip/grant mutations */
router.put("/classes/:classId/students/:studentId/inventory", updateStudentInventory);
router.post("/classes/:classId/students/:studentId/equip", equipStudentItem);
router.post("/classes/:classId/students/:studentId/rewards/grant", grantStudentReward);

export default router;
