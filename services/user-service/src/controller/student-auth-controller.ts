import bcrypt from "bcrypt";
import { Request, Response } from "express";
import { generateAccessToken } from "../utils/tokens";
import { validateStudentPassword } from "../utils/validators";
import {
  StudentModel,
  formatStudentResponse,
} from "../model/student-user-model";

/**
 * @route   POST /student/auth/sign-in
 * @auth    Public (no token required)
 * @input   Body: { username: string, password: string }
 * @notes   - Returns a short-lived access token scoped to the student role.
 *          - Uniform error message for bad credentials to avoid leaking account existence.
 *          - Rejects disabled accounts.
 *          - JWT includes { teacherId, mustChangePassword } in custom claims for client UX.
 * @logic   1) Validate presence of username/password
 *          2) Look up student by username (include password hash)
 *          3) Verify account is active and bcrypt-compare password
 *          4) Generate access token (exp configurable; currently 30d)
 *          5) Return token + formatted student profile
 * @returns 200 { message, data: { accessToken, ...student } }
 * @errors  400 missing username/password
 *          401 wrong username/password OR account disabled
 *          500 internal server error
 */
export async function studentSignIn(req: Request, res: Response) {
  const { username, password } = req.body ?? {};
  if (!username || !password)
    return res
      .status(400)
      .json({ message: "Missing username and/or password" });

  const student = await StudentModel.findOne({ username })
    .select("+password")
    .lean(false);

  if (!student || student.isDisabled)
    return res.status(401).json({ message: "Wrong username/password" });

  const ok = await bcrypt.compare(password, student.password);
  if (!ok) return res.status(401).json({ message: "Wrong username/password" });

  const accessToken = generateAccessToken(
    student.id,
    "student",
    {
      teacherId: student.teacherId.toString(),
      mustChangePassword: student.mustChangePassword,
    },
    { expiresIn: "30d" }
  );

  return res.status(200).json({
    message: "Student logged in",
    data: {
      accessToken,
      ...formatStudentResponse(student),
    },
  });
}

/**
 * @route   POST /student/auth/change-password
 * @auth    verifyStudentAccessToken (role: student)
 * @input   Body: { currentPassword: string, newPassword: string }
 * @notes   - Validates new password against policy (validateStudentPassword).
 *          - Requires the current password; on success clears mustChangePassword.
 *          - Updates lastPasswordResetAt for audit/UX.
 * @logic   1) AuthZ: ensure caller is a student
 *          2) Validate presence of currentPassword/newPassword
 *          3) Validate new password policy
 *          4) Load student by token subject and verify current password
 *          5) Hash and store new password; update flags and timestamps
 *          6) Respond success
 * @returns 200 { message: "Password updated" }
 * @errors  400 missing params / password validation failed
 *          401 wrong current password
 *          403 forbidden (not a student)
 *          404 student not found
 *          500 internal server error
 */

export async function studentChangePassword(req: any, res: Response) {
  try {
    console.log(req.body);

    if (req.user?.role !== "student")
      return res.status(403).json({ message: "Forbidden" });

    const { currentPassword, newPassword } = req.body ?? {};
    if (!currentPassword || !newPassword)
      return res.status(400).json({ message: "Missing parameters" });

    const errors = validateStudentPassword(newPassword);
    if (errors.length)
      return res
        .status(400)
        .json({ message: "Password validation failed", errors });

    const student = await StudentModel.findById(req.user.id).select(
      "+password"
    );
    if (!student) return res.status(404).json({ message: "Student not found" });

    const ok = await bcrypt.compare(currentPassword, student.password);
    if (!ok) return res.status(401).json({ message: "Wrong password" });

    student.password = bcrypt.hashSync(newPassword, bcrypt.genSaltSync(10));
    student.mustChangePassword = false;
    student.lastPasswordResetAt = new Date();
    await student.save();

    return res.status(200).json({ message: "Password updated" });
  } catch (error) {
    console.error("Error in studentChangePassword:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}
