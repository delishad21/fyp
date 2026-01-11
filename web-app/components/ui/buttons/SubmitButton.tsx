"use client";

import { useFormStatus } from "react-dom";

type SubmitButtonProps = {
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  /** If provided, button acts as a normal button and calls this instead of submitting form */
  onSubmit?: (e: React.MouseEvent<HTMLButtonElement>) => void | Promise<void>;
};

export default function SubmitButton({
  children,
  className,
  disabled = false,
  onSubmit,
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const isDisabled = disabled || pending;

  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    if (onSubmit) {
      e.preventDefault(); // prevent default form submission if handler is provided
      onSubmit(e);
    }
  }

  return (
    <button
      type={onSubmit ? "button" : "submit"} // only "submit" if no onSubmit handler
      disabled={isDisabled}
      onClick={handleClick}
      className={
        "w-full rounded-sm px-4 py-3 font-medium bg-[var(--color-primary)] text-white " +
        "hover:opacity-90 disabled:opacity-60 " +
        (className ?? "")
      }
    >
      {pending && !onSubmit ? "Please wait…" : children}
    </button>
  );
}
