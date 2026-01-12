"use client";

import * as React from "react";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import IconButton from "@/components/ui/buttons/IconButton";
import Button from "@/components/ui/buttons/Button";
import SubmitButton from "@/components/ui/buttons/SubmitButton";
import TextInput from "@/components/ui/text-inputs/TextInput";
import {
  addStudentsToClassAction,
  type AddStudentsState,
} from "@/services/class/actions/add-students-action";
import type { IssuedCredential } from "@/services/class/types/class-types";
import IssuedCredentialsPanel from "@/components/classes/class-page/IssuedCredentialsPanel";
import {
  StudentDraft,
  StudentFieldError,
} from "@/services/class/types/student-types";
import StudentCsvProcessor from "./StudentCsvProcessor";
import { deriveUsername } from "@/services/class/helpers/class-helpers";

const initialState: AddStudentsState = {
  ok: false,
  fieldErrors: { students: [] },
  message: undefined,
  redirect: undefined,
  issuedCredentials: undefined,
};

export default function AddStudentsForm({ classId }: { classId: string }) {
  const router = useRouter();
  const [state, formAction] = useActionState(
    addStudentsToClassAction,
    initialState
  );

  const [students, setStudents] = React.useState<StudentDraft[]>([
    { name: "", email: "", username: "" },
  ]);

  // If success WITHOUT credentials, redirect as before
  useEffect(() => {
    if (state.ok && state.redirect && !state.issuedCredentials?.length) {
      router.push(state.redirect);
    }
  }, [state.ok, state.redirect, state.issuedCredentials, router]);

  const addRow = () =>
    setStudents((rows) => [...rows, { name: "", email: "", username: "" }]);

  const removeRow = (idx: number) =>
    setStudents((rows) => rows.filter((_, i) => i !== idx));

  const updateRow = (idx: number, patch: Partial<StudentDraft>) =>
    setStudents((rows) =>
      rows.map((r, i) => {
        if (i !== idx) return r;
        const next = { ...r, ...patch };
        if (patch.username === undefined) {
          next.username = deriveUsername(
            patch.name ?? r.name,
            patch.email ?? r.email
          );
        }
        return next;
      })
    );

  const handleCsvImport = async (drafts: StudentDraft[]) => {
    setStudents(
      drafts.length ? drafts : [{ name: "", email: "", username: "" }]
    );
  };

  const studentErrs = (
    Array.isArray(state.fieldErrors?.students)
      ? (state.fieldErrors.students as StudentFieldError[])
      : []
  ) as StudentFieldError[];

  const studentsJson = JSON.stringify(
    students.map((s) => ({
      name: s.name?.trim(),
      email: s.email?.trim() || undefined,
      username: s.username?.trim(),
    }))
  );

  const hasCreds =
    state.ok &&
    Array.isArray(state.issuedCredentials) &&
    state.issuedCredentials.length > 0;

  // If credentials exist, show the shared panel (uses creds + onDoneHref)
  if (hasCreds) {
    const doneHref = `/classes/${encodeURIComponent(classId)}/students`;
    return (
      <IssuedCredentialsPanel
        creds={state.issuedCredentials as IssuedCredential[]}
        onDoneHref={doneHref}
      />
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-6 max-w-[1000px]">
      <div className="grid gap-3">
        <h2 className="text-base font-semibold">Import Students (CSV)</h2>
        <StudentCsvProcessor onImport={handleCsvImport} />
      </div>

      <div className="grid gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Students</h2>
        </div>

        <div className="flex flex-col gap-4">
          {students.map((s, i) => {
            const e = studentErrs[i];
            return (
              <div key={i} className="flex gap-4 items-start">
                <label className="text-md text-[var(--color-text-primary)] w-7 pt-3 ml-3">
                  {i + 1}
                </label>

                <TextInput
                  id={`student-name-${i}`}
                  name={`student-name-${i}`}
                  placeholder="Student Name"
                  value={s.name}
                  onValueChange={(v) => updateRow(i, { name: v })}
                  error={e?.name}
                  className="min-w-[260px]"
                />
                <TextInput
                  id={`student-username-${i}`}
                  name={`student-username-${i}`}
                  placeholder="Username (optional)"
                  value={s.username ?? ""}
                  onValueChange={(v) => updateRow(i, { username: v })}
                  error={e?.username}
                  className="min-w-[260px]"
                />
                <TextInput
                  id={`student-email-${i}`}
                  name={`student-email-${i}`}
                  placeholder="Email (optional)"
                  value={s.email ?? ""}
                  onValueChange={(v) => updateRow(i, { email: v })}
                  error={e?.email}
                  className="min-w-[260px]"
                />

                <div className="flex items-center gap-2">
                  <IconButton
                    icon="mingcute:delete-2-line"
                    title="Remove student"
                    onClick={() => removeRow(i)}
                    variant="error"
                    size="md"
                    type="button"
                  />
                </div>
              </div>
            );
          })}

          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={() => addRow()}
              className="w-38 ml-13"
              type="button"
            >
              Add Student
            </Button>

            <div className="mt-4 flex justify-end">
              <div className="w-48">
                <SubmitButton>Add Students</SubmitButton>
              </div>
            </div>
          </div>
        </div>
      </div>

      <input type="hidden" name="classId" value={classId} readOnly />
      <input type="hidden" name="studentsJson" value={studentsJson} readOnly />

      {state.message && (
        <p className="text-sm text-[var(--color-text-secondary)]">
          {state.message}
        </p>
      )}
    </form>
  );
}
