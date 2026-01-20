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

async function testPasswords(startFrom?: string) {
  await connectToDB();

  const csvPath = path.join(__dirname, "teacher-credentials.csv");
  const allCredentials = loadCredentialsFromCSV(csvPath);

  // If startFrom is provided, filter credentials starting from that username
  const credentialsToTest = startFrom
    ? allCredentials.filter((c) => c.username >= startFrom)
    : allCredentials;

  console.log(`Testing ${credentialsToTest.length} teacher passwords...\n`);

  let passed = 0;
  let failed = 0;
  const failedAccounts: string[] = [];

  for (const { username, password } of credentialsToTest) {
    const teacher = await TeacherUserModel.findOne({ username }).lean();

    if (!teacher) {
      console.log(`❌ ${username}: NOT FOUND in database`);
      failed++;
      failedAccounts.push(username);
      continue;
    }

    const isValid = await bcrypt.compare(password, teacher.password);

    if (isValid) {
      console.log(`✅ ${username}: Password works`);
      passed++;
    } else {
      console.log(`❌ ${username}: Password DOES NOT MATCH`);
      failed++;
      failedAccounts.push(username);
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log(`Summary: ${passed} passed, ${failed} failed`);

  if (failedAccounts.length > 0) {
    console.log("\nFailed accounts:");
    failedAccounts.forEach((username) => console.log(`  - ${username}`));
  }
}

// Allow passing starting username as command-line argument (e.g., "teacher013")
const startFrom = process.argv[2];

testPasswords(startFrom)
  .catch((err) => {
    console.error("Test failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
