import mongoose from "mongoose";

const Schema = mongoose.Schema;

const TeacherUserModelSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  honorific: {
    type: String,
    enum: ["Mr.", "Mrs.", "Ms.", "Miss", "Mx.", "Dr.", "Prof.", "None"],
    required: true,
  },
  username: {
    type: String,
    required: true,
    unique: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  isAdmin: {
    type: Boolean,
    required: true,
    default: false,
  },
  isVerified: {
    type: Boolean,
    required: true,
    default: false,
  },

  // For cleaning up unverified accounts (existing TTL)
  expireAt: {
    type: Date,
  },
});

// TTL index for cleaning up expired unverified users
TeacherUserModelSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("TeacherUserModel", TeacherUserModelSchema);
