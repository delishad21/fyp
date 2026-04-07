# Game Service API

## 1. Overview

---

### 1.1 Scope and Status

This document describes the **currently implemented** `game-service` API and behavior as represented in:

- `services/game-service/src/routes/game-routes.ts`
- `services/game-service/src/controller/game-controller.ts`
- `services/game-service/src/controller/rewards-controller.ts`

The document reflects implementation behavior (including current auth coverage), not target-state intent.

---

### 1.2 Base URL

Local via proxy:

- `http://api.local:8085/api/game`

Direct service:

- `http://localhost:7305`

---

### 1.3 Response Conventions

Most JSON endpoints use:

```json
{ "ok": true, "data": { } }
```

Error format is usually:

```json
{ "ok": false, "message": "..." }
```

Some framework-level 404/error paths may return:

```json
{ "error": { "message": "..." } }
```

SVG/image endpoints return raw SVG (`Content-Type: image/svg+xml`) with `Cache-Control: no-store`.

---

### 1.4 Authentication and Authorization (Current Route Wiring)

Protected by middleware:

- `GET /classes/:classId/students/:studentId/attempts/:attemptId/outcome`
- `GET /classes/:classId/students/:studentId/rewards/attempt/:attemptId`
- `POST /classes/:classId/students/:studentId/rewards/attempt/:attemptId/ack`
- `GET /classes/:classId/students/:studentId/notifications`
- `POST /classes/:classId/students/:studentId/notifications/ack`

Current implementation note:

- many class-level reward/config/inventory mutation endpoints are currently public at route level (no middleware attached in `game-routes.ts`).

---

### 1.5 `GET /health` — Service health

**Auth**: Public.

**Success (200)**:

```json
{
  "ok": true,
  "data": {
    "service": "game-service",
    "status": "healthy",
    "version": "v0",
    "timestamp": "2026-03-12T00:00:00.000Z"
  }
}
```

---

### 1.6 `GET /classes/:classId/leaderboard` — Leaderboard rows

**Auth**: Public (current implementation).

**Query**:

- `period` (optional): `overall | week | month` (default: `overall`)

**Behavior**:

- Period-aware score computation:
  - `overall`: canonical projection
  - `week`/`month`: best valid attempt per schedule within period
- Sort/rank:
  - `overallScore desc`, `currentStreak desc`, `studentId asc`
- Returns rounded whole-number `overallScore`.
- `displayName` is enriched from class-service roster if auth header is present and lookup succeeds; else falls back to `userId`.

**Success (200)**:

```json
{
  "ok": true,
  "data": [
    {
      "rank": 1,
      "userId": "student-id",
      "displayName": "Student Name",
      "photoUrl": "/api/game/classes/.../avatar-profile.svg",
      "className": "Class 4A",
      "overallScore": 3555,
      "avgScorePct": 88.2,
      "participationPct": 75,
      "participationCount": 9,
      "currentStreak": 14,
      "bestStreakDays": 31,
      "lastStreakDate": "2026-03-11T12:00:00.000Z"
    }
  ],
  "meta": { "period": "overall" }
}
```

**Errors**:

- `400` invalid/missing `classId`
- `500` internal error

---

### 1.7 `GET /classes/:classId/leaderboard/top` — Top slices

**Auth**: Public (current implementation).

**Query**:

- `period` (optional): `overall | week | month` (default `overall`)
- `limit` (optional): clamped to `1..10` (default `3`)

**Success (200)**:

```json
{
  "ok": true,
  "data": {
    "period": "overall",
    "topOverallScore": [ ... ],
    "topParticipation": [ ... ],
    "topStreak": [ ... ]
  }
}
```

---

### 1.8 `GET /classes/:classId/students/:studentId/profile` — Student game profile

**Auth**: Public (current implementation).

**Behavior**:

- verifies class exists
- verifies student exists on roster, or has projected data
- computes rank from current leaderboard sort
- rounds `overallScore` to whole number
- includes avatar, equipped slots, badge shelf, and score-threshold progress

**Success (200)**:

```json
{
  "ok": true,
  "data": {
    "classId": "...",
    "className": "Class 4A",
    "timezone": "Asia/Singapore",
    "studentId": "...",
    "rank": 2,
    "overallScore": 3555,
    "participationCount": 9,
    "participationPct": 75,
    "avgScorePct": 88.2,
    "currentStreak": 14,
    "bestStreakDays": 31,
    "lastStreakDate": "2026-03-11T12:00:00.000Z",
    "avatarUrl": "/api/game/classes/.../students/.../avatar-profile.svg",
    "avatarSpec": { "version": 1, "width": 800, "height": 800, "layers": [] },
    "badges": ["badge_overall_1000", "badge_streak_25"],
    "ownedBadgeIds": ["badge_overall_1000", "badge_streak_25"],
    "displayBadgeIds": ["badge_overall_1000"],
    "displayBadges": [
      {
        "id": "badge_overall_1000",
        "name": "1000 Score Milestone",
        "description": "Reached overall score threshold 1000.",
        "color": "#2563EB",
        "kind": "overall_threshold",
        "engraving": "1000",
        "imageUrl": "/api/game/classes/.../badges/badge_overall_1000/image.svg"
      }
    ],
    "cosmetics": ["cosmetic_upperwear_shirt-7"],
    "equipped": {
      "avatar": "cosmetic_avatar_avatar-3",
      "eyes": "cosmetic_eyes_eye-15"
    },
    "scoreThresholdProgress": {
      "pointsPerReward": 500,
      "nextThresholdPoints": 4000
    }
  }
}
```

**Errors**:

- `400` missing params
- `404` class or student not found
- `500` internal error

---

### 1.9 `GET /classes/:classId/students/:studentId/attempts/:attemptId/outcome` — Attempt outcome snapshot

**Auth**:

- `verifyAccessToken`
- `verifyAttemptOwnerOrPrivileged`

**Behavior**:

- If processing is not ready, returns `ready: false`
- If ready, returns score/rank delta plus attempt-triggered rewards
- `overallScoreBefore/After` are rounded whole numbers

**Success (200, not ready)**:

```json
{
  "ok": true,
  "data": {
    "classId": "...",
    "studentId": "...",
    "attemptId": "...",
    "ready": false
  }
}
```

**Success (200, ready)**:

```json
{
  "ok": true,
  "data": {
    "classId": "...",
    "studentId": "...",
    "scheduleId": "...",
    "attemptId": "...",
    "attemptVersion": 2,
    "ready": true,
    "quizScore": 8,
    "quizMaxScore": 10,
    "overallScoreBefore": 3555,
    "overallScoreAfter": 4000,
    "overallScoreDelta": 445,
    "rankBefore": 4,
    "rankAfter": 2,
    "rankDelta": 2,
    "rewards": [ ... ],
    "scoreThresholdProgress": {
      "pointsPerReward": 500,
      "nextThresholdPoints": 4500
    },
    "processedAt": "2026-03-12T03:00:00.000Z"
  }
}
```

---

### 1.10 Rewards Catalog APIs

#### 1.10.1 `GET /rewards/catalog`
#### 1.10.2 `GET /classes/:classId/rewards/catalog`

Both currently return the same payload.

**Auth**: Public (current implementation).

**Success (200)**:

```json
{
  "ok": true,
  "data": {
    "avatar": {
      "compulsorySlots": ["avatar", "eyes", "mouth", "upperwear", "lowerwear"],
      "optionalSlots": ["hair", "outerwear", "head_accessory", "eye_accessory", "wrist_accessory", "pet", "shoes"],
      "slots": [ ... ],
      "layerOrder": [ ... ],
      "assetBaseUrl": "/api/game/avatar-assets",
      "baseModels": [ ... ],
      "defaultBaseModelId": "avatar-3",
      "defaultAvatarItemId": "cosmetic_avatar_avatar-3",
      "baseAssetPath": "base/Avatar 3.png",
      "baseAssetUrl": "/api/game/avatar-assets/base/Avatar%203.png"
    },
    "cosmetics": [ ... ],
    "badges": [ ... ],
    "defaultRuleTemplates": [ ... ]
  }
}
```

---

### 1.11 Score Reward Config APIs

#### 1.11.1 `GET /classes/:classId/rewards/score-config`

**Auth**: Public (current implementation).

**Success (200)**:

```json
{
  "ok": true,
  "data": {
    "classId": "...",
    "enabled": true,
    "pointsPerReward": 500
  }
}
```

#### 1.11.2 `PUT /classes/:classId/rewards/score-config`

**Auth**: Public (current implementation).

**Body**:

```json
{
  "enabled": true,
  "pointsPerReward": 500
}
```

**Behavior**:

- `pointsPerReward` must be a positive integer
- update does not retroactively backfill old thresholds

**Errors**:

- `400` invalid payload
- `500` internal error

---

### 1.12 Badge Config APIs

#### 1.12.1 `GET /classes/:classId/badges/config`

**Auth**: Public (current implementation).

#### 1.12.2 `PUT /classes/:classId/badges/config`

**Auth**: Public (current implementation).

**Body fields** (all optional):

- `weeklyTopEnabled`
- `monthlyTopEnabled`
- `overallScoreThresholdEnabled`
- `streakThresholdEnabled`
- `overallScoreThresholdStep` (positive integer)
- `streakThresholdStep` (positive integer)

**Behavior**:

- updates config
- triggers class-wide threshold badge recomputation in same transaction path

---

### 1.13 Reward Rule APIs

#### 1.13.1 `GET /classes/:classId/rewards/rules`

**Auth**: Public (current implementation).

Returns default + custom rules for the class (default rules auto-seeded first).

#### 1.13.2 `POST /classes/:classId/rewards/rules`

**Auth**: Public (current implementation).

**Body**:

```json
{
  "name": "Custom Rule",
  "description": "Optional",
  "triggerType": "overall_score_gte",
  "threshold": 2000,
  "rewardIds": ["cosmetic_shoes_shoes-2"],
  "enabled": true,
  "repeatable": false
}
```

#### 1.13.3 `PUT /classes/:classId/rewards/rules/:ruleId`

**Auth**: Public (current implementation).

Updates a rule with the same payload shape.

#### 1.13.4 `DELETE /classes/:classId/rewards/rules/:ruleId`

**Auth**: Public (current implementation).

Deletes the rule.

---

### 1.14 Inventory Listing APIs

#### 1.14.1 `GET /classes/:classId/rewards/inventories`

**Auth**: Public (current implementation).

Ensures inventories for all roster students, then returns:

```json
{
  "ok": true,
  "data": {
    "studentIds": ["..."],
    "inventories": [ ... ]
  }
}
```

#### 1.14.2 `GET /classes/:classId/students/:studentId/inventory`

**Auth**: Public (current implementation).

Ensures and returns one student inventory.

---

### 1.15 Badge Inventory APIs

#### 1.15.1 `GET /classes/:classId/students/:studentId/badges`

**Auth**: Public (current implementation).

Returns owned/display badge ids and resolved badge payloads.

#### 1.15.2 `PUT /classes/:classId/students/:studentId/badges/display`

**Auth**: Public (current implementation).

**Body**:

```json
{
  "displayBadgeIds": ["badge_overall_1000", "badge_streak_25"]
}
```

Behavior:

- filters to owned badges only
- max 4 entries

---

### 1.16 Attempt Reward Reveal APIs

#### 1.16.1 `GET /classes/:classId/students/:studentId/rewards/attempt/:attemptId`

**Auth**:

- `verifyAccessToken`
- `verifyAttemptOwnerOrPrivileged`

Returns grants for that attempt where source is `score_threshold` or `rule`.

#### 1.16.2 `POST /classes/:classId/students/:studentId/rewards/attempt/:attemptId/ack`

**Auth**:

- `verifyAccessToken`
- `verifyAttemptOwnerOrPrivileged`

Marks matching attempt grants as acknowledged.

---

### 1.17 Notification APIs

#### 1.17.1 `GET /classes/:classId/students/:studentId/notifications`

**Auth**:

- `verifyAccessToken`
- `verifyTeacherOfStudentOrSelf`

**Query**:

- `unreadOnly=true|false` (optional)
- `limit` (optional, default 50, max 200)

Returns notification rows with resolved reward payload (if resolvable), plus unread count.

#### 1.17.2 `POST /classes/:classId/students/:studentId/notifications/ack`

**Auth**:

- `verifyAccessToken`
- `verifyTeacherOfStudentOrSelf`

**Body option A (specific rows)**:

```json
{
  "notificationIds": ["<ObjectId1>", "<ObjectId2>"]
}
```

**Body option B (bulk)**:

```json
{
  "acknowledgeAll": true
}
```

Returns acknowledged count and updated unread count.

---

### 1.18 Avatar and Badge Image APIs

#### 1.18.1 `GET /classes/:classId/students/:studentId/avatar.svg`

**Auth**: Public (current implementation).

Returns full composed avatar SVG (transparent background).

#### 1.18.2 `GET /classes/:classId/students/:studentId/avatar-profile.svg`

**Auth**: Public (current implementation).

Returns upper-middle profile crop SVG.

#### 1.18.3 `GET /classes/:classId/badges/:badgeId/image.svg`

**Auth**: Public (current implementation).

Renders badge SVG:

- static or dynamic badge id
- dynamic engraving
- optional manifest-driven layer/palette rendering

---

### 1.19 Cosmetic Preview and Asset APIs

#### 1.19.1 Preview

- `GET /rewards/cosmetics/:cosmeticId/preview.svg`
- `GET /classes/:classId/rewards/cosmetics/:cosmeticId/preview.svg`

**Auth**: Public (current implementation).

Returns avatar preview with selected cosmetic equipped.

#### 1.19.2 Asset

- `GET /rewards/cosmetics/:cosmeticId/asset.svg`
- `GET /classes/:classId/rewards/cosmetics/:cosmeticId/asset.svg`

**Auth**: Public (current implementation).

Returns isolated cosmetic asset SVG.

Behavior:

- non-avatar PNG assets are cropped to opaque pixel bounds
- avatar slot uses center-focused tiny preview output for skin-color swatch behavior

---

### 1.20 Student Inventory Mutation APIs

#### 1.20.1 `PUT /classes/:classId/students/:studentId/inventory`

**Auth**: Public (current implementation).

Supported body fields:

- `ownedCosmeticIds`
- `ownedBadgeIds`
- `displayBadgeIds`
- `equipped` (slot map)
- legacy aliases are accepted (e.g. `outfit`, `base_avatar`, `accessory`)

Behavior:

- validates ids against catalog
- enforces compulsory slot/equipment normalization
- cannot revoke default cosmetics
- teacher badge grants are blocked (badge additions rejected)
- badge revocations are allowed
- creates notifications for reward grants/revokes resulting from changes

#### 1.20.2 `POST /classes/:classId/students/:studentId/equip`

**Auth**: Public (current implementation).

**Body**:

```json
{
  "slot": "upperwear",
  "itemId": "cosmetic_upperwear_shirt-7"
}
```

Requires ownership and slot match, then updates equip + avatar cache.

#### 1.20.3 `POST /classes/:classId/students/:studentId/rewards/grant`

**Auth**: Public (current implementation).

**Body**:

```json
{
  "rewardId": "cosmetic_shoes_shoes-2"
}
```

Behavior:

- grants only supported reward ids
- teacher badge grants are disabled (badge reward ids are rejected)
- returns updated inventory

---

### 1.21 Error Notes

Common errors:

- `400` validation/parameter errors
- `401` missing/invalid token on protected routes
- `403` permission denied on protected routes
- `404` missing resource (e.g., class/student/rule/badge)
- `500` internal errors
- `503` upstream timeout from authz helper middleware

---

### 1.22 Important Implementation Notes

1. Several class-level config/mutation endpoints are currently public at route level and should be hardened if strict teacher/admin-only enforcement is required.
2. `overallScore` returned by leaderboard/profile/outcome APIs is intentionally rounded to whole numbers.
3. Score-threshold reward progress is forward-only and intentionally avoids retroactive backfill on threshold config changes.
4. Canonical analytics authority remains in class-service; game-service consumes canonical reconciliation events for consistency.
