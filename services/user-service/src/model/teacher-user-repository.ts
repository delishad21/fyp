import TeacherUserModel from "./teacher-user-model";
import "dotenv/config";
import { connect } from "mongoose";

export async function connectToDB() {
  let mongoDBUri = process.env.USER_MONGODB_URI;

  if (!mongoDBUri) {
    throw new Error("MongoDB URI is not provided");
  }

  await connect(mongoDBUri);
}

export async function createTempUser(
  name: string,
  honorific: string | undefined,
  username: string,
  email: string,
  password: string,
  isVerified = false,
  expireAt: Date
) {
  return new TeacherUserModel({
    name,
    honorific,
    username,
    email,
    password,
    isVerified,
    expireAt,
  }).save();
}

export async function findUserByEmail(email: string) {
  return TeacherUserModel.findOne({ email });
}

export async function findUserById(userId: string) {
  return TeacherUserModel.findById(userId);
}

export async function findUserByUsername(username: string) {
  return TeacherUserModel.findOne({ username });
}

export async function findUserByUsernameOrEmail(
  username: string,
  email: string
) {
  return TeacherUserModel.findOne({
    $or: [{ username }, { email }],
  });
}

export async function findAllUsers() {
  return TeacherUserModel.find();
}

export async function updateUserById(
  userId: string,
  updates: {
    email?: string;
    password?: string;
    name?: string;
    honorific?: string;
    expireAt?: Date;
  }
) {
  // Build update object by filtering out undefined/null/empty values
  const userData: Record<string, any> = {};

  if (updates.email && updates.email.trim() !== "") {
    userData.email = updates.email.trim();
  }

  if (updates.password && updates.password.trim() !== "") {
    userData.password = updates.password;
  }

  if (updates.name && updates.name.trim() !== "") {
    userData.name = updates.name.trim();
  }

  if (updates.honorific && updates.honorific.trim() !== "") {
    userData.honorific = updates.honorific.trim();
  }

  if (updates.expireAt) {
    userData.expireAt = updates.expireAt;
  }

  return TeacherUserModel.findByIdAndUpdate(
    userId,
    { $set: userData },
    { new: true } // return the updated user
  );
}

export async function updateUserAccountCreationTime(
  userId: string,
  createdAt: Date,
  expireAt: Date
) {
  return TeacherUserModel.findByIdAndUpdate(
    userId,
    {
      $set: {
        createdAt,
        expireAt,
      },
    },
    { new: true } // return the updated user
  );
}

export async function confirmUserById(userId: string, isVerified: boolean) {
  return TeacherUserModel.findByIdAndUpdate(
    userId,
    {
      $set: {
        isVerified,
      },
      $unset: {
        expireAt: "",
      },
    },
    { new: true } // return the updated user
  );
}

export async function updateUserPrivilegeById(
  userId: string,
  isAdmin: boolean
) {
  return TeacherUserModel.findByIdAndUpdate(
    userId,
    {
      $set: {
        isAdmin,
      },
    },
    { new: true } // return the updated user
  );
}

export async function deleteUserById(userId: string) {
  return TeacherUserModel.findByIdAndDelete(userId);
}
