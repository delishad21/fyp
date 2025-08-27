import express from "express";

import {
  createUserRequest,
  deleteUser,
  getAllUsers,
  getUser,
  updateUser,
  deleteCreateUserRequest,
  updateEmailRequest,
} from "../controller/webapp-user-controller";
import {
  verifyAccessToken,
  verifyIsAdmin,
  verifyIsOwnerOrAdmin,
} from "../middleware/access-control";

const router = express.Router();

router.get("/", verifyAccessToken, verifyIsAdmin, getAllUsers);

router.post("/", createUserRequest);

// For testing, used to delete createUserRequests
router.delete("/:email", deleteCreateUserRequest);

router.get("/:id", verifyAccessToken, verifyIsOwnerOrAdmin, getUser);

router.patch("/me", verifyAccessToken, updateUser);

router.post("/me/email-change/request", verifyAccessToken, updateEmailRequest);

router.delete("/:id", verifyAccessToken, verifyIsOwnerOrAdmin, deleteUser);

export default router;
