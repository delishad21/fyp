import { connect } from "mongoose";

export async function connectToDB() {
  const mongoDBUri = process.env.GAME_MONGODB_URI;

  if (!mongoDBUri) {
    throw new Error("GAME_MONGODB_URI is not provided");
  }

  await connect(mongoDBUri);
}
