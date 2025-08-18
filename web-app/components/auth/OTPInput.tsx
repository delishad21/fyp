"use client";

import { useRef } from "react";

type Props = {
  length?: number;
  value: string[];
  onChange: (next: string[]) => void;
};

export default function OTPInput({ length = 6, value, onChange }: Props) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  const setDigit = (idx: number, char: string) => {
    if (!/^\d?$/.test(char)) return;
    const next = [...value];
    next[idx] = char;
    onChange(next);
    if (char && idx < length - 1) refs.current[idx + 1]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, idx: number) => {
    if (e.key === "Backspace" && !value[idx] && idx > 0)
      refs.current[idx - 1]?.focus();
    if (e.key === "ArrowLeft" && idx > 0) {
      e.preventDefault();
      refs.current[idx - 1]?.focus();
    }
    if (e.key === "ArrowRight" && idx < length - 1) {
      e.preventDefault();
      refs.current[idx + 1]?.focus();
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const paste = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, length);
    if (!paste) return;
    const next = [...value];
    for (let i = 0; i < paste.length; i++) next[i] = paste[i];
    onChange(next);
    const firstEmpty = next.findIndex((d) => d === "");
    if (firstEmpty !== -1) refs.current[firstEmpty]?.focus();
  };

  return (
    <div className={`flex justify-center gap-3`}>
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          id={`otp-${i}`}
          inputMode="numeric"
          pattern="\d*"
          maxLength={1}
          value={value[i] ?? ""}
          onChange={(e) => setDigit(i, e.target.value)}
          onKeyDown={(e) => onKeyDown(e, i)}
          onPaste={onPaste}
          className={
            "h-15 w-12 rounded-sm bg-[var(--color-bg2)] text-center text-2xl " +
            "ring-2 ring-[var(--color-bg3)] outline-none " +
            "focus:ring-2 focus:ring-[var(--color-primary)]"
          }
        />
      ))}
    </div>
  );
}
