#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT_DIR = process.cwd();
const DEFAULT_ENV_FILE = path.join(ROOT_DIR, ".env.prod");

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const fileEnv = readEnvFile(process.env.ENV_FILE || DEFAULT_ENV_FILE);
const env = { ...fileEnv, ...process.env };

const CONFIG = {
  baseUrl:
    (env.BASE_URL || env.PRESENTATION_FRONTEND_URL || "http://localhost:8085")
      .trim()
      .replace(/\/+$/, ""),
  className: (env.CLASS_NAME || "4A").trim(),
  teacherIdentifier: (env.TEACHER_IDENTIFIER || "").trim(),
  teacherPassword: env.TEACHER_PASSWORD || "",
  teacherToken: (env.TEACHER_TOKEN || "").trim(),
  demoStudentPassword: env.DEMO_STUDENT_PASSWORD || "12345678",
  maxSchedules: Math.max(1, Number(env.SEED_SCHEDULE_COUNT || 12)),
  composeFile: env.COMPOSE_FILE || "docker-compose.prod.yml",
  composeEnvFile: env.COMPOSE_ENV_FILE || ".env.prod",
  mongoUser: env.MONGO_ROOT_USERNAME || "root",
  mongoPass: env.MONGO_ROOT_PASSWORD || "rootpassword",
  dryRun:
    String(env.DRY_RUN || "")
      .trim()
      .toLowerCase() === "true",
  sleepAfterScheduleMs: Math.max(
    0,
    Number(env.SLEEP_AFTER_SCHEDULE_MS || 6000)
  ),
  sleepAfterAttemptsMs: Math.max(
    0,
    Number(env.SLEEP_AFTER_ATTEMPTS_MS || 6000)
  ),
  quizTypesFilter: String(env.SEED_QUIZ_TYPES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};

if (!CONFIG.teacherToken && (!CONFIG.teacherIdentifier || !CONFIG.teacherPassword)) {
  console.error(
    "Missing teacher authentication. Set TEACHER_TOKEN, or TEACHER_IDENTIFIER + TEACHER_PASSWORD."
  );
  process.exit(1);
}

if (String(CONFIG.demoStudentPassword).trim().length < 8) {
  console.error("DEMO_STUDENT_PASSWORD must be at least 8 characters.");
  process.exit(1);
}

function log(step, message) {
  console.log(`[seed-4A] [${step}] ${message}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runCmd(cmd, args) {
  return execFileSync(cmd, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function resolveComposeContainerId(serviceName) {
  const id = runCmd("docker", [
    "compose",
    "--env-file",
    CONFIG.composeEnvFile,
    "-f",
    CONFIG.composeFile,
    "ps",
    "-q",
    serviceName,
  ]);
  if (!id) {
    throw new Error(
      `Unable to resolve container for compose service "${serviceName}".`
    );
  }
  return id;
}

function runMongoEval({ serviceName, dbName, code }) {
  const containerId = resolveComposeContainerId(serviceName);
  return runCmd("docker", [
    "exec",
    "-i",
    containerId,
    "mongosh",
    "--quiet",
    "-u",
    CONFIG.mongoUser,
    "-p",
    CONFIG.mongoPass,
    "--authenticationDatabase",
    "admin",
    dbName,
    "--eval",
    code,
  ]);
}

function extractUserIdFromJwt(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length < 2) return "";
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8")
    );
    const id = payload?.id ?? payload?.sub ?? "";
    return String(id || "").trim();
  } catch {
    return "";
  }
}

function fetchQuizRowsFromMongo(ownerId) {
  const safeOwnerId = String(ownerId || "").trim();
  if (!safeOwnerId) return [];

  const code = `
const ownerId = ObjectId("${safeOwnerId}");
const rows = db.quizzes.aggregate([
  { $match: { owner: ownerId } },
  { $sort: { createdAt: -1, version: -1 } },
  { $group: { _id: "$rootQuizId", doc: { $first: "$$ROOT" } } },
  { $replaceRoot: { newRoot: "$doc" } },
  {
    $project: {
      _id: { $toString: "$_id" },
      rootQuizId: { $toString: "$rootQuizId" },
      version: "$version",
      quizType: "$quizType",
      name: "$name",
      createdAt: {
        $dateToString: {
          date: "$createdAt",
          format: "%Y-%m-%dT%H:%M:%S.%LZ",
          timezone: "UTC"
        }
      }
    }
  },
  { $sort: { createdAt: -1 } }
]).toArray();
print(JSON.stringify(rows));
`.trim();

  const raw = runMongoEval({
    serviceName: "mongo-quiz",
    dbName: "quiz",
    code,
  });

  if (!raw) return [];
  try {
    const rows = JSON.parse(raw);
    if (!Array.isArray(rows)) return [];
    return rows
      .map((r) => ({
        _id: String(r?._id || ""),
        rootQuizId: String(r?.rootQuizId || ""),
        version: Number(r?.version || 1),
        quizType: String(r?.quizType || ""),
        name: String(r?.name || "Unnamed Quiz"),
        createdAt: String(r?.createdAt || new Date().toISOString()),
      }))
      .filter((r) => r._id && r.rootQuizId);
  } catch {
    return [];
  }
}

async function apiRequest(pathname, { method = "GET", token, body } = {}) {
  const headers = {
    Accept: "application/json",
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${CONFIG.baseUrl}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    const msg =
      data?.message ||
      data?.error?.message ||
      text ||
      `${res.status} ${res.statusText}`;
    const err = new Error(`HTTP ${res.status} for ${method} ${pathname}: ${msg}`);
    err.status = res.status;
    err.response = data;
    throw err;
  }
  return data;
}

async function teacherSignIn() {
  if (CONFIG.teacherToken) {
    return CONFIG.teacherToken;
  }
  const resp = await apiRequest("/api/user/teacher/auth/sign-in", {
    method: "POST",
    body: {
      identifier: CONFIG.teacherIdentifier,
      password: CONFIG.teacherPassword,
    },
  });
  const token = resp?.data?.accessToken;
  if (!token) {
    throw new Error("Teacher sign-in succeeded but accessToken missing.");
  }
  return token;
}

function pickClassByName(rows, wantedName) {
  const wanted = wantedName.toLowerCase();
  const exact = rows.find(
    (r) => String(r?.name || "").trim().toLowerCase() === wanted
  );
  if (exact) return exact;

  const prefix = rows.find((r) =>
    String(r?.name || "")
      .trim()
      .toLowerCase()
      .startsWith(wanted)
  );
  if (prefix) return prefix;

  const contains = rows.find((r) =>
    String(r?.name || "").trim().toLowerCase().includes(wanted)
  );
  return contains || null;
}

function seedIntFromString(input) {
  const digest = crypto.createHash("sha256").update(String(input)).digest();
  return digest.readUInt32BE(0);
}

function makeRng(seedInput) {
  let state = seedIntFromString(seedInput) || 1;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function shuffle(items, rng) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function uniqueByRoot(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const key = String(row?.rootQuizId || "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

async function fetchAllQuizRows(teacherToken) {
  const rows = [];
  let page = 1;
  while (true) {
    const resp = await apiRequest(`/api/quiz?page=${page}&pageSize=100`, {
      token: teacherToken,
    });
    const pageRows = Array.isArray(resp?.rows) ? resp.rows : [];
    rows.push(...pageRows);
    const pageCount = Number(resp?.pageCount || 1);
    if (page >= pageCount) break;
    page += 1;
  }
  return rows;
}

function selectQuizzesForSchedules(allRows, maxSchedules, typesFilter = []) {
  const allowedTypes =
    typesFilter.length > 0 ? new Set(typesFilter.map((t) => t.toLowerCase())) : null;

  const filtered = allRows.filter((r) => {
    if (!allowedTypes) return true;
    return allowedTypes.has(String(r?.quizType || "").toLowerCase());
  });

  const deduped = uniqueByRoot(
    [...filtered].sort(
      (a, b) =>
        new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime()
    )
  );

  const preferredOrder = [
    "basic",
    "rapid",
    "true-false",
    "crossword",
    "rapid-arithmetic",
    "crossword-bank",
  ];

  const chosen = [];
  const usedRoots = new Set();

  for (const t of preferredOrder) {
    const hit = deduped.find(
      (r) =>
        String(r?.quizType || "").toLowerCase() === t &&
        !usedRoots.has(String(r?.rootQuizId || ""))
    );
    if (!hit) continue;
    chosen.push(hit);
    usedRoots.add(String(hit.rootQuizId));
    if (chosen.length >= maxSchedules) return chosen;
  }

  for (const row of deduped) {
    const root = String(row?.rootQuizId || "");
    if (!root || usedRoots.has(root)) continue;
    chosen.push(row);
    usedRoots.add(root);
    if (chosen.length >= maxSchedules) break;
  }
  return chosen;
}

function appendUniqueQuizFamilies(current, candidates, limit) {
  const out = [...(Array.isArray(current) ? current : [])];
  const used = new Set(
    out.map((r) => String(r?.rootQuizId || "")).filter(Boolean)
  );

  for (const row of candidates || []) {
    if (out.length >= limit) break;
    const root = String(row?.rootQuizId || "");
    if (!root || used.has(root)) continue;
    used.add(root);
    out.push(row);
  }
  return out;
}

function startOfUtcDay(date = new Date()) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function dateAtUtcOffset(baseUtcDay, dayOffset, hour = 0, minute = 0) {
  const d = new Date(baseUtcDay);
  d.setUTCDate(d.getUTCDate() + Number(dayOffset || 0));
  d.setUTCHours(hour, minute, 0, 0);
  return d;
}

function buildScheduleTimelineSlots(total) {
  if (total <= 0) return [];
  const slots = [];
  const pushSlot = (
    startOffsetDays,
    durationDays,
    extra = {}
  ) => {
    const start = Number(startOffsetDays || 0);
    let duration = clamp(Number(durationDays || 1), 1, 3);
    if (start < 0) {
      const maxForPastWindow = Math.max(1, Math.min(3, Math.abs(start) + 1));
      duration = Math.min(duration, maxForPastWindow);
    }
    const end = start + duration - 1;
    const status = end < 0 ? "past" : start > 0 ? "future" : "current";
    slots.push({
      status,
      startOffsetDays: start,
      durationDays: duration,
      ...extra,
    });
  };

  // Coverage backbone: one schedule per day across the last 8 days.
  // This makes long streaks (up to 8 days) realistically achievable.
  const coverageCount = Math.min(8, total);
  const coverageDurations = [2, 1, 3, 2, 1, 2, 1, 1];
  const firstCoverageOffset = -(coverageCount - 1);
  for (let i = 0; i < coverageCount; i += 1) {
    const dayOffset = firstCoverageOffset + i;
    const templateIdx = Math.max(
      0,
      coverageDurations.length - coverageCount + i
    );
    const rawDuration = coverageDurations[templateIdx] || 1;
    pushSlot(dayOffset, rawDuration, {
      isDailyCoverage: true,
      coverageDayOffset: dayOffset,
    });
  }

  const extras = [
    { startOffsetDays: -12, durationDays: 2 },
    { startOffsetDays: -10, durationDays: 3 },
    { startOffsetDays: -1, durationDays: 2 },
    { startOffsetDays: 1, durationDays: 2 },
    { startOffsetDays: 3, durationDays: 3 },
    { startOffsetDays: 5, durationDays: 2 },
    { startOffsetDays: -14, durationDays: 2 },
    { startOffsetDays: 7, durationDays: 1 },
  ];

  for (const ex of extras) {
    if (slots.length >= total) break;
    pushSlot(ex.startOffsetDays, ex.durationDays);
  }

  while (slots.length < total) {
    const i = slots.length;
    pushSlot(2 + i, 2);
  }

  return slots.slice(0, total);
}

function applyTimelineToSchedules(createdSchedules) {
  const slots = buildScheduleTimelineSlots(createdSchedules.length);
  const base = startOfUtcDay(new Date());

  return createdSchedules.map((row, idx) => {
    const slot = slots[idx] || { status: "current", startOffsetDays: -1, durationDays: 2 };
    const startDate = dateAtUtcOffset(base, slot.startOffsetDays, 0, 30);
    const endOffset = slot.startOffsetDays + slot.durationDays - 1;
    const endDate = dateAtUtcOffset(base, endOffset, 23, 15);

    return {
      ...row,
      timelineStatus: slot.status,
      isDailyCoverage: Boolean(slot.isDailyCoverage),
      coverageDayOffset:
        slot.coverageDayOffset === undefined
          ? null
          : Number(slot.coverageDayOffset),
      finalStartDate: startDate.toISOString(),
      finalEndDate: endDate.toISOString(),
    };
  });
}

function buildAttemptTimelineAssignments({
  attemptRows,
  scheduleRows,
  studentProfiles,
}) {
  const scheduleById = new Map(
    scheduleRows.map((s) => [String(s.scheduleId), s])
  );
  const nowMs = Date.now();
  const grouped = new Map();

  for (const row of attemptRows) {
    const key = `${row.studentId}::${row.scheduleId}`;
    const pack = grouped.get(key) || [];
    pack.push(row);
    grouped.set(key, pack);
  }

  const assignments = [];

  for (const [key, rows] of grouped.entries()) {
    const [studentId, scheduleId] = key.split("::");
    const schedule = scheduleById.get(scheduleId);
    if (!schedule) continue;

    const profile = studentProfiles.get(studentId) || {
      diligence: 0.5,
    };
    const rng = makeRng(`timeline:${studentId}:${scheduleId}`);

    let windowStartMs = new Date(schedule.finalStartDate).getTime() + 45 * 60 * 1000;
    let windowEndMs = new Date(schedule.finalEndDate).getTime() - 30 * 60 * 1000;
    if (schedule.timelineStatus === "current") {
      windowEndMs = Math.min(windowEndMs, nowMs - 3 * 60 * 1000);
    }
    if (!Number.isFinite(windowStartMs) || !Number.isFinite(windowEndMs)) continue;
    if (windowEndMs <= windowStartMs) {
      windowEndMs = windowStartMs + 10 * 60 * 1000;
    }

    const ordered = [...rows].sort((a, b) => {
      if (a.attemptOrdinal !== b.attemptOrdinal) {
        return a.attemptOrdinal - b.attemptOrdinal;
      }
      return String(a.attemptId).localeCompare(String(b.attemptId));
    });

    let lastMs = windowStartMs - 1;
    const range = Math.max(1, windowEndMs - windowStartMs);

    for (let i = 0; i < ordered.length; i += 1) {
      const row = ordered[i];
      const n = ordered.length;
      const minMs = windowStartMs + i * 6 * 60 * 1000;
      const maxMs = windowEndMs - (n - i - 1) * 6 * 60 * 1000;
      const forcedCoverageDayOffset = Number(row?.forcedCoverageDayOffset);
      let finishedMs;
      if (Number.isFinite(forcedCoverageDayOffset)) {
        const forcedBase = startOfUtcDay(new Date());
        const forcedDate = dateAtUtcOffset(
          forcedBase,
          forcedCoverageDayOffset,
          12 + Math.floor(rng() * 4),
          5 + Math.floor(rng() * 40)
        );
        finishedMs = forcedDate.getTime();
      } else {
        const ordinalFrac = (i + 1) / (n + 1);
        const diligenceBias = clamp(
          0.22 + Number(profile.diligence || 0.5) * 0.56,
          0.1,
          0.92
        );
        const jitter = (rng() - 0.5) * 0.12;
        const frac = clamp(
          ordinalFrac * 0.55 + diligenceBias * 0.45 + jitter,
          0.04,
          0.96
        );
        finishedMs = Math.round(windowStartMs + frac * range);
      }

      finishedMs = clamp(finishedMs, minMs, maxMs);
      if (finishedMs <= lastMs) {
        finishedMs = Math.min(maxMs, lastMs + 6 * 60 * 1000);
      }
      lastMs = finishedMs;

      const durationMinutes = 3 + Math.floor(rng() * 7); // 3..9 mins
      const submitLeadSeconds = 12 + Math.floor(rng() * 45); // 12..56s
      const startedMs = finishedMs - durationMinutes * 60 * 1000;
      const submittedMs = finishedMs - submitLeadSeconds * 1000;

      assignments.push({
        attemptId: String(row.attemptId),
        startedAt: new Date(startedMs).toISOString(),
        submittedAt: new Date(submittedMs).toISOString(),
        finishedAt: new Date(finishedMs).toISOString(),
      });
    }
  }

  return assignments;
}

function buildTimelineBackfillMongoScripts({
  classId,
  scheduleRows,
  attemptTimelineRows,
}) {
  const scheduleJson = JSON.stringify(
    scheduleRows.map((s) => ({
      scheduleId: String(s.scheduleId),
      startDate: String(s.finalStartDate),
      endDate: String(s.finalEndDate),
    }))
  );
  const attemptsJson = JSON.stringify(attemptTimelineRows);

  const quizDbScript = `
const classObjId = ObjectId("${classId}");
const attempts = ${attemptsJson};
let updated = 0;
for (const row of attempts) {
  const attemptObjId = ObjectId(String(row.attemptId));
  const result = db.quizattempts.updateOne(
    { _id: attemptObjId, classId: classObjId },
    {
      $set: {
        startedAt: new Date(row.startedAt),
        submittedAt: new Date(row.submittedAt),
        finishedAt: new Date(row.finishedAt),
        updatedAt: new Date(row.finishedAt)
      }
    }
  );
  if (Number(result.modifiedCount || 0) > 0) updated += 1;
}
printjson({ attemptsPatched: updated, attemptsRequested: attempts.length });
`.trim();

  const classDbScript = `
const classIdStr = "${classId}";
const classObjId = ObjectId(classIdStr);
const plans = ${scheduleJson};
const attempts = ${attemptsJson};
const planById = {};
for (const p of plans) planById[String(p.scheduleId)] = p;

let schedulesPatched = 0;
const cls = db.classes.findOne({ _id: classObjId });
if (cls) {
  cls.schedule = (cls.schedule || []).map((item) => {
    const sid = String(item._id || "");
    const p = planById[sid];
    if (!p) return item;
    item.startDate = new Date(p.startDate);
    item.endDate = new Date(p.endDate);
    schedulesPatched += 1;
    return item;
  });
  db.classes.updateOne(
    { _id: classObjId },
    { $set: { schedule: cls.schedule, updatedAt: new Date() } }
  );
}

let classAttemptsPatched = 0;
for (const row of attempts) {
  const result = db.classattempts.updateOne(
    { classId: classIdStr, attemptId: String(row.attemptId) },
    { $set: { finishedAt: new Date(row.finishedAt), updatedAt: new Date(row.finishedAt) } }
  );
  if (Number(result.modifiedCount || 0) > 0) classAttemptsPatched += 1;
}

const timezone = String(
  (db.classes.findOne({ _id: classObjId }, { timezone: 1 }) || {}).timezone ||
    "Asia/Singapore"
);
const fmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: timezone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
function dayKey(d) {
  return fmt.format(new Date(d));
}
function dayIndex(k) {
  const [y, m, d] = String(k || "").split("-").map(Number);
  return Math.floor(Date.UTC(y, (m || 1) - 1, d || 1) / 86400000);
}
function stableNoonUTC(k) {
  const [y, m, d] = String(k || "").split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12, 0, 0));
}

const allAttempts = db.classattempts
  .find(
    { classId: classIdStr, valid: true, finishedAt: { $type: "date" } },
    { attemptId: 1, studentId: 1, finishedAt: 1 }
  )
  .toArray();

const attemptsByStudent = {};
const finishedByAttemptId = {};
for (const row of allAttempts) {
  const studentId = String(row.studentId || "");
  if (!studentId) continue;
  if (!attemptsByStudent[studentId]) attemptsByStudent[studentId] = [];
  attemptsByStudent[studentId].push(row);
  finishedByAttemptId[String(row.attemptId || "")] = row.finishedAt;
}

let statsPatched = 0;
const statRows = db.studentclassstats
  .find({ classId: classObjId }, { studentId: 1, canonicalBySchedule: 1 })
  .toArray();

for (const row of statRows) {
  const studentId = String(row.studentId || "");
  const studentAttempts = attemptsByStudent[studentId] || [];
  const daySet = {};
  for (const att of studentAttempts) {
    const k = dayKey(att.finishedAt);
    daySet[k] = true;
  }
  const dayKeys = Object.keys(daySet).sort();

  let streak = 0;
  let best = 0;
  let lastStreakDate = null;
  if (dayKeys.length > 0) {
    streak = 1;
    for (let i = dayKeys.length - 1; i > 0; i -= 1) {
      if (dayIndex(dayKeys[i]) - dayIndex(dayKeys[i - 1]) === 1) streak += 1;
      else break;
    }

    best = 1;
    let cur = 1;
    for (let i = 1; i < dayKeys.length; i += 1) {
      if (dayIndex(dayKeys[i]) - dayIndex(dayKeys[i - 1]) === 1) cur += 1;
      else {
        best = Math.max(best, cur);
        cur = 1;
      }
    }
    best = Math.max(best, cur);
    lastStreakDate = stableNoonUTC(dayKeys[dayKeys.length - 1]);
  }

  const canonical = row.canonicalBySchedule || {};
  let canonicalChanged = false;
  for (const sid of Object.keys(canonical)) {
    const block = canonical[sid] || {};
    const attemptId = String(block.attemptId || "");
    if (!attemptId) continue;
    const finishedAt = finishedByAttemptId[attemptId];
    if (!finishedAt) continue;
    block.finishedAt = new Date(finishedAt);
    canonical[sid] = block;
    canonicalChanged = true;
  }

  const setDoc = {
    attendanceDays: daySet,
    streakDays: streak,
    bestStreakDays: best,
    lastStreakDate,
    updatedAt: new Date(),
  };
  if (canonicalChanged) {
    setDoc.canonicalBySchedule = canonical;
  }

  db.studentclassstats.updateOne(
    { _id: row._id },
    { $set: setDoc, $inc: { version: 1 } }
  );
  statsPatched += 1;
}

printjson({
  schedulesPatched,
  classAttemptsPatched,
  studentStatsPatched: statsPatched
});
`.trim();

  const gameDbScript = `
const classIdStr = "${classId}";
const classObjId = ObjectId(classIdStr);
const plans = ${scheduleJson};
const attempts = ${attemptsJson};
const planById = {};
for (const p of plans) planById[String(p.scheduleId)] = p;

const state = db.gameclassstates.findOne({ classId: classIdStr });
let schedulesPatched = 0;
if (state) {
  const schedules = state.schedules || {};
  for (const sid of Object.keys(planById)) {
    const p = planById[sid];
    const prev = schedules[sid] || {};
    schedules[sid] = {
      ...prev,
      startDate: new Date(p.startDate),
      endDate: new Date(p.endDate),
    };
    schedulesPatched += 1;
  }
  db.gameclassstates.updateOne(
    { classId: classIdStr },
    { $set: { schedules, updatedAt: new Date() }, $inc: { version: 1 } }
  );
}

let gameAttemptsPatched = 0;
for (const row of attempts) {
  const result = db.gameattempts.updateOne(
    { classId: classIdStr, attemptId: String(row.attemptId) },
    { $set: { finishedAt: new Date(row.finishedAt), updatedAt: new Date(row.finishedAt) } }
  );
  if (Number(result.modifiedCount || 0) > 0) gameAttemptsPatched += 1;
}

const timezone = String((state || {}).timezone || "Asia/Singapore");
const fmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: timezone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
function dayKey(d) {
  return fmt.format(new Date(d));
}
function dayIndex(k) {
  const [y, m, d] = String(k || "").split("-").map(Number);
  return Math.floor(Date.UTC(y, (m || 1) - 1, d || 1) / 86400000);
}
function stableNoonUTC(k) {
  const [y, m, d] = String(k || "").split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12, 0, 0));
}

const allAttempts = db.gameattempts
  .find(
    { classId: classIdStr, valid: true, finishedAt: { $type: "date" } },
    { attemptId: 1, studentId: 1, finishedAt: 1 }
  )
  .toArray();
const attemptsByStudent = {};
const finishedByAttemptId = {};
for (const row of allAttempts) {
  const studentId = String(row.studentId || "");
  if (!studentId) continue;
  if (!attemptsByStudent[studentId]) attemptsByStudent[studentId] = [];
  attemptsByStudent[studentId].push(row);
  finishedByAttemptId[String(row.attemptId || "")] = row.finishedAt;
}

let statsPatched = 0;
const statRows = db.gamestudentstats
  .find({ classId: classObjId }, { studentId: 1, canonicalBySchedule: 1 })
  .toArray();

for (const row of statRows) {
  const studentId = String(row.studentId || "");
  const studentAttempts = attemptsByStudent[studentId] || [];
  const daySet = {};
  for (const att of studentAttempts) {
    const k = dayKey(att.finishedAt);
    daySet[k] = true;
  }
  const dayKeys = Object.keys(daySet).sort();

  let streak = 0;
  let best = 0;
  let lastStreakDate = null;
  if (dayKeys.length > 0) {
    streak = 1;
    for (let i = dayKeys.length - 1; i > 0; i -= 1) {
      if (dayIndex(dayKeys[i]) - dayIndex(dayKeys[i - 1]) === 1) streak += 1;
      else break;
    }

    best = 1;
    let cur = 1;
    for (let i = 1; i < dayKeys.length; i += 1) {
      if (dayIndex(dayKeys[i]) - dayIndex(dayKeys[i - 1]) === 1) cur += 1;
      else {
        best = Math.max(best, cur);
        cur = 1;
      }
    }
    best = Math.max(best, cur);
    lastStreakDate = stableNoonUTC(dayKeys[dayKeys.length - 1]);
  }

  const canonical = row.canonicalBySchedule || {};
  let canonicalChanged = false;
  for (const sid of Object.keys(canonical)) {
    const block = canonical[sid] || {};
    const attemptId = String(block.attemptId || "");
    if (!attemptId) continue;
    const finishedAt = finishedByAttemptId[attemptId];
    if (!finishedAt) continue;
    block.finishedAt = new Date(finishedAt);
    canonical[sid] = block;
    canonicalChanged = true;
  }

  const setDoc = {
    attendanceDays: daySet,
    streakDays: streak,
    bestStreakDays: best,
    lastStreakDate,
    updatedAt: new Date(),
  };
  if (canonicalChanged) {
    setDoc.canonicalBySchedule = canonical;
  }

  db.gamestudentstats.updateOne(
    { _id: row._id },
    { $set: setDoc, $inc: { version: 1 } }
  );
  statsPatched += 1;
}

printjson({
  schedulesPatched,
  gameAttemptsPatched,
  gameStudentStatsPatched: statsPatched
});
`.trim();

  return { classDbScript, quizDbScript, gameDbScript };
}

function pickOpenAnswerText(accepted = []) {
  if (!Array.isArray(accepted) || accepted.length === 0) return "I am not sure";
  const first = accepted[0] || {};
  const answerType = String(first.answerType || "").toLowerCase();

  if (answerType === "list") {
    const listItems = Array.isArray(first.listItems) ? first.listItems : [];
    if (listItems.length) return listItems.join(", ");
  }

  if (answerType === "keywords") {
    const keywords = Array.isArray(first.keywords) ? first.keywords : [];
    if (keywords.length) {
      const min = Math.max(1, Number(first.minKeywords || 1));
      return keywords.slice(0, min).join(" ");
    }
  }

  const text = String(first.text || "").trim();
  if (text) return text;
  return "I am not sure";
}

function buildAnswerPayloadFromAttempt(attemptDoc, accuracy, seed) {
  const rng = makeRng(seed);
  const answers = {};

  const snapshot = attemptDoc?.quizVersionSnapshot || {};
  const renderItems = Array.isArray(snapshot?.renderSpec?.items)
    ? snapshot.renderSpec.items
    : [];
  const gradingItems = Array.isArray(snapshot?.gradingKey?.items)
    ? snapshot.gradingKey.items
    : [];

  const renderById = new Map(renderItems.map((it) => [String(it?.id || ""), it]));
  const crosswordMap = {};

  for (const key of gradingItems) {
    const kind = String(key?.kind || "").toLowerCase();
    const itemId = String(key?.id || "");
    if (!itemId) continue;
    const shouldBeCorrect = rng() < accuracy;

    if (kind === "mc") {
      const render = renderById.get(itemId) || {};
      const optionIds = Array.isArray(render?.options)
        ? render.options.map((o) => String(o?.id || "")).filter(Boolean)
        : [];
      const correctOptionIds = Array.isArray(key?.correctOptionIds)
        ? key.correctOptionIds.map((id) => String(id))
        : [];
      const correctSet = new Set(correctOptionIds);
      const isMulti = Boolean(render?.multiSelect) || correctOptionIds.length > 1;

      let chosen = [];
      if (shouldBeCorrect && correctOptionIds.length > 0) {
        chosen = [...correctOptionIds];
      } else {
        const wrongPool = optionIds.filter((id) => !correctSet.has(id));
        if (isMulti) {
          const n = Math.max(1, Math.min(wrongPool.length || 1, 1 + Math.floor(rng() * 2)));
          const src = wrongPool.length ? wrongPool : optionIds;
          chosen = shuffle(src, rng).slice(0, n);
        } else {
          const wrong = wrongPool[0] || optionIds[0] || correctOptionIds[0] || "";
          chosen = wrong ? [wrong] : [];
        }
      }

      if (isMulti) {
        answers[itemId] = chosen;
      } else {
        answers[itemId] = chosen[0] || "";
      }
      continue;
    }

    if (kind === "open") {
      if (shouldBeCorrect) {
        answers[itemId] = pickOpenAnswerText(key?.accepted);
      } else {
        answers[itemId] = "Not sure";
      }
      continue;
    }

    if (kind === "crossword") {
      const expected = String(key?.answer || "");
      if (shouldBeCorrect && expected) {
        crosswordMap[itemId] = expected;
      } else if (expected.length > 1) {
        crosswordMap[itemId] = `${expected.slice(0, -1)}x`;
      } else {
        crosswordMap[itemId] = "x";
      }
    }
  }

  if (Object.keys(crosswordMap).length > 0) {
    answers.crossword = crosswordMap;
  }

  // Fallback when grading key is unavailable: fill render items with lightweight defaults.
  if (Object.keys(answers).length === 0) {
    for (const item of renderItems) {
      const kind = String(item?.kind || "").toLowerCase();
      const itemId = String(item?.id || "");
      if (!itemId || kind === "context") continue;

      if (kind === "mc") {
        const optionIds = Array.isArray(item?.options)
          ? item.options.map((o) => String(o?.id || "")).filter(Boolean)
          : [];
        if (!optionIds.length) continue;
        if (item?.multiSelect) {
          answers[itemId] = [optionIds[Math.floor(rng() * optionIds.length)]];
        } else {
          answers[itemId] = optionIds[Math.floor(rng() * optionIds.length)];
        }
      } else if (kind === "open") {
        answers[itemId] = "Not sure";
      } else if (kind === "crossword") {
        const map = {};
        for (const entry of item?.entries || []) {
          const entryId = String(entry?.id || "");
          if (!entryId) continue;
          map[entryId] = "x";
        }
        answers.crossword = map;
      }
    }
  }

  return answers;
}

async function simulateAttempt({
  studentToken,
  scheduleId,
  accuracy,
  seed,
}) {
  const spec = await apiRequest("/api/quiz/attempt/spec", {
    method: "POST",
    token: studentToken,
    body: { scheduleId },
  });
  const attemptsRemaining = Number(spec?.data?.attemptsRemaining ?? 0);
  if (attemptsRemaining <= 0) {
    return { skipped: true, reason: "attempts_exhausted" };
  }

  const startResp = await apiRequest("/api/quiz/attempt", {
    method: "POST",
    token: studentToken,
    body: { scheduleId },
  });
  const attemptId = String(startResp?.data?.attemptId || "");
  if (!attemptId) {
    throw new Error(`Start attempt returned no attemptId for schedule ${scheduleId}`);
  }

  const attemptDocResp = await apiRequest(`/api/quiz/attempt/${attemptId}`, {
    token: studentToken,
  });
  const attemptDoc = attemptDocResp?.data;

  const answers = buildAnswerPayloadFromAttempt(attemptDoc, accuracy, seed);

  await apiRequest(`/api/quiz/attempt/${attemptId}/answers`, {
    method: "PATCH",
    token: studentToken,
    body: { answers },
  });

  const finish = await apiRequest(`/api/quiz/attempt/${attemptId}/finish`, {
    method: "POST",
    token: studentToken,
  });

  return {
    skipped: false,
    attemptId,
    score: Number(finish?.data?.score ?? 0),
    maxScore: Number(finish?.data?.maxScore ?? 0),
  };
}

function buildClassResetMongoScripts({ classId, scheduleIds }) {
  const scheduleIdsJson = JSON.stringify(scheduleIds || []);

  const classDbScript = `
const classIdStr = "${classId}";
const classId = ObjectId(classIdStr);
const now = new Date();
const out = {};
out.classUpdated = db.classes.updateOne(
  { _id: classId },
  { $set: { schedule: [], updatedAt: now } }
);
out.classAttemptsDeleted = db.classattempts.deleteMany({ classId: classIdStr });
out.scheduleStatsDeleted = db.schedulestats.deleteMany({ classId: classId });
out.studentStatsReset = db.studentclassstats.updateMany(
  { classId: classId },
  {
    $set: {
      sumScore: 0,
      sumMax: 0,
      participationCount: 0,
      streakDays: 0,
      bestStreakDays: 0,
      lastStreakDate: null,
      overallScore: 0,
      canonicalBySchedule: {},
      attendanceDays: {},
      bySubject: {},
      byTopic: {},
      updatedAt: now
    },
    $inc: { version: 1 }
  }
);
printjson(out);
`.trim();

  const quizDbScript = `
const classId = ObjectId("${classId}");
const scheduleIds = ${scheduleIdsJson}.map((id) => ObjectId(id));
const out = {};
out.quizAttemptsDeleted = db.quizattempts.deleteMany({ classId: classId });
out.scheduleVariantsDeleted = scheduleIds.length
  ? db.schedulequizvariants.deleteMany({ scheduleId: { $in: scheduleIds } })
  : { acknowledged: true, deletedCount: 0 };
printjson(out);
`.trim();

  const gameDbScript = `
const classIdStr = "${classId}";
const classObjId = ObjectId(classIdStr);
const now = new Date();
const out = {};
out.gameAttemptsDeleted = db.gameattempts.deleteMany({ classId: classIdStr });
out.gameAttemptOutcomesDeleted = db.gameattemptoutcomes.deleteMany({ classId: classIdStr });
out.gameRewardGrantsDeleted = db.gamerewardgrants.deleteMany({ classId: classIdStr });
out.gameNotificationsDeleted = db.gamestudentnotifications.deleteMany({ classId: classIdStr });
out.gameBadgePeriodAwardsDeleted = db.gamebadgeperiodawards.deleteMany({ classId: classIdStr });
out.gameStudentStatsReset = db.gamestudentstats.updateMany(
  { classId: classObjId },
  {
    $set: {
      overallScore: 0,
      streakDays: 0,
      bestStreakDays: 0,
      lastStreakDate: null,
      attendanceDays: {},
      canonicalBySchedule: {},
      updatedAt: now
    },
    $inc: { version: 1 }
  }
);
out.gameClassStateSchedulesReset = db.gameclassstates.updateOne(
  { classId: classIdStr },
  { $set: { schedules: {}, updatedAt: now }, $inc: { version: 1 } }
);
out.gameInventoryBadgesReset = db.gamestudentinventories.updateMany(
  { classId: classIdStr },
  {
    $set: {
      ownedBadgeIds: [],
      displayBadgeIds: [],
      scoreThresholdProgress: null,
      updatedAt: now
    }
  }
);
printjson(out);
`.trim();

  return { classDbScript, quizDbScript, gameDbScript };
}

async function main() {
  log("init", `Base URL: ${CONFIG.baseUrl}`);
  log("init", `Target class: ${CONFIG.className}`);
  if (CONFIG.dryRun) {
    log("init", "DRY_RUN=true (no write operations will be executed).");
  }

  const teacherToken = await teacherSignIn();
  log("auth", "Teacher authentication successful.");

  const classesResp = await apiRequest("/api/class/classes/my", {
    token: teacherToken,
  });
  const classRows = Array.isArray(classesResp?.data) ? classesResp.data : [];
  const targetClass = pickClassByName(classRows, CONFIG.className);
  if (!targetClass?._id) {
    const names = classRows.map((c) => String(c?.name || "")).join(", ");
    throw new Error(
      `Class "${CONFIG.className}" not found under this teacher account. Available: ${names || "(none)"}`
    );
  }
  const classId = String(targetClass._id);
  log("class", `Resolved class "${targetClass.name}" (${classId}).`);

  const classDetailResp = await apiRequest(`/api/class/classes/${classId}`, {
    token: teacherToken,
  });
  const classDetail = classDetailResp?.data || {};
  const classStudents = Array.isArray(classDetail?.students) ? classDetail.students : [];
  const existingSchedule = Array.isArray(classDetail?.schedule) ? classDetail.schedule : [];
  const oldScheduleIds = existingSchedule
    .map((s) => String(s?._id || ""))
    .filter(Boolean);
  const existingScheduleQuizCandidates = uniqueByRoot(
    existingSchedule
      .map((s) => ({
        _id: String(s?.quizId || ""),
        rootQuizId: String(s?.quizRootId || ""),
        version: Number(s?.quizVersion || 1),
        quizType: String(s?.quizType || "unknown"),
        name: String(s?.quizName || "Scheduled Quiz"),
        createdAt: s?.startDate || s?.updatedAt || s?.createdAt || new Date().toISOString(),
      }))
      .filter((q) => q._id && q.rootQuizId && Number.isFinite(q.version))
  );

  if (!classStudents.length) {
    throw new Error("Target class has no students; cannot seed attempts.");
  }

  log(
    "class",
    `Found ${classStudents.length} students and ${oldScheduleIds.length} existing schedule item(s).`
  );

  if (!CONFIG.dryRun) {
    const { classDbScript, quizDbScript, gameDbScript } =
      buildClassResetMongoScripts({
        classId,
        scheduleIds: oldScheduleIds,
      });
    log("reset", "Resetting class-service projections + schedule in Mongo...");
    runMongoEval({
      serviceName: "mongo-class",
      dbName: "class",
      code: classDbScript,
    });
    log("reset", "Resetting quiz-service attempts in Mongo...");
    runMongoEval({
      serviceName: "mongo-quiz",
      dbName: "quiz",
      code: quizDbScript,
    });
    log("reset", "Resetting game-service projections/rewards in Mongo...");
    runMongoEval({
      serviceName: "mongo-game",
      dbName: "game",
      code: gameDbScript,
    });
    log("reset", "Hard reset complete.");
  }

  const studentListResp = await apiRequest("/api/user/student/users/me", {
    token: teacherToken,
  });
  const allTeacherStudents = Array.isArray(studentListResp?.data)
    ? studentListResp.data
    : [];
  const studentById = new Map(
    allTeacherStudents.map((s) => [String(s?.id || ""), s])
  );

  const classStudentUsers = classStudents.map((s) => {
    const userId = String(s?.userId || "");
    const user = studentById.get(userId);
    return {
      userId,
      displayName: String(s?.displayName || user?.name || userId),
      username: String(user?.username || ""),
      email: user?.email ?? null,
    };
  });

  const unresolved = classStudentUsers.filter((s) => !s.username);
  if (unresolved.length) {
    throw new Error(
      `Unable to resolve username for ${unresolved.length} class student(s): ${unresolved
        .map((s) => s.userId)
        .join(", ")}`
    );
  }

  log(
    "students",
    `Resetting passwords + creating active student sessions for ${classStudentUsers.length} students.`
  );

  const studentSessions = [];
  for (const student of classStudentUsers) {
    if (!CONFIG.dryRun) {
      const resetResp = await apiRequest(
        `/api/user/student/users/${student.userId}/reset-password`,
        {
          method: "POST",
          token: teacherToken,
        }
      );
      const tempPassword = String(resetResp?.data?.temporaryPassword || "");
      if (!tempPassword) {
        throw new Error(`Password reset returned no temp password for ${student.username}`);
      }

      const tempSignIn = await apiRequest("/api/user/student/auth/sign-in", {
        method: "POST",
        body: {
          username: student.username,
          password: tempPassword,
        },
      });
      const tempToken = String(tempSignIn?.data?.accessToken || "");
      if (!tempToken) {
        throw new Error(`Unable to sign in with temporary password for ${student.username}`);
      }

      await apiRequest("/api/user/student/auth/change-password", {
        method: "POST",
        token: tempToken,
        body: {
          currentPassword: tempPassword,
          newPassword: CONFIG.demoStudentPassword,
        },
      });

      const finalSignIn = await apiRequest("/api/user/student/auth/sign-in", {
        method: "POST",
        body: {
          username: student.username,
          password: CONFIG.demoStudentPassword,
        },
      });
      const finalToken = String(finalSignIn?.data?.accessToken || "");
      if (!finalToken) {
        throw new Error(`Unable to sign in after password change for ${student.username}`);
      }
      studentSessions.push({
        ...student,
        token: finalToken,
      });
    } else {
      studentSessions.push({ ...student, token: "<dry-run-token>" });
    }
  }

  log(
    "students",
    `Student credentials reset complete. Demo password: "${CONFIG.demoStudentPassword}"`
  );

  const allQuizRows = await fetchAllQuizRows(teacherToken);
  const teacherUserId = extractUserIdFromJwt(teacherToken);
  const mongoQuizRows = fetchQuizRowsFromMongo(teacherUserId);
  let selectedQuizzes = selectQuizzesForSchedules(
    allQuizRows,
    CONFIG.maxSchedules,
    CONFIG.quizTypesFilter
  );

  if (!selectedQuizzes.length) {
    log(
      "schedule",
      "No quizzes returned from /api/quiz for this teacher."
    );
  }

  if (
    selectedQuizzes.length < CONFIG.maxSchedules &&
    existingScheduleQuizCandidates.length
  ) {
    const fromExisting = selectQuizzesForSchedules(
      existingScheduleQuizCandidates,
      CONFIG.maxSchedules,
      CONFIG.quizTypesFilter
    );
    selectedQuizzes = appendUniqueQuizFamilies(
      selectedQuizzes,
      fromExisting,
      CONFIG.maxSchedules
    );
    log(
      "schedule",
      `Augmented selection with existing class schedule quiz families (${fromExisting.length} candidate families).`
    );
  }

  if (selectedQuizzes.length < CONFIG.maxSchedules && mongoQuizRows.length) {
    const fromMongo = selectQuizzesForSchedules(
      mongoQuizRows,
      CONFIG.maxSchedules,
      CONFIG.quizTypesFilter
    );
    selectedQuizzes = appendUniqueQuizFamilies(
      selectedQuizzes,
      fromMongo,
      CONFIG.maxSchedules
    );
    log(
      "schedule",
      `Augmented selection with quiz DB rows for owner ${teacherUserId} (${fromMongo.length} candidate families).`
    );
  }

  if (!selectedQuizzes.length && mongoQuizRows.length) {
    selectedQuizzes = selectQuizzesForSchedules(
      mongoQuizRows,
      CONFIG.maxSchedules,
      CONFIG.quizTypesFilter
    );
    log(
      "schedule",
      `Fallback to quiz DB rows for owner ${teacherUserId} (${mongoQuizRows.length} rows).`
    );
  }

  if (!selectedQuizzes.length && existingScheduleQuizCandidates.length) {
    selectedQuizzes = selectQuizzesForSchedules(
      existingScheduleQuizCandidates,
      CONFIG.maxSchedules,
      CONFIG.quizTypesFilter
    );
    log(
      "schedule",
      "Final fallback to existing class schedule quiz selectors."
    );
  }

  if (selectedQuizzes.length > CONFIG.maxSchedules) {
    selectedQuizzes = selectedQuizzes.slice(0, CONFIG.maxSchedules);
  }

  if (!selectedQuizzes.length) {
    throw new Error("No quizzes found to schedule. Create quizzes first.");
  }

  log(
    "schedule",
    `Selected ${selectedQuizzes.length} quiz families for scheduling.`
  );

  const createdSchedules = [];
  const contributionSeed = [280, 320, 360, 420, 480, 540, 600, 680, 760, 840];
  const now = Date.now();
  const temporaryScheduleStart = new Date(
    now - 10 * 60 * 1000
  ).toISOString();
  const temporaryScheduleEnd = new Date(
    now + 3 * 24 * 60 * 60 * 1000
  ).toISOString();

  for (let i = 0; i < selectedQuizzes.length; i += 1) {
    const q = selectedQuizzes[i];
    const attemptsAllowed = i % 3 === 0 ? 3 : 2;
    const contribution = contributionSeed[i % contributionSeed.length];

    const body = {
      quizId: String(q?._id || ""),
      quizRootId: String(q?.rootQuizId || ""),
      quizVersion: Number(q?.version || 1),
      startDate: temporaryScheduleStart,
      endDate: temporaryScheduleEnd,
      contribution,
      attemptsAllowed,
      showAnswersAfterAttempt: true,
    };

    if (!CONFIG.dryRun) {
      const created = await apiRequest(`/api/class/classes/${classId}/schedule`, {
        method: "POST",
        token: teacherToken,
        body,
      });
      const row = created?.data || {};
      createdSchedules.push({
        scheduleId: String(row?._id || ""),
        quizType: String(row?.quizType || q?.quizType || "unknown"),
        quizName: String(row?.quizName || q?.name || "Unnamed Quiz"),
        attemptsAllowed,
        contribution,
      });
    } else {
      createdSchedules.push({
        scheduleId: `dry-schedule-${i + 1}`,
        quizType: String(q?.quizType || "unknown"),
        quizName: String(q?.name || "Unnamed Quiz"),
        attemptsAllowed,
        contribution,
      });
    }
  }

  log("schedule", `Created ${createdSchedules.length} schedule item(s).`);
  const timelineSchedules = applyTimelineToSchedules(createdSchedules);
  const timelineCounts = timelineSchedules.reduce(
    (acc, row) => {
      const key = String(row.timelineStatus || "current");
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    },
    { past: 0, current: 0, future: 0 }
  );
  log(
    "schedule",
    `Timeline assigned: past=${timelineCounts.past}, current=${timelineCounts.current}, future=${timelineCounts.future}`
  );
  const coverageSchedules = timelineSchedules.filter(
    (s) =>
      s.coverageDayOffset !== null &&
      s.coverageDayOffset !== undefined &&
      Number.isFinite(Number(s.coverageDayOffset))
  );
  if (coverageSchedules.length) {
    const coverageDays = coverageSchedules
      .map((s) => Number(s.coverageDayOffset))
      .sort((a, b) => a - b)
      .join(", ");
    log(
      "schedule",
      `Daily coverage slots (day offsets): ${coverageDays}`
    );
  }

  if (CONFIG.sleepAfterScheduleMs > 0 && !CONFIG.dryRun) {
    log(
      "schedule",
      `Waiting ${CONFIG.sleepAfterScheduleMs}ms for schedule lifecycle propagation...`
    );
    await sleep(CONFIG.sleepAfterScheduleMs);
  }

  let attemptsFinished = 0;
  let attemptsSkipped = 0;
  const attemptRows = [];
  const studentProfiles = new Map();
  const attemptableSchedules = timelineSchedules.filter(
    (s) => s.timelineStatus !== "future"
  );
  const pastSchedules = attemptableSchedules.filter(
    (s) => s.timelineStatus === "past"
  );
  const currentSchedules = attemptableSchedules.filter(
    (s) => s.timelineStatus === "current"
  );
  const fullStreakStudentId = String(studentSessions[0]?.userId || "");
  const nearStreakStudentId = String(studentSessions[1]?.userId || "");
  const nearStreakMinDayOffset = -5;
  const coverageByScheduleId = new Map(
    coverageSchedules.map((s) => [String(s.scheduleId), s])
  );

  for (let sIdx = 0; sIdx < studentSessions.length; sIdx += 1) {
    const student = studentSessions[sIdx];
    const studentRng = makeRng(`student:${student.userId}`);
    const skill =
      studentSessions.length === 1
        ? 0.75
        : 0.95 - (sIdx * 0.6) / Math.max(1, studentSessions.length - 1);
    const participationProb = clamp(0.55 + skill * 0.35, 0.45, 0.96);
    const diligence = clamp(0.3 + skill * 0.7, 0.2, 0.98);
    studentProfiles.set(student.userId, { skill, diligence });
    const mustDoCurrent = sIdx < Math.min(2, studentSessions.length);

    const orderedSchedules = shuffle(
      attemptableSchedules,
      makeRng(`schedule-order:${student.userId}`)
    );

    for (const sch of orderedSchedules) {
      const hasCoverageDay =
        sch.coverageDayOffset !== null && sch.coverageDayOffset !== undefined;
      const coverageDayOffset = hasCoverageDay
        ? Number(sch.coverageDayOffset)
        : NaN;
      const isCoverage = hasCoverageDay && Number.isFinite(coverageDayOffset);
      if (student.userId === fullStreakStudentId && !isCoverage) {
        // Keep the top streak student bounded to the 8-day coverage lane.
        continue;
      }
      const forceCoverage =
        (student.userId === fullStreakStudentId && isCoverage) ||
        (student.userId === nearStreakStudentId &&
          isCoverage &&
          coverageDayOffset >= nearStreakMinDayOffset);
      const forceCurrent = mustDoCurrent && sch.timelineStatus === "current";
      if (!forceCoverage && !forceCurrent && studentRng() > participationProb) {
        continue;
      }

      const attemptsToMake = forceCoverage
        ? 1
        : sch.attemptsAllowed >= 2 && studentRng() < (sch.timelineStatus === "past" ? 0.34 : 0.18)
          ? 2
          : 1;

      for (let a = 0; a < attemptsToMake; a += 1) {
        const accuracy = clamp(skill + a * 0.1 + (studentRng() - 0.5) * 0.2, 0.1, 0.98);

        if (CONFIG.dryRun) {
          attemptsFinished += 1;
          attemptRows.push({
            attemptId: `dry-attempt-${student.userId}-${sch.scheduleId}-${a + 1}`,
            studentId: student.userId,
            scheduleId: sch.scheduleId,
            attemptOrdinal: a + 1,
            forcedCoverageDayOffset: forceCoverage ? coverageDayOffset : undefined,
          });
          continue;
        }

        try {
          const result = await simulateAttempt({
            studentToken: student.token,
            scheduleId: sch.scheduleId,
            accuracy,
            seed: `${student.userId}:${sch.scheduleId}:attempt:${a + 1}`,
          });
          if (result.skipped) {
            attemptsSkipped += 1;
            break;
          }
          attemptsFinished += 1;
          attemptRows.push({
            attemptId: result.attemptId,
            studentId: student.userId,
            scheduleId: sch.scheduleId,
            attemptOrdinal: a + 1,
            forcedCoverageDayOffset: forceCoverage ? coverageDayOffset : undefined,
          });
        } catch (err) {
          attemptsSkipped += 1;
          const msg = err instanceof Error ? err.message : String(err);
          log(
            "attempt",
            `Skip attempt for ${student.username} on ${sch.quizName}: ${msg}`
          );
          break;
        }
      }
    }
  }

  if (!CONFIG.dryRun && fullStreakStudentId && coverageSchedules.length > 0) {
    const fullStreakStudent = studentSessions.find(
      (s) => String(s.userId) === fullStreakStudentId
    );
    if (fullStreakStudent) {
      const attemptedCoverageScheduleIds = new Set(
        attemptRows
          .filter((r) => String(r.studentId) === fullStreakStudentId)
          .map((r) => String(r.scheduleId))
      );

      let injectedCoverageAttempts = 0;
      for (const sch of coverageSchedules) {
        if (attemptedCoverageScheduleIds.has(String(sch.scheduleId))) continue;
        try {
          const result = await simulateAttempt({
            studentToken: fullStreakStudent.token,
            scheduleId: sch.scheduleId,
            accuracy: 0.86,
            seed: `forced-coverage:${fullStreakStudent.userId}:${sch.scheduleId}`,
          });
          if (result.skipped) continue;
          attemptsFinished += 1;
          injectedCoverageAttempts += 1;
          attemptRows.push({
            attemptId: result.attemptId,
            studentId: fullStreakStudent.userId,
            scheduleId: sch.scheduleId,
            attemptOrdinal: 1,
            forcedCoverageDayOffset: Number(sch.coverageDayOffset),
          });
        } catch (err) {
          attemptsSkipped += 1;
          const msg = err instanceof Error ? err.message : String(err);
          log(
            "attempt",
            `Unable to enforce full streak attempt on ${sch.quizName}: ${msg}`
          );
        }
      }
      if (injectedCoverageAttempts > 0) {
        log(
          "attempt",
          `Injected ${injectedCoverageAttempts} coverage attempt(s) to secure long streak realism.`
        );
      }
    }
  }

  if (!CONFIG.dryRun && attemptRows.length > 0) {
    const bySchedule = new Map();
    for (const row of attemptRows) {
      bySchedule.set(
        row.scheduleId,
        (bySchedule.get(row.scheduleId) || 0) + 1
      );
    }

    const noPastAttempt = pastSchedules.every(
      (s) => !Number(bySchedule.get(s.scheduleId) || 0)
    );
    if (noPastAttempt && pastSchedules.length > 0 && studentSessions.length > 0) {
      const firstStudent = studentSessions[0];
      const firstPast = pastSchedules[0];
      try {
        const result = await simulateAttempt({
          studentToken: firstStudent.token,
          scheduleId: firstPast.scheduleId,
          accuracy: 0.78,
          seed: `forced:${firstStudent.userId}:${firstPast.scheduleId}`,
        });
        if (!result.skipped) {
          attemptRows.push({
            attemptId: result.attemptId,
            studentId: firstStudent.userId,
            scheduleId: firstPast.scheduleId,
            attemptOrdinal: 1,
            forcedCoverageDayOffset: (() => {
              const v = coverageByScheduleId.get(String(firstPast.scheduleId))
                ?.coverageDayOffset;
              return v === null || v === undefined ? undefined : Number(v);
            })(),
          });
          attemptsFinished += 1;
          log("attempt", "Injected one guaranteed past attempt for realism.");
        }
      } catch (err) {
        attemptsSkipped += 1;
        const msg = err instanceof Error ? err.message : String(err);
        log("attempt", `Unable to inject guaranteed past attempt: ${msg}`);
      }
    }

    const noCurrentAttempt = currentSchedules.every(
      (s) => !Number(bySchedule.get(s.scheduleId) || 0)
    );
    if (noCurrentAttempt && currentSchedules.length > 0 && studentSessions.length > 0) {
      const firstStudent = studentSessions[0];
      const firstCurrent = currentSchedules[0];
      try {
        const result = await simulateAttempt({
          studentToken: firstStudent.token,
          scheduleId: firstCurrent.scheduleId,
          accuracy: 0.8,
          seed: `forced-current:${firstStudent.userId}:${firstCurrent.scheduleId}`,
        });
        if (!result.skipped) {
          attemptRows.push({
            attemptId: result.attemptId,
            studentId: firstStudent.userId,
            scheduleId: firstCurrent.scheduleId,
            attemptOrdinal: 1,
            forcedCoverageDayOffset: (() => {
              const v = coverageByScheduleId.get(String(firstCurrent.scheduleId))
                ?.coverageDayOffset;
              return v === null || v === undefined ? undefined : Number(v);
            })(),
          });
          attemptsFinished += 1;
          log("attempt", "Injected one guaranteed current attempt for realism.");
        }
      } catch (err) {
        attemptsSkipped += 1;
        const msg = err instanceof Error ? err.message : String(err);
        log("attempt", `Unable to inject guaranteed current attempt: ${msg}`);
      }
    }
  }

  const scheduleById = new Map(
    timelineSchedules.map((s) => [String(s.scheduleId), s])
  );
  const attemptsByTimeline = { past: 0, current: 0, future: 0 };
  for (const row of attemptRows) {
    const schedule = scheduleById.get(String(row.scheduleId));
    const key = String(schedule?.timelineStatus || "current");
    attemptsByTimeline[key] = (attemptsByTimeline[key] || 0) + 1;
  }

  log(
    "attempt",
    `Attempt simulation done. finished=${attemptsFinished}, skipped=${attemptsSkipped}, past=${attemptsByTimeline.past || 0}, current=${attemptsByTimeline.current || 0}`
  );

  if (CONFIG.sleepAfterAttemptsMs > 0 && !CONFIG.dryRun) {
    log(
      "attempt",
      `Waiting ${CONFIG.sleepAfterAttemptsMs}ms for attempt/event projection propagation...`
    );
    await sleep(CONFIG.sleepAfterAttemptsMs);
  }

  if (!CONFIG.dryRun) {
    const attemptTimelineRows = buildAttemptTimelineAssignments({
      attemptRows,
      scheduleRows: timelineSchedules,
      studentProfiles,
    });
    log(
      "timeline",
      `Applying final timeline for ${timelineSchedules.length} schedules and ${attemptTimelineRows.length} attempts...`
    );
    const { classDbScript, quizDbScript, gameDbScript } =
      buildTimelineBackfillMongoScripts({
        classId,
        scheduleRows: timelineSchedules,
        attemptTimelineRows,
      });
    runMongoEval({
      serviceName: "mongo-class",
      dbName: "class",
      code: classDbScript,
    });
    runMongoEval({
      serviceName: "mongo-quiz",
      dbName: "quiz",
      code: quizDbScript,
    });
    runMongoEval({
      serviceName: "mongo-game",
      dbName: "game",
      code: gameDbScript,
    });
    log("timeline", "Timeline backfill complete.");
  }

  let leaderboard = [];
  let classStats = null;

  if (!CONFIG.dryRun) {
    const leaderboardResp = await apiRequest(
      `/api/game/classes/${classId}/leaderboard?period=overall`,
      { token: teacherToken }
    );
    leaderboard = Array.isArray(leaderboardResp?.data) ? leaderboardResp.data : [];

    const statsResp = await apiRequest(`/api/class/classes/${classId}/stats`, {
      token: teacherToken,
    });
    classStats = statsResp?.data || null;
  }

  log("done", "Seeding completed.");
  log("done", `Class: ${CONFIG.className} (${classId})`);
  log("done", `Schedules created: ${createdSchedules.length}`);
  log("done", `Attempts finalized: ${attemptsFinished}`);
  log("done", `Demo student password: ${CONFIG.demoStudentPassword}`);

  const credentialRows = studentSessions.map((s) => ({
    username: s.username,
    displayName: s.displayName,
    password: CONFIG.demoStudentPassword,
  }));
  console.log("\nDemo Student Credentials:");
  for (const row of credentialRows) {
    console.log(`- ${row.username} (${row.displayName}) -> ${row.password}`);
  }

  if (!CONFIG.dryRun) {
    console.log("\nTop Leaderboard (Overall):");
    const top = leaderboard.slice(0, 5);
    for (const r of top) {
      console.log(
        `- #${r.rank} ${r.displayName || r.userId}: score=${Math.round(
          Number(r.overallScore || 0)
        )}, streak=${Number(r.currentStreak || 0)}, participation=${Number(
          r.participationCount || 0
        )}`
      );
    }

    if (classStats) {
      const headcountPct = Number(
        classStats?.overallParticipation?.headcountPct ?? 0
      ).toFixed(2);
      const avgStudentPct = Number(
        classStats?.overallParticipation?.avgStudentPct ?? 0
      ).toFixed(2);
      const weightedAvgPct = Number(
        classStats?.overallGrades?.weightedAvgPct ?? 0
      ).toFixed(2);
      const avgStudentAvgScorePct = Number(
        classStats?.overallGrades?.avgStudentAvgScorePct ?? 0
      ).toFixed(2);
      console.log(
        `\nClass Stats Snapshot: headcountPct=${headcountPct}, avgStudentPct=${avgStudentPct}, weightedAvgPct=${weightedAvgPct}, avgStudentAvgScorePct=${avgStudentAvgScorePct}`
      );
    }
  }
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`\n[seed-4A] FAILED: ${msg}`);
  process.exit(1);
});
