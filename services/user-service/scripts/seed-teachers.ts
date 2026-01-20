import bcrypt from "bcrypt";
import crypto from "crypto";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { connectToDB } from "../src/model/teacher-user-repository";
import TeacherUserModel from "../src/model/teacher-user-model";

type SeededUser = {
  username: string;
  email: string;
  password: string;
};

const TOTAL = 50;
const USERNAME_PREFIX = "teacher";
const EMAIL_DOMAIN = "example.test";
const HONORIFIC = "None";

function randInt(max: number) {
  const buf = crypto.randomBytes(4);
  return buf.readUInt32BE(0) % max;
}

function pick(set: string) {
  return set[randInt(set.length)];
}

function shuffle(chars: string[]) {
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars;
}

function generateTeacherPassword(length = 10) {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const specials = "!@#$%^*";
  const all = letters + digits + specials;

  const chars = [pick(letters), pick(digits), pick(specials)];
  while (chars.length < length) {
    chars.push(pick(all));
  }

  return shuffle(chars).join("");
}

async function seedTeachers() {
  await connectToDB();

  const created: SeededUser[] = [];
  let skipped = 0;

  for (let i = 1; i <= TOTAL; i += 1) {
    const suffix = String(i).padStart(3, "0");
    const username = `${USERNAME_PREFIX}${suffix}`;
    const email = `${username}@${EMAIL_DOMAIN}`;

    const existing = await TeacherUserModel.findOne({
      $or: [{ username }, { email }],
    }).lean();
    if (existing) {
      skipped += 1;
      continue;
    }

    const password = generateTeacherPassword(10);
    const hashedPassword = await bcrypt.hash(password, 10);

    await TeacherUserModel.create({
      name: `Teacher ${suffix}`,
      honorific: HONORIFIC,
      username,
      email,
      password: hashedPassword,
      isAdmin: false,
      isVerified: true,
    });

    created.push({ username, email, password });
  }

  console.log(`Created ${created.length} teachers; skipped ${skipped}.`);

  // Save credentials to CSV file
  const csvPath = path.join(__dirname, "teacher-credentials.csv");
  const csvContent = [
    "username,email,password",
    ...created.map((u) => `${u.username},${u.email},${u.password}`),
  ].join("\n");

  fs.writeFileSync(csvPath, csvContent);
  console.log(`\nCredentials saved to: ${csvPath}`);
  console.log("\nGenerated credentials:");
  console.log("username,email,password");
  created.forEach((u) => {
    console.log(`${u.username},${u.email},${u.password}`);
  });
}

seedTeachers()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
