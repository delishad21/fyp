import {
  AVATAR_LAYER_ORDER,
  COSMETIC_SLOTS,
  CosmeticSlot,
  getCosmeticById,
  getEmptyEquippedSlots,
  resolveAvatarAssetUrl,
} from "./default-catalog";

export type AvatarEquippedSlots = Partial<Record<CosmeticSlot, string | null>>;

export type AvatarLayerSpec = {
  slot: CosmeticSlot;
  itemId: string;
  assetPath: string;
  assetUrl: string;
  zIndex: number;
};

export type AvatarComposition = {
  version: 1;
  width: number;
  height: number;
  baseAssetUrl: string | null;
  layers: AvatarLayerSpec[];
};

const CANVAS_SIZE = 800;
const PROFILE_CROP = {
  // Upper-middle portrait crop from the full 800x800 avatar canvas.
  // This is intentionally wider/taller so different base-avatar placements
  // still keep face + upper outfit visible in circular profile photos.
  x: 120,
  y: 80,
  width: 560,
  height: 560,
};

type AvatarSvgBuildOptions = {
  viewBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  outputSize?: {
    width: number;
    height: number;
  };
  backgroundColor?: string | null;
  hrefForLayer?: (layer: AvatarLayerSpec) => string;
};

function esc(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function normalizeEquippedSlots(
  equipped?: AvatarEquippedSlots
): Record<CosmeticSlot, string | null> {
  const next = getEmptyEquippedSlots();
  if (!equipped) return next;

  for (const slot of COSMETIC_SLOTS) {
    const raw = equipped[slot];
    next[slot] = raw ? String(raw) : null;
  }
  return next;
}

export function buildAvatarComposition(
  equipped?: AvatarEquippedSlots
): AvatarComposition {
  const normalized = normalizeEquippedSlots(equipped);
  const layers: AvatarLayerSpec[] = [];

  for (const [idx, slot] of AVATAR_LAYER_ORDER.entries()) {
    const itemId = normalized[slot];
    if (!itemId) continue;

    const cosmetic = getCosmeticById(itemId);
    if (!cosmetic || cosmetic.slot !== slot) continue;

    layers.push({
      slot,
      itemId,
      assetPath: cosmetic.assetPath,
      assetUrl: resolveAvatarAssetUrl(cosmetic.assetPath),
      zIndex: idx,
    });
  }

  const baseLayer = layers.find((layer) => layer.slot === "avatar");

  return {
    version: 1,
    width: CANVAS_SIZE,
    height: CANVAS_SIZE,
    baseAssetUrl: baseLayer?.assetUrl || null,
    layers,
  };
}

export function buildAvatarSvg(
  composition: AvatarComposition,
  options: AvatarSvgBuildOptions = {}
) {
  const viewBox = options.viewBox || {
    x: 0,
    y: 0,
    width: composition.width,
    height: composition.height,
  };
  const outputSize = options.outputSize || {
    width: viewBox.width,
    height: viewBox.height,
  };
  const backgroundColor =
    options.backgroundColor === undefined ? "#F8FAFC" : options.backgroundColor;

  const layers = composition.layers
    .slice()
    .sort((a, b) => a.zIndex - b.zIndex)
    .map(
      (layer) => {
        const href = options.hrefForLayer
          ? options.hrefForLayer(layer)
          : layer.assetUrl;
        return `<image href="${esc(href)}" x="0" y="0" width="${composition.width}" height="${composition.height}" preserveAspectRatio="xMidYMid meet" />`;
      }
    )
    .join("\n  ");

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${outputSize.width}" height="${outputSize.height}" viewBox="${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}">
  ${
    backgroundColor
      ? `<rect x="${viewBox.x}" y="${viewBox.y}" width="${viewBox.width}" height="${viewBox.height}" fill="${esc(backgroundColor)}"/>`
      : ""
  }
  ${layers}
</svg>`.trim();
}

export function buildAvatarProfileSvg(composition: AvatarComposition) {
  return buildAvatarSvg(composition, {
    viewBox: PROFILE_CROP,
    outputSize: {
      width: PROFILE_CROP.width,
      height: PROFILE_CROP.height,
    },
  });
}

export function buildAvatarProfileSvgWithLayerHref(
  composition: AvatarComposition,
  hrefForLayer: (layer: AvatarLayerSpec) => string
) {
  return buildAvatarSvg(composition, {
    viewBox: PROFILE_CROP,
    outputSize: {
      width: PROFILE_CROP.width,
      height: PROFILE_CROP.height,
    },
    hrefForLayer,
  });
}

export function buildAvatarDataUri(composition: AvatarComposition) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(buildAvatarSvg(composition))}`;
}
