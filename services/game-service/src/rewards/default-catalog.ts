import fs from "fs";
import path from "path";

export const COMPULSORY_COSMETIC_SLOTS = [
  "avatar",
  "eyes",
  "mouth",
  "upperwear",
  "lowerwear",
] as const;

export const OPTIONAL_COSMETIC_SLOTS = [
  "hair",
  "outerwear",
  "head_accessory",
  "eye_accessory",
  "wrist_accessory",
  "pet",
  "shoes",
] as const;

export const COSMETIC_SLOTS = [
  ...COMPULSORY_COSMETIC_SLOTS,
  ...OPTIONAL_COSMETIC_SLOTS,
] as const;

export type CosmeticSlot = (typeof COSMETIC_SLOTS)[number];
type CompulsoryCosmeticSlot = (typeof COMPULSORY_COSMETIC_SLOTS)[number];

export const AVATAR_LAYER_ORDER: CosmeticSlot[] = [
  "avatar",
  "lowerwear",
  "shoes",
  "upperwear",
  "outerwear",
  "wrist_accessory",
  "mouth",
  "eyes",
  "hair",
  "head_accessory",
  "eye_accessory",
  "pet",
];

const SLOT_FOLDER_BY_TYPE: Record<CosmeticSlot, string> = {
  avatar: "base",
  eyes: "eyes",
  mouth: "mouth",
  upperwear: "upperwear",
  lowerwear: "lowerwear",
  hair: "hair",
  outerwear: "outerwear",
  head_accessory: "head-accessory",
  eye_accessory: "eye-accessory",
  wrist_accessory: "wrist-accessory",
  pet: "pet",
  shoes: "shoes",
};

const ALLOWED_ASSET_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg"]);
const DEFAULT_CATALOG_CACHE_MS = 10_000;
const BASE_MODEL_ANY = "any";

export type CosmeticDefinition = {
  id: string;
  name: string;
  slot: CosmeticSlot;
  description: string;
  color: string;
  assetPath: string;
  defaultOwned?: boolean;
  defaultEquipped?: boolean;
  baseModel: string | null;
};

export type AvatarBaseModelDefinition = {
  id: string;
  name: string;
  description: string;
  isDefault: boolean;
};

export type BadgeDefinition = {
  id: string;
  name: string;
  description: string;
  color: string;
  kind?:
    | "static"
    | "overall_threshold"
    | "streak_threshold"
    | "weekly_top"
    | "monthly_top";
  engraving?: string;
  imageUrl?: string | null;
};

export type RewardRuleTriggerType =
  | "overall_score_gte"
  | "best_streak_gte"
  | "participation_count_gte";

export type RewardRuleTemplate = {
  key: string;
  name: string;
  triggerType: RewardRuleTriggerType;
  threshold: number;
  rewardIds: string[];
  description?: string;
};

type AvatarManifestBaseModel = {
  name?: string;
  description?: string;
  default?: boolean;
};

type AvatarManifestItem = {
  displayName?: string;
  description?: string;
  color?: string;
  defaultOwned?: boolean;
  defaultEquipped?: boolean;
  baseModel?: string;
};

type AvatarCatalogManifest = {
  baseModels?: Record<string, AvatarManifestBaseModel>;
  items?: Record<string, AvatarManifestItem>;
  startingItems?: Record<string, string[]>;
  defaults?: {
    baseModel?: string;
  };
};

type CatalogSnapshot = {
  refreshedAt: number;
  cosmetics: CosmeticDefinition[];
  byId: Map<string, CosmeticDefinition>;
  baseModels: AvatarBaseModelDefinition[];
  defaultBaseModelId: string | null;
  defaultAvatarItemId: string | null;
};

let catalogCache: CatalogSnapshot | null = null;

function slugify(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeBaseModelId(value: unknown) {
  const v = slugify(String(value || ""));
  if (!v) return null;
  if (v === "all" || v === "*" || v === "any") return BASE_MODEL_ANY;
  return v;
}

function toTitle(input: string) {
  const clean = String(input || "").trim();
  if (!clean) return "Untitled";
  return clean
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function normalizeCatalogPath(input: string) {
  return String(input || "").replace(/\\/g, "/").replace(/^\/+/, "");
}

function normalizeStartingToken(input: string) {
  return String(input || "")
    .replace(/\\/g, "/")
    .replace(/^\.?\//, "")
    .trim()
    .toLowerCase();
}

function normalizeSlotAlias(slot: string): CosmeticSlot | null {
  const key = String(slot || "").trim().toLowerCase();
  if (!key) return null;
  if (key === "base" || key === "base_avatar") return "avatar";
  if (key === "outfit") return "upperwear";
  if (key === "accessory") return "eye_accessory";
  if (key === "hand_accessory") return "wrist_accessory";
  if (key === "hair_accessory") return "head_accessory";
  if ((COSMETIC_SLOTS as readonly string[]).includes(key)) return key as CosmeticSlot;
  return null;
}

type StartingSlotRule = {
  all: boolean;
  selectors: Set<string>;
};

function buildStartingItemsRules(manifest: AvatarCatalogManifest) {
  const raw = manifest.startingItems;
  const hasConfig = !!raw && Object.keys(raw).length > 0;
  const rules = new Map<CosmeticSlot, StartingSlotRule>();
  if (!raw) return { hasConfig, rules };

  for (const [rawSlot, rawSelectors] of Object.entries(raw)) {
    const slot = normalizeSlotAlias(rawSlot);
    if (!slot || !Array.isArray(rawSelectors)) continue;

    const rule: StartingSlotRule = { all: false, selectors: new Set<string>() };
    for (const entry of rawSelectors) {
      const token = normalizeStartingToken(entry);
      if (!token) continue;
      if (token === "*" || token === "all") {
        rule.all = true;
        continue;
      }
      rule.selectors.add(token);
    }
    rules.set(slot, rule);
  }

  return { hasConfig, rules };
}

function getCatalogCacheMs() {
  const parsed = Number(process.env.GAME_AVATAR_CATALOG_CACHE_MS);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_CATALOG_CACHE_MS;
  }
  return parsed;
}

function getAvatarAssetDir() {
  const fromEnv = String(process.env.GAME_AVATAR_ASSET_DIR || "").trim();
  if (fromEnv) return fromEnv;
  return path.resolve(__dirname, "../../assets/avatar");
}

function readAssetFiles(folderAbsPath: string) {
  if (!fs.existsSync(folderAbsPath)) return [] as string[];
  if (!fs.statSync(folderAbsPath).isDirectory()) return [] as string[];

  return fs
    .readdirSync(folderAbsPath, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => ALLOWED_ASSET_EXT.has(path.extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b));
}

function normalizeColorForSlot(slot: CosmeticSlot) {
  if (slot === "avatar") return "#F59E0B";
  if (slot === "eyes" || slot === "mouth") return "#1F2937";
  if (slot === "upperwear" || slot === "outerwear") return "#3D5CFF";
  if (slot === "lowerwear" || slot === "shoes") return "#334155";
  if (slot === "hair") return "#111827";
  if (slot === "pet") return "#10B981";
  return "#64748B";
}

function isCompulsorySlot(slot: CosmeticSlot): slot is CompulsoryCosmeticSlot {
  return (COMPULSORY_COSMETIC_SLOTS as readonly string[]).includes(slot);
}

function readAvatarManifest(assetRoot: string): AvatarCatalogManifest {
  const manifestPath = path.join(assetRoot, "avatar-manifest.json");
  if (!fs.existsSync(manifestPath)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(manifestPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return parsed as AvatarCatalogManifest;
  } catch (error) {
    console.warn("[game-avatar] failed to parse avatar-manifest.json", error);
    return {};
  }
}

function manifestItemForPath(manifest: AvatarCatalogManifest, assetPath: string) {
  const key = normalizeCatalogPath(assetPath);
  return manifest.items?.[key] || null;
}

function buildCatalogSnapshot(): CatalogSnapshot {
  const assetRoot = getAvatarAssetDir();
  const manifest = readAvatarManifest(assetRoot);
  const startingRules = buildStartingItemsRules(manifest);
  const cosmetics: CosmeticDefinition[] = [];

  const baseModelMap = new Map<string, AvatarBaseModelDefinition>();
  for (const [rawId, rawDef] of Object.entries(manifest.baseModels || {})) {
    const id = normalizeBaseModelId(rawId);
    if (!id) continue;
    baseModelMap.set(id, {
      id,
      name: String(rawDef?.name || toTitle(id)),
      description: String(rawDef?.description || ""),
      isDefault: !!rawDef?.default,
    });
  }

  const avatarSlot: CosmeticSlot = "avatar";
  const avatarFolder = SLOT_FOLDER_BY_TYPE[avatarSlot];
  const avatarFiles = readAssetFiles(path.join(assetRoot, avatarFolder));
  const avatarItems: CosmeticDefinition[] = [];

  const isStartingOwned = (
    slot: CosmeticSlot,
    fileName: string,
    assetPath: string,
    explicitDefaultOwned: boolean | undefined
  ) => {
    if (typeof explicitDefaultOwned === "boolean") {
      return explicitDefaultOwned;
    }
    if (!startingRules.hasConfig) return true;

    const rule = startingRules.rules.get(slot);
    if (!rule) return false;
    if (rule.all) return true;

    const baseName = path.parse(fileName).name;
    const pathToken = normalizeStartingToken(assetPath);
    const fileToken = normalizeStartingToken(fileName);
    const baseToken = normalizeStartingToken(baseName);
    return (
      rule.selectors.has(pathToken) ||
      rule.selectors.has(fileToken) ||
      rule.selectors.has(baseToken)
    );
  };

  for (const fileName of avatarFiles) {
    const baseName = path.parse(fileName).name;
    const slug = slugify(baseName);
    if (!slug) continue;

    const assetPath = `${avatarFolder}/${fileName}`;
    const itemMeta = manifestItemForPath(manifest, assetPath);
    const explicitModel = normalizeBaseModelId(itemMeta?.baseModel);
    const inferredModel = explicitModel || slug || "default";

    if (!baseModelMap.has(inferredModel)) {
      baseModelMap.set(inferredModel, {
        id: inferredModel,
        name: toTitle(inferredModel),
        description: "",
        isDefault: false,
      });
    }

    avatarItems.push({
      id: `cosmetic_${avatarSlot}_${slug}`,
      name: String(itemMeta?.displayName || toTitle(baseName)),
      slot: avatarSlot,
      description: String(itemMeta?.description || "Base avatar model."),
      color: String(itemMeta?.color || normalizeColorForSlot(avatarSlot)),
      assetPath,
      defaultOwned: isStartingOwned(avatarSlot, fileName, assetPath, itemMeta?.defaultOwned),
      defaultEquipped: !!itemMeta?.defaultEquipped,
      baseModel: inferredModel,
    });
  }

  const manifestDefaultModel = normalizeBaseModelId(manifest.defaults?.baseModel);
  let defaultBaseModelId =
    manifestDefaultModel && baseModelMap.has(manifestDefaultModel)
      ? manifestDefaultModel
      : null;
  if (!defaultBaseModelId) {
    defaultBaseModelId =
      Array.from(baseModelMap.values()).find((model) => model.isDefault)?.id || null;
  }
  if (!defaultBaseModelId && avatarItems.length) {
    defaultBaseModelId = avatarItems[0].baseModel;
  }
  if (!defaultBaseModelId && baseModelMap.size) {
    defaultBaseModelId = Array.from(baseModelMap.keys())[0];
  }
  if (defaultBaseModelId && baseModelMap.has(defaultBaseModelId)) {
    const current = baseModelMap.get(defaultBaseModelId)!;
    current.isDefault = true;
    baseModelMap.set(defaultBaseModelId, current);
  }

  cosmetics.push(...avatarItems);

  for (const slot of COSMETIC_SLOTS) {
    if (slot === avatarSlot) continue;

    const folder = SLOT_FOLDER_BY_TYPE[slot];
    const files = readAssetFiles(path.join(assetRoot, folder));
    const usedIds = new Set<string>();

    for (const fileName of files) {
      const baseName = path.parse(fileName).name;
      const slug = slugify(baseName);
      if (!slug) continue;

      const id = `cosmetic_${slot}_${slug}`;
      if (usedIds.has(id)) continue;
      usedIds.add(id);

      const assetPath = `${folder}/${fileName}`;
      const itemMeta = manifestItemForPath(manifest, assetPath);
      const explicitModel = normalizeBaseModelId(itemMeta?.baseModel);
      const baseModel = explicitModel || (isCompulsorySlot(slot) ? BASE_MODEL_ANY : null);

      cosmetics.push({
        id,
        name: String(itemMeta?.displayName || toTitle(baseName)),
        slot,
        description: String(itemMeta?.description || `${toTitle(slot)} asset`),
        color: String(itemMeta?.color || normalizeColorForSlot(slot)),
        assetPath,
        defaultOwned: isStartingOwned(slot, fileName, assetPath, itemMeta?.defaultOwned),
        defaultEquipped: !!itemMeta?.defaultEquipped,
        baseModel,
      });
    }
  }

  for (const item of cosmetics) {
    if (item.defaultEquipped) item.defaultOwned = true;
  }

  const defaultAvatarItemId =
    avatarItems.find((item) => item.defaultEquipped)?.id ||
    avatarItems.find((item) => item.baseModel === defaultBaseModelId)?.id ||
    avatarItems[0]?.id ||
    null;

  const baseModels = Array.from(baseModelMap.values()).sort((a, b) =>
    a.id.localeCompare(b.id)
  );

  return {
    refreshedAt: Date.now(),
    cosmetics,
    byId: new Map(cosmetics.map((item) => [item.id, item])),
    baseModels,
    defaultBaseModelId,
    defaultAvatarItemId,
  };
}

function getCatalogSnapshot(forceRefresh = false): CatalogSnapshot {
  const ttlMs = getCatalogCacheMs();
  const now = Date.now();
  const shouldRefresh =
    forceRefresh ||
    !catalogCache ||
    ttlMs === 0 ||
    now - catalogCache.refreshedAt > ttlMs;

  if (shouldRefresh) {
    catalogCache = buildCatalogSnapshot();
  }
  if (!catalogCache) {
    catalogCache = buildCatalogSnapshot();
  }
  return catalogCache;
}

export function listCosmetics(options?: { forceRefresh?: boolean }) {
  return getCatalogSnapshot(!!options?.forceRefresh).cosmetics;
}

export function listAvatarBaseModels(options?: { forceRefresh?: boolean }) {
  return getCatalogSnapshot(!!options?.forceRefresh).baseModels;
}

export function getDefaultBaseModelId(options?: { forceRefresh?: boolean }) {
  return getCatalogSnapshot(!!options?.forceRefresh).defaultBaseModelId;
}

export function getDefaultAvatarItemId(options?: { forceRefresh?: boolean }) {
  return getCatalogSnapshot(!!options?.forceRefresh).defaultAvatarItemId;
}

export const DEFAULT_BADGES: BadgeDefinition[] = [
  {
    id: "badge_score_500",
    name: "500 Score Club",
    description: "Reached an overall score of 500.",
    color: "#2563EB",
    kind: "static",
  },
  {
    id: "badge_streak_7",
    name: "7-Day Streak",
    description: "Reached a 7-day streak.",
    color: "#DC2626",
    kind: "static",
  },
  {
    id: "badge_participation_10",
    name: "Consistent Learner",
    description: "Completed at least 10 canonical quizzes.",
    color: "#16A34A",
    kind: "static",
  },
];

function firstCosmeticIdInSlot(slot: CosmeticSlot) {
  const found = listCosmetics().find((item) => item.slot === slot);
  return found?.id || null;
}

function firstCosmeticIdByPriority(slot: CosmeticSlot, preferredNameTokens: string[] = []) {
  const all = listCosmetics().filter((item) => item.slot === slot);
  if (!all.length) return null;
  if (!preferredNameTokens.length) return all[0].id;

  const found = all.find((item) => {
    const haystack = `${item.id} ${item.name}`.toLowerCase();
    return preferredNameTokens.every((token) => haystack.includes(token.toLowerCase()));
  });
  return (found || all[0]).id;
}

export function getDefaultRewardRuleTemplates(): RewardRuleTemplate[] {
  const outerwearRewardId = firstCosmeticIdByPriority("outerwear", ["scholar"]);
  const petRewardId = firstCosmeticIdInSlot("pet");
  const wristRewardId = firstCosmeticIdByPriority("wrist_accessory", ["star"]);

  const templates: RewardRuleTemplate[] = [
    {
      key: "default_overall_250_outerwear",
      name: "Score 250 Unlock",
      triggerType: "overall_score_gte",
      threshold: 250,
      rewardIds: outerwearRewardId ? [outerwearRewardId] : [],
      description: "Unlock an outerwear cosmetic at overall score 250.",
    },
    {
      key: "default_streak_7",
      name: "7-Day Streak Cosmetic Unlock",
      triggerType: "best_streak_gte",
      threshold: 7,
      rewardIds: [...(petRewardId ? [petRewardId] : [])],
      description: "Unlock a pet cosmetic at 7-day streak.",
    },
    {
      key: "default_participation_10_cosmetic",
      name: "Participation 10 Cosmetic Unlock",
      triggerType: "participation_count_gte",
      threshold: 10,
      rewardIds: [...(wristRewardId ? [wristRewardId] : [])],
      description: "Unlock a cosmetic for consistent quiz participation.",
    },
  ];

  return templates.map((rule) => ({
    ...rule,
    rewardIds: Array.from(new Set(rule.rewardIds.filter(Boolean))),
  }));
}

export function isCosmeticId(id: string) {
  if (!id) return false;
  return getCatalogSnapshot().byId.has(id);
}

export function isBadgeId(id: string) {
  if (DEFAULT_BADGES.some((b) => b.id === id)) return true;
  return !!parseDynamicBadgeId(id);
}

export function getCosmeticById(id: string) {
  if (!id) return null;
  return getCatalogSnapshot().byId.get(id) || null;
}

export function getCosmeticBaseModel(id: string) {
  return getCosmeticById(id)?.baseModel || null;
}

export function isBaseModelCompatible(itemBaseModel: string | null | undefined, active: string | null) {
  if (!itemBaseModel || itemBaseModel === BASE_MODEL_ANY) return true;
  if (!active) return true;
  return itemBaseModel === active;
}

export function getBadgeById(id: string) {
  const staticBadge = DEFAULT_BADGES.find((b) => b.id === id);
  if (staticBadge) return { ...staticBadge, imageUrl: null };

  const dynamic = parseDynamicBadgeId(id);
  if (!dynamic) return null;

  return {
    id,
    name: dynamic.name,
    description: dynamic.description,
    color: dynamic.color,
    kind: dynamic.kind,
    engraving: dynamic.engraving,
    imageUrl: null,
  };
}

type DynamicBadgeMeta = {
  kind: "overall_threshold" | "streak_threshold" | "weekly_top" | "monthly_top";
  threshold?: number;
  periodKey?: string;
  engraving: string;
  name: string;
  description: string;
  color: string;
};

function toMonthLabel(monthKey: string) {
  const [yearStr, monthStr] = String(monthKey || "").split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return monthKey;
  }
  const yy = String(year).slice(-2);
  return `${String(month).padStart(2, "0")}/${yy}`;
}

function toWeekStartLabel(weekStartKey: string) {
  const [yearStr, monthStr, dayStr] = String(weekStartKey || "").split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return weekStartKey;
  }
  const yy = String(year).slice(-2);
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${yy}`;
}

export function parseDynamicBadgeId(id: string): DynamicBadgeMeta | null {
  const value = String(id || "").trim();
  if (!value) return null;

  // Backward-compatible: old ids used badge_score_<threshold>.
  const overall = /^badge_(?:overall|score)_(\d+)$/i.exec(value);
  if (overall) {
    const threshold = Number(overall[1]);
    return {
      kind: "overall_threshold",
      threshold,
      engraving: `${threshold}`,
      name: `${threshold} Score Milestone`,
      description: `Reached overall score threshold ${threshold}.`,
      color: "#2563EB",
    };
  }

  const streak = /^badge_streak_(\d+)$/i.exec(value);
  if (streak) {
    const threshold = Number(streak[1]);
    return {
      kind: "streak_threshold",
      threshold,
      engraving: `${threshold}`,
      name: `${threshold}-Day Streak Milestone`,
      description: `Reached best streak threshold ${threshold}.`,
      color: "#DC2626",
    };
  }

  const weekly = /^badge_weekly_top_(\d{4}-\d{2}-\d{2})$/i.exec(value);
  if (weekly) {
    const periodKey = weekly[1];
    const weekLabel = toWeekStartLabel(periodKey);
    return {
      kind: "weekly_top",
      periodKey,
      engraving: `Week of ${weekLabel}`,
      name: "Top Student (Week)",
      description: `Top scorer for the week of ${weekLabel}.`,
      color: "#9333EA",
    };
  }

  const monthly = /^badge_monthly_top_(\d{4}-\d{2})$/i.exec(value);
  if (monthly) {
    const periodKey = monthly[1];
    const monthLabel = toMonthLabel(periodKey);
    return {
      kind: "monthly_top",
      periodKey,
      engraving: monthLabel,
      name: "Top Student (Month)",
      description: `Top scorer for ${monthLabel}.`,
      color: "#EA580C",
    };
  }

  return null;
}

export function buildOverallThresholdBadgeId(threshold: number) {
  return `badge_overall_${Math.max(1, Math.floor(Number(threshold) || 0))}`;
}

export function buildStreakThresholdBadgeId(threshold: number) {
  return `badge_streak_${Math.max(1, Math.floor(Number(threshold) || 0))}`;
}

export function buildWeeklyTopBadgeId(weekStartKey: string) {
  return `badge_weekly_top_${String(weekStartKey || "").trim()}`;
}

export function buildMonthlyTopBadgeId(monthKey: string) {
  return `badge_monthly_top_${String(monthKey || "").trim()}`;
}

export function getDefaultOwnedCosmeticIds() {
  return listCosmetics().filter((item) => item.defaultOwned !== false).map((item) => item.id);
}

function trimSlashes(input: string) {
  return String(input || "").replace(/\/+$/g, "").replace(/^\/+/, "");
}

function encodeAssetPath(assetPath: string) {
  return trimSlashes(assetPath)
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function getAvatarAssetBaseUrl() {
  const configured = String(process.env.GAME_AVATAR_ASSET_BASE_URL || "").trim();
  if (configured) return configured.replace(/\/+$/g, "");
  return "/api/game/avatar-assets";
}

export function resolveAvatarAssetUrl(assetPath: string) {
  const base = getAvatarAssetBaseUrl();
  const resolved = encodeAssetPath(assetPath);
  return `${base}/${resolved}`;
}

export function getAvatarRenderBaseUrl() {
  const configured = String(process.env.GAME_AVATAR_RENDER_BASE_URL || "").trim();
  if (configured) return configured.replace(/\/+$/g, "");
  return "/api/game";
}

export function buildAvatarRenderUrl(classId: string, studentId: string) {
  const base = getAvatarRenderBaseUrl();
  return `${base}/classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(studentId)}/avatar.svg`;
}

export function buildBadgeRenderUrl(classId: string, badgeId: string) {
  const base = getAvatarRenderBaseUrl();
  return `${base}/classes/${encodeURIComponent(classId)}/badges/${encodeURIComponent(
    badgeId
  )}/image.svg`;
}

export function getEmptyEquippedSlots(): Record<CosmeticSlot, string | null> {
  return Object.fromEntries(COSMETIC_SLOTS.map((slot) => [slot, null])) as Record<
    CosmeticSlot,
    string | null
  >;
}

export function getAvatarCatalogSummary() {
  const snapshot = getCatalogSnapshot();
  const defaultAvatar = snapshot.defaultAvatarItemId
    ? snapshot.byId.get(snapshot.defaultAvatarItemId) || null
    : null;

  return {
    compulsorySlots: COMPULSORY_COSMETIC_SLOTS,
    optionalSlots: OPTIONAL_COSMETIC_SLOTS,
    slots: COSMETIC_SLOTS,
    layerOrder: AVATAR_LAYER_ORDER,
    assetBaseUrl: getAvatarAssetBaseUrl(),
    baseModels: snapshot.baseModels,
    defaultBaseModelId: snapshot.defaultBaseModelId,
    defaultAvatarItemId: snapshot.defaultAvatarItemId,
    baseAssetPath: defaultAvatar?.assetPath || null,
    baseAssetUrl: defaultAvatar ? resolveAvatarAssetUrl(defaultAvatar.assetPath) : null,
  };
}
