import bcrypt from "bcrypt";
import {
  validatePassword,
  validateName,
  validateHonorific,
} from "../../utils/validators";

import {
  findUserByEmail as _findUserByEmail,
  findUserById as _findUserById,
  updateUserById as _updateUserById,
} from "../../model/webapp-user-repository";

type UpdateResult =
  | {
      ok: true;
      user: any;
      log: string;
      field: UpdateField;
    }
  | {
      ok: false;
      status: number;
      body: { message: string; errors?: Record<string, string[]> };
      log?: string;
    };
// services/userUpdateHelpers.ts
export type UpdateField = "password" | "name" | "honorific";
type UpdateHandler = (userId: string, value: string) => Promise<UpdateResult>;

export const updateHandlers: Record<UpdateField, UpdateHandler> = {
  password: handlePasswordUpdate,
  name: handleNameUpdate,
  honorific: handleHonorificUpdate,
};

async function handlePasswordUpdate(
  userId: string,
  newPassword: string
): Promise<UpdateResult> {
  const errs = validatePassword(newPassword); // string[]
  if (errs.length) {
    return {
      ok: false,
      status: 400,
      body: {
        message: "Password does not meet requirements",
        errors: { password: errs },
      },
    };
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(newPassword, salt);

  const user = await _updateUserById(userId, { password: hashedPassword });
  return {
    ok: true,
    user,
    log: `User password updated - ID: ${userId}`,
    field: "password",
  };
}

async function handleNameUpdate(
  userId: string,
  newName: string
): Promise<UpdateResult> {
  const errs = validateName(newName);
  if (errs.length) {
    return {
      ok: false,
      status: 400,
      body: { message: "Invalid name", errors: { name: errs } },
    };
  }

  const user = await _updateUserById(userId, { name: newName.trim() });
  return {
    ok: true,
    user,
    log: `User name updated - ID: ${userId}`,
    field: "name",
  };
}

async function handleHonorificUpdate(
  userId: string,
  newHonorific: string
): Promise<UpdateResult> {
  const errs = validateHonorific(newHonorific);
  if (errs.length) {
    return {
      ok: false,
      status: 400,
      body: { message: "Invalid honorific", errors: { honorific: errs } },
    };
  }

  const user = await _updateUserById(userId, {
    honorific: newHonorific.trim(),
  });
  return {
    ok: true,
    user,
    log: `User honorific updated - ID: ${userId}`,
    field: "honorific",
  };
}
