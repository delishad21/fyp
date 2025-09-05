import multer from "multer";
import path from "path";
import fs from "fs";

/**
 * uploadQuizImages middleware
 *
 * Purpose:
 * - Handles multipart form-data uploads for quiz-related images.
 * - Stores files on disk under `/uploads` with unique, safe filenames.
 *
 * Behavior:
 * - Ensures `uploads/` directory exists at server startup.
 * - Uses `multer.diskStorage`:
 *   • `destination`: always `uploads/`.
 *   • `filename`: `<fieldname>-<timestamp>-<random>.<ext>`.
 * - Limits:
 *   • Max file size: 10MB each.
 *   • Max files per request: 100.
 *
 * Usage:
 * - Attach this middleware to routes that accept quiz image uploads:
 *   ```ts
 *   app.post("/quiz", uploadQuizImages, createQuiz);
 *   ```
 */

// ensure uploads dir exists
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// configure disk storage
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    // generate safe filename
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  },
});

export const uploadQuizImages = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 100 },
}).any();
