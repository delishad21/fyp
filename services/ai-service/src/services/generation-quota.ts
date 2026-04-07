import { Types } from "mongoose";
import { GenerationJobModel } from "../models/generation-job-model";
import TeacherGenerationQuotaUsageModel from "../models/generation-quota-model";

export type TeacherGenerationQuotaStatus = {
  enabled: boolean;
  maxGenerations: number | null;
  generationsUsed: number;
  generationsRemaining: number | null;
  exhausted: boolean;
};

export type TeacherGenerationQuotaConsumptionResult =
  TeacherGenerationQuotaStatus & {
    acquired: boolean;
  };

function parseBoolean(raw: string | undefined, fallback: boolean) {
  if (typeof raw !== "string") return fallback;
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parseNonNegativeInt(raw: string | undefined, fallback: number) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return fallback;
  return Math.floor(value);
}

export function isTeacherGenerationQuotaEnabled() {
  return parseBoolean(process.env.AI_TEACHER_GENERATION_QUOTA_ENABLED, false);
}

export function getTeacherGenerationQuotaMaxJobs() {
  return parseNonNegativeInt(
    process.env.AI_TEACHER_GENERATION_QUOTA_MAX_JOBS,
    1,
  );
}

function buildStatus(
  enabled: boolean,
  maxGenerations: number | null,
  generationsUsed: number,
): TeacherGenerationQuotaStatus {
  if (!enabled || maxGenerations === null) {
    return {
      enabled: false,
      maxGenerations: null,
      generationsUsed,
      generationsRemaining: null,
      exhausted: false,
    };
  }

  const remaining = Math.max(0, maxGenerations - generationsUsed);
  return {
    enabled: true,
    maxGenerations,
    generationsUsed,
    generationsRemaining: remaining,
    exhausted: remaining <= 0,
  };
}

async function getExistingUsageCount(normalizedTeacherId: Types.ObjectId) {
  return GenerationJobModel.countDocuments({
    teacherId: normalizedTeacherId,
  });
}

async function getOrSeedUsage(normalizedTeacherId: Types.ObjectId) {
  const existingUsage = await TeacherGenerationQuotaUsageModel.findOne({
    teacherId: normalizedTeacherId,
  })
    .select({ generationsUsed: 1 })
    .lean<{ generationsUsed?: number } | null>();

  if (existingUsage) {
    return Math.max(0, Number(existingUsage.generationsUsed || 0));
  }

  const historicalUsage = Math.max(
    0,
    await getExistingUsageCount(normalizedTeacherId),
  );

  if (historicalUsage === 0) {
    return 0;
  }

  try {
    await TeacherGenerationQuotaUsageModel.create({
      teacherId: normalizedTeacherId,
      generationsUsed: historicalUsage,
      lastConsumedAt: new Date(),
    });
    return historicalUsage;
  } catch (error: any) {
    if (error?.code === 11000) {
      const concurrentUsage = await TeacherGenerationQuotaUsageModel.findOne({
        teacherId: normalizedTeacherId,
      })
        .select({ generationsUsed: 1 })
        .lean<{ generationsUsed?: number } | null>();
      return Math.max(0, Number(concurrentUsage?.generationsUsed || 0));
    }
    throw error;
  }
}

export async function getTeacherGenerationQuotaStatus(
  teacherId: string | Types.ObjectId,
): Promise<TeacherGenerationQuotaStatus> {
  const enabled = isTeacherGenerationQuotaEnabled();
  const maxGenerations = getTeacherGenerationQuotaMaxJobs();

  const normalizedTeacherId =
    teacherId instanceof Types.ObjectId ? teacherId : new Types.ObjectId(teacherId);

  const generationsUsed = await getOrSeedUsage(normalizedTeacherId);
  return buildStatus(enabled, enabled ? maxGenerations : null, generationsUsed);
}

export async function consumeTeacherGenerationQuota(
  teacherId: string | Types.ObjectId,
): Promise<TeacherGenerationQuotaConsumptionResult> {
  const enabled = isTeacherGenerationQuotaEnabled();
  const maxGenerations = getTeacherGenerationQuotaMaxJobs();

  const normalizedTeacherId =
    teacherId instanceof Types.ObjectId ? teacherId : new Types.ObjectId(teacherId);

  if (!enabled) {
    return {
      ...buildStatus(false, null, 0),
      acquired: true,
    };
  }

  if (maxGenerations <= 0) {
    const generationsUsed = await getOrSeedUsage(normalizedTeacherId);
    return {
      ...buildStatus(true, maxGenerations, generationsUsed),
      acquired: false,
    };
  }

  try {
    await getOrSeedUsage(normalizedTeacherId);

    const updated = await TeacherGenerationQuotaUsageModel.findOneAndUpdate(
      {
        teacherId: normalizedTeacherId,
        generationsUsed: { $lt: maxGenerations },
      },
      {
        $setOnInsert: { teacherId: normalizedTeacherId },
        $set: { lastConsumedAt: new Date() },
        $inc: { generationsUsed: 1 },
      },
      {
        new: true,
        upsert: true,
      },
    )
      .select({ generationsUsed: 1 })
      .lean<{ generationsUsed?: number } | null>();

    if (!updated) {
      return {
        ...buildStatus(true, maxGenerations, maxGenerations),
        acquired: false,
      };
    }

    const generationsUsed = Math.max(0, Number(updated.generationsUsed || 0));
    return {
      ...buildStatus(true, maxGenerations, generationsUsed),
      acquired: true,
    };
  } catch (error: any) {
    if (error?.code === 11000) {
      return consumeTeacherGenerationQuota(normalizedTeacherId);
    }
    throw error;
  }
}

export async function releaseTeacherGenerationQuota(
  teacherId: string | Types.ObjectId,
): Promise<void> {
  if (!isTeacherGenerationQuotaEnabled()) return;

  const normalizedTeacherId =
    teacherId instanceof Types.ObjectId ? teacherId : new Types.ObjectId(teacherId);

  await TeacherGenerationQuotaUsageModel.updateOne(
    {
      teacherId: normalizedTeacherId,
      generationsUsed: { $gt: 0 },
    },
    {
      $inc: { generationsUsed: -1 },
    },
  );
}
