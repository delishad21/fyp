import { Types } from "mongoose";
import { ScheduleQuizVariantModel } from "../model/schedule-quiz-variant-model";
import { QuizTypeDef } from "../model/quiz-registry";

type ResolveVariantInput = {
  scheduleId: string;
  quizDoc: any;
  def: QuizTypeDef;
};

function withVariant(quizDoc: any, variantData: Record<string, any>) {
  return {
    ...quizDoc,
    ...variantData,
  };
}

/**
 * Returns the schedule-anchored quiz shape used to build attempt specs/stats.
 * For non-randomized quiz types, this is just `quizDoc`.
 */
export async function resolveQuizForSchedule({
  scheduleId,
  quizDoc,
  def,
}: ResolveVariantInput): Promise<any> {
  if (!def.buildScheduleVariant) return quizDoc;
  if (!Types.ObjectId.isValid(scheduleId)) return quizDoc;

  const scheduleObjectId = new Types.ObjectId(scheduleId);
  const root = String(quizDoc?.rootQuizId ?? "");
  const version = Number(quizDoc?.version);

  if (!Types.ObjectId.isValid(root) || !Number.isFinite(version)) {
    return quizDoc;
  }

  const quizRootId = new Types.ObjectId(root);

  const existing = await ScheduleQuizVariantModel.findOne({
    scheduleId: scheduleObjectId,
    quizRootId,
    quizVersion: version,
  })
    .select({ variantData: 1 })
    .lean<{ variantData?: Record<string, any> } | null>();

  if (existing?.variantData && typeof existing.variantData === "object") {
    return withVariant(quizDoc, existing.variantData);
  }

  const variantData = def.buildScheduleVariant(quizDoc, { scheduleId });

  if (!variantData || typeof variantData !== "object") {
    return quizDoc;
  }

  try {
    await ScheduleQuizVariantModel.updateOne(
      {
        scheduleId: scheduleObjectId,
        quizRootId,
        quizVersion: version,
      },
      {
        $setOnInsert: {
          scheduleId: scheduleObjectId,
          quizRootId,
          quizVersion: version,
          quizType: def.type,
          variantData,
        },
      },
      { upsert: true }
    );
  } catch (err: any) {
    // Duplicate-key races are expected under concurrent first access.
    if (err?.code !== 11000) throw err;
  }

  const persisted = await ScheduleQuizVariantModel.findOne({
    scheduleId: scheduleObjectId,
    quizRootId,
    quizVersion: version,
  })
    .select({ variantData: 1 })
    .lean<{ variantData?: Record<string, any> } | null>();

  if (persisted?.variantData && typeof persisted.variantData === "object") {
    return withVariant(quizDoc, persisted.variantData);
  }

  return withVariant(quizDoc, variantData);
}

export async function purgeScheduleVariants(input: {
  scheduleId: string;
  quizRootId?: string | null;
  quizVersion?: number | null;
}) {
  if (!Types.ObjectId.isValid(input.scheduleId)) return;

  const filter: Record<string, any> = {
    scheduleId: new Types.ObjectId(input.scheduleId),
  };

  if (input.quizRootId && Types.ObjectId.isValid(input.quizRootId)) {
    filter.quizRootId = new Types.ObjectId(input.quizRootId);
  }
  if (
    typeof input.quizVersion === "number" &&
    Number.isFinite(input.quizVersion)
  ) {
    filter.quizVersion = input.quizVersion;
  }

  await ScheduleQuizVariantModel.deleteMany(filter);
}
