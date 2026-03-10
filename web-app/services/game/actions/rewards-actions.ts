"use server";

import { getAuthHeader } from "@/services/user/session-definitions";
import { classSvcUrl, gameSvcUrl } from "@/utils/utils";

export type RewardCatalogCosmetic = {
  id: string;
  name: string;
  slot: string;
  description: string;
  color: string;
  assetPath?: string;
  assetUrl?: string;
  defaultOwned?: boolean;
};

export type RewardCatalogBadge = {
  id: string;
  name: string;
  description: string;
  color: string;
  imageUrl?: string;
};

export type StudentBadgeItem = {
  id: string;
  name: string;
  description: string;
  color: string;
  kind?: string;
  engraving?: string | null;
  imageUrl?: string | null;
};

export type RewardRule = {
  _id: string;
  classId: string;
  key?: string;
  name: string;
  description?: string;
  triggerType: "overall_score_gte" | "best_streak_gte" | "participation_count_gte";
  threshold: number;
  rewardIds: string[];
  enabled: boolean;
  repeatable: boolean;
  source: "default" | "custom";
};

export type StudentInventory = {
  _id?: string;
  classId: string;
  studentId: string;
  ownedCosmeticIds: string[];
  ownedBadgeIds: string[];
  displayBadgeIds: string[];
  equipped: Record<string, string | null>;
  scoreThresholdProgress?: {
    pointsPerReward: number;
    nextThresholdPoints: number;
  } | null;
  avatarUrl?: string | null;
};

export type ClassStudentLite = {
  userId: string;
  displayName: string;
  photoUrl?: string | null;
};

export type ScoreRewardConfig = {
  classId: string;
  enabled: boolean;
  pointsPerReward: number;
};

export type BadgeRewardConfig = {
  classId: string;
  weeklyTopEnabled: boolean;
  monthlyTopEnabled: boolean;
  overallScoreThresholdEnabled: boolean;
  streakThresholdEnabled: boolean;
  overallScoreThresholdStep: number;
  streakThresholdStep: number;
};

type Ok<T> = { ok: true; data: T };
type Err = { ok: false; message: string };

function toGameCosmeticAssetUrl(cosmeticId: string) {
  return gameSvcUrl(
    `/rewards/cosmetics/${encodeURIComponent(cosmeticId)}/asset.svg`
  );
}

function toGameBadgeImageUrl(classId: string, badgeId: string) {
  return gameSvcUrl(
    `/classes/${encodeURIComponent(classId)}/badges/${encodeURIComponent(
      badgeId
    )}/image.svg`
  );
}

async function authedJson(url: string, init?: RequestInit) {
  const auth = await getAuthHeader();
  if (!auth) {
    return { ok: false, message: "Not authenticated", status: 401, body: null as any };
  }

  const resp = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: auth,
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  const isJson = (resp.headers.get("content-type") || "").includes(
    "application/json"
  );
  const body = isJson ? await resp.json().catch(() => null) : null;

  if (!resp.ok || !body?.ok) {
    return {
      ok: false,
      status: resp.status,
      message:
        body?.message ||
        body?.error ||
        (resp.status === 401 || resp.status === 403
          ? "Authentication failed"
          : `Request failed (${resp.status})`),
      body,
    };
  }

  return { ok: true, status: resp.status, body };
}

export async function getRewardsDashboardAction(
  classId: string
): Promise<
  Ok<{
    catalog: {
      cosmetics: RewardCatalogCosmetic[];
      badges: RewardCatalogBadge[];
    };
    rules: RewardRule[];
      scoreConfig: ScoreRewardConfig;
      badgeConfig: BadgeRewardConfig | null;
      students: ClassStudentLite[];
      inventories: StudentInventory[];
  }> |
    Err
> {
  const encodedClassId = encodeURIComponent(classId);

  const [
    catalogRes,
    rulesRes,
    scoreConfigRes,
    badgeConfigRes,
    inventoriesRes,
    studentsRes,
  ] =
    await Promise.all([
    authedJson(gameSvcUrl(`/rewards/catalog`)),
    authedJson(gameSvcUrl(`/classes/${encodedClassId}/rewards/rules`)),
    authedJson(gameSvcUrl(`/classes/${encodedClassId}/rewards/score-config`)),
    authedJson(gameSvcUrl(`/classes/${encodedClassId}/badges/config`)),
    authedJson(gameSvcUrl(`/classes/${encodedClassId}/rewards/inventories`)),
    authedJson(classSvcUrl(`/classes/${encodedClassId}/students`)),
    ]);

  for (const result of [
    catalogRes,
    rulesRes,
    scoreConfigRes,
    inventoriesRes,
    studentsRes,
  ]) {
    if (!result.ok) return { ok: false, message: result.message };
  }

  const students: ClassStudentLite[] = Array.isArray(studentsRes.body?.data)
    ? studentsRes.body.data.map((row: any) => ({
        userId: String(row.userId),
        displayName: String(row.displayName || row.userId),
        photoUrl: typeof row.photoUrl === "string" ? row.photoUrl : null,
      }))
    : [];

  const inventories: StudentInventory[] = Array.isArray(
    inventoriesRes.body?.data?.inventories
  )
    ? inventoriesRes.body.data.inventories.map((row: any) => ({
        _id: String(row._id || ""),
        classId: String(row.classId),
        studentId: String(row.studentId),
        ownedCosmeticIds: Array.isArray(row.ownedCosmeticIds)
          ? row.ownedCosmeticIds.map((v: any) => String(v))
          : [],
        ownedBadgeIds: Array.isArray(row.ownedBadgeIds)
          ? row.ownedBadgeIds.map((v: any) => String(v))
          : [],
        displayBadgeIds: Array.isArray(row.displayBadgeIds)
          ? row.displayBadgeIds.map((v: any) => String(v))
          : [],
        equipped:
          row?.equipped && typeof row.equipped === "object"
            ? Object.fromEntries(
                Object.entries(row.equipped).map(([slot, id]) => [
                  String(slot),
                  id ? String(id) : null,
                ])
              )
            : {},
        scoreThresholdProgress:
          row?.scoreThresholdProgress &&
          typeof row.scoreThresholdProgress === "object"
            ? {
                pointsPerReward: Number(
                  row.scoreThresholdProgress.pointsPerReward || 0
                ),
                nextThresholdPoints: Number(
                  row.scoreThresholdProgress.nextThresholdPoints || 0
                ),
              }
            : null,
        avatarUrl: typeof row.avatarUrl === "string" ? row.avatarUrl : null,
      }))
    : [];

  return {
    ok: true,
    data: {
      catalog: {
        cosmetics: Array.isArray(catalogRes.body?.data?.cosmetics)
          ? catalogRes.body.data.cosmetics.map((item: any) => ({
              id: String(item.id),
              name: String(item.name || item.id),
              slot: String(item.slot || ""),
              description: String(item.description || ""),
              color: String(item.color || "#64748B"),
              assetPath:
                typeof item.assetPath === "string" ? item.assetPath : undefined,
              assetUrl:
                typeof item.id === "string" && item.id
                  ? toGameCosmeticAssetUrl(item.id)
                  : undefined,
              defaultOwned: item.defaultOwned !== false,
            }))
          : [],
        badges: Array.isArray(catalogRes.body?.data?.badges)
          ? catalogRes.body.data.badges.map((item: any) => ({
              id: String(item.id),
              name: String(item.name || item.id),
              description: String(item.description || ""),
              color: String(item.color || "#64748B"),
              imageUrl: toGameBadgeImageUrl(classId, String(item.id || "")),
            }))
          : [],
      },
      rules: Array.isArray(rulesRes.body?.data) ? rulesRes.body.data : [],
      scoreConfig: {
        classId: String(scoreConfigRes.body?.data?.classId || classId),
        enabled: scoreConfigRes.body?.data?.enabled !== false,
        pointsPerReward: Number(scoreConfigRes.body?.data?.pointsPerReward || 500),
      },
      badgeConfig: badgeConfigRes.ok
        ? {
            classId: String(badgeConfigRes.body?.data?.classId || classId),
            weeklyTopEnabled: badgeConfigRes.body?.data?.weeklyTopEnabled === true,
            monthlyTopEnabled: badgeConfigRes.body?.data?.monthlyTopEnabled !== false,
            overallScoreThresholdEnabled:
              badgeConfigRes.body?.data?.overallScoreThresholdEnabled !== false,
            streakThresholdEnabled:
              badgeConfigRes.body?.data?.streakThresholdEnabled !== false,
            overallScoreThresholdStep: Number(
              badgeConfigRes.body?.data?.overallScoreThresholdStep || 1000
            ),
            streakThresholdStep: Number(
              badgeConfigRes.body?.data?.streakThresholdStep || 25
            ),
          }
        : null,
      students,
      inventories,
    },
  };
}

export async function updateScoreRewardConfigAction(
  classId: string,
  payload: {
    enabled?: boolean;
    pointsPerReward?: number;
  }
) {
  return authedJson(
    gameSvcUrl(`/classes/${encodeURIComponent(classId)}/rewards/score-config`),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
}

export async function createRewardRuleAction(classId: string, payload: {
  name: string;
  description?: string;
  triggerType: string;
  threshold: number;
  rewardIds: string[];
  enabled?: boolean;
}) {
  return authedJson(gameSvcUrl(`/classes/${encodeURIComponent(classId)}/rewards/rules`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function updateRewardRuleAction(
  classId: string,
  ruleId: string,
  payload: {
    name: string;
    description?: string;
    triggerType: string;
    threshold: number;
    rewardIds: string[];
    enabled?: boolean;
  }
) {
  return authedJson(
    gameSvcUrl(
      `/classes/${encodeURIComponent(classId)}/rewards/rules/${encodeURIComponent(
        ruleId
      )}`
    ),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
}

export async function deleteRewardRuleAction(classId: string, ruleId: string) {
  return authedJson(
    gameSvcUrl(
      `/classes/${encodeURIComponent(classId)}/rewards/rules/${encodeURIComponent(
        ruleId
      )}`
    ),
    { method: "DELETE" }
  );
}

export async function updateStudentInventoryAction(
  classId: string,
  studentId: string,
  payload: {
    ownedCosmeticIds: string[];
    ownedBadgeIds: string[];
    displayBadgeIds?: string[];
    equipped?: Record<string, string | null>;
    equippedOutfit?: string | null;
    equippedAccessory?: string | null;
    equippedPet?: string | null;
  }
) {
  return authedJson(
    gameSvcUrl(
      `/classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(
        studentId
      )}/inventory`
    ),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
}

export async function grantRewardToStudentAction(
  classId: string,
  studentId: string,
  rewardId: string
) {
  return authedJson(
    gameSvcUrl(
      `/classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(
        studentId
      )}/rewards/grant`
    ),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rewardId }),
    }
  );
}

export async function getRewardsCatalogAction(
  classId?: string
): Promise<Ok<{ cosmetics: RewardCatalogCosmetic[]; badges: RewardCatalogBadge[] }> | Err> {
  void classId;
  const res = await authedJson(gameSvcUrl(`/rewards/catalog`));
  if (!res.ok) return { ok: false, message: res.message };

  const cosmetics: RewardCatalogCosmetic[] = Array.isArray(res.body?.data?.cosmetics)
    ? res.body.data.cosmetics.map((item: any) => ({
        id: String(item.id),
        name: String(item.name || item.id),
        slot: String(item.slot || ""),
        description: String(item.description || ""),
        color: String(item.color || "#64748B"),
        assetPath: typeof item.assetPath === "string" ? item.assetPath : undefined,
        assetUrl:
          typeof item.id === "string" && item.id
            ? toGameCosmeticAssetUrl(item.id)
            : undefined,
        defaultOwned: item.defaultOwned !== false,
      }))
    : [];

  const badges: RewardCatalogBadge[] = Array.isArray(res.body?.data?.badges)
    ? res.body.data.badges.map((item: any) => ({
        id: String(item.id),
        name: String(item.name || item.id),
        description: String(item.description || ""),
        color: String(item.color || "#64748B"),
        imageUrl: classId ? toGameBadgeImageUrl(classId, String(item.id || "")) : undefined,
      }))
    : [];

  return { ok: true, data: { cosmetics, badges } };
}

export async function getClassBadgeConfigAction(
  classId: string
): Promise<Ok<BadgeRewardConfig> | Err> {
  const res = await authedJson(
    gameSvcUrl(`/classes/${encodeURIComponent(classId)}/badges/config`)
  );
  if (!res.ok) return { ok: false, message: res.message };

  return {
    ok: true,
    data: {
      classId: String(res.body?.data?.classId || classId),
      weeklyTopEnabled: res.body?.data?.weeklyTopEnabled === true,
      monthlyTopEnabled: res.body?.data?.monthlyTopEnabled !== false,
      overallScoreThresholdEnabled:
        res.body?.data?.overallScoreThresholdEnabled !== false,
      streakThresholdEnabled: res.body?.data?.streakThresholdEnabled !== false,
      overallScoreThresholdStep: Number(
        res.body?.data?.overallScoreThresholdStep || 1000
      ),
      streakThresholdStep: Number(res.body?.data?.streakThresholdStep || 25),
    },
  };
}

export async function updateClassBadgeConfigAction(
  classId: string,
  payload: Partial<BadgeRewardConfig>
) {
  return authedJson(
    gameSvcUrl(`/classes/${encodeURIComponent(classId)}/badges/config`),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
}

export async function getClassScoreRewardConfigAction(
  classId: string
): Promise<Ok<ScoreRewardConfig> | Err> {
  const res = await authedJson(
    gameSvcUrl(`/classes/${encodeURIComponent(classId)}/rewards/score-config`)
  );
  if (!res.ok) return { ok: false, message: res.message };

  return {
    ok: true,
    data: {
      classId: String(res.body?.data?.classId || classId),
      enabled: res.body?.data?.enabled !== false,
      pointsPerReward: Number(res.body?.data?.pointsPerReward || 500),
    },
  };
}

export async function getStudentInventoryAction(
  classId: string,
  studentId: string
): Promise<Ok<StudentInventory> | Err> {
  const res = await authedJson(
    gameSvcUrl(
      `/classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(
        studentId
      )}/inventory`
    )
  );
  if (!res.ok) return { ok: false, message: res.message };

  const row = res.body?.data || {};
  return {
    ok: true,
    data: {
      _id: row?._id ? String(row._id) : undefined,
      classId: String(row?.classId || classId),
      studentId: String(row?.studentId || studentId),
      ownedCosmeticIds: Array.isArray(row?.ownedCosmeticIds)
        ? row.ownedCosmeticIds.map((v: any) => String(v))
        : [],
      ownedBadgeIds: Array.isArray(row?.ownedBadgeIds)
        ? row.ownedBadgeIds.map((v: any) => String(v))
        : [],
      displayBadgeIds: Array.isArray(row?.displayBadgeIds)
        ? row.displayBadgeIds.map((v: any) => String(v))
        : [],
      equipped:
        row?.equipped && typeof row.equipped === "object"
          ? Object.fromEntries(
              Object.entries(row.equipped).map(([slot, id]) => [
                String(slot),
                id ? String(id) : null,
              ])
            )
          : {},
      scoreThresholdProgress:
        row?.scoreThresholdProgress && typeof row.scoreThresholdProgress === "object"
          ? {
              pointsPerReward: Number(row.scoreThresholdProgress.pointsPerReward || 0),
              nextThresholdPoints: Number(
                row.scoreThresholdProgress.nextThresholdPoints || 0
              ),
            }
          : null,
      avatarUrl: typeof row?.avatarUrl === "string" ? row.avatarUrl : null,
    },
  };
}

export async function getStudentBadgesAction(
  classId: string,
  studentId: string
): Promise<
  Ok<{
    ownedBadgeIds: string[];
    displayBadgeIds: string[];
    ownedBadges: StudentBadgeItem[];
    displayBadges: StudentBadgeItem[];
  }> | Err
> {
  const res = await authedJson(
    gameSvcUrl(
      `/classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(
        studentId
      )}/badges`
    )
  );
  if (!res.ok) return { ok: false, message: res.message };

  const row = res.body?.data || {};
  const ownedBadgeIds: string[] = Array.isArray(row?.ownedBadgeIds)
    ? row.ownedBadgeIds.map((v: any) => String(v))
    : [];
  const displayBadgeIds: string[] = Array.isArray(row?.displayBadgeIds)
    ? row.displayBadgeIds.map((v: any) => String(v))
    : [];

  const normalizeBadge = (item: any): StudentBadgeItem => ({
    id: String(item?.id || ""),
    name: String(item?.name || item?.id || "Badge"),
    description: String(item?.description || ""),
    color: String(item?.color || "#64748B"),
    kind: item?.kind ? String(item.kind) : undefined,
    engraving: item?.engraving ? String(item.engraving) : null,
    imageUrl:
      typeof item?.imageUrl === "string" && item.imageUrl
        ? item.imageUrl
        : toGameBadgeImageUrl(classId, String(item?.id || "")),
  });

  return {
    ok: true,
    data: {
      ownedBadgeIds,
      displayBadgeIds,
      ownedBadges: Array.isArray(row?.ownedBadges)
        ? row.ownedBadges.map((item: any) => normalizeBadge(item))
        : [],
      displayBadges: Array.isArray(row?.displayBadges)
        ? row.displayBadges.map((item: any) => normalizeBadge(item))
        : [],
    },
  };
}
