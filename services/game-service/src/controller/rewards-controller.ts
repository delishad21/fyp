import { Request, Response } from "express";
import mongoose, { Types } from "mongoose";
import { GameClassStateModel } from "../model/class/game-class-state-model";
import { GameRewardRuleModel } from "../model/rewards/game-reward-rule-model";
import { GameRewardGrantModel } from "../model/rewards/game-reward-grant-model";
import { GameStudentInventoryModel } from "../model/rewards/game-student-inventory-model";
import { GameStudentNotificationModel } from "../model/rewards/game-student-notification-model";
import {
  DEFAULT_BADGES,
  buildBadgeRenderUrl,
  CosmeticSlot,
  CosmeticDefinition,
  getAvatarCatalogSummary,
  getBadgeById,
  parseDynamicBadgeId,
  getCosmeticById,
  getEmptyEquippedSlots,
  getDefaultRewardRuleTemplates,
  listCosmetics,
  resolveAvatarAssetUrl,
} from "../rewards/default-catalog";
import {
  buildAvatarComposition,
  buildAvatarProfileSvgWithLayerHref,
  buildAvatarSvg,
} from "../rewards/avatar-generator";
import {
  ensureDefaultRewardRules,
  getScoreThresholdConfig,
  ensureStudentInventory,
  grantRewardToStudent,
  normalizeInventoryInput,
  setStudentInventory,
  updateScoreThresholdConfig,
  validateRewardRulePayload,
} from "../rewards/reward-engine";
import {
  getBadgeConfig,
  recomputeThresholdBadgesForClass,
  updateBadgeConfig,
} from "../rewards/badge-engine";

import {
  badgeImageSvg,
  buildBadgePayload,
  buildDefaultPreviewEquippedSlots,
  escapeXml,
  firstQueryValue,
  getPngOpaqueBounds,
  normalizeSlotAlias,
  normalizeUnique,
  parseEquippedPayload,
  parseLimit,
  parseNotificationObjectIds,
  parseOptionalBoolean,
  parseStringArray,
  requireClassId,
  requireStudentId,
  resolveRewardPayload,
  notificationCopy,
  toInlineAssetDataUri,
} from "./rewards-controller-helpers";

export function getRewardsCatalog(_req: Request, res: Response) {
  const cosmetics = listCosmetics({ forceRefresh: true });
  const avatar = getAvatarCatalogSummary();
  return res.status(200).json({
    ok: true,
    data: {
      avatar,
      cosmetics,
      badges: DEFAULT_BADGES,
      defaultRuleTemplates: getDefaultRewardRuleTemplates(),
    },
  });
}

/**
 * @route  GET /classes/:classId/rewards/score-config
 * @auth   Public (current route wiring)
 * @input  Params: { classId }
 * @returns 200 { ok, data: { classId, enabled, pointsPerReward } }
 */
export async function getClassScoreRewardConfig(req: Request, res: Response) {
  try {
    const classId = requireClassId(req, res);
    if (!classId) return;

    const config = await getScoreThresholdConfig(classId);
    return res.status(200).json({ ok: true, data: config });
  } catch (e: any) {
    return res
      .status(500)
      .json({ ok: false, message: e?.message || "Internal error" });
  }
}

/**
 * @route  PUT /classes/:classId/rewards/score-config
 * @auth   Public (current route wiring)
 * @input  Params: { classId }, Body: { enabled?, pointsPerReward? }
 * @notes  Updates class score-threshold reward configuration.
 * @returns 200 { ok, data: { classId, enabled, pointsPerReward } }
 * @errors  400 invalid payload
 *          500 internal error
 */
export async function updateClassScoreRewardConfig(
  req: Request,
  res: Response,
) {
  try {
    const classId = requireClassId(req, res);
    if (!classId) return;

    const parsedEnabled = parseOptionalBoolean(req.body?.enabled);
    const hasPoints = Object.prototype.hasOwnProperty.call(
      req.body || {},
      "pointsPerReward",
    );

    const updated = await updateScoreThresholdConfig(classId, {
      enabled: parsedEnabled,
      pointsPerReward: hasPoints
        ? Number(req.body?.pointsPerReward)
        : undefined,
      updatedBy: null,
    });

    return res.status(200).json({ ok: true, data: updated });
  } catch (e: any) {
    const message = e?.message || "Invalid score reward config payload";
    const status = /pointsPerReward/i.test(message) ? 400 : 500;
    return res.status(status).json({ ok: false, message });
  }
}

/**
 * @route  GET /classes/:classId/badges/config
 * @auth   Public (current route wiring)
 * @input  Params: { classId }
 * @returns 200 { ok, data: BadgeConfig }
 */
export async function getClassBadgeConfig(req: Request, res: Response) {
  try {
    const classId = requireClassId(req, res);
    if (!classId) return;

    const config = await getBadgeConfig(classId);
    return res.status(200).json({ ok: true, data: config });
  } catch (e: any) {
    return res
      .status(500)
      .json({ ok: false, message: e?.message || "Internal error" });
  }
}

/**
 * @route  PUT /classes/:classId/badges/config
 * @auth   Public (current route wiring)
 * @input  Params: { classId }, Body: { weeklyTopEnabled?, monthlyTopEnabled?, overallScoreThresholdEnabled?, streakThresholdEnabled?, overallScoreThresholdStep?, streakThresholdStep? }
 * @notes  Updates class badge config and recomputes threshold badges for the class.
 * @returns 200 { ok, data: BadgeConfig }
 * @errors  400 invalid payload
 *          500 internal error
 */
export async function updateClassBadgeConfig(req: Request, res: Response) {
  const classId = requireClassId(req, res);
  if (!classId) return;

  const session = await mongoose.startSession();

  try {
    let updatedConfig: any = null;
    await session.withTransaction(async () => {
      updatedConfig = await updateBadgeConfig(
        classId,
        {
          weeklyTopEnabled: parseOptionalBoolean(req.body?.weeklyTopEnabled),
          monthlyTopEnabled: parseOptionalBoolean(req.body?.monthlyTopEnabled),
          overallScoreThresholdEnabled: parseOptionalBoolean(
            req.body?.overallScoreThresholdEnabled
          ),
          streakThresholdEnabled: parseOptionalBoolean(req.body?.streakThresholdEnabled),
          overallScoreThresholdStep: Object.prototype.hasOwnProperty.call(
            req.body || {},
            "overallScoreThresholdStep"
          )
            ? Number(req.body?.overallScoreThresholdStep)
            : undefined,
          streakThresholdStep: Object.prototype.hasOwnProperty.call(
            req.body || {},
            "streakThresholdStep"
          )
            ? Number(req.body?.streakThresholdStep)
            : undefined,
          updatedBy: null,
        },
        session
      );

      await recomputeThresholdBadgesForClass(classId, session);
    });

    return res.status(200).json({ ok: true, data: updatedConfig });
  } catch (e: any) {
    const message = e?.message || "Invalid badge config payload";
    const status =
      /threshold|step|positive|integer/i.test(message) ? 400 : 500;
    return res.status(status).json({ ok: false, message });
  } finally {
    session.endSession();
  }
}

/**
 * @route  GET /classes/:classId/rewards/rules
 * @auth   Public (current route wiring)
 * @input  Params: { classId }
 * @notes  Ensures defaults then returns all class reward rules.
 * @returns 200 { ok, data: RewardRule[] }
 */
export async function getClassRewardRules(req: Request, res: Response) {
  try {
    const classId = requireClassId(req, res);
    if (!classId) return;

    await ensureDefaultRewardRules(classId);

    const rules = await GameRewardRuleModel.find({ classId })
      .sort({ source: 1, createdAt: 1, _id: 1 })
      .lean();

    return res.status(200).json({ ok: true, data: rules });
  } catch (e: any) {
    return res
      .status(500)
      .json({ ok: false, message: e?.message || "Internal error" });
  }
}

/**
 * @route  POST /classes/:classId/rewards/rules
 * @auth   Public (current route wiring)
 * @input  Params: { classId }, Body: { name?, description?, triggerType, threshold, rewardIds, enabled?, repeatable? }
 * @returns 201 { ok, data: RewardRule }
 * @errors  400 invalid payload
 *          500 internal error
 */
export async function createClassRewardRule(req: Request, res: Response) {
  try {
    const classId = requireClassId(req, res);
    if (!classId) return;

    const parsed = validateRewardRulePayload({
      triggerType: String(req.body?.triggerType || ""),
      threshold: Number(req.body?.threshold),
      rewardIds: parseStringArray(req.body?.rewardIds),
    });

    const name = String(req.body?.name || "").trim();
    const description = String(req.body?.description || "").trim();

    const created = await GameRewardRuleModel.create({
      classId,
      source: "custom",
      name: name || "Custom reward rule",
      description,
      triggerType: parsed.triggerType,
      threshold: parsed.threshold,
      rewardIds: parsed.rewardIds,
      enabled: req.body?.enabled !== false,
      repeatable: req.body?.repeatable === true,
      createdBy: null,
      updatedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return res.status(201).json({ ok: true, data: created });
  } catch (e: any) {
    const message = e?.message || "Invalid reward rule payload";
    const status = /Unsupported|Unknown|required|threshold/i.test(message)
      ? 400
      : 500;
    return res.status(status).json({ ok: false, message });
  }
}

/**
 * @route  PUT /classes/:classId/rewards/rules/:ruleId
 * @auth   Public (current route wiring)
 * @input  Params: { classId, ruleId }, Body: { name?, description?, triggerType, threshold, rewardIds, enabled?, repeatable? }
 * @returns 200 { ok, data: RewardRule }
 * @errors  400 invalid payload/ruleId
 *          404 rule not found
 *          500 internal error
 */
export async function updateClassRewardRule(req: Request, res: Response) {
  try {
    const classId = requireClassId(req, res);
    if (!classId) return;

    const ruleId = String(req.params.ruleId || "").trim();
    if (!ruleId || !Types.ObjectId.isValid(ruleId)) {
      return res.status(400).json({ ok: false, message: "Invalid ruleId" });
    }

    const parsed = validateRewardRulePayload({
      triggerType: String(req.body?.triggerType || ""),
      threshold: Number(req.body?.threshold),
      rewardIds: parseStringArray(req.body?.rewardIds),
    });

    const name = String(req.body?.name || "").trim();
    const description = String(req.body?.description || "").trim();

    const updated = await GameRewardRuleModel.findOneAndUpdate(
      { _id: ruleId, classId },
      {
        $set: {
          name: name || "Custom reward rule",
          description,
          triggerType: parsed.triggerType,
          threshold: parsed.threshold,
          rewardIds: parsed.rewardIds,
          enabled: req.body?.enabled !== false,
          repeatable: req.body?.repeatable === true,
          updatedBy: null,
          updatedAt: new Date(),
        },
      },
      { new: true },
    ).lean();

    if (!updated) {
      return res.status(404).json({ ok: false, message: "Rule not found" });
    }

    return res.status(200).json({ ok: true, data: updated });
  } catch (e: any) {
    const message = e?.message || "Invalid reward rule payload";
    const status = /Unsupported|Unknown|required|threshold/i.test(message)
      ? 400
      : 500;
    return res.status(status).json({ ok: false, message });
  }
}

/**
 * @route  DELETE /classes/:classId/rewards/rules/:ruleId
 * @auth   Public (current route wiring)
 * @input  Params: { classId, ruleId }
 * @returns 200 { ok, data: deletedRule }
 * @errors  400 invalid ruleId
 *          404 rule not found
 *          500 internal error
 */
export async function deleteClassRewardRule(req: Request, res: Response) {
  try {
    const classId = requireClassId(req, res);
    if (!classId) return;

    const ruleId = String(req.params.ruleId || "").trim();
    if (!ruleId || !Types.ObjectId.isValid(ruleId)) {
      return res.status(400).json({ ok: false, message: "Invalid ruleId" });
    }

    const deleted = await GameRewardRuleModel.findOneAndDelete({
      _id: ruleId,
      classId,
    }).lean();

    if (!deleted) {
      return res.status(404).json({ ok: false, message: "Rule not found" });
    }

    return res.status(200).json({ ok: true, data: deleted });
  } catch (e: any) {
    return res
      .status(500)
      .json({ ok: false, message: e?.message || "Internal error" });
  }
}

/**
 * @route  GET /classes/:classId/rewards/inventories
 * @auth   Public (current route wiring)
 * @input  Params: { classId }
 * @notes  Ensures inventory rows for roster students and returns class inventory projection.
 * @returns 200 { ok, data: { studentIds, inventories } }
 */
export async function getClassRewardInventories(req: Request, res: Response) {
  try {
    const classId = requireClassId(req, res);
    if (!classId) return;

    const classState = await GameClassStateModel.findOne({ classId })
      .select({ students: 1 })
      .lean<{
        students?: Record<string, boolean> | Map<string, boolean>;
      } | null>();

    const studentIdsRaw = classState?.students || {};
    const studentIds =
      studentIdsRaw instanceof Map
        ? Array.from(studentIdsRaw.keys())
        : Object.keys(studentIdsRaw as Record<string, boolean>);

    await Promise.all(
      studentIds.map((studentId) => ensureStudentInventory(classId, studentId)),
    );

    const inventories = await GameStudentInventoryModel.find({ classId })
      .sort({ studentId: 1 })
      .lean();

    return res.status(200).json({
      ok: true,
      data: {
        studentIds,
        inventories,
      },
    });
  } catch (e: any) {
    return res
      .status(500)
      .json({ ok: false, message: e?.message || "Internal error" });
  }
}

/**
 * @route  GET /classes/:classId/students/:studentId/inventory
 * @auth   Public (current route wiring)
 * @input  Params: { classId, studentId }
 * @returns 200 { ok, data: StudentInventory }
 */
export async function getStudentInventory(req: Request, res: Response) {
  try {
    const classId = requireClassId(req, res);
    if (!classId) return;
    const studentId = requireStudentId(req, res);
    if (!studentId) return;

    const inv = await ensureStudentInventory(classId, studentId);
    return res.status(200).json({ ok: true, data: inv });
  } catch (e: any) {
    return res
      .status(500)
      .json({ ok: false, message: e?.message || "Internal error" });
  }
}

/**
 * @route  GET /classes/:classId/students/:studentId/badges
 * @auth   Public (current route wiring)
 * @input  Params: { classId, studentId }
 * @returns 200 { ok, data: { ownedBadgeIds, displayBadgeIds, ownedBadges, displayBadges } }
 */
export async function getStudentBadges(req: Request, res: Response) {
  try {
    const classId = requireClassId(req, res);
    if (!classId) return;
    const studentId = requireStudentId(req, res);
    if (!studentId) return;

    const inv = await ensureStudentInventory(classId, studentId);
    const ownedBadgeIds = normalizeUnique(
      (inv.ownedBadgeIds || []).map((id: unknown) => String(id))
    );
    const displayBadgeIds = normalizeUnique(
      (inv.displayBadgeIds || []).map((id: unknown) => String(id))
    )
      .filter((id) => ownedBadgeIds.includes(id))
      .slice(0, 4);

    const ownedBadges = ownedBadgeIds
      .map((badgeId) => buildBadgePayload(classId, badgeId))
      .filter(Boolean);
    const displayBadges = displayBadgeIds
      .map((badgeId) => buildBadgePayload(classId, badgeId))
      .filter(Boolean);

    return res.status(200).json({
      ok: true,
      data: {
        classId,
        studentId,
        ownedBadgeIds,
        displayBadgeIds,
        ownedBadges,
        displayBadges,
      },
    });
  } catch (e: any) {
    return res
      .status(500)
      .json({ ok: false, message: e?.message || "Internal error" });
  }
}

/**
 * @route  PUT /classes/:classId/students/:studentId/badges/display
 * @auth   Public (current route wiring)
 * @input  Params: { classId, studentId }, Body: { displayBadgeIds: string[] }
 * @notes  Only owned badges are accepted; max 4 displayed badges.
 * @returns 200 { ok, data: { classId, studentId, displayBadgeIds, displayBadges } }
 */
export async function updateStudentDisplayedBadges(req: Request, res: Response) {
  try {
    const classId = requireClassId(req, res);
    if (!classId) return;
    const studentId = requireStudentId(req, res);
    if (!studentId) return;

    const displayBadgeIdsRaw = parseStringArray(req.body?.displayBadgeIds);
    const inv = await ensureStudentInventory(classId, studentId);
    const ownedSet = new Set(
      (inv.ownedBadgeIds || []).map((id: unknown) => String(id))
    );
    const displayBadgeIds = normalizeUnique(displayBadgeIdsRaw)
      .filter((id) => ownedSet.has(id))
      .slice(0, 4);

    const updated = await setStudentInventory(classId, studentId, {
      ownedCosmeticIds: inv.ownedCosmeticIds || [],
      ownedBadgeIds: inv.ownedBadgeIds || [],
      displayBadgeIds,
      equipped: inv.equipped || getEmptyEquippedSlots(),
    });

    return res.status(200).json({
      ok: true,
      data: {
        classId,
        studentId,
        displayBadgeIds: updated.displayBadgeIds || [],
        displayBadges: (updated.displayBadgeIds || [])
          .map((badgeId: unknown) => buildBadgePayload(classId, String(badgeId)))
          .filter(Boolean),
      },
    });
  } catch (e: any) {
    return res
      .status(500)
      .json({ ok: false, message: e?.message || "Internal error" });
  }
}

/**
 * @route  PUT /classes/:classId/students/:studentId/inventory
 * @auth   Public (current route wiring)
 * @input  Params: { classId, studentId }, Body: inventory patch fields
 * @notes  - Normalizes/validates owned/equipped payload.
 *         - Default cosmetics cannot be revoked.
 *         - Teacher badge grants are disabled; badge revokes are allowed.
 *         - Emits notification rows for grant/revoke changes.
 * @returns 200 { ok, data: StudentInventory }
 * @errors  400 invalid payload / forbidden badge grant / default revoke
 *          500 internal error
 */
export async function updateStudentInventory(req: Request, res: Response) {
  try {
    const classId = requireClassId(req, res);
    if (!classId) return;
    const studentId = requireStudentId(req, res);
    if (!studentId) return;

    const before = await ensureStudentInventory(classId, studentId);
    const beforeOwnedCosmetics = Array.from(
      new Set((before.ownedCosmeticIds || []).map((id: unknown) => String(id)))
    );
    const beforeOwnedBadges = Array.from(
      new Set((before.ownedBadgeIds || []).map((id: unknown) => String(id)))
    );
    const beforeBadgeSet = new Set(beforeOwnedBadges);

    const hasOwnedCosmeticIds = Object.prototype.hasOwnProperty.call(
      req.body || {},
      "ownedCosmeticIds",
    );
    const hasOwnedBadgeIds = Object.prototype.hasOwnProperty.call(
      req.body || {},
      "ownedBadgeIds",
    );
    const hasDisplayBadgeIds = Object.prototype.hasOwnProperty.call(
      req.body || {},
      "displayBadgeIds",
    );

    const requestedOwnedCosmeticIds = hasOwnedCosmeticIds
      ? parseStringArray(req.body?.ownedCosmeticIds)
      : undefined;
    const requestedOwnedBadgeIds = hasOwnedBadgeIds
      ? parseStringArray(req.body?.ownedBadgeIds)
      : undefined;

    if (requestedOwnedCosmeticIds) {
      const requestedSet = new Set(requestedOwnedCosmeticIds.map((id) => String(id)));
      const nonRevocableDefaultIds = listCosmetics({ forceRefresh: true })
        .filter((item) => item.defaultOwned !== false)
        .map((item) => String(item.id));
      const missingDefaults = nonRevocableDefaultIds.filter(
        (id) => !requestedSet.has(id)
      );
      if (missingDefaults.length) {
        return res.status(400).json({
          ok: false,
          message: `Cannot revoke default cosmetics: ${missingDefaults.join(", ")}`,
        });
      }
    }

    if (requestedOwnedBadgeIds) {
      const newlyAddedBadges = normalizeUnique(requestedOwnedBadgeIds).filter(
        (id) => !beforeBadgeSet.has(String(id))
      );
      if (newlyAddedBadges.length) {
        return res.status(400).json({
          ok: false,
          message:
            "Teacher badge grants are disabled. Teachers can only revoke badges from a student's existing inventory.",
        });
      }
    }

    let updated = await setStudentInventory(classId, studentId, {
      ownedCosmeticIds: hasOwnedCosmeticIds
        ? requestedOwnedCosmeticIds
        : undefined,
      ownedBadgeIds: hasOwnedBadgeIds
        ? requestedOwnedBadgeIds
        : undefined,
      displayBadgeIds: hasDisplayBadgeIds
        ? parseStringArray(req.body?.displayBadgeIds)
        : undefined,
      equipped: parseEquippedPayload(req.body),
    });

    const afterOwnedCosmetics = Array.from(
      new Set((updated.ownedCosmeticIds || []).map((id: unknown) => String(id)))
    );
    const afterOwnedBadges = Array.from(
      new Set((updated.ownedBadgeIds || []).map((id: unknown) => String(id)))
    );

    const beforeCosmeticSet = new Set(beforeOwnedCosmetics);
    const afterCosmeticSet = new Set(afterOwnedCosmetics);
    const afterBadgeSet = new Set(afterOwnedBadges);
    const newlyGrantedBadges = afterOwnedBadges.filter(
      (id) => !beforeBadgeSet.has(id)
    );

    if (newlyGrantedBadges.length) {
      const autoDisplayNext = normalizeUnique(
        [...(updated.displayBadgeIds || []), ...newlyGrantedBadges].map((id) =>
          String(id)
        )
      )
        .filter((id) => afterBadgeSet.has(id))
        .slice(0, 4);

      const prevDisplay = normalizeUnique(
        (updated.displayBadgeIds || []).map((id: unknown) => String(id))
      );
      if (
        autoDisplayNext.length !== prevDisplay.length ||
        autoDisplayNext.some((id: string, idx: number) => id !== prevDisplay[idx])
      ) {
        updated = await setStudentInventory(classId, studentId, {
          ownedCosmeticIds: updated.ownedCosmeticIds || [],
          ownedBadgeIds: updated.ownedBadgeIds || [],
          displayBadgeIds: autoDisplayNext,
          equipped: updated.equipped || getEmptyEquippedSlots(),
        });
      }
    }

    const docs: Array<Record<string, unknown>> = [];

    for (const rewardId of afterOwnedCosmetics) {
      if (!beforeCosmeticSet.has(rewardId)) {
        docs.push({
          classId,
          studentId,
          type: "reward_granted",
          source: "teacher",
          rewardId,
          rewardType: "cosmetic",
          triggerAttemptId: null,
          metadata: { via: "inventory_update" },
          createdAt: new Date(),
          acknowledgedAt: null,
        });
      }
    }
    for (const rewardId of beforeOwnedCosmetics) {
      if (!afterCosmeticSet.has(rewardId)) {
        docs.push({
          classId,
          studentId,
          type: "reward_revoked",
          source: "teacher",
          rewardId,
          rewardType: "cosmetic",
          triggerAttemptId: null,
          metadata: { via: "inventory_update" },
          createdAt: new Date(),
          acknowledgedAt: null,
        });
      }
    }
    for (const rewardId of afterOwnedBadges) {
      if (!beforeBadgeSet.has(rewardId)) {
        docs.push({
          classId,
          studentId,
          type: "reward_granted",
          source: "teacher",
          rewardId,
          rewardType: "badge",
          triggerAttemptId: null,
          metadata: { via: "inventory_update" },
          createdAt: new Date(),
          acknowledgedAt: null,
        });
      }
    }
    for (const rewardId of beforeOwnedBadges) {
      if (!afterBadgeSet.has(rewardId)) {
        docs.push({
          classId,
          studentId,
          type: "reward_revoked",
          source: "teacher",
          rewardId,
          rewardType: "badge",
          triggerAttemptId: null,
          metadata: { via: "inventory_update" },
          createdAt: new Date(),
          acknowledgedAt: null,
        });
      }
    }

    if (docs.length) {
      await GameStudentNotificationModel.insertMany(docs, { ordered: false });
    }

    return res.status(200).json({ ok: true, data: updated });
  } catch (e: any) {
    const message = e?.message || "Invalid inventory payload";
    const status = /Invalid|Unknown|default/i.test(message) ? 400 : 500;
    return res.status(status).json({ ok: false, message });
  }
}

/**
 * @route  POST /classes/:classId/students/:studentId/equip
 * @auth   Public (current route wiring)
 * @input  Params: { classId, studentId }, Body: { slot, itemId }
 * @notes  Requires student ownership and slot/item compatibility.
 * @returns 200 { ok, data: StudentInventory }
 * @errors  400 invalid slot/item/ownership
 *          500 internal error
 */
export async function equipStudentItem(req: Request, res: Response) {
  try {
    const classId = requireClassId(req, res);
    if (!classId) return;
    const studentId = requireStudentId(req, res);
    if (!studentId) return;

    const slot = normalizeSlotAlias(String(req.body?.slot || ""));
    const itemId = String(req.body?.itemId || "").trim();
    if (!slot) {
      return res.status(400).json({ ok: false, message: "Invalid slot" });
    }
    if (!itemId) {
      return res.status(400).json({ ok: false, message: "Missing itemId" });
    }

    const cosmetic = getCosmeticById(itemId);
    if (!cosmetic) {
      return res
        .status(400)
        .json({ ok: false, message: "Unknown cosmetic item" });
    }
    if (cosmetic.slot !== slot) {
      return res.status(400).json({
        ok: false,
        message: `Item ${itemId} is not a ${slot} cosmetic`,
      });
    }

    const current = await ensureStudentInventory(classId, studentId);
    if (!current.ownedCosmeticIds.includes(itemId)) {
      return res
        .status(400)
        .json({ ok: false, message: "Student does not own this cosmetic" });
    }

    const normalized = normalizeInventoryInput(classId, studentId, current, {
      ownedCosmeticIds: current.ownedCosmeticIds,
      ownedBadgeIds: current.ownedBadgeIds,
      equipped: {
        ...getEmptyEquippedSlots(),
        ...(current.equipped || {}),
        [slot]: itemId,
      },
    });

    current.equipped = normalized.equipped;
    current.avatarSpec = normalized.avatarSpec;
    current.avatarUrl = normalized.avatarUrl;
    current.updatedAt = new Date();
    await current.save();

    return res.status(200).json({ ok: true, data: current });
  } catch (e: any) {
    return res
      .status(500)
      .json({ ok: false, message: e?.message || "Internal error" });
  }
}

/**
 * @route  POST /classes/:classId/students/:studentId/rewards/grant
 * @auth   Public (current route wiring)
 * @input  Params: { classId, studentId }, Body: { rewardId }
 * @notes  Teacher badge grants are intentionally disabled in current implementation.
 * @returns 200 { ok, data: StudentInventory }
 * @errors  400 missing/invalid rewardId or badge grant attempt
 *          500 internal error
 */
export async function grantStudentReward(req: Request, res: Response) {
  try {
    const classId = requireClassId(req, res);
    if (!classId) return;
    const studentId = requireStudentId(req, res);
    if (!studentId) return;

    const rewardId = String(req.body?.rewardId || "").trim();
    if (!rewardId) {
      return res.status(400).json({ ok: false, message: "Missing rewardId" });
    }
    if (getBadgeById(rewardId)) {
      return res.status(400).json({
        ok: false,
        message:
          "Teacher badge grants are disabled. Teachers can only revoke badges from a student's inventory.",
      });
    }

    await grantRewardToStudent({
      classId,
      studentId,
      rewardId,
      source: "teacher",
      ruleId: null,
    });

    const inv = await ensureStudentInventory(classId, studentId);
    return res.status(200).json({ ok: true, data: inv });
  } catch (e: any) {
    const message = e?.message || "Failed to grant reward";
    const status = /Unknown reward id/.test(message) ? 400 : 500;
    return res.status(status).json({ ok: false, message });
  }
}

/**
 * @route  GET /classes/:classId/students/:studentId/rewards/attempt/:attemptId
 * @auth   verifyAccessToken + verifyAttemptOwnerOrPrivileged
 * @input  Params: { classId, studentId, attemptId }
 * @notes  Returns rewards granted for this attempt (rule + score-threshold sources).
 * @returns 200 { ok, data: { classId, studentId, attemptId, grants } }
 */
export async function getStudentAttemptRewards(req: Request, res: Response) {
  try {
    const classId = requireClassId(req, res);
    if (!classId) return;
    const studentId = requireStudentId(req, res);
    if (!studentId) return;

    const attemptId = String(req.params.attemptId || "").trim();
    if (!attemptId) {
      return res.status(400).json({ ok: false, message: "Missing attemptId" });
    }

    const rows = await GameRewardGrantModel.find({
      classId,
      studentId,
      triggerAttemptId: attemptId,
      source: { $in: ["score_threshold", "rule"] },
    })
      .sort({ grantedAt: 1, _id: 1 })
      .lean<
        Array<{
          rewardId: string;
          rewardType: "cosmetic" | "badge";
          thresholdPoints?: number | null;
          grantedAt?: Date;
        }>
      >();

    const grants = rows
      .map((row) => {
        const rewardId = String(row.rewardId || "");
        if (!rewardId) return null;

        const cosmetic = getCosmeticById(rewardId);
        if (cosmetic) {
          return {
            rewardId,
            rewardType: "cosmetic" as const,
            thresholdPoints: Number(row.thresholdPoints || 0),
            grantedAt: row.grantedAt || new Date(),
            reward: {
              id: cosmetic.id,
              name: cosmetic.name,
              description: cosmetic.description,
              color: cosmetic.color,
              slot: cosmetic.slot,
              assetPath: cosmetic.assetPath,
              assetUrl: resolveAvatarAssetUrl(cosmetic.assetPath),
            },
          };
        }

        const badge = getBadgeById(rewardId);
        if (badge) {
          return {
            rewardId,
            rewardType: "badge" as const,
            thresholdPoints: Number(row.thresholdPoints || 0),
            grantedAt: row.grantedAt || new Date(),
            reward: {
              id: badge.id,
              name: badge.name,
              description: badge.description,
              color: badge.color,
              engraving:
                badge.engraving || parseDynamicBadgeId(badge.id)?.engraving || null,
              imageUrl: buildBadgeRenderUrl(classId, badge.id),
            },
          };
        }

        return null;
      })
      .filter(Boolean);

    return res.status(200).json({
      ok: true,
      data: {
        classId,
        studentId,
        attemptId,
        grants,
      },
    });
  } catch (e: any) {
    return res
      .status(500)
      .json({ ok: false, message: e?.message || "Internal error" });
  }
}

/**
 * @route  POST /classes/:classId/students/:studentId/rewards/attempt/:attemptId/ack
 * @auth   verifyAccessToken + verifyAttemptOwnerOrPrivileged
 * @input  Params: { classId, studentId, attemptId }
 * @notes  Marks attempt-linked reward grants as acknowledged.
 * @returns 200 { ok, data: { classId, studentId, attemptId, acknowledgedCount } }
 */
export async function acknowledgeAttemptRewards(req: Request, res: Response) {
  try {
    const classId = requireClassId(req, res);
    if (!classId) return;
    const studentId = requireStudentId(req, res);
    if (!studentId) return;

    const attemptId = String(req.params.attemptId || "").trim();
    if (!attemptId) {
      return res.status(400).json({ ok: false, message: "Missing attemptId" });
    }

    const result = await GameRewardGrantModel.updateMany(
      {
        classId,
        studentId,
        triggerAttemptId: attemptId,
        source: { $in: ["score_threshold", "rule"] },
        acknowledgedAt: null,
      },
      {
        $set: {
          acknowledgedAt: new Date(),
        },
      }
    );

    return res.status(200).json({
      ok: true,
      data: {
        classId,
        studentId,
        attemptId,
        acknowledgedCount: Number(result.modifiedCount || 0),
      },
    });
  } catch (e: any) {
    return res
      .status(500)
      .json({ ok: false, message: e?.message || "Internal error" });
  }
}

/**
 * @route  GET /classes/:classId/students/:studentId/notifications
 * @auth   verifyAccessToken + verifyTeacherOfStudentOrSelf
 * @input  Params: { classId, studentId }, Query: { unreadOnly?, limit? }
 * @notes  Returns notification feed and unread count with resolved reward payload when available.
 * @returns 200 { ok, data: { classId, studentId, unreadCount, notifications } }
 */
export async function getStudentNotifications(req: Request, res: Response) {
  try {
    const classId = requireClassId(req, res);
    if (!classId) return;
    const studentId = requireStudentId(req, res);
    if (!studentId) return;

    const unreadOnly =
      parseOptionalBoolean(firstQueryValue(req.query?.unreadOnly)) === true;
    const limit = parseLimit(firstQueryValue(req.query?.limit), 50, 200);

    const filter: Record<string, unknown> = { classId, studentId };
    if (unreadOnly) {
      filter.acknowledgedAt = null;
    }

    const [rows, unreadCount] = await Promise.all([
      GameStudentNotificationModel.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit)
        .select({
          type: 1,
          source: 1,
          rewardId: 1,
          rewardType: 1,
          triggerAttemptId: 1,
          metadata: 1,
          createdAt: 1,
          acknowledgedAt: 1,
        })
        .lean<
          Array<{
            _id: Types.ObjectId;
            type: "reward_granted" | "reward_revoked";
            source: "teacher" | "rule" | "score_threshold" | "system";
            rewardId?: string | null;
            rewardType?: "cosmetic" | "badge" | null;
            triggerAttemptId?: string | null;
            metadata?: Record<string, unknown>;
            createdAt?: Date;
            acknowledgedAt?: Date | null;
          }>
        >(),
      GameStudentNotificationModel.countDocuments({
        classId,
        studentId,
        acknowledgedAt: null,
      }),
    ]);

    const notifications = rows.map((row) => {
      const rewardId = String(row.rewardId || "");
      const rewardPayload = resolveRewardPayload(
        rewardId,
        classId,
        row.rewardType || null
      );
      const rewardName = rewardPayload?.reward?.name || rewardId;
      const copy = notificationCopy(row.type, rewardName);

      return {
        id: String(row._id),
        type: row.type,
        source: row.source,
        rewardId: rewardId || null,
        rewardType: rewardPayload?.rewardType || row.rewardType || null,
        reward: rewardPayload?.reward || null,
        triggerAttemptId: row.triggerAttemptId || null,
        title: copy.title,
        message: copy.message,
        metadata: row.metadata || {},
        createdAt: row.createdAt || new Date(),
        acknowledgedAt: row.acknowledgedAt || null,
      };
    });

    return res.status(200).json({
      ok: true,
      data: {
        classId,
        studentId,
        unreadCount: Number(unreadCount || 0),
        notifications,
      },
    });
  } catch (e: any) {
    return res
      .status(500)
      .json({ ok: false, message: e?.message || "Internal error" });
  }
}

/**
 * @route  POST /classes/:classId/students/:studentId/notifications/ack
 * @auth   verifyAccessToken + verifyTeacherOfStudentOrSelf
 * @input  Params: { classId, studentId }, Body: { acknowledgeAll? | notificationIds? }
 * @notes  Supports single/multi ack by ids, or acknowledge-all mode.
 * @returns 200 { ok, data: { classId, studentId, acknowledgedCount, unreadCount } }
 * @errors  400 invalid notificationIds payload
 *          500 internal error
 */
export async function acknowledgeStudentNotifications(
  req: Request,
  res: Response
) {
  try {
    const classId = requireClassId(req, res);
    if (!classId) return;
    const studentId = requireStudentId(req, res);
    if (!studentId) return;

    const acknowledgeAll = parseOptionalBoolean(req.body?.acknowledgeAll) === true;
    const rawIds = parseStringArray(req.body?.notificationIds);
    if (!acknowledgeAll && rawIds.length === 0) {
      return res.status(400).json({
        ok: false,
        message: "Provide notificationIds or acknowledgeAll=true",
      });
    }

    let objectIds: Types.ObjectId[] = [];
    if (!acknowledgeAll && rawIds.length > 0) {
      try {
        objectIds = parseNotificationObjectIds(rawIds);
      } catch (e: any) {
        return res.status(400).json({ ok: false, message: e?.message || "Invalid notificationIds" });
      }
    }

    const filter: Record<string, unknown> = {
      classId,
      studentId,
      acknowledgedAt: null,
    };
    if (!acknowledgeAll && objectIds.length > 0) {
      filter._id = { $in: objectIds };
    }

    const result = await GameStudentNotificationModel.updateMany(filter, {
      $set: { acknowledgedAt: new Date() },
    });

    const unreadCount = await GameStudentNotificationModel.countDocuments({
      classId,
      studentId,
      acknowledgedAt: null,
    });

    return res.status(200).json({
      ok: true,
      data: {
        classId,
        studentId,
        acknowledgedCount: Number(result.modifiedCount || 0),
        unreadCount: Number(unreadCount || 0),
      },
    });
  } catch (e: any) {
    return res
      .status(500)
      .json({ ok: false, message: e?.message || "Internal error" });
  }
}

/**
 * @route  GET /classes/:classId/students/:studentId/avatar.svg
 * @auth   Public (current route wiring)
 * @input  Params: { classId, studentId }
 * @notes  Renders full avatar SVG (transparent background) from equipped inventory layers.
 * @returns 200 image/svg+xml
 */
export async function getStudentAvatarSvg(req: Request, res: Response) {
  try {
    const classId = requireClassId(req, res);
    if (!classId) return;
    const studentId = requireStudentId(req, res);
    if (!studentId) return;

    const inv = await ensureStudentInventory(classId, studentId);
    const composition = buildAvatarComposition(inv.equipped || {});
    const svg = buildAvatarSvg(composition, {
      backgroundColor: null,
      hrefForLayer: (layer) =>
        toInlineAssetDataUri(layer.assetPath) || layer.assetUrl,
    });

    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(svg);
  } catch (e: any) {
    return res
      .status(500)
      .json({ ok: false, message: e?.message || "Internal error" });
  }
}

/**
 * @route  GET /classes/:classId/students/:studentId/avatar-profile.svg
 * @auth   Public (current route wiring)
 * @input  Params: { classId, studentId }
 * @notes  Renders profile-cropped avatar SVG for profile photo usage.
 * @returns 200 image/svg+xml
 */
export async function getStudentAvatarProfileSvg(req: Request, res: Response) {
  try {
    const classId = requireClassId(req, res);
    if (!classId) return;
    const studentId = requireStudentId(req, res);
    if (!studentId) return;

    const inv = await ensureStudentInventory(classId, studentId);
    const composition = buildAvatarComposition(inv.equipped || {});
    const svg = buildAvatarProfileSvgWithLayerHref(
      composition,
      (layer) => toInlineAssetDataUri(layer.assetPath) || layer.assetUrl,
    );

    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(svg);
  } catch (e: any) {
    return res
      .status(500)
      .json({ ok: false, message: e?.message || "Internal error" });
  }
}

/**
 * @route  GET /classes/:classId/badges/:badgeId/image.svg
 * @auth   Public (current route wiring)
 * @input  Params: { classId, badgeId }
 * @notes  Renders badge image SVG (supports dynamic threshold/week/month engravings).
 * @returns 200 image/svg+xml
 * @errors  400 missing badgeId
 *          404 badge not found
 *          500 internal error
 */
export async function getBadgeImageSvg(req: Request, res: Response) {
  try {
    const classId = requireClassId(req, res);
    if (!classId) return;

    const badgeId = String(req.params.badgeId || "").trim();
    if (!badgeId) {
      return res.status(400).json({ ok: false, message: "Missing badgeId" });
    }

    const svg = await badgeImageSvg(classId, badgeId);
    if (!svg) {
      return res.status(404).json({ ok: false, message: "Badge not found" });
    }

    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(svg);
  } catch (e: any) {
    return res
      .status(500)
      .json({ ok: false, message: e?.message || "Internal error" });
  }
}

/**
 * @route  GET /rewards/cosmetics/:cosmeticId/preview.svg
 * @route  GET /classes/:classId/rewards/cosmetics/:cosmeticId/preview.svg
 * @auth   Public (current route wiring)
 * @input  Params: { cosmeticId }
 * @notes  Renders avatar preview with the requested cosmetic applied.
 * @returns 200 image/svg+xml
 * @errors  400 missing cosmeticId
 *          404 cosmetic not found
 *          500 internal error
 */
export function getCosmeticPreviewSvg(req: Request, res: Response) {
  try {
    const cosmeticId = String(req.params.cosmeticId || "").trim();
    if (!cosmeticId) {
      return res.status(400).json({ ok: false, message: "Missing cosmeticId" });
    }

    const cosmetic = getCosmeticById(cosmeticId) as CosmeticDefinition | null;
    if (!cosmetic) {
      return res.status(404).json({ ok: false, message: "Cosmetic not found" });
    }

    const equipped = buildDefaultPreviewEquippedSlots();
    if (cosmetic.slot === "avatar") {
      equipped.avatar = cosmetic.id;
    } else {
      equipped[cosmetic.slot] = cosmetic.id;
    }

    const composition = buildAvatarComposition(equipped);
    const svg = buildAvatarSvg(composition, {
      hrefForLayer: (layer) =>
        toInlineAssetDataUri(layer.assetPath) || layer.assetUrl,
    });

    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(svg);
  } catch (e: any) {
    return res
      .status(500)
      .json({ ok: false, message: e?.message || "Internal error" });
  }
}

/**
 * @route  GET /rewards/cosmetics/:cosmeticId/asset.svg
 * @route  GET /classes/:classId/rewards/cosmetics/:cosmeticId/asset.svg
 * @auth   Public (current route wiring)
 * @input  Params: { cosmeticId }
 * @notes  Returns isolated cosmetic asset SVG (opaque-bounds crop for non-avatar PNGs).
 * @returns 200 image/svg+xml
 * @errors  400 missing cosmeticId
 *          404 cosmetic not found
 *          500 internal error
 */
export function getCosmeticAssetSvg(req: Request, res: Response) {
  try {
    const cosmeticId = String(req.params.cosmeticId || "").trim();
    if (!cosmeticId) {
      return res.status(400).json({ ok: false, message: "Missing cosmeticId" });
    }

    const cosmetic = getCosmeticById(cosmeticId) as CosmeticDefinition | null;
    if (!cosmetic) {
      return res.status(404).json({ ok: false, message: "Cosmetic not found" });
    }

    const href = toInlineAssetDataUri(cosmetic.assetPath);
    if (!href) {
      return res.status(500).json({
        ok: false,
        message: `Unable to load asset for ${cosmetic.id}`,
      });
    }

    let outWidth = 800;
    let outHeight = 800;
    let imageX = 0;
    let imageY = 0;

    if (cosmetic.slot === "avatar") {
      // Skin-color preview should focus the center body area, not full 800x800.
      const centerPreviewSize = 1;
      const centerOffset = Math.floor((800 - centerPreviewSize) / 2);
      outWidth = centerPreviewSize;
      outHeight = centerPreviewSize;
      imageX = -centerOffset;
      imageY = -centerOffset;
    } else {
      const crop = getPngOpaqueBounds(cosmetic.assetPath);
      if (crop?.width && crop.width > 0 && crop?.height && crop.height > 0) {
        outWidth = crop.width;
        outHeight = crop.height;
        imageX = -crop.x;
        imageY = -crop.y;
      }
    }

    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${outWidth}" height="${outHeight}" viewBox="0 0 ${outWidth} ${outHeight}">
  <image href="${escapeXml(href)}" x="${imageX}" y="${imageY}" width="800" height="800" preserveAspectRatio="xMidYMid meet" />
</svg>`.trim();

    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(svg);
  } catch (e: any) {
    return res
      .status(500)
      .json({ ok: false, message: e?.message || "Internal error" });
  }
}
