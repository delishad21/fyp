"use client";

/**
 * SelectAddModal Component
 *
 * Purpose:
 *   - Modal dialog for adding a new option to a <Select>.
 *   - Supports text input for the label and optional color picker.
 *   - Handles validation, loading state, and add/cancel actions.
 *
 * Props:
 * @param {boolean} open
 * - Whether the modal is visible.
 * @param {string} idBase
 * - Base ID for input elements (ensures unique HTML IDs).
 * @param {string} draft
 * - Current text input value for the new option label.
 * @param {(v: string) => void} setDraft
 * - Setter to update the draft label.
 * @param {string} [error]
 * - Optional error message displayed below the input.
 * @param {boolean} adding
 * - Whether the "Add" action is currently processing.
 * @param {() => void} onClose
 * - Callback to close the modal.
 * @param {() => void} onSubmit
 * - Callback to submit and add the option.
 * @param {boolean} [enableColor]
 * - If true, shows a color picker grid.
 * @param {string[]} [colors]
 * - Available color hex values for selection.
 * @param {string} [selectedColor]
 * - Currently selected color hex.
 * @param {(hex: string) => void} [onSelectColor]
 * - Callback when a color is chosen.
 *
 * Behavior / Logic:
 *   - Fade/scale animations on open/close using Framer Motion.
 *   - Escape key or clicking overlay closes the modal.
 *   - Add button shows loading spinner if `adding` is true.
 *   - Displays validation error if provided.
 *   - Supports color preview and palette selection if enabled.
 *
 * UI:
 *   - Header with title and close button.
 *   - TextInput for label.
 *   - Optional color grid with live preview.
 *   - Error message below inputs.
 *   - Footer with Close and Add buttons.
 */

import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "@iconify/react";
import TextInput from "@/components/ui/text-inputs/TextInput";

export function SelectAddModal({
  open,
  idBase,
  draft,
  setDraft,
  error,
  adding,
  onClose,
  onSubmit,
  enableColor,
  colors = [],
  selectedColor = "#ffffff",
  onSelectColor,
}: {
  open: boolean;
  idBase: string;
  draft: string;
  setDraft: (v: string) => void;
  error?: string;
  adding: boolean;
  onClose: () => void;
  onSubmit: () => void;
  enableColor?: boolean;
  colors?: string[];
  selectedColor?: string;
  onSelectColor?: (hex: string) => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[60] bg-black"
            onClick={onClose}
          />
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[61] grid place-items-center p-4"
          >
            <div className="w-full max-w-sm rounded-xl border border-[var(--color-bg4)] bg-[var(--color-bg2)] p-4 shadow-2xl">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-medium text-[var(--color-text-primary)]">
                  Add new option
                </h3>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md p-1 hover:bg-[var(--color-bg3)]"
                >
                  <Icon
                    icon="mingcute:close-line"
                    width={18}
                    height={18}
                    className="text-[var(--color-icon)]"
                  />
                </button>
              </div>

              <div className="space-y-3">
                <TextInput
                  id={`${idBase}-add`}
                  label="Label"
                  value={draft}
                  onValueChange={setDraft}
                  placeholder="Enter a label…"
                  disabled={adding}
                />

                {enableColor && colors?.length > 0 && (
                  <div className="space-y-1.5 mt-5">
                    <div className="flex items-center justify-between">
                      <label className="text-sm text-[var(--color-text-primary)]">
                        Color
                      </label>
                      <span
                        className="inline-block h-3 w-3 rounded-full ring-1 ring-black/10"
                        style={{ backgroundColor: selectedColor }}
                      />
                    </div>
                    <div className="grid grid-cols-8 mt-3 gap-2">
                      {colors.map((hex) => {
                        const isSel =
                          selectedColor?.toLowerCase() === hex.toLowerCase();
                        return (
                          <button
                            key={hex}
                            type="button"
                            onClick={() => onSelectColor?.(hex)}
                            className={`h-6 w-6 rounded-full ring-1 ring-black/10 ${
                              isSel
                                ? "outline-2 outline-[var(--color-primary)]"
                                : ""
                            }`}
                            title={hex}
                            style={{ backgroundColor: hex }}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}

                {error && (
                  <p className="text-xs text-[var(--color-error)]">{error}</p>
                )}
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg3)]"
                  disabled={adding}
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={onSubmit}
                  className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-sm text-white hover:opacity-90 disabled:opacity-70"
                  disabled={adding}
                >
                  {adding && (
                    <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  )}
                  Add
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
