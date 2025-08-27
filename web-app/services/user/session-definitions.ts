import { getIronSession, SessionOptions } from "iron-session";
import { cookies } from "next/headers";

/* -------------------
  Session Definitions
--------------------- */

const SECRET_KEY =
  process.env.SESSIONS_SECRET_KEY || "ThisIsASecretKeyMaybeYouShouldChangeIt";

export interface SessionData {
  userId?: string;
  username?: string;
  email?: string;
  isAdmin: boolean;
  accessToken?: string;
  isLoggedIn: boolean;
  name?: string;
  honorific?: string;
}

export interface EmailChangeSessionData {
  emailToken?: string;
  expiry?: string;
}

export const defaultSession: SessionData = {
  isLoggedIn: false,
  isAdmin: false,
};

export const sessionOptions: SessionOptions = {
  password: SECRET_KEY,
  cookieName: "main-session",
  cookieOptions: {
    httpOnly: true,
    secure: false,
    maxAge: 24 * 60 * 60,
  },
};

export const emailChangeOptions: SessionOptions = {
  password: SECRET_KEY,
  cookieName: "email-change-session",
  cookieOptions: {
    httpOnly: true,
    secure: false,
    maxAge: 3 * 60,
  },
};

export const getSession = async () => {
  const session = await getIronSession<SessionData>(
    await cookies(),
    sessionOptions
  );

  if (!session.isLoggedIn) {
    session.isLoggedIn = defaultSession.isLoggedIn;
  }

  if (!session.isAdmin) {
    session.isAdmin = defaultSession.isAdmin;
  }

  return session;
};

function withMaxAge(base: SessionOptions, ttlSeconds?: number): SessionOptions {
  const maxAge =
    typeof ttlSeconds === "number" && ttlSeconds > 0
      ? Math.ceil(ttlSeconds)
      : base.cookieOptions?.maxAge;

  return {
    ...base,
    cookieOptions: {
      ...base.cookieOptions,
      secure: process.env.NODE_ENV === "production",
      ...(typeof maxAge === "number" ? { maxAge } : {}),
    },
  };
}

export const getEmailChangeSession = async (ttlSeconds?: number) => {
  const session = await getIronSession<EmailChangeSessionData>(
    await cookies(),
    withMaxAge(emailChangeOptions, ttlSeconds)
  );
  return session;
};

export const getAccessToken = async () => {
  const session = await getSession();
  return session.accessToken;
};

export const getEmailChangeEmailToken = async () => {
  const session = await getEmailChangeSession();
  return session.emailToken;
};

export const getUsername = async () => {
  const session = await getSession();
  return session.username;
};

export const getEmail = async () => {
  const session = await getSession();
  return session.email;
};

export const isSessionLoggedIn = async () => {
  const session = await getSession();

  return session.isLoggedIn;
};

export const isSessionAdmin = async () => {
  const session = await getSession();

  console.log("isSessionAdmin: ", session.isAdmin);
  if (!session.isAdmin) {
    return false;
  } else {
    return session.isAdmin;
  }
};

export const getEmailChangeTimeToExpire = async () => {
  const session = await getEmailChangeSession();

  return session.expiry;
};
