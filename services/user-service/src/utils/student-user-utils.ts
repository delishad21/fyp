import crypto from "crypto";

export function generateTempPassword(length = 10) {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^*";
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
