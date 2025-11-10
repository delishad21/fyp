import { fetchJSON } from "@/src/api/http";

export type SignInResponse = {
  message: string;
  data: {
    accessToken: string;
    id: string;
    name: string;
    username: string | null;
    email: string | null;
    teacherId: string | null;
    mustChangePassword: boolean;
    isDisabled: boolean;
    createdAt: string;
    updatedAt: string;
  };
};

const USER_SVC_URL =
  process.env.EXPO_PUBLIC_USER_SVC_URL || "http://localhost:7301";

export async function signIn(username: string, password: string) {
  return fetchJSON<SignInResponse>(`${USER_SVC_URL}/student/auth/sign-in`, {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

// (for later change-password page)
export async function changePassword(
  currentPassword: string,
  newPassword: string
) {
  return fetchJSON<{ message: string }>(
    `${USER_SVC_URL}/student/auth/change-password`,
    {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    }
  );
}

export async function changePasswordRequest(
  token: string,
  currentPassword: string,
  newPassword: string
) {
  return fetchJSON<{ message: string }>(
    `${USER_SVC_URL}/student/auth/change-password`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ currentPassword, newPassword }),
    }
  );
}
