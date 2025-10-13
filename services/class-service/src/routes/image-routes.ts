import { Router } from "express";
import path from "path";
import { uploadClassImages } from "../utils/upload";
import { verifyAccessToken } from "../middleware/access-control";

const router = Router();

/**
 * Routes under prefix: /  (mounted in index.ts)
 */

/** POST /upload — Upload a class image and return a public URL */
router.post("/upload", verifyAccessToken, uploadClassImages, (req, res) => {
  // Step 1: basic validation
  const files = (req.files ?? []) as Express.Multer.File[];
  const f = files[0];
  if (!f) return res.status(400).json({ ok: false, message: "No file" });

  // Step 2: compute public URL (override with IMAGE_UPLOAD_URL if behind proxy)
  const base =
    process.env.IMAGE_UPLOAD_URL ||
    `${req.protocol}://${req.get("host")}/uploads`;
  const url = `${base}/${path.basename((f as any).path)}`;

  // Step 3: respond with minimal metadata
  console.log("[IMAGE] Uploading class image");
  return res.json({
    ok: true,
    data: {
      url,
      filename: f.originalname,
      mimetype: f.mimetype,
      size: f.size,
      path: (f as any).path,
    },
  });
});

export default router;
