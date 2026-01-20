import bcrypt from "bcrypt";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { connectToDB } from "../src/model/teacher-user-repository";
import TeacherUserModel from "../src/model/teacher-user-model";

interface Credential {
  username: string;
  email: string;
  password: string;
}

function loadCredentialsFromCSV(csvPath: string): Credential[] {
  const content = fs.readFileSync(csvPath, "utf-8");
  const lines = content.trim().split("\n");

  // Skip header line
  return lines.slice(1).map((line) => {
    const [username, email, password] = line.split(",");
    return { username, email, password };
  });
}

async function patchTeachers(usernamesToPatch?: string[]) {
  await connectToDB();

  const csvPath = path.join(__dirname, "teacher-credentials.csv");
  const allCredentials = loadCredentialsFromCSV(csvPath);

  // If specific usernames provided, filter for those, otherwise patch all
  const credentialsToPatch = usernamesToPatch
    ? allCredentials.filter((c) => usernamesToPatch.includes(c.username))
    : allCredentials;

  console.log(
    `Starting password patch for ${credentialsToPatch.length} accounts...\n`,
  );

  let updated = 0;
  let notFound = 0;

  for (const { username, password } of credentialsToPatch) {
    const teacher = await TeacherUserModel.findOne({ username });

    if (!teacher) {
      console.log(`❌ ${username}: NOT FOUND in database`);
      notFound++;
      continue;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    teacher.password = hashedPassword;
    await teacher.save();

    console.log(`✅ ${username}: Password updated successfully`);
    updated++;
  }

  console.log(`\nPatch complete! Updated: ${updated}, Not found: ${notFound}`);
}

// Allow passing specific usernames as command-line arguments
const usernamesToPatch = process.argv.slice(2);

patchTeachers(usernamesToPatch.length > 0 ? usernamesToPatch : undefined)
  .catch((err) => {
    console.error("Patch failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
