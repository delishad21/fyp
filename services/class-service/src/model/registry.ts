import { connect } from "mongoose";
import "dotenv/config";

export async function connectToDB() {
  let mongoDBUri = process.env.CLASS_MONGODB_URI;

  if (!mongoDBUri) {
    throw new Error("MongoDB URI is not provided");
  }

  await connect(mongoDBUri);
}
