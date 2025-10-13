"use client";

import * as React from "react";
import { useActionState, useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import SubmitButton from "@/components/ui/buttons/SubmitButton";
import ImageUpload from "@/components/ImageUpload";
import { uploadClassImage } from "@/services/class/actions/class-image-upload-action";
import { DEFAULT_COLOR_PALETTE } from "@/utils/utils";
import {
  processClass,
  deleteClass,
} from "@/services/class/actions/class-actions";
import Button from "@/components/ui/buttons/Button";
import type { ImageMeta } from "@/services/images/types";
import WarningModal from "@/components/ui/WarningModal";
import { useTimezoneOptions } from "@/services/class/helpers/scheduling/hooks/useTimezoneOptions";
import { ClassFields } from "./ClassFields";
export type ClassEditInitial = {
  _id: string;
  name: string;
  level?: string;
  timezone?: string;
  metadata?: { color?: string };
  image?: ImageMeta | null;
};

const initialState = {
  ok: false,
  fieldErrors: {} as Record<string, any>,
  values: { name: "", level: "", color: undefined as string | undefined },
  message: undefined as string | undefined,
  issuedCredentials: undefined as any,
};

export default function EditClassForm({
  initial,
}: {
  initial: ClassEditInitial;
}) {
  const router = useRouter();
  const tzOptions = useTimezoneOptions();

  const [image, setImage] = useState<ImageMeta | null>(initial.image ?? null);
  const [color, setColor] = useState<string>(
    initial.metadata?.color ?? DEFAULT_COLOR_PALETTE[0]
  );

  const [state, formAction] = useActionState(processClass, {
    ...initialState,
    values: {
      name: initial.name ?? "",
      level: initial.level ?? "",
      color: initial.metadata?.color,
    },
  });

  const imageJson = JSON.stringify(image ?? undefined);

  // Delete + modal state
  const [isDeleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const requestDelete = () => {
    setDeleteError(null);
    setConfirmOpen(true);
  };
  const confirmCancel = () => setConfirmOpen(false);
  const confirmContinue = () => {
    startDelete(async () => {
      const success = await deleteClass(initial._id);
      if (success) {
        setConfirmOpen(false);
        router.replace("/classes");
        router.refresh();
      } else {
        setDeleteError("Failed to delete class. Please try again.");
      }
    });
  };

  return (
    <>
      {/* Delete confirmation */}
      <WarningModal
        open={confirmOpen}
        title="Delete this class?"
        message={
          <>
            This action cannot be undone. It will remove the class and all
            students in the class. Associated quiz attempts and results will be
            deleted as well.
            {deleteError && (
              <div className="mt-2 text-[var(--color-error)] text-sm">
                {deleteError}
              </div>
            )}
          </>
        }
        cancelLabel="Cancel"
        continueLabel={isDeleting ? "Deleting…" : "Delete"}
        onCancel={confirmCancel}
        onContinue={confirmContinue}
      />

      <form action={formAction} className="flex flex-col gap-8 max-w-[1000px]">
        <input type="hidden" name="mode" value="edit" readOnly />
        <input type="hidden" name="classId" value={initial._id} readOnly />

        {/* Basics (Name, Level, Color, Timezone) */}
        <ClassFields
          values={{
            name: state.values.name || initial.name,
            level: state.values.level || initial.level,
            color,
            timezoneDefault: initial.timezone || "Asia/Singapore",
          }}
          errors={state.fieldErrors}
          tzOptions={tzOptions}
          onColorChange={setColor}
        />

        {/* Image */}
        <div className="flex flex-col">
          <div className="justify-center">
            <ImageUpload
              uploadFn={uploadClassImage}
              initialUrl={initial.image?.url}
              onUploaded={(img) => setImage(img)}
              onDelete={() => setImage(null)}
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          {/* Delete button */}
          <Button
            variant="error"
            onClick={requestDelete}
            loading={isDeleting}
            title="Delete class"
          >
            Delete Class
          </Button>

          <div className="w-48">
            <SubmitButton>Save Changes</SubmitButton>
          </div>
        </div>

        <input type="hidden" name="imageJson" value={imageJson} readOnly />
        <input type="hidden" name="color" value={color} readOnly />

        {state.message && (
          <p className="text-sm text-[var(--color-text-secondary)]">
            {state.message}
          </p>
        )}
      </form>
    </>
  );
}
