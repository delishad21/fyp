export type AvatarSlot =
  | "avatar"
  | "eyes"
  | "mouth"
  | "upperwear"
  | "lowerwear"
  | "hair"
  | "outerwear"
  | "head_accessory"
  | "eye_accessory"
  | "wrist_accessory"
  | "pet"
  | "shoes";

export type GameLeaderboardRow = {
  rank: number;
  userId: string;
  displayName: string;
  photoUrl?: string | null;
  className: string;
  overallScore: number;
  avgScorePct: number;
  participationPct: number;
  participationCount: number;
  currentStreak: number;
  bestStreakDays: number;
};

export type GameScoreThresholdProgress = {
  pointsPerReward: number;
  nextThresholdPoints: number;
};

export type GameBadgeItem = {
  id: string;
  name: string;
  description: string;
  color: string;
  kind?: string;
  engraving?: string | null;
  imageUrl?: string | null;
};

export type GameStudentProfile = {
  classId: string;
  className: string;
  timezone: string;
  studentId: string;
  rank: number | null;
  overallScore: number;
  participationCount: number;
  participationPct: number;
  avgScorePct: number;
  currentStreak: number;
  bestStreakDays: number;
  lastStreakDate?: string | null;
  avatarUrl?: string | null;
  avatarProfileUrl?: string | null;
  avatarSpec?: unknown;
  badges?: string[];
  ownedBadgeIds?: string[];
  displayBadgeIds?: string[];
  displayBadges?: GameBadgeItem[];
  cosmetics?: string[];
  equipped?: Partial<Record<AvatarSlot, string | null>>;
  scoreThresholdProgress?: GameScoreThresholdProgress | null;
};

export type GameCosmeticDefinition = {
  id: string;
  name: string;
  slot: AvatarSlot;
  description: string;
  color: string;
  assetPath: string;
  baseModel?: string | null;
  defaultOwned?: boolean;
  defaultEquipped?: boolean;
};

export type GameBadgeDefinition = {
  id: string;
  name: string;
  description: string;
  color: string;
};

export type GameRewardRuleTemplate = {
  key: string;
  name: string;
  triggerType: "overall_score_gte" | "best_streak_gte" | "participation_count_gte";
  threshold: number;
  rewardIds: string[];
  description?: string;
};

export type GameRewardsCatalog = {
  avatar: {
    compulsorySlots: AvatarSlot[];
    optionalSlots: AvatarSlot[];
    slots: AvatarSlot[];
    layerOrder: AvatarSlot[];
    assetBaseUrl: string;
    baseModels?: Array<{
      id: string;
      name: string;
      description?: string;
      isDefault?: boolean;
    }>;
    defaultBaseModelId?: string | null;
    defaultAvatarItemId?: string | null;
    baseAssetPath?: string | null;
    baseAssetUrl?: string | null;
  };
  cosmetics: GameCosmeticDefinition[];
  badges: GameBadgeDefinition[];
  defaultRuleTemplates: GameRewardRuleTemplate[];
};

export type GameStudentInventory = {
  classId: string;
  studentId: string;
  ownedCosmeticIds: string[];
  ownedBadgeIds: string[];
  displayBadgeIds: string[];
  equipped: Partial<Record<AvatarSlot, string | null>>;
  scoreThresholdProgress?: GameScoreThresholdProgress | null;
  avatarUrl?: string | null;
  avatarSpec?: unknown;
  updatedAt?: string;
};

export type GameAttemptRewardGrant = {
  rewardId: string;
  rewardType: "cosmetic" | "badge";
  thresholdPoints: number;
  grantedAt: string;
  reward: {
    id: string;
    name: string;
    description: string;
    color: string;
    slot?: AvatarSlot;
    assetPath?: string;
    assetUrl?: string | null;
    imageUrl?: string | null;
    engraving?: string | null;
  };
};

export type GameAttemptOutcome = {
  classId: string;
  studentId: string;
  scheduleId?: string;
  attemptId: string;
  attemptVersion?: number;
  ready: boolean;
  quizScore?: number;
  quizMaxScore?: number;
  overallScoreBefore?: number;
  overallScoreAfter?: number;
  overallScoreDelta?: number;
  rankBefore?: number | null;
  rankAfter?: number | null;
  rankDelta?: number | null;
  rewards?: GameAttemptRewardGrant[];
  scoreThresholdProgress?: GameScoreThresholdProgress | null;
  processedAt?: string | null;
};

export type GameStudentNotification = {
  id: string;
  type: "reward_granted" | "reward_revoked";
  source: "teacher" | "rule" | "score_threshold" | "system";
  rewardId?: string | null;
  rewardType?: "cosmetic" | "badge" | null;
  reward?: {
    id: string;
    name: string;
    description: string;
    color: string;
    slot?: AvatarSlot;
    assetPath?: string;
    assetUrl?: string | null;
    imageUrl?: string | null;
    engraving?: string | null;
  } | null;
  triggerAttemptId?: string | null;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  acknowledgedAt?: string | null;
};

type GameLeaderboardResponse = { ok: boolean; data?: GameLeaderboardRow[] };
type GameStudentProfileResponse = { ok: boolean; data?: GameStudentProfile };
type GameRewardsCatalogResponse = { ok: boolean; data?: GameRewardsCatalog };
type GameStudentInventoryResponse = { ok: boolean; data?: GameStudentInventory };
type GameAttemptRewardsResponse = {
  ok: boolean;
  data?: {
    classId: string;
    studentId: string;
    attemptId: string;
    grants: GameAttemptRewardGrant[];
  };
};
type GameAttemptOutcomeResponse = {
  ok: boolean;
  data?: GameAttemptOutcome;
};
type GameStudentNotificationsResponse = {
  ok: boolean;
  data?: {
    classId: string;
    studentId: string;
    unreadCount: number;
    notifications: GameStudentNotification[];
  };
};
type GameNotificationAcknowledgeResponse = {
  ok: boolean;
  data?: {
    classId: string;
    studentId: string;
    acknowledgedCount: number;
    unreadCount: number;
  };
};
type GameAttemptRewardAcknowledgeResponse = {
  ok: boolean;
  data?: {
    classId: string;
    studentId: string;
    attemptId: string;
    acknowledgedCount: number;
  };
};
type GameStudentBadgesResponse = {
  ok: boolean;
  data?: {
    classId: string;
    studentId: string;
    ownedBadgeIds: string[];
    displayBadgeIds: string[];
    ownedBadges: GameBadgeItem[];
    displayBadges: GameBadgeItem[];
  };
};

const GAME_BASE_URL = process.env.EXPO_PUBLIC_GAME_SVC_URL || "http://localhost:7305";

function trimSlashRight(input: string) {
  return String(input || "").replace(/\/+$/g, "");
}

function trimSlashLeft(input: string) {
  return String(input || "").replace(/^\/+/, "");
}

function gameOrigin() {
  try {
    const parsed = new URL(GAME_BASE_URL);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return trimSlashRight(GAME_BASE_URL);
  }
}

export function resolveGameUrl(input?: string | null) {
  const value = String(input || "").trim();
  if (!value) return null;
  if (/^(https?:)?\/\//i.test(value) || value.startsWith("data:")) {
    return value;
  }
  if (value.startsWith("/")) {
    return `${gameOrigin()}${value}`;
  }
  return `${trimSlashRight(GAME_BASE_URL)}/${trimSlashLeft(value)}`;
}

export function getCosmeticPreviewUrl(classId: string, cosmeticId: string) {
  const c = String(classId || "").trim();
  const id = String(cosmeticId || "").trim();
  if (!c || !id) return null;
  return resolveGameUrl(
    `${trimSlashRight(GAME_BASE_URL)}/classes/${encodeURIComponent(
      c
    )}/rewards/cosmetics/${encodeURIComponent(id)}/preview.svg`
  );
}

export function getCosmeticAssetSvgUrl(classId: string, cosmeticId: string) {
  const c = String(classId || "").trim();
  const id = String(cosmeticId || "").trim();
  if (!c || !id) return null;
  return resolveGameUrl(
    `${trimSlashRight(GAME_BASE_URL)}/classes/${encodeURIComponent(
      c
    )}/rewards/cosmetics/${encodeURIComponent(id)}/asset.svg`
  );
}

function buildStudentAvatarUrl(classId: string, studentId: string) {
  return resolveGameUrl(
    `${trimSlashRight(GAME_BASE_URL)}/classes/${encodeURIComponent(
      classId
    )}/students/${encodeURIComponent(studentId)}/avatar.svg`
  );
}

function buildStudentProfileAvatarUrl(classId: string, studentId: string) {
  return resolveGameUrl(
    `${trimSlashRight(GAME_BASE_URL)}/classes/${encodeURIComponent(
      classId
    )}/students/${encodeURIComponent(studentId)}/avatar-profile.svg`
  );
}

function buildBadgeImageUrl(classId: string, badgeId: string) {
  return resolveGameUrl(
    `${trimSlashRight(GAME_BASE_URL)}/classes/${encodeURIComponent(
      classId
    )}/badges/${encodeURIComponent(badgeId)}/image.svg`
  );
}

export function getBadgeImageUrl(classId: string, badgeId: string) {
  const c = String(classId || "").trim();
  const b = String(badgeId || "").trim();
  if (!c || !b) return null;
  return buildBadgeImageUrl(c, b);
}

async function authedRequest<T>(
  url: string,
  token: string,
  options?: {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    body?: unknown;
  }
): Promise<T> {
  const method = options?.method || "GET";
  const res = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(method === "GET" ? {} : { "Content-Type": "application/json" }),
    },
    body: method === "GET" ? undefined : JSON.stringify(options?.body || {}),
  });

  const isJson = (res.headers.get("content-type") || "").includes("application/json");
  const body = (isJson ? await res.json().catch(() => null) : null) as T | null;
  if (!res.ok) {
    const msg = (body as any)?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return body as T;
}

export async function getClassLeaderboard(
  token: string,
  classId: string,
  period: "overall" | "week" | "month" = "overall"
): Promise<GameLeaderboardRow[]> {
  const id = String(classId || "").trim();
  if (!id) return [];

  const p = String(period || "overall").trim().toLowerCase();
  const res = await authedRequest<GameLeaderboardResponse>(
    `${GAME_BASE_URL}/classes/${encodeURIComponent(
      id
    )}/leaderboard?period=${encodeURIComponent(p)}`,
    token
  );
  return Array.isArray(res.data)
    ? res.data.map((row) => ({
        ...row,
        photoUrl: buildStudentProfileAvatarUrl(id, String(row.userId)),
      }))
    : [];
}

export async function getClassStudentGameProfile(
  token: string,
  classId: string,
  studentId: string
): Promise<GameStudentProfile | null> {
  const c = String(classId || "").trim();
  const s = String(studentId || "").trim();
  if (!c || !s) return null;

  const res = await authedRequest<GameStudentProfileResponse>(
    `${GAME_BASE_URL}/classes/${encodeURIComponent(
      c
    )}/students/${encodeURIComponent(s)}/profile`,
    token
  );
  if (!res.data) return null;
  const displayBadges = Array.isArray(res.data.displayBadges)
    ? res.data.displayBadges.map((badge) => ({
        ...badge,
        imageUrl:
          resolveGameUrl(badge?.imageUrl || null) ||
          buildBadgeImageUrl(c, String(badge?.id || "")) ||
          null,
      }))
    : [];
  return {
    ...res.data,
    avatarUrl: buildStudentAvatarUrl(c, s),
    avatarProfileUrl: buildStudentProfileAvatarUrl(c, s),
    displayBadges,
  };
}

export async function getRewardsCatalog(
  token: string,
  classId: string
): Promise<GameRewardsCatalog | null> {
  const c = String(classId || "").trim();
  if (!c) return null;

  const res = await authedRequest<GameRewardsCatalogResponse>(
    `${GAME_BASE_URL}/classes/${encodeURIComponent(c)}/rewards/catalog`,
    token
  );
  if (!res.data) return null;
  return {
    ...res.data,
    avatar: {
      ...res.data.avatar,
      assetBaseUrl: resolveGameUrl(res.data.avatar.assetBaseUrl) || "",
      baseAssetUrl: resolveGameUrl(res.data.avatar.baseAssetUrl || null),
    },
  };
}

export async function getStudentInventory(
  token: string,
  classId: string,
  studentId: string
): Promise<GameStudentInventory | null> {
  const c = String(classId || "").trim();
  const s = String(studentId || "").trim();
  if (!c || !s) return null;

  const res = await authedRequest<GameStudentInventoryResponse>(
    `${GAME_BASE_URL}/classes/${encodeURIComponent(
      c
    )}/students/${encodeURIComponent(s)}/inventory`,
    token
  );
  if (!res.data) return null;
  return {
    ...res.data,
    displayBadgeIds: Array.isArray(res.data.displayBadgeIds)
      ? res.data.displayBadgeIds.map((id) => String(id))
      : [],
    avatarUrl: buildStudentAvatarUrl(c, s),
  };
}

export async function equipStudentItem(
  token: string,
  classId: string,
  studentId: string,
  slot: AvatarSlot,
  itemId: string
): Promise<GameStudentInventory | null> {
  const c = String(classId || "").trim();
  const s = String(studentId || "").trim();
  const item = String(itemId || "").trim();
  if (!c || !s || !slot || !item) return null;

  const res = await authedRequest<GameStudentInventoryResponse>(
    `${GAME_BASE_URL}/classes/${encodeURIComponent(c)}/students/${encodeURIComponent(s)}/equip`,
    token,
    {
      method: "POST",
      body: { slot, itemId: item },
    }
  );
  if (!res.data) return null;
  return {
    ...res.data,
    avatarUrl: buildStudentAvatarUrl(c, s),
  };
}

export async function setStudentEquippedSlot(
  token: string,
  classId: string,
  studentId: string,
  slot: AvatarSlot,
  itemId: string | null
): Promise<GameStudentInventory | null> {
  const c = String(classId || "").trim();
  const s = String(studentId || "").trim();
  if (!c || !s || !slot) return null;

  const res = await authedRequest<GameStudentInventoryResponse>(
    `${GAME_BASE_URL}/classes/${encodeURIComponent(
      c
    )}/students/${encodeURIComponent(s)}/inventory`,
    token,
    {
      method: "PUT",
      body: {
        equipped: {
          [slot]: itemId,
        },
      },
    }
  );
  if (!res.data) return null;
  return {
    ...res.data,
    avatarUrl: buildStudentAvatarUrl(c, s),
  };
}

export async function getAttemptThresholdRewards(
  token: string,
  classId: string,
  studentId: string,
  attemptId: string
): Promise<GameAttemptRewardGrant[]> {
  const c = String(classId || "").trim();
  const s = String(studentId || "").trim();
  const a = String(attemptId || "").trim();
  if (!c || !s || !a) return [];

  const res = await authedRequest<GameAttemptRewardsResponse>(
    `${GAME_BASE_URL}/classes/${encodeURIComponent(c)}/students/${encodeURIComponent(
      s
    )}/rewards/attempt/${encodeURIComponent(a)}`,
    token
  );

  const rows = Array.isArray(res.data?.grants) ? res.data!.grants : [];
  return rows.map((row) => ({
    ...row,
    grantedAt: String(row.grantedAt || ""),
    reward: {
      ...row.reward,
      assetUrl: resolveGameUrl(row.reward?.assetUrl || row.reward?.assetPath || null),
      imageUrl:
        resolveGameUrl(row.reward?.imageUrl || null) ||
        (row.rewardType === "badge"
          ? buildBadgeImageUrl(c, String(row.reward?.id || row.rewardId || ""))
          : null),
      engraving: row.reward?.engraving ? String(row.reward.engraving) : null,
    },
  }));
}

export async function getStudentAttemptOutcome(
  token: string,
  classId: string,
  studentId: string,
  attemptId: string
): Promise<GameAttemptOutcome | null> {
  const c = String(classId || "").trim();
  const s = String(studentId || "").trim();
  const a = String(attemptId || "").trim();
  if (!c || !s || !a) return null;

  const res = await authedRequest<GameAttemptOutcomeResponse>(
    `${GAME_BASE_URL}/classes/${encodeURIComponent(c)}/students/${encodeURIComponent(
      s
    )}/attempts/${encodeURIComponent(a)}/outcome`,
    token
  );

  if (!res.data) return null;

  const rewards = Array.isArray(res.data.rewards) ? res.data.rewards : [];
  return {
    ...res.data,
    rewards: rewards.map((row) => ({
      ...row,
      grantedAt: String(row.grantedAt || ""),
      reward: {
        ...row.reward,
        assetUrl: resolveGameUrl(row.reward?.assetUrl || row.reward?.assetPath || null),
        imageUrl:
          resolveGameUrl(row.reward?.imageUrl || null) ||
          (row.rewardType === "badge"
            ? buildBadgeImageUrl(c, String(row.reward?.id || row.rewardId || ""))
            : null),
        engraving: row.reward?.engraving ? String(row.reward.engraving) : null,
      },
    })),
    processedAt: res.data.processedAt ? String(res.data.processedAt) : null,
  };
}

export async function acknowledgeAttemptRewards(
  token: string,
  classId: string,
  studentId: string,
  attemptId: string
): Promise<number> {
  const c = String(classId || "").trim();
  const s = String(studentId || "").trim();
  const a = String(attemptId || "").trim();
  if (!c || !s || !a) return 0;

  const res = await authedRequest<GameAttemptRewardAcknowledgeResponse>(
    `${GAME_BASE_URL}/classes/${encodeURIComponent(c)}/students/${encodeURIComponent(
      s
    )}/rewards/attempt/${encodeURIComponent(a)}/ack`,
    token,
    { method: "POST", body: {} }
  );

  return Number(res.data?.acknowledgedCount || 0);
}

export async function getStudentNotifications(
  token: string,
  classId: string,
  studentId: string,
  options?: { unreadOnly?: boolean; limit?: number }
): Promise<{ unreadCount: number; notifications: GameStudentNotification[] }> {
  const c = String(classId || "").trim();
  const s = String(studentId || "").trim();
  if (!c || !s) {
    return { unreadCount: 0, notifications: [] };
  }

  const query = new URLSearchParams();
  if (options?.unreadOnly) query.set("unreadOnly", "1");
  if (Number.isFinite(options?.limit)) {
    query.set("limit", String(Math.max(1, Math.floor(Number(options?.limit)))));
  }

  const url = `${GAME_BASE_URL}/classes/${encodeURIComponent(
    c
  )}/students/${encodeURIComponent(s)}/notifications${
    query.toString() ? `?${query.toString()}` : ""
  }`;

  const res = await authedRequest<GameStudentNotificationsResponse>(url, token);
  const rows = Array.isArray(res.data?.notifications) ? res.data!.notifications : [];

  return {
    unreadCount: Number(res.data?.unreadCount || 0),
    notifications: rows.map((row) => ({
      ...row,
      reward: row.reward
        ? {
            ...row.reward,
            assetUrl: resolveGameUrl(
              row.reward.assetUrl || row.reward.assetPath || null
            ),
            imageUrl:
              resolveGameUrl(row.reward.imageUrl || null) ||
              (row.rewardType === "badge"
                ? buildBadgeImageUrl(c, String(row.reward.id || row.rewardId || ""))
                : null),
            engraving: row.reward.engraving
              ? String(row.reward.engraving)
              : null,
          }
        : null,
      createdAt: String(row.createdAt || ""),
      acknowledgedAt: row.acknowledgedAt ? String(row.acknowledgedAt) : null,
    })),
  };
}

export async function acknowledgeStudentNotifications(
  token: string,
  classId: string,
  studentId: string,
  payload: { notificationIds?: string[]; acknowledgeAll?: boolean }
): Promise<{ acknowledgedCount: number; unreadCount: number }> {
  const c = String(classId || "").trim();
  const s = String(studentId || "").trim();
  if (!c || !s) {
    return { acknowledgedCount: 0, unreadCount: 0 };
  }

  const res = await authedRequest<GameNotificationAcknowledgeResponse>(
    `${GAME_BASE_URL}/classes/${encodeURIComponent(c)}/students/${encodeURIComponent(
      s
    )}/notifications/ack`,
    token,
    {
      method: "POST",
      body: {
        notificationIds: Array.isArray(payload.notificationIds)
          ? payload.notificationIds
          : [],
        acknowledgeAll: payload.acknowledgeAll === true,
      },
    }
  );

  return {
    acknowledgedCount: Number(res.data?.acknowledgedCount || 0),
    unreadCount: Number(res.data?.unreadCount || 0),
  };
}

export async function getStudentBadges(
  token: string,
  classId: string,
  studentId: string
): Promise<{
  ownedBadgeIds: string[];
  displayBadgeIds: string[];
  ownedBadges: GameBadgeItem[];
  displayBadges: GameBadgeItem[];
}> {
  const c = String(classId || "").trim();
  const s = String(studentId || "").trim();
  if (!c || !s) {
    return {
      ownedBadgeIds: [],
      displayBadgeIds: [],
      ownedBadges: [],
      displayBadges: [],
    };
  }

  const res = await authedRequest<GameStudentBadgesResponse>(
    `${GAME_BASE_URL}/classes/${encodeURIComponent(c)}/students/${encodeURIComponent(
      s
    )}/badges`,
    token
  );

  const ownedBadges = Array.isArray(res.data?.ownedBadges)
    ? res.data!.ownedBadges.map((badge) => ({
        ...badge,
        imageUrl:
          resolveGameUrl(badge?.imageUrl || null) ||
          buildBadgeImageUrl(c, String(badge?.id || "")) ||
          null,
      }))
    : [];
  const displayBadges = Array.isArray(res.data?.displayBadges)
    ? res.data!.displayBadges.map((badge) => ({
        ...badge,
        imageUrl:
          resolveGameUrl(badge?.imageUrl || null) ||
          buildBadgeImageUrl(c, String(badge?.id || "")) ||
          null,
      }))
    : [];

  return {
    ownedBadgeIds: Array.isArray(res.data?.ownedBadgeIds)
      ? res.data!.ownedBadgeIds.map((id) => String(id))
      : [],
    displayBadgeIds: Array.isArray(res.data?.displayBadgeIds)
      ? res.data!.displayBadgeIds.map((id) => String(id))
      : [],
    ownedBadges,
    displayBadges,
  };
}

export async function updateStudentDisplayedBadges(
  token: string,
  classId: string,
  studentId: string,
  displayBadgeIds: string[]
): Promise<{ displayBadgeIds: string[]; displayBadges: GameBadgeItem[] }> {
  const c = String(classId || "").trim();
  const s = String(studentId || "").trim();
  if (!c || !s) {
    return { displayBadgeIds: [], displayBadges: [] };
  }

  const res = await authedRequest<{
    ok: boolean;
    data?: {
      classId: string;
      studentId: string;
      displayBadgeIds: string[];
      displayBadges: GameBadgeItem[];
    };
  }>(
    `${GAME_BASE_URL}/classes/${encodeURIComponent(c)}/students/${encodeURIComponent(
      s
    )}/badges/display`,
    token,
    {
      method: "PUT",
      body: {
        displayBadgeIds: Array.isArray(displayBadgeIds) ? displayBadgeIds : [],
      },
    }
  );

  return {
    displayBadgeIds: Array.isArray(res.data?.displayBadgeIds)
      ? res.data!.displayBadgeIds.map((id) => String(id))
      : [],
    displayBadges: Array.isArray(res.data?.displayBadges)
      ? res.data!.displayBadges.map((badge) => ({
          ...badge,
          imageUrl:
            resolveGameUrl(badge?.imageUrl || null) ||
            buildBadgeImageUrl(c, String(badge?.id || "")) ||
            null,
        }))
      : [],
  };
}
