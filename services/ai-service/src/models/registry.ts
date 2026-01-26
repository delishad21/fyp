import { connect } from "mongoose";
import "dotenv/config";

export async function connectToDB() {
  let mongoDBUri = process.env.MONGODB_URI;

  if (!mongoDBUri) {
    throw new Error("MONGODB_URI is not provided");
  }

  await connect(mongoDBUri);
}
