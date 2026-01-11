import { del, getJSON, setJSON } from "@/src/lib/secure";
import {
  changePasswordRequest,
  signIn as signInReq,
} from "@/src/services/auth";
import { create } from "zustand";

export type SessionData = {
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

type AuthStatus = "loading" | "unauth" | "auth" | "mustChangePassword";

type AuthState = {
  status: AuthStatus;
  account: SessionData | null;
  error: string | null;
  errors: string[] | null;
  lastAuthPassword: string | null;

  bootstrap: () => Promise<void>;
  signIn: (u: string, p: string) => Promise<void>;
  changePassword: (
    currentPassword: string,
    newPassword: string
  ) => Promise<void>;
  logout: () => Promise<void>;

  token: () => string | null;
  clearError: () => void;
};

const KEY = { SESSION: "session.v1" };

export const useSession = create<AuthState>((set, get) => ({
  status: "loading",
  account: null,
  error: null,
  errors: null,
  lastAuthPassword: null,

  async bootstrap() {
    const saved = await getJSON<SessionData>(KEY.SESSION);
    if (saved) {
      set({
        account: saved,
        status: saved.mustChangePassword ? "mustChangePassword" : "auth",
        error: null,
        errors: null,
      });
    } else {
      set({ status: "unauth", error: null, errors: null });
    }
  },

  async signIn(username, password) {
    try {
      set({ error: null, errors: null });
      const res = await signInReq(username, password);
      const acc = res.data;
      await setJSON(KEY.SESSION, acc);
      set({
        account: acc,
        status: acc.mustChangePassword ? "mustChangePassword" : "auth",
        error: null,
        errors: null,
        lastAuthPassword: password,
      });
    } catch (e: any) {
      set({
        error: e?.body?.message || e?.message || "Sign-in failed",
        errors: Array.isArray(e?.body?.errors) ? e.body.errors : null,
        status: "unauth",
      });
      throw e;
    }
  },

  async logout() {
    await del(KEY.SESSION);
    set({
      account: null,
      status: "unauth",
      error: null,
      errors: null,
      lastAuthPassword: null,
    });
  },

  token() {
    return get().account?.accessToken ?? null;
  },

  async changePassword(currentPassword, newPassword) {
    try {
      set({ error: null, errors: null });
      const acc = get().account;
      const token = get().token();
      if (!acc || !token) {
        set({
          error: "Not authenticated. Please sign in again.",
          errors: null,
        });
        return;
      }

      await changePasswordRequest(token, currentPassword, newPassword);

      const updatedAcc = { ...acc, mustChangePassword: false };
      await setJSON(KEY.SESSION, updatedAcc);

      set({
        account: updatedAcc,
        status: "auth",
        error: null,
        errors: null,
        lastAuthPassword: null,
      });
    } catch (e: any) {
      set({
        error:
          e?.body?.message ||
          e?.message ||
          "Could not change password. Please try again.",
        errors: Array.isArray(e?.body?.errors) ? e.body.errors : null,
      });
      throw e;
    }
  },

  clearError() {
    set({ error: null, errors: null });
  },
}));
