"use client";

/**
 * Select Component
 *
 * Purpose:
 *   - Custom replacement for <select> with support for colors, server-validated additions,
 *     and hidden inputs for form compatibility.
 *   - Provides both controlled (`value` + `onChange`) and uncontrolled (`defaultValue`) modes.
 *
 * Props:
 *   @param {string} id
 *     - Unique identifier for form elements.
 *   @param {string} [label]
 *     - Optional label displayed above the control.
 *   @param {string} [value]
 *     - Controlled selected value. Use with `onChange`.
 *   @param {(value: string) => void} [onChange]
 *     - Callback fired when a value is selected.
 *   @param {string} [defaultValue]
 *     - Default value when uncontrolled.
 *   @param {string} [name]
 *     - Name for hidden inputs (for form POST).
 *   @param {Option[]} options
 *     - Available options (simple strings or {label, value, colorHex} objects).
 *   @param {string} [placeholder]
 *     - Placeholder text when no selection exists.
 *   @param {string|string[]} [error]
 *     - Error message(s) displayed below the control.
 *   @param {string} [helperText]
 *     - Secondary helper text when there is no error.
 *   @param {boolean} [required]
 *     - Marks as required in form contexts.
 *   @param {boolean} [disabled]
 *     - Disables interaction.
 *   @param {(label: string, meta?: {colorHex?: string}) => Promise<AddResult>|AddResult} [handleAdd]
 *     - Server callback for adding new options. Supports:
 *         • `string` -> error message
 *         • `{value,label,colorHex?}` -> canonical option
 *         • `void` -> parent will refresh options externally
 *   @param {boolean} [allowAdd]
 *     - If true and `handleAdd` is undefined, allows local-only adding.
 *   @param {"auto"|"always"|"never"} [colorMode="auto"]
 *     - Controls display of color chips:
 *         • `auto` -> only if any option has color
 *         • `always` -> force show
 *         • `never` -> hide all
 *
 * Behavior / Logic:
 *   - Normalizes options into consistent {label,value,colorHex}.
 *   - Merges canonical options with locally added ones.
 *   - Tracks open/close state, closes on outside click or Escape key.
 *   - Supports hidden inputs for form submissions:
 *       • `name` -> selected value
 *       • `name__label` -> selected label
 *       • `name__color` -> selected color (if enabled)
 *       • `name__isNew` -> marker if value not in normalized list
 *   - Add flow:
 *       • Opens modal via "Add new…" row.
 *       • Validates and submits to `handleAdd` or local insert.
 *       • Supports optional color picker palette.
 *
 * UI:
 *   - Trigger button (<SelectTrigger>) shows label or placeholder.
 *   - Dropdown (<SelectPopover>) contains:
 *       • Optional "Add new…" row.
 *       • Scrollable option list (<SelectList>).
 *   - Add modal (<SelectAddModal>) for creating new entries with optional color.
 *   - Helper/error text below the control.
 *
 * Constraints:
 *   - Up to 16 unique colors merged into palette.
 *   - Default palette ensures basic coverage.
 *
 */

import * as React from "react";
import clsx from "clsx";
import { SelectTrigger } from "./components/SelectTrigger";
import { SelectPopover } from "./components/SelectPopover";
import { SelectList, SimpleOption } from "./components/SelectList";
import { SelectAddRow } from "./components/SelectAddRow";
import { SelectAddModal } from "./components/SelectAddModal";
import { DEFAULT_COLOR_PALETTE } from "@/utils/utils";

type Option = string | { label: string; value: string; colorHex?: string };
export type SimpleOptionWithColor = SimpleOption & { colorHex?: string };

function normalizeOptions(options: Option[]): SimpleOptionWithColor[] {
  return options.map((opt) =>
    typeof opt === "string"
      ? { label: opt, value: opt }
      : {
          label: opt.label,
          value: opt.value ?? opt.label,
          colorHex: opt.colorHex,
        }
  );
}

type AddResult =
  | void // parent will refresh options itself; Select won't insert anything locally
  | string // error message
  | { value: string; label: string; colorHex?: string }; // canonical from server

type Props = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "onChange"> & {
  id: string;
  label?: string;

  value?: string;
  onChange?: (value: string) => void;

  defaultValue?: string;
  name?: string;

  options: Option[];
  placeholder?: string;
  error?: string | string[];
  helperText?: string;
  className?: string;
  handleAdd?: (
    // Select will call this and expect canonical {value,label,colorHex?} or error string
    label: string,
    meta?: { colorHex?: string }
  ) => Promise<AddResult> | AddResult;
  allowAdd?: boolean; // for local-only adding, leave `handleAdd` undefined and set allowAdd=true
  colorMode?: "auto" | "always" | "never"; // force color chips/picker
};

export default function Select({
  id,
  name,
  label,
  value: controlledValue,
  onChange,
  defaultValue,
  options,
  placeholder,
  error,
  helperText,
  className,
  required,
  disabled,
  handleAdd,
  allowAdd,
  colorMode = "auto",
}: Props) {
  const normalized = React.useMemo(() => normalizeOptions(options), [options]);

  const [extraOptions, setExtraOptions] = React.useState<
    SimpleOptionWithColor[]
  >([]);
  const allOptions = React.useMemo(
    () => [...normalized, ...extraOptions],
    [normalized, extraOptions]
  );

  const hasAnyColorInOptions = React.useMemo(
    () => allOptions.some((o) => !!o.colorHex),
    [allOptions]
  );

  const colorEnabled =
    colorMode === "always"
      ? true
      : colorMode === "never"
      ? false
      : hasAnyColorInOptions; // auto

  const colorPalette = React.useMemo(() => {
    const fromOptions = Array.from(
      new Set(
        allOptions.map((o) => o.colorHex).filter((x): x is string => Boolean(x))
      )
    );
    const merged = Array.from(
      new Set(["#ffffff", ...fromOptions, ...DEFAULT_COLOR_PALETTE])
    );
    return merged.slice(0, 16);
  }, [allOptions]);

  React.useEffect(() => {
    setExtraOptions((prev) =>
      prev.filter((x) => !normalized.some((o) => o.value === x.value))
    );
  }, [normalized]);

  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function onDoc(e: MouseEvent) {
      const el = rootRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const isControlled = controlledValue !== undefined;
  const [uncontrolled, setUncontrolled] = React.useState<string>(
    defaultValue ?? ""
  );
  const currentValue = isControlled ? controlledValue! : uncontrolled;

  const currentOpt = allOptions.find((o) => o.value === currentValue);
  const currentLabel = currentOpt?.label ?? (currentValue ? currentValue : "");
  const currentColor =
    colorEnabled && currentOpt ? currentOpt.colorHex ?? "#ffffff" : undefined;

  const hasError = Boolean(error);
  const errorList = Array.isArray(error) ? error : error ? [error] : [];

  function commit(next: string) {
    if (!isControlled) setUncontrolled(next);
    onChange?.(next);
  }

  // Add modal state
  const [showAdd, setShowAdd] = React.useState(false);
  const [addDraft, setAddDraft] = React.useState("");
  const [addErr, setAddErr] = React.useState<string | undefined>();
  const [adding, setAdding] = React.useState(false);
  const [addColor, setAddColor] = React.useState<string>("#ffffff");

  React.useEffect(() => {
    if (!colorEnabled) setAddColor("#ffffff");
  }, [colorEnabled]);

  const closeAdd = () => {
    setShowAdd(false);
    setAddDraft("");
    setAddErr(undefined);
    setAdding(false);
    setAddColor("#ffffff");
  };

  async function onAddSubmit() {
    const label = addDraft.trim();
    if (!label) {
      setAddErr("Please enter a value.");
      return;
    }
    try {
      setAdding(true);

      if (handleAdd) {
        const result = await handleAdd(
          label,
          colorEnabled ? { colorHex: addColor } : undefined
        );

        // string -> error
        if (typeof result === "string" && result) {
          setAddErr(result);
          setAdding(false);
          return;
        }

        // object -> canonical option from server
        if (result && typeof result === "object") {
          const canonical = result as SimpleOptionWithColor;
          if (!allOptions.some((o) => o.value === canonical.value)) {
            setExtraOptions((prev) => [...prev, canonical]);
          }
          commit(canonical.value);
          closeAdd();
          setOpen(false);
          return;
        }

        // void -> parent will refresh lists; we don't insert a local item
        closeAdd();
        setOpen(false);
        return;
      }

      // No handleAdd: local-only adding (not recommended if server enforces slugs)
      if (allowAdd) {
        const value = label; // keep raw (no slugging); parent can reconcile later
        if (!allOptions.some((o) => o.value === value)) {
          setExtraOptions((prev) => [
            ...prev,
            { label, value, colorHex: colorEnabled ? addColor : undefined },
          ]);
        }
        commit(value);
        closeAdd();
        setOpen(false);
        return;
      }

      setAddErr("Adding is disabled.");
      setAdding(false);
    } catch {
      setAddErr("Something went wrong. Please try again.");
      setAdding(false);
    }
  }

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (showAdd) closeAdd();
        else setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showAdd]);

  const canAdd = Boolean(handleAdd) || Boolean(allowAdd);

  const isNewSelection =
    Boolean(name) &&
    Boolean(currentValue) &&
    !normalized.some((o) => o.value === currentValue) &&
    Boolean(currentLabel);

  return (
    <div ref={rootRef} className={clsx("grid gap-1.5", className)}>
      {label && (
        <label
          htmlFor={id}
          className="text-sm text-[var(--color-text-primary)]"
        >
          {label}
        </label>
      )}

      {/* keep forms working */}
      {name && <input type="hidden" name={name} value={currentValue ?? ""} />}

      {name && currentValue && (
        <>
          <input type="hidden" name={`${name}__label`} value={currentLabel} />
          {colorEnabled && (
            <input
              type="hidden"
              name={`${name}__color`}
              value={currentColor ?? "#ffffff"}
            />
          )}
          {isNewSelection && (
            <input type="hidden" name={`${name}__isNew`} value="1" />
          )}
        </>
      )}

      <div className="relative">
        <SelectTrigger
          id={id}
          disabled={disabled}
          open={open}
          hasValue={Boolean(currentValue)}
          text={currentLabel}
          placeholder={placeholder}
          onToggle={() => setOpen((o) => !o)}
          showColor={colorEnabled}
          colorHex={currentColor}
        />

        <SelectPopover open={open && !disabled}>
          {canAdd && <SelectAddRow onClick={() => setShowAdd(true)} />}
          <SelectList
            id={id}
            options={allOptions}
            value={currentValue}
            placeholder={placeholder}
            onSelect={(v) => {
              commit(v);
              setOpen(false);
            }}
            showColor={colorEnabled}
          />
        </SelectPopover>
      </div>

      <SelectAddModal
        open={showAdd}
        idBase={id}
        draft={addDraft}
        setDraft={setAddDraft}
        error={addErr}
        adding={adding}
        onClose={closeAdd}
        onSubmit={onAddSubmit}
        enableColor={colorEnabled}
        colors={colorPalette}
        selectedColor={addColor}
        onSelectColor={setAddColor}
      />

      {helperText && !hasError && (
        <p
          id={`${id}-help`}
          className="text-xs text-[var(--color-text-secondary)]"
        >
          {helperText}
        </p>
      )}
      {hasError && (
        <div id={`${id}-error`} className="space-y-0.5">
          {errorList.map((msg, i) => (
            <p key={i} className="text-xs text-[var(--color-error)]">
              {msg}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
