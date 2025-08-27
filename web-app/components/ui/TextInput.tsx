"use client";

type Props = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string | string[];
  id: string;
  readOnly?: boolean;
};

export default function TextInput({
  label,
  error,
  id,
  readOnly,
  ...rest
}: Props) {
  const errors = Array.isArray(error) ? error : error ? [error] : [];

  return (
    <div className="grid gap-1.5">
      {label && (
        <label
          htmlFor={id}
          className="text-sm text-[var(--color-text-primary)]"
        >
          {label}
        </label>
      )}
      <input
        id={id}
        className={`rounded-sm bg-[var(--color-bg2)] px-4 py-3 text-[var(--color-text-primary)]
             outline-2 outline-[var(--color-bg4)] text-sm
             focus:outline-2 focus:outline-[var(--color-primary)]
             ${
               readOnly
                 ? "cursor-not-allowed text-[var(--color-text-secondary)]"
                 : ""
             }`}
        readOnly={readOnly}
        {...rest}
      />
      {/* Render Error as <p> if only one error */}
      {errors.length === 1 && (
        <p className="text-xs text-[var(--color-error)]">{errors[0]}</p>
      )}

      {/* Render Error as <ul> if multiple errors */}
      {errors.length > 1 && (
        <ul className="list-disc pl-5 text-xs text-[var(--color-error)] space-y-0.5">
          {errors.map((msg, i) => (
            <li key={i}>{msg}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
