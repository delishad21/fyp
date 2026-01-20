import { ColorSwatches } from "@/components/ui/selectors/color-select/ColorSwatches";
import Select from "@/components/ui/selectors/select/Select";
import TextInput from "@/components/ui/text-inputs/TextInput";
import type { ClassFormState } from "@/services/class/types/class-types";

type ClassFieldsProps = {
  values: {
    name?: string;
    level?: string;
    timezoneDefault?: string;
    color: string;
  };
  errors?: ClassFormState["fieldErrors"];
  tzOptions: string[];
  onColorChange: (c: string) => void;
};

export function ClassFields({
  values,
  errors,
  tzOptions,
  onColorChange,
}: ClassFieldsProps) {
  const colorError = Array.isArray(errors?.color)
    ? errors?.color.join(", ")
    : errors?.color;

  return (
    <>
      <div className="flex gap-4 items-start">
        <TextInput
          id="name"
          name="name"
          label="Name"
          placeholder="e.g. 3A"
          error={errors?.name}
          className="min-w-[240px]"
          defaultValue={values.name ?? ""}
        />
        <TextInput
          id="level"
          name="level"
          label="Level"
          placeholder="e.g. Primary 3"
          error={errors?.level}
          className="min-w-[240px]"
          defaultValue={values.level ?? ""}
        />
        <ColorSwatches
          value={values.color}
          onChange={onColorChange}
          name="color"
          error={colorError}
        />
      </div>

      <div className="max-w-[480px]">
        <Select
          id="class-timezone"
          label="Class Timezone"
          name="timezone"
          placeholder="Select a timezone"
          defaultValue={values.timezoneDefault || "Asia/Singapore"}
          options={tzOptions}
          error={errors?.timezone}
        />
      </div>
    </>
  );
}
