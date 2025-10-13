import bcrypt from "bcrypt";
import { Response } from "express";
import { CustomRequest } from "../middleware/access-control";
import { isValidEmail, validateStudentUserData } from "../utils/validators";
import {
  StudentModel,
  formatStudentResponse,
} from "../model/student-user-model";
import mongoose from "mongoose";
import { generateTempPassword } from "../utils/student-user-utils";

/**
 * @route   POST /student/users/create
 * @auth    verifyTeacherAccessToken (teacher or admin)
 * @input   Body: { name: string, username: string, email?: string }
 * @notes   - Only teachers/admins can create student accounts.
 *          - Username must be unique.
 *          - Generates a temporary password and sets mustChangePassword=true.
 *          - Password is hashed (bcrypt) before storage.
 *          - (Optional) place to trigger email with credentials.
 * @logic   1) AuthZ: ensure teacher/admin
 *          2) Validate required fields + email shape (if provided)
 *          3) Enforce username uniqueness
 *          4) Create student with temp password (hashed)
 *          5) Return formatted student + temporaryPassword
 * @returns 201 { message, data: { _id, name, username, email?, isDisabled, mustChangePassword, ... , temporaryPassword } }
 * @errors  400 missing/invalid fields
 *          403 forbidden (not teacher/admin)
 *          409 username already exists
 *          500 internal server error
 */

export async function createStudent(req: CustomRequest, res: Response) {
  if (req.user?.role !== "teacher" && !req.user?.isAdmin)
    return res.status(403).json({ message: "Forbidden" });

  const teacherId = req.user.id;
  const { name, username, email } = req.body ?? {};

  if (!name || !username)
    return res.status(400).json({ message: "Missing name/username" });
  if (email && !isValidEmail(email))
    return res.status(400).json({ message: "Invalid email" });

  const exists = await StudentModel.findOne({ username });
  if (exists)
    return res.status(409).json({ message: "Username already exists" });

  const temp = generateTempPassword();
  const hashed = bcrypt.hashSync(temp, bcrypt.genSaltSync(10));

  const student = await StudentModel.create({
    name,
    username,
    email,
    teacherId,
    password: hashed,
    mustChangePassword: true,
  });

  // TODO: mail the student here using mail utils.
  // await sendStudentCredentials(email, name, username, temp)

  return res.status(201).json({
    message: "Student created",
    data: { ...formatStudentResponse(student), temporaryPassword: temp },
  });
}

/**
 * @route   GET /student/users/me
 * @auth    verifyTeacherAccessToken (teacher or admin)
 * @input   None
 * @notes   - Lists students owned by the authenticated teacher (or the caller if admin).
 *          - Sorted by newest first.
 * @logic   1) AuthZ: ensure teacher/admin
 *          2) Query students where teacherId == req.user.id
 *          3) Return formatted list
 * @returns 200 { message, data: Array<FormattedStudent> }
 * @errors  403 forbidden (not teacher/admin)
 *          500 internal server error
 */

export async function listMyStudents(req: CustomRequest, res: Response) {
  if (req.user?.role !== "teacher" && !req.user?.isAdmin)
    return res.status(403).json({ message: "Forbidden" });

  const students = await StudentModel.find({ teacherId: req.user.id }).sort({
    createdAt: -1,
  });
  return res.status(200).json({
    message: "Found students",
    data: students.map(formatStudentResponse),
  });
}

/**
 * @route   POST /student/users/:studentId/reset-password
 * @auth    verifyTeacherAccessToken (teacher or admin)
 * @input   Params: { studentId }
 * @notes   - Teacher can reset only their own students; admin can reset any (route middleware limits to teacher/admin; controller narrows to teacher’s own).
 *          - Generates a new temporary password and forces password change on next login.
 * @logic   1) AuthZ: ensure teacher/admin
 *          2) Load student by { _id, teacherId } (unless admin)
 *          3) Generate temp password; hash; set mustChangePassword=true
 *          4) Save and return username + temporaryPassword
 * @returns 200 { message, data: { username, temporaryPassword } }
 * @errors  403 forbidden
 *          404 student not found (or not owned by teacher)
 *          500 internal server error
 */
export async function teacherResetStudentPassword(
  req: CustomRequest,
  res: Response
) {
  if (req.user?.role !== "teacher" && !req.user?.isAdmin)
    return res.status(403).json({ message: "Forbidden" });

  const { studentId } = req.params;
  const student = await StudentModel.findOne({
    _id: studentId,
    teacherId: req.user.id,
  }).select("+password");
  if (!student) return res.status(404).json({ message: "Student not found" });

  const temp = generateTempPassword();
  student.password = bcrypt.hashSync(temp, bcrypt.genSaltSync(10));
  student.mustChangePassword = true;
  student.lastPasswordResetAt = new Date();
  await student.save();

  return res.status(200).json({
    message: "Temporary password generated",
    data: { username: student.username, temporaryPassword: temp },
  });
}

/**
 * @route   POST /student/users/bulk-create
 * @auth    verifyTeacherAccessToken (teacher or admin)
 * @input   Query: includePasswords?=true|false
 *          Body:  { students: Array<{ name: string, username: string, email?: string }> }
 * @notes   - Validates each row (name/username required; email optional/validated).
 *          - Rejects payload with per-row error reporting on 400.
 *          - Limits batch size to MAX_BATCH.
 *          - Checks for duplicate usernames (payload + DB) before insert.
 *          - All-or-nothing insert inside a MongoDB transaction.
 *          - Optionally includes temporary passwords in the response (includePasswords=true).
 * @logic   1) AuthZ + validate payload size
 *          2) Per-row normalize + validate; detect intra-payload dupes
 *          3) Check DB for existing usernames → 409 with aligned errors
 *          4) Generate temp passwords + hash; build docs
 *          5) Transactional insertMany
 *          6) Re-fetch created docs; respond aligned to input order
 * @returns 201 { ok, message, data: [{ name, userId, username, email?, temporaryPassword? }, ...] }
 * @errors  400 validation failed (row-aligned errors)
 *          403 forbidden
 *          409 username conflicts (pre-check) or (race) on insert
 *          413 payload too large
 *          500 internal error
 */

export async function bulkCreateStudentsHandler(req: any, res: Response) {
  const MAX_BATCH = 100;
  console.log("[STUDENT-USER] Bulk create students request");
  const role: "teacher" | "admin" | undefined = req.user?.role;
  if (role !== "teacher" && role !== "admin") {
    return res.status(403).json({ ok: false, message: "Forbidden" });
  }
  const teacherId = req.user.id;

  const includePasswords =
    String(req.query?.includePasswords || "").toLowerCase() === "true";

  const students = (req.body?.students ?? []) as Array<{
    name: string;
    username: string;
    email?: string;
  }>;

  if (!Array.isArray(students) || students.length === 0) {
    return res.status(400).json({
      ok: false,
      message: "Class must have at least one student",
    });
  }
  if (students.length > MAX_BATCH) {
    return res
      .status(413)
      .json({ ok: false, message: `Class too large (max: ${MAX_BATCH})` });
  }

  // Prepare aligned per-item error array
  const itemErrors: (
    | { _error?: string; name?: string; username?: string; email?: string }
    | undefined
  )[] = new Array(students.length).fill(undefined);

  // Normalize + validate
  const normalized = students.map((s, idx) => {
    const name = String(s?.name ?? "").trim();
    const username = String(s?.username ?? "").trim();
    const email = s?.email ? String(s.email).trim().toLowerCase() : "";

    const fe = validateStudentUserData({ name, username, email });
    const e: {
      _error?: string;
      name?: string;
      username?: string;
      email?: string;
    } = {};
    if (fe.name.length) e.name = fe.name[0];
    if (fe.username.length) e.username = fe.username[0];
    if (fe.email.length) e.email = fe.email[0];
    if (e.name || e.username || e.email) {
      e._error = "Invalid student data";
      itemErrors[idx] = e;
    }
    return { name, username, email: email || undefined };
  });

  // Duplicate usernames within payload
  const seen = new Set<string>();
  normalized.forEach((s, idx) => {
    if (!s.username) return;
    const key = s.username.toLowerCase();
    if (seen.has(key)) {
      const cur = itemErrors[idx] ?? {};
      (cur as any).username ??= "Duplicate username in input";
      (cur as any)._error ??= "Duplicate username in input";
      itemErrors[idx] = cur as any;
    } else {
      seen.add(key);
    }
  });

  if (itemErrors.some(Boolean)) {
    return res.status(400).json({
      ok: false,
      message: "Validation failed",
      errors: { students: itemErrors },
    });
  }

  // Pre-check DB for existing usernames (still racey without txn, but helps UX)
  const usernames = normalized.map((s) => s.username);
  const existing = await StudentModel.find({ username: { $in: usernames } })
    .select("username")
    .lean();

  if (existing.length > 0) {
    const taken = new Set(
      existing.map((x: any) => String(x.username).toLowerCase())
    );
    normalized.forEach((s, idx) => {
      if (taken.has(s.username.toLowerCase())) {
        const cur = itemErrors[idx] ?? {};
        (cur as any).username = "Username already exists";
        (cur as any)._error = "Username already exists";
        itemErrors[idx] = cur as any;
      }
    });
    return res.status(409).json({
      ok: false,
      message: "Username conflicts",
      errors: { students: itemErrors },
    });
  }

  // Build docs for insert
  const tempPasswords: string[] = [];
  const docs = normalized.map((s) => {
    const temp = generateTempPassword();
    tempPasswords.push(temp);
    const hashed = bcrypt.hashSync(temp, bcrypt.genSaltSync(10));
    return {
      name: s.name,
      username: s.username,
      email: s.email,
      teacherId,
      password: hashed,
      mustChangePassword: true,
      isDisabled: false,
    };
  });

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // All-or-nothing insert
      await StudentModel.insertMany(docs, { ordered: true, session });
    });

    // Re-fetch in insertion order (or map from docs if insertMany returns docs in your driver)
    const created = await StudentModel.find({ username: { $in: usernames } })
      .select("name username email _id")
      .lean();

    // Keep output aligned with input order
    const byUsername = new Map(
      created.map((c: any) => [c.username.toLowerCase(), c])
    );
    const data = normalized.map((n, i) => {
      const c = byUsername.get(n.username.toLowerCase());
      return {
        name: c?.name ?? n.name,
        userId: c?._id?.toString(),
        username: n.username,
        email: c?.email ?? n.email ?? undefined,
        ...(includePasswords ? { temporaryPassword: tempPasswords[i] } : {}),
      };
    });

    return res
      .status(201)
      .json({ ok: true, message: `Created ${data.length} students`, data });
  } catch (e: any) {
    // On any error inside txn, nothing is committed (no partial inserts)
    if (e?.code === 11000 || e?.name === "MongoBulkWriteError") {
      // Duplicate key races — all rolled back
      // Optionally try to decode which usernames conflicted; generic is fine:
      return res.status(409).json({
        ok: false,
        message: "Username conflicts (race)",
        errors: { students: new Array(students.length).fill(undefined) },
      });
    }

    console.error("[bulkCreateStudents] error:", e);
    return res.status(500).json({ ok: false, message: "Internal error" });
  } finally {
    session.endSession();
  }
}

/**
 * @route   PATCH /student/users/:studentId
 * @auth    verifyTeacherAccessToken (teacher or admin)
 * @input   Params: { studentId }
 *          Body:   Partial<{ name, username, email, isDisabled, mustChangePassword }>
 * @notes   - Teacher can edit only their own students; admin can edit any.
 *          - Validates fields; ensures username uniqueness when changed.
 *          - Email is optional; can be cleared by sending empty/undefined.
 * @logic   1) AuthZ + load student by scope (teacher’s own or any for admin)
 *          2) Compose candidate values (current ⊕ patch) and validate
 *          3) If username changed → uniqueness check
 *          4) Apply boolean toggles if provided
 *          5) Update and return formatted student
 * @returns 200 { message, data: FormattedStudent }
 * @errors  400 validation failed / invalid studentId
 *          403 forbidden
 *          404 student not found
 *          409 username already exists
 *          500 internal server error
 */

export async function updateStudent(req: CustomRequest, res: Response) {
  if (req.user?.role !== "teacher" && !req.user?.isAdmin) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const { studentId } = req.params;

  try {
    // Load the student first so we can validate with full (current + patch) data
    const filter = req.user?.isAdmin
      ? { _id: studentId }
      : { _id: studentId, teacherId: req.user.id };

    const current = await StudentModel.findOne(filter);
    if (!current) {
      return res.status(404).json({ message: "Student not found" });
    }

    // Compose candidate values
    const patch = req.body ?? {};
    const candidate = {
      name:
        patch.name !== undefined
          ? String(patch.name).trim()
          : String(current.name),
      username:
        patch.username !== undefined
          ? String(patch.username).trim()
          : String(current.username),
      email:
        patch.email !== undefined
          ? String(patch.email || "").trim()
          : current.email ?? "",
    };

    // Validate (email is optional)
    const v = validateStudentUserData(candidate, {
      emailRequired: false,
      passwordRequired: false,
    });
    if (v.name.length || v.username.length || v.email.length) {
      return res.status(400).json({
        message: "Validation failed",
        errors: v,
      });
    }

    // Uniqueness: if username changed
    if (candidate.username !== current.username) {
      const exists = await StudentModel.exists({
        username: candidate.username,
        _id: { $ne: current._id },
      });
      if (exists) {
        return res.status(409).json({ message: "Username already exists" });
      }
    }

    // Boolean toggles (optional)
    const updates: any = {
      name: candidate.name,
      username: candidate.username,
      email: candidate.email || undefined,
    };

    if (patch.isDisabled !== undefined) {
      if (typeof patch.isDisabled !== "boolean") {
        return res.status(400).json({ message: "isDisabled must be boolean" });
      }
      updates.isDisabled = patch.isDisabled;
    }

    if (patch.mustChangePassword !== undefined) {
      if (typeof patch.mustChangePassword !== "boolean") {
        return res
          .status(400)
          .json({ message: "mustChangePassword must be boolean" });
      }
      updates.mustChangePassword = patch.mustChangePassword;
    }

    const updated = await StudentModel.findByIdAndUpdate(
      current._id,
      { $set: updates },
      { new: true }
    );

    return res.status(200).json({
      message: "Student updated",
      data: formatStudentResponse(updated!),
    });
  } catch (e: any) {
    // Handle bad ObjectId etc.
    if (e?.name === "CastError") {
      return res.status(400).json({ message: "Invalid studentId" });
    }
    console.error("[updateStudent] error", e);
    return res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * @route   DELETE /student/users/:studentId
 * @auth    verifyTeacherAccessToken (teacher or admin)
 * @input   Params: { studentId }
 * @notes   - Hard-delete (if you need soft-delete, prefer PATCH isDisabled=true).
 *          - Teacher can delete only their own; admin can delete any.
 * @logic   1) AuthZ + scoped filter (teacher’s own or any for admin)
 *          2) findOneAndDelete
 *          3) Respond result
 * @returns 200 { message: "Student deleted" }
 * @errors  400 invalid studentId
 *          403 forbidden
 *          404 student not found
 *          500 internal server error
 */

export async function deleteStudent(req: CustomRequest, res: Response) {
  if (req.user?.role !== "teacher" && !req.user?.isAdmin) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const { studentId } = req.params;

  try {
    const filter = req.user?.isAdmin
      ? { _id: studentId }
      : { _id: studentId, teacherId: req.user.id };

    const deleted = await StudentModel.findOneAndDelete(filter);
    if (!deleted) {
      return res.status(404).json({ message: "Student not found" });
    }

    return res.status(200).json({ message: "Student deleted" });
  } catch (e: any) {
    if (e?.name === "CastError") {
      return res.status(400).json({ message: "Invalid studentId" });
    }
    console.error("[deleteStudent] error", e);
    return res.status(500).json({ message: "Internal server error" });
  }
}

const MAX_BULK_DELETE = 1000;

/**
 * @route   POST /student/users/bulk-delete
 * @auth    verifyTeacherAccessToken (teacher or admin)
 * @input   Body: { studentIds: string[] }
 * @notes   - De-dupes input IDs; enforces a maximum limit (MAX_BULK_DELETE).
 *          - Admin can delete any that exist; teacher can delete only their own.
 *          - Returns which IDs were deleted vs not found/forbidden.
 * @logic   1) AuthZ and basic payload checks
 *          2) Normalize + de-dupe input IDs; enforce cap
 *          3) Resolve deletable subset by role (admin:any, teacher:own)
 *          4) deleteMany on allowed IDs
 *          5) Return deletedCount + partition (deleted vs notFoundOrForbidden)
 * @returns 200 {
 *            ok, message,
 *            data: { deletedCount, deletedIds: string[], notFoundOrForbiddenIds: string[] }
 *          }
 * @errors  400 bad body / invalid IDs
 *          403 forbidden
 *          413 too many ids
 *          500 internal error
 */

export async function bulkDeleteStudentsHandler(
  req: CustomRequest,
  res: Response
) {
  if (req.user?.role !== "teacher" && !req.user?.isAdmin) {
    return res.status(403).json({ ok: false, message: "Forbidden" });
  }

  const idsRaw = (req.body?.studentIds ?? []) as unknown;
  if (!Array.isArray(idsRaw)) {
    return res
      .status(400)
      .json({ ok: false, message: "studentIds must be an array" });
  }

  // Normalize + de-dupe
  const inputIds = Array.from(
    new Set(idsRaw.map((s) => String(s || "").trim()).filter(Boolean))
  );

  if (inputIds.length === 0) {
    return res
      .status(400)
      .json({ ok: false, message: "studentIds cannot be empty" });
  }
  if (inputIds.length > MAX_BULK_DELETE) {
    return res.status(413).json({
      ok: false,
      message: `Too many ids (max ${MAX_BULK_DELETE})`,
    });
  }

  try {
    // Resolve which of these the caller is allowed to delete
    let deletableIds: string[] = [];

    if (req.user!.isAdmin) {
      // Admin can delete anything that exists; get the subset that exists
      const existing = await StudentModel.find({ _id: { $in: inputIds } })
        .select("_id")
        .lean();
      deletableIds = existing.map((d) => String(d._id));
    } else {
      // Teacher can only delete their own students
      const existingMine = await StudentModel.find({
        _id: { $in: inputIds },
        teacherId: req.user!.id,
      })
        .select("_id")
        .lean();
      deletableIds = existingMine.map((d) => String(d._id));
    }

    if (deletableIds.length === 0) {
      return res.status(200).json({
        ok: true,
        message: "No matching students found to delete",
        data: {
          deletedCount: 0,
          deletedIds: [],
          notFoundOrForbiddenIds: inputIds, // either not found or not owned by teacher
        },
      });
    }

    // Perform deletion
    const delRes = await StudentModel.deleteMany({
      _id: { $in: deletableIds },
    });
    const deletedCount = delRes?.deletedCount ?? 0;

    // Compute remainder that could not be deleted (not found or not allowed)
    const deletableSet = new Set(deletableIds);
    const notFoundOrForbiddenIds = inputIds.filter(
      (id) => !deletableSet.has(id)
    );

    return res.status(200).json({
      ok: true,
      message: `Deleted ${deletedCount} of ${inputIds.length} students`,
      data: {
        deletedCount,
        deletedIds: deletableIds,
        notFoundOrForbiddenIds,
      },
    });
  } catch (e: any) {
    if (e?.name === "CastError") {
      return res
        .status(400)
        .json({ ok: false, message: "One or more studentIds are invalid" });
    }
    console.error("[bulkDeleteStudentsHandler] error:", e);
    return res.status(500).json({ ok: false, message: "Internal error" });
  }
}
