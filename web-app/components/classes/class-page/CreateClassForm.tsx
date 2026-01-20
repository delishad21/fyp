"use client";

import * as React from "react";
import { useActionState } from "react";
import { processClass } from "@/services/class/actions/class-actions";
import SubmitButton from "@/components/ui/buttons/SubmitButton";
import IconButton from "@/components/ui/buttons/IconButton";
import { Icon } from "@iconify/react";
import { ImageMeta } from "@/services/images/types";
import ImageUpload from "@/components/ImageUpload";
import Button from "@/components/ui/buttons/Button";
import {
  ClassFormState,
  IssuedCredential,
} from "@/services/class/types/class-types";
import { DEFAULT_COLOR_PALETTE } from "@/utils/utils";
import {
  StudentDraft,
  StudentFieldError,
} from "@/services/class/types/student-types";
import { uploadClassImage } from "@/services/class/actions/class-image-upload-action";
import TextInput from "@/components/ui/text-inputs/TextInput";
import { useTimezoneOptions } from "@/services/class/helpers/scheduling/hooks/useTimezoneOptions";
import { ClassFields } from "./ClassFields";
import IssuedCredentialsPanel from "./IssuedCredentialsPanel";
import StudentCsvProcessor from "./StudentCsvProcessor";
import { deriveUsername } from "@/services/class/helpers/class-helpers";
import ToggleButton from "@/components/ui/buttons/ToggleButton";

const initialState: ClassFormState = {
  ok: false,
  fieldErrors: {},
  values: { name: "", level: "", color: undefined },
  message: undefined,
  issuedCredentials: [] as IssuedCredential[] | undefined,
};

export default function CreateClassForm() {
  const tzOptions = useTimezoneOptions();

  const [state, formAction] = useActionState(processClass, initialState);
  const [students, setStudents] = React.useState<StudentDraft[]>([
    { name: "", email: "", username: "" },
  ]);
  const [autoUsername, setAutoUsername] = React.useState(true);

  const [image, setImage] = React.useState<ImageMeta | null>(null);
  const [color, setColor] = React.useState<string>(
    state.values.color ?? DEFAULT_COLOR_PALETTE[0]
  );

  // If class was created and we have creds, show the panel only.
  const hasCreds =
    state.ok &&
    Array.isArray(state.issuedCredentials) &&
    state.issuedCredentials.length > 0;

  React.useEffect(() => {
    if (!hasCreds) return;
    window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  }, [hasCreds]);

  const addRow = () =>
    setStudents((rows) => [...rows, { name: "", email: "", username: "" }]);

  const removeRow = (idx: number) =>
    setStudents((rows) => rows.filter((_, i) => i !== idx));

  const updateRow = (idx: number, patch: Partial<StudentDraft>) =>
    setStudents((rows) =>
      rows.map((r, i) => {
        if (i !== idx) return r;
        const next = { ...r, ...patch };
        if (autoUsername && patch.username === undefined) {
          next.username = deriveUsername(
            patch.name ?? r.name,
            patch.email ?? r.email
          );
        }
        return next;
      })
    );

  const toggleAutoUsername = () =>
    setAutoUsername((prev) => {
      const next = !prev;
      if (next) {
        setStudents((rows) =>
          rows.map((r) => {
            if ((r.username ?? "").trim()) return r;
            return {
              ...r,
              username: deriveUsername(r.name ?? "", r.email ?? ""),
            };
          })
        );
      }
      return next;
    });

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
  const imageJson = JSON.stringify(image ?? undefined);

  if (hasCreds) {
    return (
      <IssuedCredentialsPanel
        creds={state.issuedCredentials!}
        onDoneHref="/classes"
      />
    );
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-8 max-w-[1000px] min-w-[960px]"
    >
      {/* Basics (Name, Level, Color, Timezone) */}
      <ClassFields
        values={{
          name: state.values.name,
          level: state.values.level,
          color,
          timezoneDefault: "Asia/Singapore",
        }}
        errors={state.fieldErrors}
        tzOptions={tzOptions}
        onColorChange={setColor}
      />

      {/* Image */}
      <div className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Class Photo (optional)</h2>
        <div className="justify-center">
          <ImageUpload
            uploadFn={uploadClassImage}
            initialUrl={undefined}
            onUploaded={(img) => setImage(img)}
            onDelete={() => setImage(null)}
          />
        </div>
      </div>

      <div className="grid gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold">Import Students (CSV)</h2>
          <span className="relative group">
            <Icon
              icon="mdi:help-circle-outline"
              className="text-[var(--color-text-tertiary)] text-lg"
            />
            <span className="pointer-events-none absolute left-0 top-full z-10 mt-2 w-72 rounded-md border border-[var(--color-bg4)] bg-[var(--color-bg1)] px-3 py-2 text-sm text-[var(--color-text-primary)] shadow-sm opacity-0 transition-opacity group-hover:opacity-100">
              We accept CSV files with headers: Name, Username, and Email.
              <br />
              Email is optional. You can upload Name + Username, or just Name
              and we will auto-generate the username.
            </span>
          </span>
        </div>
        <StudentCsvProcessor onImport={handleCsvImport} />
      </div>

      {/* Students (manual edit after import is still possible) */}
      <div className="grid gap-3">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-base font-semibold">Add Students</h2>
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2">
              <span className="text-sm text-[var(--color-text-primary)]">
                Auto-generate usernames
              </span>
              <ToggleButton
                id="auto-username-toggle"
                on={autoUsername}
                onToggle={toggleAutoUsername}
                size={24}
              />
            </div>
          </div>
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
                  className="min-w-[300px]"
                />
                <TextInput
                  id={`student-username-${i}`}
                  name={`student-username-${i}`}
                  placeholder="Username"
                  value={s.username ?? ""}
                  onValueChange={(v) => updateRow(i, { username: v })}
                  error={e?.username}
                  className="min-w-[300px]"
                />
                <TextInput
                  id={`student-email-${i}`}
                  name={`student-email-${i}`}
                  placeholder="Email (optional)"
                  value={s.email ?? ""}
                  onValueChange={(v) => updateRow(i, { email: v })}
                  error={e?.email}
                  className="min-w-[300px]"
                />
                <div className="flex items-center gap-2">
                  <IconButton
                    icon="mingcute:delete-2-line"
                    title="Remove student"
                    onClick={() => removeRow(i)}
                    variant="error"
                    size="md"
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
            >
              Add Student
            </Button>
            <div className="mt-4 flex justify-end">
              <div className="w-48">
                <SubmitButton>Create Class</SubmitButton>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden JSON payloads consumed by the server action */}
      <input type="hidden" name="studentsJson" value={studentsJson} readOnly />
      <input type="hidden" name="imageJson" value={imageJson} readOnly />
      <input type="hidden" name="color" value={color} readOnly />

      {/* Global message */}
      {state.message && (
        <p className="text-sm text-[var(--color-text-secondary)]">
          {state.message}
        </p>
      )}
    </form>
  );
}
