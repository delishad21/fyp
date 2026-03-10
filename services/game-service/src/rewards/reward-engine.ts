import crypto from "node:crypto";
import mongoose, { ClientSession, Types } from "mongoose";
import { GameRewardRuleModel, IGameRewardRule } from "../model/rewards/game-reward-rule-model";
import {
  GameStudentInventoryModel,
  IGameStudentInventory,
} from "../model/rewards/game-student-inventory-model";
import { GameStudentStatsModel } from "../model/stats/game-student-stats-model";
import { GameRewardGrantModel } from "../model/rewards/game-reward-grant-model";
import { GameStudentNotificationModel } from "../model/rewards/game-student-notification-model";
import { GameScoreRewardConfigModel } from "../model/rewards/game-score-reward-config-model";
import {
  COMPULSORY_COSMETIC_SLOTS,
  COSMETIC_SLOTS,
  CosmeticSlot,
  RewardRuleTriggerType,
  buildAvatarRenderUrl,
  getCosmeticBaseModel,
  getDefaultAvatarItemId,
  getDefaultBaseModelId,
  getDefaultRewardRuleTemplates,
  getBadgeById,
  getCosmeticById,
  getDefaultOwnedCosmeticIds,
  getEmptyEquippedSlots,
  isBaseModelCompatible,
  isBadgeId,
  isCosmeticId,
  listCosmetics,
} from "./default-catalog";
import { buildAvatarComposition, normalizeEquippedSlots } from "./avatar-generator";
import { toClassObjectId } from "../utils/mongo-utils";

export type InventoryUpdateInput = {
  ownedCosmeticIds?: string[];
  ownedBadgeIds?: string[];
  displayBadgeIds?: string[];
  equipped?: Partial<Record<CosmeticSlot, string | null>> & {
    outfit?: string | null;
    accessory?: string | null;
    hand_accessory?: string | null;
    hair_accessory?: string | null;
  };
};

type StudentMetrics = {
  overallScore: number;
  bestStreakDays: number;
  participationCount: number;
};

type RewardGrantSource = "rule" | "teacher" | "score_threshold";

export type ScoreThresholdConfig = {
  classId: string;
  enabled: boolean;
  pointsPerReward: number;
};

const DEFAULT_POINTS_PER_REWARD = 500;
const MAX_DISPLAY_BADGES = 4;

function normalizeUnique(values: string[]) {
  return Array.from(
    new Set(values.map((v) => String(v || "").trim()).filter(Boolean))
  );
}

function normalizeDisplayedBadges(
  ownedBadgeIds: string[],
  displayBadgeIds?: string[]
) {
  const owned = new Set(ownedBadgeIds.map((id) => String(id)));
  return normalizeUnique(displayBadgeIds || [])
    .filter((id) => owned.has(id))
    .slice(0, MAX_DISPLAY_BADGES);
}

function parsePointsPerReward(input: unknown) {
  const raw = Number(input);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_POINTS_PER_REWARD;
  return Math.max(1, Math.floor(raw));
}

function getDefaultPointsPerReward() {
  return parsePointsPerReward(process.env.GAME_SCORE_REWARD_STEP_DEFAULT);
}

function slotForCosmetic(cosmeticId: string): CosmeticSlot | null {
  return getCosmeticById(cosmeticId)?.slot || null;
}

function firstOwnedBySlot(
  ownedCosmeticIds: string[],
  slot: CosmeticSlot,
  activeBaseModel: string | null
) {
  const sameSlot = ownedCosmeticIds.filter((id) => slotForCosmetic(id) === slot);
  if (!sameSlot.length) return null;

  const sameSlotAndModel = sameSlot.filter((id) =>
    isBaseModelCompatible(getCosmeticBaseModel(id), activeBaseModel)
  );
  const preferredInModel = sameSlotAndModel.find(
    (id) => !!getCosmeticById(id)?.defaultEquipped
  );
  if (preferredInModel) return preferredInModel;
  if (sameSlotAndModel.length) return sameSlotAndModel[0];

  const preferredAnyModel = sameSlot.find((id) => !!getCosmeticById(id)?.defaultEquipped);
  if (preferredAnyModel) return preferredAnyModel;
  return sameSlot[0] || null;
}

function withLegacySlotAliases(
  equipped?: InventoryUpdateInput["equipped"]
): Partial<Record<CosmeticSlot, string | null>> {
  if (!equipped) return {};
  const mapped = { ...equipped } as Record<string, string | null | undefined>;

  // Legacy aliases from earlier versions.
  if (!mapped.avatar && mapped.base_avatar) mapped.avatar = mapped.base_avatar;
  if (!mapped.avatar && mapped.base) mapped.avatar = mapped.base;
  if (!mapped.upperwear && mapped.outfit) mapped.upperwear = mapped.outfit;
  if (!mapped.eye_accessory && mapped.accessory) mapped.eye_accessory = mapped.accessory;
  if (!mapped.wrist_accessory && mapped.hand_accessory) {
    mapped.wrist_accessory = mapped.hand_accessory;
  }
  if (!mapped.head_accessory && mapped.hair_accessory) {
    mapped.head_accessory = mapped.hair_accessory;
  }

  delete mapped.outfit;
  delete mapped.accessory;
  delete mapped.base_avatar;
  delete mapped.base;
  delete mapped.hand_accessory;
  delete mapped.hair_accessory;
  return mapped as Partial<Record<CosmeticSlot, string | null>>;
}

function normalizeEquipped(
  ownedCosmeticIds: string[],
  equipped?: InventoryUpdateInput["equipped"]
) {
  const next = normalizeEquippedSlots(withLegacySlotAliases(equipped));
  const compulsory = new Set<CosmeticSlot>(COMPULSORY_COSMETIC_SLOTS as readonly CosmeticSlot[]);
  const defaultBaseModelId = getDefaultBaseModelId();

  // 1) clear invalid slots.
  for (const slot of COSMETIC_SLOTS) {
    const current = next[slot];
    if (!current) continue;
    const isOwned = ownedCosmeticIds.includes(current);
    const sameSlot = slotForCosmetic(current) === slot;
    if (!isOwned || !sameSlot) next[slot] = null;
  }

  // 2) resolve compulsory avatar slot first; base model is driven by equipped avatar.
  let activeAvatarId = next.avatar;
  if (!activeAvatarId) {
    const preferredAvatar = getDefaultAvatarItemId();
    if (preferredAvatar && ownedCosmeticIds.includes(preferredAvatar)) {
      activeAvatarId = preferredAvatar;
    }
  }
  if (!activeAvatarId) {
    activeAvatarId = firstOwnedBySlot(ownedCosmeticIds, "avatar", defaultBaseModelId);
  }
  next.avatar = activeAvatarId || null;

  const activeBaseModel = next.avatar ? getCosmeticBaseModel(next.avatar) : defaultBaseModelId;

  // 3) normalize compulsory slots with base-model compatibility.
  for (const slot of COMPULSORY_COSMETIC_SLOTS) {
    if (slot === "avatar") continue;

    const current = next[slot];
    const compatibleCurrent =
      !!current &&
      ownedCosmeticIds.includes(current) &&
      slotForCosmetic(current) === slot &&
      isBaseModelCompatible(getCosmeticBaseModel(current), activeBaseModel);

    if (compatibleCurrent) continue;
    next[slot] = firstOwnedBySlot(ownedCosmeticIds, slot, activeBaseModel);
  }

  // 4) optional slots can be empty but must be valid if present.
  for (const slot of COSMETIC_SLOTS) {
    if (compulsory.has(slot)) continue;
    const current = next[slot];
    if (!current) continue;
    const isOwned = ownedCosmeticIds.includes(current);
    const sameSlot = slotForCosmetic(current) === slot;
    if (!isOwned || !sameSlot) next[slot] = null;
  }

  for (const slot of COMPULSORY_COSMETIC_SLOTS) {
    if (!next[slot]) {
      throw new Error(`Missing compulsory slot asset for "${slot}"`);
    }
  }

  return next;
}

function buildAvatarState(
  classId: string,
  studentId: string,
  equipped: Record<CosmeticSlot, string | null>
) {
  return {
    avatarSpec: buildAvatarComposition(equipped),
    avatarUrl: buildAvatarRenderUrl(classId, studentId),
  };
}

function validateCatalogIds(ownedCosmeticIds: string[], ownedBadgeIds: string[]) {
  const invalidCosmetics = ownedCosmeticIds.filter((id) => !isCosmeticId(id));
  const invalidBadges = ownedBadgeIds.filter((id) => !isBadgeId(id));

  if (invalidCosmetics.length || invalidBadges.length) {
    const parts: string[] = [];
    if (invalidCosmetics.length) {
      parts.push(`Invalid cosmetic ids: ${invalidCosmetics.join(", ")}`);
    }
    if (invalidBadges.length) {
      parts.push(`Invalid badge ids: ${invalidBadges.join(", ")}`);
    }
    throw new Error(parts.join(" | "));
  }
}

export function normalizeInventoryInput(
  classId: string,
  studentId: string,
  current: IGameStudentInventory | null,
  input: InventoryUpdateInput
) {
  const ownedCosmeticIds = normalizeUnique(
    input.ownedCosmeticIds ?? current?.ownedCosmeticIds ?? getDefaultOwnedCosmeticIds()
  );
  const ownedBadgeIds = normalizeUnique(input.ownedBadgeIds ?? current?.ownedBadgeIds ?? []);
  const displayBadgeIds = normalizeDisplayedBadges(
    ownedBadgeIds,
    input.displayBadgeIds ?? current?.displayBadgeIds ?? []
  );

  validateCatalogIds(ownedCosmeticIds, ownedBadgeIds);
  const equipped = normalizeEquipped(ownedCosmeticIds, {
    ...getEmptyEquippedSlots(),
    ...(current?.equipped || {}),
    ...withLegacySlotAliases(input.equipped),
  });
  const avatarState = buildAvatarState(classId, studentId, equipped);

  return {
    ownedCosmeticIds,
    ownedBadgeIds,
    displayBadgeIds,
    equipped,
    avatarSpec: avatarState.avatarSpec,
    avatarUrl: avatarState.avatarUrl,
  };
}

export async function ensureDefaultRewardRules(
  classId: string,
  session?: ClientSession
) {
  const templates = getDefaultRewardRuleTemplates().filter(
    (tpl) => Array.isArray(tpl.rewardIds) && tpl.rewardIds.length > 0
  );
  const updates = templates.map((tpl) =>
    GameRewardRuleModel.updateOne(
      { classId, key: tpl.key },
      {
        $setOnInsert: {
          classId,
          key: tpl.key,
          source: "default" as const,
          createdBy: null,
          createdAt: new Date(),
        },
        $set: {
          name: tpl.name,
          description: tpl.description || "",
          triggerType: tpl.triggerType,
          threshold: tpl.threshold,
          rewardIds: tpl.rewardIds,
          enabled: true,
          repeatable: false,
          updatedBy: null,
          updatedAt: new Date(),
        },
      },
      { upsert: true, session }
    )
  );

  await Promise.all(updates);
}

export async function ensureScoreThresholdConfig(
  classId: string,
  session?: ClientSession
) {
  const pointsPerReward = getDefaultPointsPerReward();
  await GameScoreRewardConfigModel.updateOne(
    { classId },
    {
      $setOnInsert: {
        classId,
        enabled: true,
        pointsPerReward,
        updatedAt: new Date(),
        updatedBy: null,
      },
    },
    { upsert: true, session }
  );
}

export async function getScoreThresholdConfig(
  classId: string,
  session?: ClientSession
): Promise<ScoreThresholdConfig> {
  await ensureScoreThresholdConfig(classId, session);

  const query = GameScoreRewardConfigModel.findOne(
    { classId },
    { classId: 1, enabled: 1, pointsPerReward: 1 }
  ).lean<{
      classId?: string;
      enabled?: boolean;
      pointsPerReward?: number;
    } | null>();

  if (session) query.session(session);
  const row = await query;

  return {
    classId,
    enabled: row?.enabled !== false,
    pointsPerReward: parsePointsPerReward(row?.pointsPerReward),
  };
}

export async function updateScoreThresholdConfig(
  classId: string,
  payload: {
    pointsPerReward?: number;
    enabled?: boolean;
    updatedBy?: string | null;
  },
  session?: ClientSession
): Promise<ScoreThresholdConfig> {
  const $set: Record<string, unknown> = { updatedAt: new Date() };

  if (payload.pointsPerReward !== undefined) {
    const parsed = Number(payload.pointsPerReward);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error("pointsPerReward must be a positive integer");
    }
    $set.pointsPerReward = Math.max(1, Math.floor(parsed));
  }

  if (payload.enabled !== undefined) {
    $set.enabled = payload.enabled === true;
  }

  if (payload.updatedBy !== undefined) {
    $set.updatedBy = payload.updatedBy;
  }

  await GameScoreRewardConfigModel.updateOne(
    { classId },
    {
      $setOnInsert: {
        classId,
        enabled: true,
        pointsPerReward: getDefaultPointsPerReward(),
      },
      $set,
    },
    { upsert: true, session }
  );

  return getScoreThresholdConfig(classId, session);
}

export async function ensureStudentInventory(
  classId: string,
  studentId: string,
  session?: ClientSession
) {
  const catalogOwnedCosmeticIds = getDefaultOwnedCosmeticIds();
  const existing = await GameStudentInventoryModel.findOne(
    { classId, studentId },
    null,
    { session, lean: false }
  );
  if (existing) {
    const existingValidOwnedCosmetics = (existing.ownedCosmeticIds || []).filter(
      (id: string) => isCosmeticId(id)
    );
    const existingValidOwnedBadges = (existing.ownedBadgeIds || []).filter(
      (id: string) => isBadgeId(id)
    );
    const mergedOwned = normalizeUnique([
      ...existingValidOwnedCosmetics,
      ...catalogOwnedCosmeticIds,
    ]);
    const needsRefresh =
      mergedOwned.length !== (existing.ownedCosmeticIds || []).length ||
      existingValidOwnedBadges.length !== (existing.ownedBadgeIds || []).length ||
      normalizeDisplayedBadges(
        existingValidOwnedBadges,
        (existing.displayBadgeIds || []).map((id: unknown) => String(id))
      ).length !== (existing.displayBadgeIds || []).length ||
      !existing.avatarUrl ||
      existing.avatarUrl.startsWith("data:image/svg+xml") ||
      !existing.avatarSpec;
    if (needsRefresh) {
      const normalized = normalizeInventoryInput(classId, studentId, existing, {
        ownedCosmeticIds: mergedOwned,
        ownedBadgeIds: existingValidOwnedBadges,
        displayBadgeIds: existing.displayBadgeIds || [],
        equipped: (existing.equipped || {}) as Partial<Record<CosmeticSlot, string | null>>,
      });
      existing.ownedCosmeticIds = normalized.ownedCosmeticIds;
      existing.ownedBadgeIds = normalized.ownedBadgeIds;
      existing.displayBadgeIds = normalized.displayBadgeIds;
      existing.equipped = normalized.equipped;
      existing.avatarSpec = normalized.avatarSpec;
      existing.avatarUrl = normalized.avatarUrl;
      existing.updatedAt = new Date();
      await existing.save({ session });
    }
    return existing;
  }

  const ownedCosmeticIds = catalogOwnedCosmeticIds;
  const equipped = normalizeEquipped(ownedCosmeticIds, getEmptyEquippedSlots());
  const avatarState = buildAvatarState(classId, studentId, equipped);

  const created = await GameStudentInventoryModel.create(
    [
      {
        classId,
        studentId,
        ownedCosmeticIds,
        ownedBadgeIds: [],
        displayBadgeIds: [],
        equipped,
        avatarSpec: avatarState.avatarSpec,
        avatarUrl: avatarState.avatarUrl,
        updatedAt: new Date(),
      },
    ],
    { session }
  );
  return created[0];
}

export async function setStudentInventory(
  classId: string,
  studentId: string,
  input: InventoryUpdateInput,
  session?: ClientSession
) {
  const current = await ensureStudentInventory(classId, studentId, session);
  const normalized = normalizeInventoryInput(classId, studentId, current, input);

  current.ownedCosmeticIds = normalized.ownedCosmeticIds;
  current.ownedBadgeIds = normalized.ownedBadgeIds;
  current.displayBadgeIds = normalized.displayBadgeIds;
  current.equipped = normalized.equipped;
  current.avatarSpec = normalized.avatarSpec;
  current.avatarUrl = normalized.avatarUrl;
  current.updatedAt = new Date();

  await current.save({ session });
  return current;
}

async function getStudentMetrics(
  classId: string,
  studentId: string,
  session: ClientSession
): Promise<StudentMetrics> {
  const row = await GameStudentStatsModel.findOne(
    { classId: toClassObjectId(classId), studentId },
    { overallScore: 1, bestStreakDays: 1, canonicalBySchedule: 1 }
  )
    .session(session)
    .lean<{
      overallScore?: number;
      bestStreakDays?: number;
      canonicalBySchedule?: Record<string, unknown>;
    } | null>();

  return {
    overallScore: Number(row?.overallScore || 0),
    bestStreakDays: Number(row?.bestStreakDays || 0),
    participationCount: Object.keys(row?.canonicalBySchedule || {}).length,
  };
}

function conditionMatches(
  triggerType: RewardRuleTriggerType,
  threshold: number,
  metrics: StudentMetrics
) {
  if (triggerType === "overall_score_gte") {
    return metrics.overallScore >= threshold;
  }
  if (triggerType === "best_streak_gte") {
    return metrics.bestStreakDays >= threshold;
  }
  if (triggerType === "participation_count_gte") {
    return metrics.participationCount >= threshold;
  }
  return false;
}

function rewardTypeForId(rewardId: string): "cosmetic" | "badge" | null {
  if (isCosmeticId(rewardId)) return "cosmetic";
  if (isBadgeId(rewardId)) return "badge";
  return null;
}

async function grantRewardToStudentInSession(payload: {
  classId: string;
  studentId: string;
  rewardId: string;
  source: RewardGrantSource;
  ruleId?: Types.ObjectId | null;
  thresholdPoints?: number | null;
  triggerAttemptId?: string | null;
  metadata?: Record<string, unknown>;
  session: ClientSession;
}) {
  const rewardType = rewardTypeForId(payload.rewardId);
  if (!rewardType) {
    throw new Error(`Unknown reward id: ${payload.rewardId}`);
  }

  let existingGrant: any = null;
  if (payload.source === "rule" && payload.ruleId) {
    existingGrant = await GameRewardGrantModel.exists({
      classId: payload.classId,
      studentId: payload.studentId,
      rewardId: payload.rewardId,
      ruleId: payload.ruleId,
    })
      .session(payload.session)
      .lean();
  }
  if (
    payload.source === "score_threshold" &&
    Number.isFinite(payload.thresholdPoints)
  ) {
    existingGrant = await GameRewardGrantModel.exists({
      classId: payload.classId,
      studentId: payload.studentId,
      source: "score_threshold",
      thresholdPoints: Number(payload.thresholdPoints),
    })
      .session(payload.session)
      .lean();
  }

  if (existingGrant) return false;

  const inv = await ensureStudentInventory(
    payload.classId,
    payload.studentId,
    payload.session
  );

  let changed = false;
  if (rewardType === "cosmetic" && !inv.ownedCosmeticIds.includes(payload.rewardId)) {
    inv.ownedCosmeticIds.push(payload.rewardId);
    changed = true;
    const slot = slotForCosmetic(payload.rewardId);
    if (slot && !inv.equipped[slot]) {
      inv.equipped[slot] = payload.rewardId;
    }
  }
  if (rewardType === "badge" && !inv.ownedBadgeIds.includes(payload.rewardId)) {
    inv.ownedBadgeIds.push(payload.rewardId);
    inv.displayBadgeIds = normalizeDisplayedBadges(
      inv.ownedBadgeIds || [],
      [...(inv.displayBadgeIds || []), payload.rewardId]
    );
    changed = true;
  }

  if (changed) {
    inv.equipped = normalizeEquipped(
      inv.ownedCosmeticIds || [],
      (inv.equipped || {}) as Partial<Record<CosmeticSlot, string | null>>
    );
    const avatarState = buildAvatarState(payload.classId, payload.studentId, inv.equipped);
    inv.avatarSpec = avatarState.avatarSpec;
    inv.avatarUrl = avatarState.avatarUrl;
    inv.updatedAt = new Date();
    await inv.save({ session: payload.session });
  }

  try {
    const grantedAt = new Date();
    await GameRewardGrantModel.create(
      [
        {
          classId: payload.classId,
          studentId: payload.studentId,
          rewardId: payload.rewardId,
          rewardType,
          source: payload.source,
          ruleId: payload.ruleId || null,
          thresholdPoints:
            payload.source === "score_threshold"
              ? Number(payload.thresholdPoints || 0)
              : null,
          triggerAttemptId: payload.triggerAttemptId
            ? String(payload.triggerAttemptId)
            : null,
          grantedAt,
          metadata: {
            ...(payload.metadata || {}),
            inventoryChanged: changed,
          },
          acknowledgedAt: null,
        },
      ],
      { session: payload.session }
    );
  } catch (e: any) {
    if (e?.code === 11000) {
      return false;
    }
    throw e;
  }

  if (changed && !payload.triggerAttemptId) {
    await GameStudentNotificationModel.create(
      [
        {
          classId: payload.classId,
          studentId: payload.studentId,
          type: "reward_granted",
          source: payload.source,
          rewardId: payload.rewardId,
          rewardType,
          triggerAttemptId: null,
          metadata: {
            ...(payload.metadata || {}),
            via: "reward_grant",
          },
          createdAt: new Date(),
          acknowledgedAt: null,
        },
      ],
      { session: payload.session }
    );
  }

  return changed;
}

export async function grantRewardToStudent(payload: {
  classId: string;
  studentId: string;
  rewardId: string;
  source: RewardGrantSource;
  ruleId?: Types.ObjectId | null;
}) {
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(async () =>
      grantRewardToStudentInSession({
        classId: payload.classId,
        studentId: payload.studentId,
        rewardId: payload.rewardId,
        source: payload.source,
        ruleId: payload.ruleId || null,
        session,
      })
    );
  } finally {
    session.endSession();
  }
}

function normalizeScorePoints(value: unknown) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function nextThresholdAfterScore(score: number, pointsPerReward: number) {
  const step = parsePointsPerReward(pointsPerReward);
  const safeScore = normalizeScorePoints(score);
  return (Math.floor(safeScore / step) + 1) * step;
}

async function getLatestScoreThresholdGrantPoint(
  classId: string,
  studentId: string,
  session: ClientSession
) {
  const row = await GameRewardGrantModel.findOne(
    {
      classId,
      studentId,
      source: "score_threshold",
      thresholdPoints: { $exists: true, $ne: null, $type: "number" },
    },
    { thresholdPoints: 1 }
  )
    .sort({ thresholdPoints: -1, grantedAt: -1, _id: -1 })
    .session(session)
    .lean<{ thresholdPoints?: number | null } | null>();

  const parsed = Number(row?.thresholdPoints);
  return Number.isFinite(parsed) ? parsed : null;
}

function pickRandom<T>(items: T[]) {
  if (!items.length) return null;
  if (items.length === 1) return items[0];
  return items[crypto.randomInt(items.length)];
}

function pickThresholdCosmeticRewardId(ownedCosmeticIds: string[]) {
  const owned = new Set<string>(ownedCosmeticIds.map((id) => String(id)));
  const catalog = listCosmetics();
  const all = catalog.map((item) => item.id);
  if (!all.length) return null;

  const locked = catalog
    .filter((item) => item.defaultOwned === false)
    .map((item) => item.id);

  const lockedUnowned = locked.filter((id) => !owned.has(id));
  if (lockedUnowned.length) return pickRandom(lockedUnowned);

  const anyUnowned = all.filter((id) => !owned.has(id));
  if (anyUnowned.length) return pickRandom(anyUnowned);

  return pickRandom(all);
}

export async function evaluateScoreThresholdRewards(payload: {
  classId: string;
  studentId: string;
  triggerAttemptId?: string | null;
  session?: ClientSession;
}) {
  const run = async (session: ClientSession) => {
    const [config, metrics, inv] = await Promise.all([
      getScoreThresholdConfig(payload.classId, session),
      getStudentMetrics(payload.classId, payload.studentId, session),
      ensureStudentInventory(payload.classId, payload.studentId, session),
    ]);

    if (!config.enabled) return;

    const pointsPerReward = parsePointsPerReward(config.pointsPerReward);
    const currentScore = normalizeScorePoints(metrics.overallScore);
    const progress = inv.scoreThresholdProgress || null;
    const progressStep = Number(progress?.pointsPerReward);
    const progressNext = Number(progress?.nextThresholdPoints);

    const progressInitialized =
      Number.isFinite(progressStep) &&
      progressStep > 0 &&
      Number.isFinite(progressNext) &&
      progressNext > 0;

    let nextThresholdPoints = 0;

    if (!progressInitialized) {
      const latestGranted = await getLatestScoreThresholdGrantPoint(
        payload.classId,
        payload.studentId,
        session
      );

      if (Number.isFinite(latestGranted)) {
        nextThresholdPoints = Math.max(
          nextThresholdAfterScore(currentScore, pointsPerReward),
          Number(latestGranted) + pointsPerReward,
          pointsPerReward
        );
      } else {
        // Fresh student: begin from the first threshold and grant when crossed.
        nextThresholdPoints = pointsPerReward;
      }
    } else if (progressStep !== pointsPerReward) {
      // Config changed: do not backfill. Move to the next forward threshold only.
      nextThresholdPoints = nextThresholdAfterScore(currentScore, pointsPerReward);
    } else {
      nextThresholdPoints = progressNext;
    }

    let progressChanged = !progressInitialized || progressStep !== pointsPerReward;
    const localOwned = new Set<string>(
      (inv.ownedCosmeticIds || []).map((id: unknown) => String(id))
    );

    while (currentScore >= nextThresholdPoints) {
      const rewardId = pickThresholdCosmeticRewardId(Array.from(localOwned));
      if (!rewardId) {
        break;
      }

      const changed = await grantRewardToStudentInSession({
        classId: payload.classId,
        studentId: payload.studentId,
        rewardId,
        source: "score_threshold",
        thresholdPoints: nextThresholdPoints,
        triggerAttemptId: payload.triggerAttemptId || null,
        metadata: {
          thresholdPoints: nextThresholdPoints,
          pointsPerReward,
          metric: "overallScore",
        },
        session,
      });

      if (changed && !localOwned.has(rewardId)) {
        localOwned.add(rewardId);
        inv.ownedCosmeticIds.push(rewardId);
      }

      nextThresholdPoints += pointsPerReward;
      progressChanged = true;
    }

    if (progressChanged) {
      await GameStudentInventoryModel.updateOne(
        { classId: payload.classId, studentId: payload.studentId },
        {
          $set: {
            scoreThresholdProgress: {
              pointsPerReward,
              nextThresholdPoints,
            },
            updatedAt: new Date(),
          },
        },
        { session }
      );
    }
  };

  if (payload.session) {
    await run(payload.session);
    return;
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await run(session);
    });
  } finally {
    session.endSession();
  }
}

export async function evaluateStudentRewardRules(payload: {
  classId: string;
  studentId: string;
  triggerAttemptId?: string | null;
  session?: ClientSession;
}) {
  const run = async (session: ClientSession) => {
    await ensureDefaultRewardRules(payload.classId, session);

    const [rules, metrics] = await Promise.all([
      GameRewardRuleModel.find({ classId: payload.classId, enabled: true })
        .select({
          _id: 1,
          triggerType: 1,
          threshold: 1,
          rewardIds: 1,
          repeatable: 1,
        })
        .session(session)
        .lean<
          Array<
            Pick<
              IGameRewardRule,
              "triggerType" | "threshold" | "rewardIds" | "repeatable"
            > & { _id: Types.ObjectId }
          >
        >(),
      getStudentMetrics(payload.classId, payload.studentId, session),
    ]);

    for (const rule of rules) {
      if (!conditionMatches(rule.triggerType, Number(rule.threshold), metrics)) {
        continue;
      }

      const rewardIds = normalizeUnique(Array.isArray(rule.rewardIds) ? rule.rewardIds : []);
      for (const rewardId of rewardIds) {
        if (!rule.repeatable) {
          const exists = await GameRewardGrantModel.exists({
            classId: payload.classId,
            studentId: payload.studentId,
            rewardId,
            ruleId: rule._id,
          })
            .session(session)
            .lean();
          if (exists) continue;
        }

        try {
          await grantRewardToStudentInSession({
            classId: payload.classId,
            studentId: payload.studentId,
            rewardId,
            source: "rule",
            ruleId: rule._id,
            triggerAttemptId: payload.triggerAttemptId || null,
            session,
          });
        } catch (e) {
          console.warn("[game-reward] grant failed", {
            classId: payload.classId,
            studentId: payload.studentId,
            rewardId,
            error: e,
          });
        }
      }
    }
  };

  if (payload.session) {
    await run(payload.session);
    return;
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await run(session);
    });
  } finally {
    session.endSession();
  }
}

export function validateRewardRulePayload(input: {
  triggerType: string;
  threshold: number;
  rewardIds: string[];
}) {
  const triggerType = String(input.triggerType || "") as RewardRuleTriggerType;
  const allowed = [
    "overall_score_gte",
    "best_streak_gte",
    "participation_count_gte",
  ] satisfies RewardRuleTriggerType[];

  if (!allowed.includes(triggerType)) {
    throw new Error(`Unsupported triggerType: ${triggerType}`);
  }

  const threshold = Number(input.threshold);
  if (!Number.isFinite(threshold) || threshold < 0) {
    throw new Error("threshold must be a non-negative number");
  }

  const rewardIds = normalizeUnique(input.rewardIds || []);
  if (!rewardIds.length) {
    throw new Error("At least one reward id is required");
  }

  for (const rewardId of rewardIds) {
    if (!getCosmeticById(rewardId) && !getBadgeById(rewardId)) {
      throw new Error(`Unknown reward id: ${rewardId}`);
    }
  }

  return { triggerType, threshold, rewardIds };
}
