"use client";

import * as React from "react";
import Button from "@/components/ui/buttons/Button";
import {
  buildStudentCsvCanonicalHeader,
  parseStudentCsv,
  studentRowToCanonical,
  STUDENT_CSV_HEADER_ALIASES,
  type StudentCsvCanonicalKey,
  // We won’t use STUDENT_CSV_REQUIRED_FIELDS because we only require "name" here
} from "@/services/class/helpers/csv-utils";
import type { StudentDraft } from "@/services/class/types/student-types";
import { deriveUsername } from "@/services/class/helpers/class-helpers";

type Props = {
  /** Called immediately after parsing; you can setStudents(drafts) directly */
  onImport: (students: StudentDraft[]) => void | Promise<void>;
  buttonText?: string;
  fileInputId?: string;
  /** If true, we’ll accept a `username` column (case-insensitive) if present. */
  allowUsernameColumn?: boolean;
};

/**
 * Button-only CSV importer that fills the parent form's student fields directly.
 * - Immediate parse on file selection (no preview).
 * - Accepts headers case-insensitively via csv-utils aliases.
 * - Requires only "name" column; "email" and "username" are optional.
 * - Auto-generates username (<=30) when missing.
 */
export default function StudentCsvProcessor({
  onImport,
  buttonText = "Import from CSV",
  fileInputId = "student-csv-input",
  allowUsernameColumn = true,
}: Props) {
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function handleFileChange(file?: File | null) {
    setErr(null);
    if (!file) return;
    setLoading(true);
    try {
      const text = await file.text();
      const matrix = parseStudentCsv(text);
      if (matrix.length === 0) {
        setErr("CSV appears to be empty.");
        return;
      }

      const [rawHeader, ...dataRows] = matrix;

      // Only "name" is required; username/email are optional
      // Build aliases map; include a username alias only if allowed
      type CsvKey = StudentCsvCanonicalKey | "username";
      const aliases: Record<string, CsvKey> = {
        ...STUDENT_CSV_HEADER_ALIASES,
        ...(allowUsernameColumn ? { username: "username" } : {}),
      };

      // We require only "name"
      const REQUIRED: Array<CsvKey> = ["name"];

      const { canonicalOrder, missingRequired, headerErrors } =
        buildStudentCsvCanonicalHeader<CsvKey>(rawHeader, REQUIRED, aliases);

      if (headerErrors.length) {
        setErr(headerErrors.join("\n"));
        return;
      }
      if (missingRequired.length) {
        setErr(
          `Missing required headers: ${missingRequired
            .map((k) => `"${k}"`)
            .join(", ")}.`
        );
        return;
      }

      const normalized = dataRows
        .filter((r) => r.some((cell) => (cell ?? "").trim().length > 0))
        .map((r) => studentRowToCanonical<CsvKey>(r, canonicalOrder));

      // Convert to StudentDrafts with username generation
      const drafts: StudentDraft[] = normalized.map((row) => {
        const name = (row.name ?? "").trim();
        const email = (row.email ?? "").trim();
        let username = (row.username ?? "").trim();

        if (!username) {
          username = deriveUsername(name, email);
        } else {
          // even if provided, enforce the 30-char rule consistently
          username = deriveUsername(name, `${username}@stub.local`);
        }

        return { name, email, username };
      });

      await onImport(
        drafts.length ? drafts : [{ name: "", email: "", username: "" }]
      );

      // clear the file input so selecting the same file again will retrigger change
      const el = document.getElementById(
        fileInputId
      ) as HTMLInputElement | null;
      if (el) el.value = "";
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to parse CSV.";
      setErr(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        id={fileInputId}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
      />
      <Button
        type="button"
        variant="ghost"
        loading={loading}
        onClick={() => document.getElementById(fileInputId)?.click()}
      >
        {buttonText}
      </Button>
      {err && <span className="text-xs text-[var(--color-error)]">{err}</span>}
    </div>
  );
}
