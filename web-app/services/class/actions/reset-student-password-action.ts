"use server";

import { getAuthHeader } from "@/services/user/session-definitions";
import { classSvcUrl } from "@/utils/utils";

const USER_SVC_URL = (process.env.USER_SVC_URL || "").replace(/\/+$/, "");

export type ResetStudentPasswordResult = {
  ok: boolean;
  message?: string;
  data?: {
    username: string;
    temporaryPassword: string;
  };
};

export async function resetStudentPasswordAction(
  classId: string,
  studentId: string,
): Promise<ResetStudentPasswordResult> {
  const authHeader = await getAuthHeader();
  if (!authHeader) return { ok: false, message: "Not authenticated" };

  if (!classId || !studentId) {
    return { ok: false, message: "Missing class or student id." };
  }

  // Guard by class membership first to keep UX aligned with student page context.
  try {
    const memberRes = await fetch(
      classSvcUrl(
        `/classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(studentId)}`,
      ),
      {
        method: "GET",
        headers: { Authorization: authHeader, Accept: "application/json" },
        cache: "no-store",
      },
    );

    if (!memberRes.ok) {
      const json = await memberRes.json().catch(() => null);
      return {
        ok: false,
        message: json?.message || "Student not found in this class.",
      };
    }
  } catch {
    return { ok: false, message: "Failed to verify student in class." };
  }

  if (!USER_SVC_URL) {
    return { ok: false, message: "USER_SVC_URL is not configured." };
  }

  try {
    const res = await fetch(
      `${USER_SVC_URL}/student/users/${encodeURIComponent(studentId)}/reset-password`,
      {
        method: "POST",
        headers: { Authorization: authHeader, Accept: "application/json" },
        cache: "no-store",
      },
    );

    const json = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        message: json?.message || "Failed to reset student password.",
      };
    }

    const username = json?.data?.username;
    const temporaryPassword = json?.data?.temporaryPassword;
    if (!username || !temporaryPassword) {
      return {
        ok: false,
        message: "Password reset succeeded but response data is incomplete.",
      };
    }

    return {
      ok: true,
      message: json?.message || "Temporary password generated.",
      data: { username: String(username), temporaryPassword: String(temporaryPassword) },
    };
  } catch (e: any) {
    return {
      ok: false,
      message: e?.message || "Network error while resetting password.",
    };
  }
}
