import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { Types } from "mongoose";
import {
  COSMETIC_SLOTS,
  CosmeticSlot,
  CosmeticDefinition,
  buildBadgeRenderUrl,
  getBadgeById,
  getCosmeticById,
  getEmptyEquippedSlots,
  listCosmetics,
  parseDynamicBadgeId,
  resolveAvatarAssetUrl,
} from "../rewards/default-catalog";
import { getBadgeConfig } from "../rewards/badge-engine";

const avatarAssetDir =
  String(process.env.GAME_AVATAR_ASSET_DIR || "").trim() ||
  path.resolve(__dirname, "../../assets/avatar");
const badgeAssetDir =
  String(process.env.GAME_BADGE_ASSET_DIR || "").trim() ||
  path.resolve(__dirname, "../../assets/badges");

const avatarDataUriCache = new Map<string, string>();
const badgeDataUriCache = new Map<string, string>();
const pngOpaqueBoundsCache = new Map<
  string,
  { x: number; y: number; width: number; height: number } | null
>();
const mimeByExt: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

function escapeXml(input: string) {
  return String(input || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toInlineAssetDataUri(assetPath: string) {
  const normalized = String(assetPath || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  if (!normalized) return null;

  const cached = avatarDataUriCache.get(normalized);
  if (cached) return cached;

  const absPath = path.resolve(avatarAssetDir, normalized);
  if (
    absPath !== avatarAssetDir &&
    !absPath.startsWith(`${avatarAssetDir}${path.sep}`)
  ) {
    return null;
  }

  const ext = path.extname(absPath).toLowerCase();
  const mime = mimeByExt[ext];
  if (!mime) return null;
  if (!fs.existsSync(absPath)) return null;

  const file = fs.readFileSync(absPath);
  const dataUri = `data:${mime};base64,${file.toString("base64")}`;
  avatarDataUriCache.set(normalized, dataUri);
  return dataUri;
}

type BadgeKind =
  | "overall_threshold"
  | "streak_threshold"
  | "weekly_top"
  | "monthly_top"
  | "static";

type BadgeLayerAssets = {
  mask?: string;
  line?: string;
  shade?: string;
};

type BadgeTierPalette = {
  fillStart: string;
  fillEnd: string;
  ringOuter?: string;
  ringInner?: string;
  plaqueFill?: string;
  plaqueText?: string;
};

type BadgeManifest = {
  baseAssets?: Partial<
    Record<
      "overall_threshold" | "streak_threshold" | "weekly_top" | "monthly_top" | "static" | "fallback",
      string
    >
  >;
  layerAssets?: Partial<Record<"overall_threshold" | "streak_threshold", BadgeLayerAssets>>;
  tierPalette?: BadgeTierPalette[];
};

const DEFAULT_TIER_PALETTE: BadgeTierPalette[] = [
  {
    fillStart: "#A16207",
    fillEnd: "#713F12",
    ringOuter: "#FCD34D",
    ringInner: "#78350F",
    plaqueFill: "#451A03",
    plaqueText: "#FEF3C7",
  },
  {
    fillStart: "#B45309",
    fillEnd: "#7C2D12",
    ringOuter: "#FDBA74",
    ringInner: "#7C2D12",
    plaqueFill: "#4A1D0A",
    plaqueText: "#FFEDD5",
  },
  {
    fillStart: "#9CA3AF",
    fillEnd: "#4B5563",
    ringOuter: "#E5E7EB",
    ringInner: "#374151",
    plaqueFill: "#111827",
    plaqueText: "#F3F4F6",
  },
  {
    fillStart: "#60A5FA",
    fillEnd: "#1D4ED8",
    ringOuter: "#BFDBFE",
    ringInner: "#1E3A8A",
    plaqueFill: "#172554",
    plaqueText: "#DBEAFE",
  },
  {
    fillStart: "#22C55E",
    fillEnd: "#166534",
    ringOuter: "#BBF7D0",
    ringInner: "#14532D",
    plaqueFill: "#052E16",
    plaqueText: "#DCFCE7",
  },
  {
    fillStart: "#EAB308",
    fillEnd: "#B45309",
    ringOuter: "#FDE68A",
    ringInner: "#92400E",
    plaqueFill: "#451A03",
    plaqueText: "#FEF9C3",
  },
  {
    fillStart: "#A855F7",
    fillEnd: "#6D28D9",
    ringOuter: "#DDD6FE",
    ringInner: "#4C1D95",
    plaqueFill: "#2E1065",
    plaqueText: "#EDE9FE",
  },
  {
    fillStart: "#F43F5E",
    fillEnd: "#7C3AED",
    ringOuter: "#FBCFE8",
    ringInner: "#581C87",
    plaqueFill: "#4A044E",
    plaqueText: "#FCE7F3",
  },
];

let badgeManifestCache: { loadedAt: number; data: BadgeManifest } | null = null;

function readBadgeManifest() {
  const ttlMs = 10_000;
  const now = Date.now();
  if (badgeManifestCache && now - badgeManifestCache.loadedAt < ttlMs) {
    return badgeManifestCache.data;
  }

  const manifestPath = path.join(badgeAssetDir, "badge-manifest.json");
  let parsed: BadgeManifest = {};
  if (fs.existsSync(manifestPath)) {
    try {
      const raw = fs.readFileSync(manifestPath, "utf8");
      const data = JSON.parse(raw);
      if (data && typeof data === "object") {
        parsed = data as BadgeManifest;
      }
    } catch (error) {
      console.warn("[game-badge] failed to parse badge-manifest.json", error);
    }
  }

  badgeManifestCache = { loadedAt: now, data: parsed };
  return parsed;
}

function badgeKindForId(badgeId: string): BadgeKind {
  const parsed = parseDynamicBadgeId(badgeId);
  if (
    parsed?.kind === "overall_threshold" ||
    parsed?.kind === "streak_threshold" ||
    parsed?.kind === "weekly_top" ||
    parsed?.kind === "monthly_top"
  ) {
    return parsed.kind;
  }
  return "static";
}

function normalizeManifestAssetPath(input: unknown) {
  const value = String(input || "").trim();
  if (!value) return undefined;
  return value.replace(/\\/g, "/").replace(/^\/+/, "");
}

function manifestLayerAssetsForKind(
  manifest: BadgeManifest,
  kind: BadgeKind
): BadgeLayerAssets | null {
  if (kind !== "overall_threshold" && kind !== "streak_threshold") return null;
  const layer = manifest.layerAssets?.[kind];
  if (!layer || typeof layer !== "object") return null;
  return {
    mask: normalizeManifestAssetPath(layer.mask),
    line: normalizeManifestAssetPath(layer.line),
    shade: normalizeManifestAssetPath(layer.shade),
  };
}

function tierPaletteForIndex(manifest: BadgeManifest, tierIndex: number): BadgeTierPalette {
  const safeIndex = Math.max(1, Math.min(8, Math.floor(Number(tierIndex) || 1)));
  const fromManifest = Array.isArray(manifest.tierPalette)
    ? manifest.tierPalette[safeIndex - 1]
    : null;
  const fallback = DEFAULT_TIER_PALETTE[safeIndex - 1] || DEFAULT_TIER_PALETTE[0];
  if (!fromManifest || typeof fromManifest !== "object") {
    return fallback;
  }
  return {
    fillStart: String((fromManifest as any).fillStart || fallback.fillStart),
    fillEnd: String((fromManifest as any).fillEnd || fallback.fillEnd),
    ringOuter: String((fromManifest as any).ringOuter || fallback.ringOuter || "#FFFFFF"),
    ringInner: String((fromManifest as any).ringInner || fallback.ringInner || "#0F172A"),
    plaqueFill: String((fromManifest as any).plaqueFill || fallback.plaqueFill || "#000000"),
    plaqueText: String((fromManifest as any).plaqueText || fallback.plaqueText || "#FFFFFF"),
  };
}

function toInlineBadgeDataUri(assetPath: string | null | undefined) {
  const normalized = String(assetPath || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  if (!normalized) return null;

  const cached = badgeDataUriCache.get(normalized);
  if (cached) return cached;

  const absPath = path.resolve(badgeAssetDir, normalized);
  if (
    absPath !== badgeAssetDir &&
    !absPath.startsWith(`${badgeAssetDir}${path.sep}`)
  ) {
    return null;
  }

  const ext = path.extname(absPath).toLowerCase();
  const mime = mimeByExt[ext];
  if (!mime || !fs.existsSync(absPath)) return null;

  const file = fs.readFileSync(absPath);
  const dataUri = `data:${mime};base64,${file.toString("base64")}`;
  badgeDataUriCache.set(normalized, dataUri);
  return dataUri;
}

function badgeBaseAssetPathForId(badgeId: string, manifest?: BadgeManifest) {
  const kind = badgeKindForId(badgeId);
  const m = manifest || readBadgeManifest();
  return (
    normalizeManifestAssetPath(m.baseAssets?.[kind]) ||
    normalizeManifestAssetPath(m.baseAssets?.fallback) ||
    normalizeManifestAssetPath(m.baseAssets?.static) ||
    null
  );
}

function badgeFallbackGradient(color: string) {
  const c = String(color || "#64748B");
  return `<defs>
    <radialGradient id="badge-grad" cx="35%" cy="35%" r="70%">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.9"/>
      <stop offset="55%" stop-color="${escapeXml(c)}" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="#0F172A" stop-opacity="0.95"/>
    </radialGradient>
  </defs>
  <circle cx="400" cy="400" r="392" fill="url(#badge-grad)" />`;
}

async function badgeTierIndexForBadge(input: {
  classId: string;
  badgeId: string;
  kind: BadgeKind;
  threshold?: number;
}) {
  if (
    (input.kind !== "overall_threshold" && input.kind !== "streak_threshold") ||
    !Number.isFinite(input.threshold)
  ) {
    return null;
  }

  let step = input.kind === "overall_threshold" ? 1000 : 25;
  try {
    const config = await getBadgeConfig(input.classId);
    if (input.kind === "overall_threshold") {
      step = Math.max(1, Math.floor(Number(config.overallScoreThresholdStep || step)));
    } else {
      step = Math.max(1, Math.floor(Number(config.streakThresholdStep || step)));
    }
  } catch {
    // Fall back to defaults if config read fails.
  }

  const threshold = Math.max(1, Math.floor(Number(input.threshold || 0)));
  const level = Math.max(1, Math.floor(threshold / step));
  return Math.min(8, level);
}

async function badgeImageSvg(classId: string, badgeId: string) {
  const badge = getBadgeById(badgeId);
  if (!badge) return null;

  const manifest = readBadgeManifest();
  const dynamic = parseDynamicBadgeId(badgeId);
  const kind = badgeKindForId(badgeId);
  const tierIndex = await badgeTierIndexForBadge({
    classId,
    badgeId,
    kind,
    threshold: Number(dynamic?.threshold),
  });
  const tierPalette = tierIndex ? tierPaletteForIndex(manifest, tierIndex) : null;

  const color = String(tierPalette?.fillStart || badge.color || "#64748B");
  const engraving =
    String(badge.engraving || dynamic?.engraving || "").trim();
  const basePath = badgeBaseAssetPathForId(badgeId, manifest);
  const inline = toInlineBadgeDataUri(basePath);

  const layerAssets = manifestLayerAssetsForKind(manifest, kind);
  const maskInline = toInlineBadgeDataUri(layerAssets?.mask);
  const lineInline = toInlineBadgeDataUri(layerAssets?.line);
  const shadeInline = toInlineBadgeDataUri(layerAssets?.shade);
  const useLayeredTierRender = !!(tierPalette && maskInline);

  const imageLayer = useLayeredTierRender
    ? `<defs>
        <clipPath id="badge-clip"><circle cx="400" cy="400" r="392"/></clipPath>
        <linearGradient id="badge-tier-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${escapeXml(tierPalette!.fillStart)}" />
          <stop offset="100%" stop-color="${escapeXml(tierPalette!.fillEnd)}" />
        </linearGradient>
        <mask id="badge-tier-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="800" height="800" mask-type="alpha">
          <image href="${maskInline}" x="0" y="0" width="800" height="800" preserveAspectRatio="xMidYMid slice" />
        </mask>
      </defs>
      <g clip-path="url(#badge-clip)" mask="url(#badge-tier-mask)">
        <rect width="800" height="800" fill="url(#badge-tier-grad)" />
        ${
          shadeInline
            ? `<image href="${shadeInline}" x="0" y="0" width="800" height="800" preserveAspectRatio="xMidYMid slice" opacity="0.45" />`
            : ""
        }
        ${
          lineInline
            ? `<image href="${lineInline}" x="0" y="0" width="800" height="800" preserveAspectRatio="xMidYMid slice" />`
            : ""
        }
      </g>`
    : inline
    ? `<defs>
        <clipPath id="badge-clip"><circle cx="400" cy="400" r="392"/></clipPath>
      </defs>
      <rect width="800" height="800" fill="${escapeXml(color)}"/>
      <image href="${inline}" x="0" y="0" width="800" height="800" preserveAspectRatio="xMidYMid slice" clip-path="url(#badge-clip)" />`
    : badgeFallbackGradient(color);

  const engravingLayer = engraving
    ? (() => {
        const engravingFontSize =
          kind === "overall_threshold" || kind === "streak_threshold" ? 56 : 36;
        return `<g>
      <text x="400" y="668" text-anchor="middle" fill="${escapeXml(
        tierPalette?.plaqueText || "#FFFFFF"
      )}" font-size="${engravingFontSize}" font-family="Arial, sans-serif" font-weight="800">${escapeXml(
          engraving
        )}</text>
    </g>`;
      })()
    : "";

  const ring = `<circle cx="400" cy="400" r="392" fill="none" stroke="${escapeXml(
    tierPalette?.ringOuter || "#FFFFFF"
  )}" stroke-opacity="0.72" stroke-width="12" />
    <circle cx="400" cy="400" r="376" fill="none" stroke="${escapeXml(
      tierPalette?.ringInner || "#0F172A"
    )}" stroke-opacity="0.38" stroke-width="8" />`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800" role="img" aria-label="${escapeXml(
    badge.name
  )}">
  ${imageLayer}
  ${engravingLayer}
  ${ring}
</svg>`;
}

function paethPredictor(a: number, b: number, c: number) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function readPngOpaqueBounds(
  file: Buffer,
): { x: number; y: number; width: number; height: number } | null {
  if (file.length < 8) return null;
  const signature = file.subarray(0, 8);
  const pngSignature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  if (!signature.equals(pngSignature)) return null;

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idatChunks: Buffer[] = [];
  let transparency: Buffer | null = null;

  let offset = 8;
  while (offset + 8 <= file.length) {
    const chunkLength = file.readUInt32BE(offset);
    const chunkType = file.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + chunkLength;
    const crcEnd = dataEnd + 4;
    if (crcEnd > file.length) return null;

    const data = file.subarray(dataStart, dataEnd);
    if (chunkType === "IHDR") {
      if (data.length < 13) return null;
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (chunkType === "IDAT") {
      idatChunks.push(data);
    } else if (chunkType === "tRNS") {
      transparency = data;
    } else if (chunkType === "IEND") {
      break;
    }

    offset = crcEnd;
  }

  if (!width || !height || idatChunks.length === 0) return null;
  if (bitDepth !== 8 || interlace !== 0) return null;

  let bytesPerPixel = 0;
  switch (colorType) {
    case 0:
      bytesPerPixel = 1; // grayscale
      break;
    case 2:
      bytesPerPixel = 3; // rgb
      break;
    case 3:
      bytesPerPixel = 1; // indexed
      break;
    case 4:
      bytesPerPixel = 2; // gray + alpha
      break;
    case 6:
      bytesPerPixel = 4; // rgba
      break;
    default:
      return null;
  }

  const inflated = zlib.inflateSync(Buffer.concat(idatChunks));
  const rowBytes = width * bytesPerPixel;
  const expectedLength = (rowBytes + 1) * height;
  if (inflated.length < expectedLength) return null;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  let pos = 0;
  let prevRow = Buffer.alloc(rowBytes);

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[pos++];
    const row = Buffer.alloc(rowBytes);

    for (let i = 0; i < rowBytes; i += 1) {
      const raw = inflated[pos++];
      const left = i >= bytesPerPixel ? row[i - bytesPerPixel] : 0;
      const up = prevRow[i];
      const upLeft = i >= bytesPerPixel ? prevRow[i - bytesPerPixel] : 0;

      let value = raw;
      if (filter === 1) {
        value = (raw + left) & 0xff;
      } else if (filter === 2) {
        value = (raw + up) & 0xff;
      } else if (filter === 3) {
        value = (raw + Math.floor((left + up) / 2)) & 0xff;
      } else if (filter === 4) {
        value = (raw + paethPredictor(left, up, upLeft)) & 0xff;
      }

      row[i] = value;
    }

    for (let x = 0; x < width; x += 1) {
      const pixelOffset = x * bytesPerPixel;
      let alpha = 255;

      if (colorType === 6) {
        alpha = row[pixelOffset + 3];
      } else if (colorType === 4) {
        alpha = row[pixelOffset + 1];
      } else if (colorType === 3) {
        const paletteIdx = row[pixelOffset];
        alpha =
          transparency && paletteIdx < transparency.length
            ? transparency[paletteIdx]
            : 255;
      }

      if (alpha > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }

    prevRow = row;
  }

  if (maxX < 0 || maxY < 0) return null;
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function getPngOpaqueBounds(
  assetPath: string,
): { x: number; y: number; width: number; height: number } | null {
  const normalized = String(assetPath || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  if (!normalized) return null;

  const cached = pngOpaqueBoundsCache.get(normalized);
  if (cached !== undefined) return cached;

  const absPath = path.resolve(avatarAssetDir, normalized);
  if (
    absPath !== avatarAssetDir &&
    !absPath.startsWith(`${avatarAssetDir}${path.sep}`)
  ) {
    pngOpaqueBoundsCache.set(normalized, null);
    return null;
  }

  if (
    path.extname(absPath).toLowerCase() !== ".png" ||
    !fs.existsSync(absPath)
  ) {
    pngOpaqueBoundsCache.set(normalized, null);
    return null;
  }

  try {
    const file = fs.readFileSync(absPath);
    const bounds = readPngOpaqueBounds(file);
    pngOpaqueBoundsCache.set(normalized, bounds);
    return bounds;
  } catch {
    pngOpaqueBoundsCache.set(normalized, null);
    return null;
  }
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v || "").trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeUnique(values: string[]) {
  return Array.from(
    new Set(values.map((v) => String(v || "").trim()).filter(Boolean))
  );
}

function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
  }
  return undefined;
}

function normalizeSlotAlias(slot: string): CosmeticSlot | null {
  const normalized = String(slot || "").trim();
  if ((COSMETIC_SLOTS as readonly string[]).includes(normalized)) {
    return normalized as CosmeticSlot;
  }
  if (normalized === "base_avatar" || normalized === "base") return "avatar";
  if (normalized === "outfit") return "upperwear";
  if (normalized === "accessory") return "eye_accessory";
  if (normalized === "hand_accessory") return "wrist_accessory";
  if (normalized === "hair_accessory") return "head_accessory";
  return null;
}

function parseEquippedPayload(
  payload: any,
): Partial<Record<CosmeticSlot, string | null>> {
  const next: Partial<Record<CosmeticSlot, string | null>> = {};
  const equipped = payload?.equipped || {};

  for (const slot of COSMETIC_SLOTS) {
    if (Object.prototype.hasOwnProperty.call(equipped, slot)) {
      next[slot] = equipped[slot] ? String(equipped[slot]) : null;
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(payload || {}, slot)) {
      next[slot] = payload[slot] ? String(payload[slot]) : null;
    }
  }

  const legacyOutfit = equipped?.outfit ?? payload?.equippedOutfit;
  const legacyAvatar =
    equipped?.base_avatar ??
    payload?.equippedBaseAvatar ??
    payload?.equippedAvatar;
  const legacyAccessory = equipped?.accessory ?? payload?.equippedAccessory;
  const legacyHairAccessory =
    equipped?.hair_accessory ?? payload?.equippedHairAccessory;
  const legacyHandAccessory =
    equipped?.hand_accessory ?? payload?.equippedHandAccessory;
  const legacyPet = equipped?.pet ?? payload?.equippedPet;

  if (!next.avatar && legacyAvatar) next.avatar = String(legacyAvatar);
  if (!next.upperwear && legacyOutfit) next.upperwear = String(legacyOutfit);
  if (!next.eye_accessory && legacyAccessory)
    next.eye_accessory = String(legacyAccessory);
  if (!next.head_accessory && legacyHairAccessory) {
    next.head_accessory = String(legacyHairAccessory);
  }
  if (!next.wrist_accessory && legacyHandAccessory) {
    next.wrist_accessory = String(legacyHandAccessory);
  }
  if (!next.pet && legacyPet) next.pet = String(legacyPet);

  return next;
}

function requireClassId(req: Request, res: Response) {
  const classId = String(req.params.classId || "").trim();
  if (!classId) {
    res.status(400).json({ ok: false, message: "Missing classId" });
    return null;
  }
  return classId;
}

function requireStudentId(req: Request, res: Response) {
  const studentId = String(req.params.studentId || "").trim();
  if (!studentId) {
    res.status(400).json({ ok: false, message: "Missing studentId" });
    return null;
  }
  return studentId;
}

function parseLimit(value: unknown, fallback = 50, max = 200) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(n)));
}

function firstQueryValue(value: unknown) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function parseNotificationObjectIds(rawIds: string[]) {
  const ids = rawIds.map((id) => String(id || "").trim()).filter(Boolean);
  if (!ids.length) return [];
  if (!ids.every((id) => Types.ObjectId.isValid(id))) {
    throw new Error("notificationIds must contain valid ObjectIds");
  }
  return ids.map((id) => new Types.ObjectId(id));
}

function resolveRewardPayload(
  rewardId: string,
  classId: string,
  rewardType?: "cosmetic" | "badge" | null,
) {
  const normalizedType = rewardType || null;
  if (!rewardId) return null;

  if (!normalizedType || normalizedType === "cosmetic") {
    const cosmetic = getCosmeticById(rewardId);
    if (cosmetic) {
      return {
        rewardType: "cosmetic" as const,
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
  }

  if (!normalizedType || normalizedType === "badge") {
    const badge = getBadgeById(rewardId);
    if (badge) {
      return {
        rewardType: "badge" as const,
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
  }

  return null;
}

function notificationCopy(type: "reward_granted" | "reward_revoked", rewardName: string) {
  if (type === "reward_revoked") {
    return {
      title: "Item removed",
      message: rewardName
        ? `${rewardName} was removed from your inventory.`
        : "An item was removed from your inventory.",
    };
  }

  return {
    title: "New reward",
    message: rewardName
      ? `You unlocked ${rewardName}.`
      : "You unlocked a new reward.",
  };
}

function buildDefaultPreviewEquippedSlots() {
  const equipped = getEmptyEquippedSlots();
  const cosmetics = listCosmetics({ forceRefresh: true });

  for (const cosmetic of cosmetics) {
    if (cosmetic.defaultEquipped) {
      equipped[cosmetic.slot] = cosmetic.id;
    }
  }

  if (!equipped.avatar) {
    const fallbackAvatar = cosmetics.find((c) => c.slot === "avatar");
    if (fallbackAvatar) {
      equipped.avatar = fallbackAvatar.id;
    }
  }

  return equipped;
}

function buildBadgePayload(classId: string, badgeId: string) {
  const badge = getBadgeById(badgeId);
  if (!badge) return null;
  return {
    id: badge.id,
    name: badge.name,
    description: badge.description,
    color: badge.color,
    kind: badge.kind || parseDynamicBadgeId(badge.id)?.kind || "static",
    engraving: badge.engraving || parseDynamicBadgeId(badge.id)?.engraving || null,
    imageUrl: buildBadgeRenderUrl(classId, badge.id),
  };
}

export {
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
};
